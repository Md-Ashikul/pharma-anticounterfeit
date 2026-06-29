/**
 * benchmark-operations.js — Per-Operation Cost & Latency Harness
 * Sepolia (L1) vs Arbitrum (L2) — Academic/Research Edition.
 *
 * COMPLEMENTS src/benchmark.js (which focuses on the consumer HIDDEN-QR
 * verifyAndBurn path + IPFS retrieval + local hashing). This script measures
 * every OTHER operation so the paper has a complete cost + latency table:
 *
 *   SUPPLY-CHAIN CUSTODY (public-QR scans by entities) — WRITE, costs gas:
 *     1. registerDrug   (Manufacturer scans/registers a strip)
 *     2. distributeDrug (Distributor scans public QR, accepts custody)
 *     3. retailDrug     (Retailer scans public QR, accepts custody)
 *     4. consumeDrug    (Relayer records consumption after hidden-QR burn)
 *
 *   CONSUMER PUBLIC-QR READ (authenticity + timeline) — READ, 0 gas:
 *     5. getBatch       (ManufacturerBatch authenticity lookup)
 *     6. getDrugStatus  (current supply-chain status)
 *     7. getDrugHistory (full custody timeline)
 *
 *   CONSORTIUM GOVERNANCE (M-of-N) — estimateGas, non-destructive:
 *     8. proposeRegisterEntity (a regulator opens a proposal, auto-votes YES)
 *     9. voteOnProposal        (a regulator votes; only if BENCH_PROPOSAL_ID set)
 *
 * NOTE: The consumer HIDDEN-QR (private) scan = verifyAndBurn, which is fully
 *       measured by src/benchmark.js. It is intentionally NOT duplicated here.
 *
 * The script is RESILIENT: for each operation it does a REAL transaction when
 * it has the right wallet/role (giving both gas AND confirmation latency, with
 * a verifiable txHash on Etherscan/Arbiscan); otherwise it falls back to
 * estimateGas, or SKIPS the op with a clear human-readable reason. Supply-chain
 * writes use a FRESH unique drugId each run, so they are safe + repeatable and
 * never collide with real data.
 *
 * Usage:
 *   node src/benchmark-operations.js               # both networks
 *   node src/benchmark-operations.js sepolia       # only L1
 *   node src/benchmark-operations.js arbitrum      # only L2
 *
 * Required env (per network):
 *   RPC_URL / ARBITRUM_RPC_URL
 *   Contract addresses are read from blockchain/deployed-addresses.json
 *   (override with *_ADDRESS env vars if you prefer).
 *
 * Role wallets (optional — provide the ones you want to measure):
 *   MANUFACTURER_PRIVATE_KEY   (also acts as the relayer for consumeDrug)
 *   DISTRIBUTOR_PRIVATE_KEY
 *   RETAILER_PRIVATE_KEY
 *   GOVERNMENT_PRIVATE_KEY     (a regulator, for governance ops)
 *
 * Tunable env (optional):
 *   BENCH_READ_SAMPLES  (default 10)  read-latency samples per read op
 *   BENCH_READ_BATCH_ID (optional)    an existing batchId for getBatch reads
 *   BENCH_PROPOSAL_ID   (optional)    a pending proposalId to estimate vote gas
 */

require("dotenv").config();

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// ─── Load deployed contract addresses ────────────────────────────────────────
const ADDR_PATH = path.join(__dirname, "../../blockchain/deployed-addresses.json");
let DEPLOYED = {};
try {
  DEPLOYED = JSON.parse(fs.readFileSync(ADDR_PATH, "utf-8"));
} catch (err) {
  console.warn(`⚠️  Could not read ${ADDR_PATH}: ${err.message}. Falling back to env vars only.`);
}

// ─── Minimal ABIs ─────────────────────────────────────────────────────────────
const GOV_ABI = [
  "function proposeRegisterEntity(address wallet, string name, string licenseNumber, uint8 role) external returns (uint256)",
  "function voteOnProposal(uint256 proposalId, bool voteChoice) external",
  "function isWhitelisted(address account) view returns (bool)",
  "function hasRole(address account, uint8 role) view returns (bool)",
];

