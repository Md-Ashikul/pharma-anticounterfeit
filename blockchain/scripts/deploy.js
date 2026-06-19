const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Maps a hardhat network name to the env-var prefix the backend expects.
const ENV_PREFIX = {
  sepolia: "",
  arbitrumSepolia: "ARBITRUM_",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = network.name;
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("──────────────────────────────────────────────");
  console.log(`Network:   ${net} (chainId ${network.config.chainId})`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Balance:   ${ethers.formatEther(balance)} ETH`);
  console.log("──────────────────────────────────────────────\n");

  if (balance === 0n) {
    throw new Error(
      `Deployer wallet has 0 ETH on ${net}. Fund it before deploying ` +
        `(Arbitrum Sepolia faucet: https://faucet.quicknode.com/arbitrum/sepolia).`
    );
  }

  // ── 1. Deploy GovernmentRegistry ──────────────────────────────────────────
  const GovReg = await ethers.getContractFactory("GovernmentRegistry");
  const govReg = await GovReg.deploy(deployer.address);
  await govReg.waitForDeployment();
  const govRegAddr = await govReg.getAddress();
  console.log("✓ GovernmentRegistry deployed to:", govRegAddr);

  // ── 2. Deploy ManufacturerBatch ───────────────────────────────────────────
  const MfgBatch = await ethers.getContractFactory("ManufacturerBatch");
  const mfgBatch = await MfgBatch.deploy(govRegAddr);
  await mfgBatch.waitForDeployment();
  const mfgBatchAddr = await mfgBatch.getAddress();
  console.log("✓ ManufacturerBatch deployed to:", mfgBatchAddr);

  // ── 3. Deploy SupplyChainTracker ──────────────────────────────────────────
  const SCT = await ethers.getContractFactory("SupplyChainTracker");
  const sct = await SCT.deploy(govRegAddr);
  await sct.waitForDeployment();
  const sctAddr = await sct.getAddress();
  console.log("✓ SupplyChainTracker deployed to:", sctAddr);

  // ── 4. Initialize Governance (M-of-N Voting) ─────────────────────────────
  // Read governance config from env or use defaults
  const regulatorsStr = process.env.GOVERNANCE_REGULATORS;
  const thresholdStr = process.env.GOVERNANCE_THRESHOLD;

  let regulators = [];
  let threshold = 1;

  if (regulatorsStr) {
    try {
      regulators = JSON.parse(regulatorsStr); // Expect ["0x...", "0x...", ...]
      if (!Array.isArray(regulators)) regulators = [];
    } catch {
      console.warn("⚠ Could not parse GOVERNANCE_REGULATORS env var");
    }
  }

  if (thresholdStr) {
    const parsed = parseInt(thresholdStr, 10);
    if (!isNaN(parsed) && parsed > 0) threshold = parsed;
  }

  // If no regulators provided, use deployer as default single regulator (backward compat)
  if (regulators.length === 0) {
    regulators = [deployer.address];
    threshold = 1;
    console.log(
      `\n⚠ No GOVERNANCE_REGULATORS env var. Using deployer as default regulator (1-of-1).`
    );
  }

  if (threshold > regulators.length) {
    threshold = regulators.length;
    console.log(
      `⚠ Threshold > regulator count. Capped threshold to ${threshold}.`
    );
  }

  console.log(`\nInitializing governance: ${threshold}-of-${regulators.length}`);
  console.log(`Regulators: ${regulators.join(", ")}`);

  const initTx = await govReg.initializeGovernance(regulators, threshold);
  const initReceipt = await initTx.wait();
  console.log(`✓ Governance initialized (tx: ${initReceipt.hash})`);

  // ── Save addresses, keyed per-network ────────────────────────────────────
  const addrFile = path.join(__dirname, "..", "deployed-addresses.json");
  let store = {};
  if (fs.existsSync(addrFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(addrFile, "utf8"));
      if (existing.GovernmentRegistry && !existing.sepolia && !existing.arbitrumSepolia) {
        store.sepolia = existing;
      } else {
        store = existing;
      }
    } catch {
      store = {};
    }
  }

  store[net] = {
    GovernmentRegistry: govRegAddr,
    ManufacturerBatch: mfgBatchAddr,
    SupplyChainTracker: sctAddr,
    chainId: network.config.chainId,
    deployer: deployer.address,
    governance: {
      regulators,
      threshold,
      initialized: true,
    },
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(addrFile, JSON.stringify(store, null, 2));
  console.log(`\n✓ Addresses saved to deployed-addresses.json under "${net}"`);

  // ── Emit the exact backend .env block to paste ───────────────────────────
  const prefix = ENV_PREFIX[net] ?? "";
  console.log("\n┌─ Add these to backend/.env ─────────────────────────────");
  if (net === "arbitrumSepolia") {
    console.log("│ ACTIVE_NETWORK=arbitrum");
  }
  console.log(`│ ${prefix}GOVERNMENT_REGISTRY_ADDRESS=${govRegAddr}`);
  console.log(`│ ${prefix}MANUFACTURER_BATCH_ADDRESS=${mfgBatchAddr}`);
  console.log(`│ ${prefix}SUPPLY_CHAIN_TRACKER_ADDRESS=${sctAddr}`);
  console.log("└─────────────────────────────────────────────────────────");

  // ── Verification helper ─────────────────────────────────────────────────
  console.log("\n┌─ Verify on block explorer (optional) ───────────────────");
  console.log(`│ npx hardhat verify --network ${net} ${govRegAddr} ${deployer.address}`);
  console.log(`│ npx hardhat verify --network ${net} ${mfgBatchAddr} ${govRegAddr}`);
  console.log(`│ npx hardhat verify --network ${net} ${sctAddr} ${govRegAddr}`);
  console.log("└─────────────────────────────────────────────────────────");

  console.log("\n✓ Deployment complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
