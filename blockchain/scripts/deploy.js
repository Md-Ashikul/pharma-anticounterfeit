const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  // ── 1. Deploy GovernmentRegistry ──────────────────────────────────────────
  const GovReg = await ethers.getContractFactory("GovernmentRegistry");
  // The deployer IS the government authority
  const govReg = await GovReg.deploy(deployer.address);
  await govReg.waitForDeployment();
  console.log("GovernmentRegistry deployed to:", await govReg.getAddress());

  // ── 2. Deploy ManufacturerBatch ───────────────────────────────────────────
  const MfgBatch = await ethers.getContractFactory("ManufacturerBatch");
  const mfgBatch = await MfgBatch.deploy(await govReg.getAddress());
  await mfgBatch.waitForDeployment();
  console.log("ManufacturerBatch deployed to:", await mfgBatch.getAddress());

  // ── 3. Deploy SupplyChainTracker ──────────────────────────────────────────
  const SCT = await ethers.getContractFactory("SupplyChainTracker");
  const sct = await SCT.deploy(await govReg.getAddress());
  await sct.waitForDeployment();
  console.log("SupplyChainTracker deployed to:", await sct.getAddress());

  // ── Save addresses for next steps ─────────────────────────────────────────
  const addresses = {
    GovernmentRegistry: await govReg.getAddress(),
    ManufacturerBatch:  await mfgBatch.getAddress(),
    SupplyChainTracker: await sct.getAddress(),
    deployedAt:         new Date().toISOString(),
  };

  const fs = require("fs");
  fs.writeFileSync(
    "deployed-addresses.json",
    JSON.stringify(addresses, null, 2)
  );
  console.log("\nAddresses saved to deployed-addresses.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});