const SCT_ABI = [
  "function registerDrug(string drugId, string location) external",
  "function distributeDrug(string drugId, string location) external",
  "function retailDrug(string drugId, string location) external",
  "function consumeDrug(string drugId, string location) external",
  "function getDrugStatus(string drugId) view returns (uint8)",
  "function getDrugHistory(string drugId) view returns (tuple(address actor, string role, uint8 status, uint256 timestamp, string location)[])",
];

const MB_ABI = [
  "function getBatch(string batchId) view returns (tuple(bytes32 merkleRoot, string ipfsCID, uint256 expiryDate, uint256 registeredAt, address manufacturer, string drugName, bool isActive))",
];

// EntityRole enum: None=0, Manufacturer=1, Distributor=2, Retailer=3
const ROLE = { Manufacturer: 1, Distributor: 2, Retailer: 3 };

// ─── Tunables ────────────────────────────────────────────────────────────────
const READ_SAMPLES = Number(process.env.BENCH_READ_SAMPLES || 10);

// ─── Network definitions (read both, no ACTIVE_NETWORK switching) ────────────
const NETWORKS = {
  sepolia: {
    label: "Ethereum Sepolia (L1)",
    rpcUrl: process.env.RPC_URL,
    addrKey: "sepolia",
    gov: process.env.GOVERNMENT_REGISTRY_ADDRESS,
    mb: process.env.MANUFACTURER_BATCH_ADDRESS,
    sct: process.env.SUPPLY_CHAIN_TRACKER_ADDRESS,
  },
  arbitrum: {
    label: "Arbitrum Sepolia (L2)",
    rpcUrl: process.env.ARBITRUM_RPC_URL,
    addrKey: "arbitrumSepolia",
    gov: process.env.ARBITRUM_GOVERNMENT_REGISTRY_ADDRESS,
    mb: process.env.ARBITRUM_MANUFACTURER_BATCH_ADDRESS,
    sct: process.env.ARBITRUM_SUPPLY_CHAIN_TRACKER_ADDRESS,
  },
};

function resolveAddresses(net) {
  const onChain = DEPLOYED[net.addrKey] || {};
  return {
    gov: net.gov || onChain.GovernmentRegistry,
    mb: net.mb || onChain.ManufacturerBatch,
    sct: net.sct || onChain.SupplyChainTracker,
  };
}

