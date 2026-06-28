/**
 * benchmark.js — Sepolia (L1) vs Arbitrum (L2) Performance Harness
 * Academic/Research Edition.
 *
 * Produces the numbers needed for the paper:
 *   - End-to-end verification latency (local hash, IPFS retrieval MISS/HIT,
 *     on-chain verifyAndBurn confirmation)
 *   - Gas cost of verifyAndBurn (via estimateGas, repeatable + non-destructive)
 *   - A few REAL verifyAndBurn transactions per network for true confirmation latency
 *   - Live gas price (from each network's provider) + live ETH/USD (CoinGecko)
 *     => cost in USD per verification
 *
 * Because verifyAndBurn() permanently consumes a leaf, the harness:
 *   1. SEEDS a dedicated benchmark batch on each network (fresh, unconsumed leaves)
 *   2. Uses estimateGas on a DISJOINT set of leaves for the gas/USD numbers
 *   3. Burns a small set of OTHER fresh leaves for real confirmation latency
 *
 * Usage:
 *   node src/benchmark.js                 # both networks
 *   node src/benchmark.js sepolia         # only L1
 *   node src/benchmark.js arbitrum        # only L2
 *
 * Tunable env (optional):
 *   BENCH_STRIP_COUNT   (default 64)   leaves in the seeded benchmark batch
 *   BENCH_GAS_SAMPLES   (default 10)   leaves used for estimateGas sampling
 *   BENCH_REAL_TXS      (default 3)    real verifyAndBurn txs per network
 */

require("dotenv").config();

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const { generateSecret } = require("./utils");
const { buildMerkleTree, generateProof } = require("./merkle");
const { pinJSONToIPFS, testPinataConnection } = require("./ipfs");

// ─── Minimal ABI (only what the benchmark needs) ─────────────────────────────
const MANUFACTURER_BATCH_ABI = [
  "function registerBatch(string batchId, bytes32 merkleRoot, string ipfsCID, uint256 expiryDate, string drugName) external",
  "function getBatch(string batchId) external view returns (tuple(bytes32 merkleRoot, string ipfsCID, uint256 expiryDate, uint256 registeredAt, address manufacturer, string drugName, bool isActive))",
  "function verifyAndBurn(string batchId, bytes32[] proof, bytes32 leafHash) external returns (bool expired)",
  "function isLeafConsumed(bytes32 leafHash) external view returns (bool)",
];

// ─── Tunables ────────────────────────────────────────────────────────────────
const STRIP_COUNT = Number(process.env.BENCH_STRIP_COUNT || 64);
const GAS_SAMPLES = Number(process.env.BENCH_GAS_SAMPLES || 10);
const REAL_TXS = Number(process.env.BENCH_REAL_TXS || 3);
const PINATA_GATEWAY =
  process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs";

