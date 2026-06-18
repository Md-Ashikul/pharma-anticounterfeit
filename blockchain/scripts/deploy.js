const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Maps a hardhat network name to the env-var prefix the backend expects.
// Sepolia (L1) uses the bare names; Arbitrum (L2) uses the ARBITRUM_ prefix.
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
  // The deployer IS the government authority
  const govReg = await GovReg.deploy(deployer.address);
  await govReg.waitForDeployment();
  const govRegAddr = await govReg.getAddress();
  console.log("GovernmentRegistry deployed to:", govRegAddr);

  // ── 2. Deploy ManufacturerBatch ───────────────────────────────────────────
  const MfgBatch = await ethers.getContractFactory("ManufacturerBatch");
  const mfgBatch = await MfgBatch.deploy(govRegAddr);
  await mfgBatch.waitForDeployment();
  const mfgBatchAddr = await mfgBatch.getAddress();
  console.log("ManufacturerBatch deployed to:", mfgBatchAddr);

  // ── 3. Deploy SupplyChainTracker ──────────────────────────────────────────
  const SCT = await ethers.getContractFactory("SupplyChainTracker");
  const sct = await SCT.deploy(govRegAddr);
  await sct.waitForDeployment();
  const sctAddr = await sct.getAddress();
  console.log("SupplyChainTracker deployed to:", sctAddr);

  // ── Save addresses, keyed per-network so we never clobber another chain ────
  const addrFile = path.join(__dirname, "..", "deployed-addresses.json");
  let store = {};
  if (fs.existsSync(addrFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(addrFile, "utf8"));
      // Migrate the old flat format ({ GovernmentRegistry: ... }) into sepolia.
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
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(addrFile, JSON.stringify(store, null, 2));
  console.log(`\nAddresses saved to deployed-addresses.json under "${net}"`);

  // ── Emit the exact backend .env block to paste ────────────────────────────
  const prefix = ENV_PREFIX[net] ?? "";
  console.log("\n── Add these to backend/.env ─────────────────────────────");
  if (net === "arbitrumSepolia") {
    console.log("ACTIVE_NETWORK=arbitrum");
  }
  console.log(`${prefix}GOVERNMENT_REGISTRY_ADDRESS=${govRegAddr}`);
  console.log(`${prefix}MANUFACTURER_BATCH_ADDRESS=${mfgBatchAddr}`);
  console.log(`${prefix}SUPPLY_CHAIN_TRACKER_ADDRESS=${sctAddr}`);
  console.log("──────────────────────────────────────────────────────────");

  // ── Verification helper ───────────────────────────────────────────────────
  console.log("\n── Verify on the block explorer (optional) ───────────────");
  console.log(`npx hardhat verify --network ${net} ${govRegAddr} ${deployer.address}`);
  console.log(`npx hardhat verify --network ${net} ${mfgBatchAddr} ${govRegAddr}`);
  console.log(`npx hardhat verify --network ${net} ${sctAddr} ${govRegAddr}`);
  console.log("──────────────────────────────────────────────────────────");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