// ─── Generic helpers ─────────────────────────────────────────────────────────
async function httpJSON(url) {
  const fetchFn = typeof fetch !== "undefined" ? fetch : (await import("node-fetch")).default;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function getEthUsd() {
  try {
    const data = await httpJSON(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
    );
    return data.ethereum.usd;
  } catch (err) {
    console.warn(`  ⚠️  CoinGecko price fetch failed (${err.message}). USD will be null.`);
    return null;
  }
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function stats(nums) {
  if (!nums.length) return { min: 0, max: 0, avg: 0, median: 0, samples: 0 };
  const sum = nums.reduce((a, b) => a + b, 0);
  return {
    min: Math.min(...nums),
    max: Math.max(...nums),
    avg: sum / nums.length,
    median: median(nums),
    samples: nums.length,
  };
}

function feeFrom(gasUsed, gasPriceWei) {
  if (!gasUsed || !gasPriceWei) return { feeWei: null, feeEth: null };
  const feeWei = BigInt(Math.round(gasUsed)) * BigInt(gasPriceWei);
  return { feeWei: feeWei.toString(), feeEth: Number(ethers.formatEther(feeWei)) };
}

function costUSD(gasUsed, gasPriceWei, ethUsd) {
  const { feeEth } = feeFrom(gasUsed, gasPriceWei);
  if (feeEth == null || ethUsd == null) return null;
  return feeEth * ethUsd;
}

// Build a uniform operation-result record.
function makeRecord(network, label, operation, kind) {
  return {
    network,
    label,
    operation,
    kind, // "write" | "read" | "estimate"
    status: "skipped",
    reason: null,
    gasUsed: null,
    latencyMs: null,
    txHash: null,
    blockNumber: null,
  };
}

// Wrap a write tx, capturing gas + confirmation latency.
async function runWrite(contract, method, args) {
  const start = Date.now();
  const tx = await contract[method](...args);
  const receipt = await tx.wait();
  const latencyMs = Date.now() - start;
  const effGasPrice = receipt.gasPrice ?? null;
  return {
    gasUsed: Number(receipt.gasUsed),
    latencyMs,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    effGasPriceWei: effGasPrice ? effGasPrice.toString() : null,
  };
}

// ─── Pre-flight: which role does a wallet hold? ──────────────────────────────
async function describeWallet(govRead, address) {
  const out = { address, whitelisted: false, roles: [] };
  try {
    out.whitelisted = await govRead.isWhitelisted(address);
    for (const [name, id] of Object.entries(ROLE)) {
      try {
        if (await govRead.hasRole(address, id)) out.roles.push(name);
      } catch (_) {
        /* ignore per-role probe errors */
      }
    }
  } catch (err) {
    out.error = err.shortMessage || err.message;
  }
  return out;
}

// ─── Benchmark a single network ──────────────────────────────────────────────
async function benchmarkNetwork(key, ethUsd) {
  const net = { key, ...NETWORKS[key] };
  if (!net.rpcUrl) {
    throw new Error(`Missing RPC for ${key} (set ${key === "sepolia" ? "RPC_URL" : "ARBITRUM_RPC_URL"})`);
  }

  const addrs = resolveAddresses(net);
  if (!addrs.sct || !addrs.gov) {
    throw new Error(`Missing contract addresses for ${key}. Check deployed-addresses.json or *_ADDRESS env.`);
  }

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  OPERATIONS BENCHMARK: ${net.label.padEnd(30)}║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);

  const provider = new ethers.JsonRpcProvider(net.rpcUrl);
  const feeData = await provider.getFeeData();
  const gasPriceWei = (feeData.gasPrice ?? 0n).toString();
  const gasPriceGwei = Number(ethers.formatUnits(gasPriceWei, "gwei"));
  console.log(`Gas price: ${gasPriceGwei.toFixed(6)} gwei`);

  // Read-only contracts (no signer needed).
  const govRead = new ethers.Contract(addrs.gov, GOV_ABI, provider);
  const mbRead = new ethers.Contract(addrs.mb, MB_ABI, provider);
  const sctRead = new ethers.Contract(addrs.sct, SCT_ABI, provider);

  // Build signers for whichever role keys are present.
  const keys = {
    Manufacturer: process.env.MANUFACTURER_PRIVATE_KEY,
    Distributor: process.env.DISTRIBUTOR_PRIVATE_KEY,
    Retailer: process.env.RETAILER_PRIVATE_KEY,
    Government: process.env.GOVERNMENT_PRIVATE_KEY,
  };
  const wallets = {};
  for (const [role, pk] of Object.entries(keys)) {
    if (pk) wallets[role] = new ethers.Wallet(pk, provider);
  }

  // Pre-flight role report so the user knows what's set up.
  console.log(`\n[PREFLIGHT] Wallet roles on ${net.label}:`);
  const preflight = {};
  for (const [role, w] of Object.entries(wallets)) {
    const info = await describeWallet(govRead, w.address);
    preflight[role] = info;
    console.log(
      `  ${role.padEnd(12)} ${w.address}  whitelisted=${info.whitelisted}  roles=[${info.roles.join(", ")}]`
    );
  }
  if (!Object.keys(wallets).length) {
    console.log(`  (no role private keys provided — only READ ops will be measured)`);
  }

  const records = [];
  const drugId = `BENCH-OP-${key.toUpperCase()}-${Date.now()}`;
  console.log(`\nUsing fresh drugId: ${drugId}`);

  // ── SUPPLY-CHAIN CUSTODY WRITES (sequential state machine) ────────────────
  let manufactured = false;
  let distributed = false;
  let retailed = false;

  // 1. registerDrug — Manufacturer
  {
    const rec = makeRecord(key, net.label, "registerDrug (Manufacturer scan)", "write");
    const w = wallets.Manufacturer;
    if (!w) {
      rec.reason = "MANUFACTURER_PRIVATE_KEY not set";
    } else if (!preflight.Manufacturer?.roles.includes("Manufacturer")) {
      rec.reason = `wallet ${w.address} lacks Manufacturer role (register it via governance first)`;
    } else {
      try {
        const sct = new ethers.Contract(addrs.sct, SCT_ABI, w);
        const r = await runWrite(sct, "registerDrug", [drugId, "Bench-Factory"]);
        Object.assign(rec, { status: "ok", ...r });
        manufactured = true;
        console.log(`  ✅ registerDrug: ${r.latencyMs} ms | gas ${r.gasUsed}`);
      } catch (err) {
        rec.status = "error";
        rec.reason = err.shortMessage || err.message;
        console.warn(`  ⚠️  registerDrug failed: ${rec.reason}`);
      }
    }
    records.push(rec);
  }

  // 2. distributeDrug — Distributor
  {
    const rec = makeRecord(key, net.label, "distributeDrug (Distributor scan)", "write");
    const w = wallets.Distributor;
    if (!w) {
      rec.reason = "DISTRIBUTOR_PRIVATE_KEY not set";
    } else if (!manufactured) {
      rec.reason = "skipped — registerDrug did not succeed (state machine requires Manufactured)";
    } else if (!preflight.Distributor?.roles.includes("Distributor")) {
      rec.reason = `wallet ${w.address} lacks Distributor role`;
    } else {
      try {
        const sct = new ethers.Contract(addrs.sct, SCT_ABI, w);
        const r = await runWrite(sct, "distributeDrug", [drugId, "Bench-Warehouse"]);
        Object.assign(rec, { status: "ok", ...r });
        distributed = true;
        console.log(`  ✅ distributeDrug: ${r.latencyMs} ms | gas ${r.gasUsed}`);
      } catch (err) {
        rec.status = "error";
        rec.reason = err.shortMessage || err.message;
        console.warn(`  ⚠️  distributeDrug failed: ${rec.reason}`);
      }
    }
    records.push(rec);
  }

  // 3. retailDrug — Retailer
  {
    const rec = makeRecord(key, net.label, "retailDrug (Retailer scan)", "write");
    const w = wallets.Retailer;
    if (!w) {
      rec.reason = "RETAILER_PRIVATE_KEY not set";
    } else if (!distributed) {
      rec.reason = "skipped — distributeDrug did not succeed (state machine requires Distributed)";
    } else if (!preflight.Retailer?.roles.includes("Retailer")) {
      rec.reason = `wallet ${w.address} lacks Retailer role`;
    } else {
      try {
        const sct = new ethers.Contract(addrs.sct, SCT_ABI, w);
        const r = await runWrite(sct, "retailDrug", [drugId, "Bench-Pharmacy"]);
        Object.assign(rec, { status: "ok", ...r });
        retailed = true;
        console.log(`  ✅ retailDrug: ${r.latencyMs} ms | gas ${r.gasUsed}`);
      } catch (err) {
        rec.status = "error";
        rec.reason = err.shortMessage || err.message;
        console.warn(`  ⚠️  retailDrug failed: ${rec.reason}`);
      }
    }
    records.push(rec);
  }

  // 4. consumeDrug — Relayer (any wallet; no role check). Use Manufacturer key as relayer.
  {
    const rec = makeRecord(key, net.label, "consumeDrug (Relayer records consume)", "write");
    const w = wallets.Manufacturer || wallets.Government;
    if (!w) {
      rec.reason = "no relayer key available (set MANUFACTURER_PRIVATE_KEY or GOVERNMENT_PRIVATE_KEY)";
    } else if (!retailed) {
      rec.reason = "skipped — retailDrug did not succeed (state machine requires Retailed)";
    } else {
      try {
        const sct = new ethers.Contract(addrs.sct, SCT_ABI, w);
        const r = await runWrite(sct, "consumeDrug", [drugId, "Bench-Home"]);
        Object.assign(rec, { status: "ok", ...r });
        console.log(`  ✅ consumeDrug: ${r.latencyMs} ms | gas ${r.gasUsed}`);
      } catch (err) {
        rec.status = "error";
        rec.reason = err.shortMessage || err.message;
        console.warn(`  ⚠️  consumeDrug failed: ${rec.reason}`);
      }
    }
    records.push(rec);
  }

  // ── CONSORTIUM GOVERNANCE (estimateGas — non-destructive) ─────────────────
  // 8. proposeRegisterEntity
  {
    const rec = makeRecord(key, net.label, "proposeRegisterEntity (consortium propose)", "estimate");
    const w = wallets.Government;
    if (!w) {
      rec.reason = "GOVERNMENT_PRIVATE_KEY not set";
    } else {
      try {
        const gov = new ethers.Contract(addrs.gov, GOV_ABI, w);
        // Random unregistered target so the proposal precondition passes.
        const target = ethers.Wallet.createRandom().address;
        const est = await gov.proposeRegisterEntity.estimateGas(
          target,
          "Benchmark Pharma Co",
          "LIC-BENCH-0001",
          ROLE.Manufacturer
        );
        rec.status = "ok";
        rec.gasUsed = Number(est);
        console.log(`  ✅ proposeRegisterEntity (estimateGas): gas ${rec.gasUsed}`);
      } catch (err) {
        rec.status = "error";
        rec.reason = err.shortMessage || err.message;
        console.warn(`  ⚠️  proposeRegisterEntity estimate failed: ${rec.reason}`);
      }
    }
    records.push(rec);
  }

  // 9. voteOnProposal — only if a pending proposal id is supplied
  {
    const rec = makeRecord(key, net.label, "voteOnProposal (consortium vote)", "estimate");
    const w = wallets.Government;
    const pid = process.env.BENCH_PROPOSAL_ID;
    if (!w) {
      rec.reason = "GOVERNMENT_PRIVATE_KEY not set";
    } else if (!pid) {
      rec.reason = "BENCH_PROPOSAL_ID not set (provide a pending proposalId to estimate vote gas)";
    } else {
      try {
        const gov = new ethers.Contract(addrs.gov, GOV_ABI, w);
        const est = await gov.voteOnProposal.estimateGas(pid, true);
        rec.status = "ok";
        rec.gasUsed = Number(est);
        console.log(`  ✅ voteOnProposal (estimateGas, proposal ${pid}): gas ${rec.gasUsed}`);
      } catch (err) {
        rec.status = "error";
        rec.reason = err.shortMessage || err.message;
        console.warn(`  ⚠️  voteOnProposal estimate failed: ${rec.reason}`);
      }
    }
    records.push(rec);
  }

  // ── CONSUMER PUBLIC-QR READS (eth_call, 0 gas — latency only) ─────────────
  console.log(`\n[READS] Sampling ${READ_SAMPLES}x public-QR read latency...`);

  // 5. getBatch (authenticity lookup)
  {
    const rec = makeRecord(key, net.label, "getBatch (public QR authenticity read)", "read");
    const batchId = process.env.BENCH_READ_BATCH_ID || drugId; // any id still measures RPC round-trip
    const lat = [];
    for (let i = 0; i < READ_SAMPLES; i++) {
      const t = Date.now();
      try {
        await mbRead.getBatch(batchId);
      } catch (_) {
        /* empty/unknown batch still does a full round-trip; timing is valid */
      }
      lat.push(Date.now() - t);
    }
    rec.status = "ok";
    rec.latencyMs = stats(lat);
    rec.reason = process.env.BENCH_READ_BATCH_ID ? null : "read against fresh id (empty result; latency still valid)";
    console.log(`  ✅ getBatch read: avg ${Math.round(rec.latencyMs.avg)} ms`);
    records.push(rec);
  }

  // 6. getDrugStatus
  {
    const rec = makeRecord(key, net.label, "getDrugStatus (public QR status read)", "read");
    const lat = [];
    for (let i = 0; i < READ_SAMPLES; i++) {
      const t = Date.now();
      try {
        await sctRead.getDrugStatus(drugId);
      } catch (_) {}
      lat.push(Date.now() - t);
    }
    rec.status = "ok";
    rec.latencyMs = stats(lat);
    console.log(`  ✅ getDrugStatus read: avg ${Math.round(rec.latencyMs.avg)} ms`);
    records.push(rec);
  }

  // 7. getDrugHistory (timeline)
  {
    const rec = makeRecord(key, net.label, "getDrugHistory (public QR timeline read)", "read");
    const lat = [];
    for (let i = 0; i < READ_SAMPLES; i++) {
      const t = Date.now();
      try {
        await sctRead.getDrugHistory(drugId);
      } catch (_) {}
      lat.push(Date.now() - t);
    }
    rec.status = "ok";
    rec.latencyMs = stats(lat);
    console.log(`  ✅ getDrugHistory read: avg ${Math.round(rec.latencyMs.avg)} ms`);
    records.push(rec);
  }

  return {
    network: key,
    label: net.label,
    addresses: addrs,
    gasPriceWei,
    gasPriceGwei,
    preflight,
    drugId,
    records,
  };
}

// ─── Report: pretty table + JSON + CSV ───────────────────────────────────────
function report(networkResults, ethUsd) {
  // Flatten every operation record into rows for the table/CSV.
  const rows = [];
  for (const nr of networkResults) {
    for (const rec of nr.records) {
      const gas = typeof rec.gasUsed === "number" ? rec.gasUsed : null;
      const { feeEth } = feeFrom(gas, nr.gasPriceWei);
      const usd = costUSD(gas, nr.gasPriceWei, ethUsd);

      // Latency: writes have a single latencyMs; reads have a stats object.
      let latencyMs = null;
      if (typeof rec.latencyMs === "number") latencyMs = rec.latencyMs;
      else if (rec.latencyMs && typeof rec.latencyMs.avg === "number") latencyMs = Math.round(rec.latencyMs.avg);

      rows.push({
        Network: nr.label,
        Operation: rec.operation,
        Kind: rec.kind,
        Status: rec.status,
        "Gas used": gas != null ? gas : "—",
        "Fee (ETH)": feeEth != null ? feeEth.toExponential(4) : "—",
        "Fee (USD)": usd != null ? usd.toFixed(6) : "—",
        "Latency (ms)": latencyMs != null ? latencyMs : "—",
        Note: rec.status === "ok" ? rec.txHash || "" : rec.reason || "",
      });
    }
  }

  console.log(`\n\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║     PER-OPERATION COST & LATENCY — SEPOLIA vs ARB     ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`ETH/USD at run time: ${ethUsd != null ? "$" + ethUsd : "unavailable"}\n`);
  console.table(rows);

  const outDir = path.join(__dirname, "../benchmark-results");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const jsonPath = path.join(outDir, `operations-${stamp}.json`);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ ranAt: new Date().toISOString(), ethUsd, networks: networkResults }, null, 2)
  );

  const csvHeader = Object.keys(rows[0]).join(",");
  const csvBody = rows
    .map((row) => Object.values(row).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const csvPath = path.join(outDir, `operations-${stamp}.csv`);
  fs.writeFileSync(csvPath, `${csvHeader}\n${csvBody}\n`);

  console.log(`\n📄 Results saved:\n   ${jsonPath}\n   ${csvPath}\n`);
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const arg = (process.argv[2] || "").toLowerCase();
  const targets =
    arg === "sepolia" || arg === "l1"
      ? ["sepolia"]
      : arg === "arbitrum" || arg === "l2"
      ? ["arbitrum"]
      : ["sepolia", "arbitrum"];

  console.log(`\n🔬 Per-operation benchmark targets: ${targets.join(", ")}`);
  console.log(`   Read samples per op: ${READ_SAMPLES}`);

  const ethUsd = await getEthUsd();

  const networkResults = [];
  for (const key of targets) {
    try {
      networkResults.push(await benchmarkNetwork(key, ethUsd));
    } catch (err) {
      console.error(`\n❌ Operations benchmark failed for ${key}: ${err.message}`);
    }
  }

  if (networkResults.length) {
    report(networkResults, ethUsd);
  } else {
    console.error("\n❌ No networks benchmarked successfully.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n❌ Critical benchmark failure:", err);
  process.exit(1);
});