// ─── Network definitions (read both, no ACTIVE_NETWORK switching) ────────────
const NETWORKS = {
  sepolia: {
    label: "Ethereum Sepolia (L1)",
    rpcUrl: process.env.RPC_URL,
    manufacturerBatch: process.env.MANUFACTURER_BATCH_ADDRESS,
  },
  arbitrum: {
    label: "Arbitrum Sepolia (L2)",
    rpcUrl: process.env.ARBITRUM_RPC_URL,
    manufacturerBatch: process.env.ARBITRUM_MANUFACTURER_BATCH_ADDRESS,
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function httpJSON(url) {
  const fetchFn =
    typeof fetch !== "undefined"
      ? fetch
      : (await import("node-fetch")).default;
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
  if (!nums.length) return { min: 0, max: 0, avg: 0, median: 0 };
  const sum = nums.reduce((a, b) => a + b, 0);
  return {
    min: Math.min(...nums),
    max: Math.max(...nums),
    avg: sum / nums.length,
    median: median(nums),
  };
}

// ─── Seed a fresh benchmark batch on one network ─────────────────────────────
async function seedBatch(net, wallet, contract) {
  const batchId = `BENCH-${net.key.toUpperCase()}-${Date.now()}`;
  console.log(`\n[SEED] Creating benchmark batch "${batchId}" with ${STRIP_COUNT} leaves...`);

  const secrets = Array.from({ length: STRIP_COUNT }, () => generateSecret());
  const { leaves, merkleRoot, treeJSON } = buildMerkleTree(secrets);

  console.log(`[SEED] Uploading Merkle tree to IPFS...`);
  const ipfsCID = await pinJSONToIPFS(treeJSON, `${batchId}-merkle-tree`);
  console.log(`[SEED] IPFS CID: ${ipfsCID}`);

  const expiryTimestamp = Math.floor(new Date("2030-12-31").getTime() / 1000);

  console.log(`[SEED] Registering batch on-chain...`);
  const regStart = Date.now();
  const tx = await contract.registerBatch(
    batchId,
    merkleRoot,
    ipfsCID,
    expiryTimestamp,
    "Benchmark Drug 500mg"
  );
  const receipt = await tx.wait();
  const registerLatencyMs = Date.now() - regStart;

  console.log(
    `[SEED] Registered in block ${receipt.blockNumber} | gasUsed ${receipt.gasUsed} | ${registerLatencyMs} ms`
  );

  // Reuse the same tree object the relayer would download to build proofs.
  return {
    batchId,
    ipfsCID,
    merkleRoot,
    secrets,
    leaves, // array of keccak256 leaf hex strings (the leafHash values)
    treeJSON,
    register: {
      gasUsed: receipt.gasUsed.toString(),
      latencyMs: registerLatencyMs,
      txHash: receipt.hash,
    },
  };
}

// ─── Build a proof for a given leaf index from the seeded batch ──────────────
function proofFor(seed, index) {
  // Rebuild the tree exactly like the relayer does (from treeJSON leaves).
  const secrets = seed.secrets;
  const { tree, leaves } = buildMerkleTree(secrets);
  const proof = generateProof(tree, leaves, index);
  const leafHash = leaves[index]; // keccak256(secret) hex
  return { proof, leafHash };
}

// ─── Benchmark a single network end-to-end ───────────────────────────────────
async function benchmarkNetwork(key) {
  const net = { key, ...NETWORKS[key] };

  if (!net.rpcUrl || !net.manufacturerBatch) {
    throw new Error(
      `Missing env for ${key}: need ${
        key === "sepolia"
          ? "RPC_URL + MANUFACTURER_BATCH_ADDRESS"
          : "ARBITRUM_RPC_URL + ARBITRUM_MANUFACTURER_BATCH_ADDRESS"
      }`
    );
  }
  if (!process.env.MANUFACTURER_PRIVATE_KEY) {
    throw new Error("Missing MANUFACTURER_PRIVATE_KEY in .env");
  }

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  BENCHMARKING: ${net.label.padEnd(38)}║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);

  const provider = new ethers.JsonRpcProvider(net.rpcUrl);
  const wallet = new ethers.Wallet(process.env.MANUFACTURER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(net.manufacturerBatch, MANUFACTURER_BATCH_ABI, wallet);

  // ── Phase 1: Seed a fresh batch ───────────────────────────────────────────
  const seed = await seedBatch(net, wallet, contract);

  // ── Phase 2: IPFS retrieval (MISS = cold gateway fetch, HIT = in-memory) ──
  console.log(`\n[IPFS] Measuring cold gateway fetch (MISS) and warm cache (HIT)...`);
  const ipfsUrl = `${PINATA_GATEWAY}/${seed.ipfsCID}`;
  const missStart = Date.now();
  const fetchedTree = await httpJSON(ipfsUrl);
  const ipfsMissMs = Date.now() - missStart;

  // Simulate the warm path: tree already in memory, no network round-trip.
  const hitStart = Date.now();
  const _warm = fetchedTree.merkleRoot; // trivial in-memory access
  const ipfsHitMs = Date.now() - hitStart;
  console.log(`[IPFS] MISS: ${ipfsMissMs} ms | HIT: ${ipfsHitMs} ms`);

  // ── Phase 3: Local hash computation timing ────────────────────────────────
  const localHashes = [];
  for (let i = 0; i < GAS_SAMPLES; i++) {
    const t = process.hrtime.bigint();
    ethers.keccak256(seed.secrets[i]);
    localHashes.push(Number(process.hrtime.bigint() - t) / 1e6); // ns -> ms
  }
  const localHashStats = stats(localHashes);

  // ── Phase 4: Gas via estimateGas (non-destructive, disjoint leaf set) ─────
  // Reserve leaves [0 .. REAL_TXS) for real burns.
  // Use leaves [REAL_TXS .. REAL_TXS + GAS_SAMPLES) for estimateGas.
  console.log(`\n[GAS] Sampling estimateGas on ${GAS_SAMPLES} leaves (non-destructive)...`);
  const gasEstimates = [];
  for (let i = 0; i < GAS_SAMPLES; i++) {
    const idx = REAL_TXS + i;
    if (idx >= STRIP_COUNT) break;
    const { proof, leafHash } = proofFor(seed, idx);
    try {
      const est = await contract.verifyAndBurn.estimateGas(seed.batchId, proof, leafHash);
      gasEstimates.push(Number(est));
    } catch (err) {
      console.warn(`  ⚠️  estimateGas failed for leaf ${idx}: ${err.shortMessage || err.message}`);
    }
  }
  const gasStats = stats(gasEstimates);
  console.log(`[GAS] estimateGas avg ${Math.round(gasStats.avg)} | min ${gasStats.min} | max ${gasStats.max}`);

  // ── Phase 5: Real verifyAndBurn txs for true confirmation latency ─────────
  console.log(`\n[TX] Sending ${REAL_TXS} REAL verifyAndBurn txs (consumes fresh leaves)...`);
  const realTxs = [];
  for (let i = 0; i < REAL_TXS; i++) {
    if (i >= STRIP_COUNT) break;
    const { proof, leafHash } = proofFor(seed, i);
    try {
      const start = Date.now();
      const tx = await contract.verifyAndBurn(seed.batchId, proof, leafHash);
      const receipt = await tx.wait();
      const latencyMs = Date.now() - start;
      const effGasPrice = receipt.gasPrice ?? (await provider.getFeeData()).gasPrice;
      realTxs.push({
        leafIndex: i,
        latencyMs,
        gasUsed: Number(receipt.gasUsed),
        effectiveGasPriceWei: effGasPrice ? effGasPrice.toString() : null,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });
      console.log(`  ✅ tx ${i + 1}/${REAL_TXS}: ${latencyMs} ms | gasUsed ${receipt.gasUsed}`);
    } catch (err) {
      console.warn(`  ⚠️  real tx for leaf ${i} failed: ${err.shortMessage || err.message}`);
    }
  }
  const realLatencyStats = stats(realTxs.map((t) => t.latencyMs));
  const realGasStats = stats(realTxs.map((t) => t.gasUsed));

  // ── Phase 6: Pricing ──────────────────────────────────────────────────────
  const feeData = await provider.getFeeData();
  const gasPriceWei = feeData.gasPrice ?? 0n;

  return {
    network: key,
    label: net.label,
    contract: net.manufacturerBatch,
    batchId: seed.batchId,
    ipfsCID: seed.ipfsCID,
    stripCount: STRIP_COUNT,
    register: seed.register,
    latency: {
      localHashComputation_ms: localHashStats,
      ipfsRetrieval_miss_ms: ipfsMissMs,
      ipfsRetrieval_hit_ms: ipfsHitMs,
      verifyAndBurn_real_ms: realLatencyStats,
    },
    gas: {
      verifyAndBurn_estimate: gasStats,
      verifyAndBurn_real: realGasStats,
      gasPriceWei: gasPriceWei.toString(),
      gasPriceGwei: Number(ethers.formatUnits(gasPriceWei, "gwei")),
    },
    realTxs,
  };
}

// ─── Cost computation given a gas amount + price + ETH/USD ───────────────────
function costUSD(gasUsed, gasPriceWei, ethUsd) {
  if (!gasUsed || !gasPriceWei || ethUsd == null) return null;
  const feeWei = BigInt(Math.round(gasUsed)) * BigInt(gasPriceWei);
  const feeEth = Number(ethers.formatEther(feeWei));
  return feeEth * ethUsd;
}

// ─── Pretty-print + persist the comparison ───────────────────────────────────
function report(results, ethUsd) {
  const rows = results.map((r) => {
    const avgGas = r.gas.verifyAndBurn_estimate.avg || r.gas.verifyAndBurn_real.avg;
    const feeEth =
      avgGas && r.gas.gasPriceWei
        ? Number(
            ethers.formatEther(
              BigInt(Math.round(avgGas)) * BigInt(r.gas.gasPriceWei)
            )
          )
        : null;
    return {
      Network: r.label,
      "Avg gas (estimate)": Math.round(r.gas.verifyAndBurn_estimate.avg),
      "Gas price (gwei)": r.gas.gasPriceGwei.toFixed(4),
      "Fee (ETH)": feeEth != null ? feeEth.toExponential(4) : "n/a",
      "Fee (USD)": costUSD(avgGas, r.gas.gasPriceWei, ethUsd)?.toFixed(6) ?? "n/a",
      "IPFS MISS (ms)": r.latency.ipfsRetrieval_miss_ms,
      "Burn latency avg (ms)": Math.round(r.latency.verifyAndBurn_real_ms.avg),
    };
  });

  console.log(`\n\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║          SEPOLIA vs ARBITRUM — COMPARISON            ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`ETH/USD at run time: ${ethUsd != null ? "$" + ethUsd : "unavailable"}\n`);
  console.table(rows);

  // ── Persist JSON + CSV ──────────────────────────────────────────────────
  const outDir = path.join(__dirname, "../benchmark-results");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const jsonPath = path.join(outDir, `benchmark-${stamp}.json`);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ ranAt: new Date().toISOString(), ethUsd, results }, null, 2)
  );

  const csvHeader = Object.keys(rows[0]).join(",");
  const csvBody = rows.map((row) => Object.values(row).join(",")).join("\n");
  const csvPath = path.join(outDir, `benchmark-${stamp}.csv`);
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

  console.log(`\n🔬 Benchmark targets: ${targets.join(", ")}`);
  console.log(`   Strips/batch: ${STRIP_COUNT} | gas samples: ${GAS_SAMPLES} | real txs: ${REAL_TXS}`);

  console.log(`\n[PREP] Verifying Pinata connection...`);
  const ok = await testPinataConnection();
  if (!ok) throw new Error("Pinata authentication failed. Check PINATA_API_KEY/SECRET in .env");
  console.log(`[PREP] Pinata OK`);

  const ethUsd = await getEthUsd();

  const results = [];
  for (const key of targets) {
    try {
      results.push(await benchmarkNetwork(key));
    } catch (err) {
      console.error(`\n❌ Benchmark failed for ${key}: ${err.message}`);
    }
  }

  if (results.length) {
    report(results, ethUsd);
  } else {
    console.error("\n❌ No networks benchmarked successfully.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n❌ Critical benchmark failure:", err);
  process.exit(1);
});
