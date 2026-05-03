/**
 * setupRegistry.js — One-time script to whitelist entities on the local Hardhat node.
 * Run this ONCE after deploying contracts, before running generateBatch.js
 *
 * Usage: node src/setupRegistry.js
 */

require("dotenv").config();
const { ethers } = require("ethers");

const GOVERNMENT_REGISTRY_ABI = [
  "function registerEntity(address wallet, string name, string licenseNumber, uint8 role) external",
  "function isWhitelisted(address wallet) external view returns (bool)",
  "function getEntityRoleString(address wallet) external view returns (string)",
];

async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   REGISTRY SETUP — Whitelisting Entities     ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

  // Government wallet = Account #0 (the deployer/owner)
  const govWallet = new ethers.Wallet(
    process.env.GOVERNMENT_PRIVATE_KEY,
    provider
  );

  const registry = new ethers.Contract(
    process.env.GOVERNMENT_REGISTRY_ADDRESS,
    GOVERNMENT_REGISTRY_ABI,
    govWallet
  );

  // Hardhat Account #1 = Manufacturer
  const manufacturerAddress = "0xF4A4b36D818804720b3443438eBdA1aB01AfF22e";
  const distributorAddress = "0xAcb9bf874Cc3eA2a67cb94a60575192CEfeF831b";
  const retailerAddress = "0x4dEE81d53d984F6B1F3d6Ca9c4F2023E825E939F";

  // Role enum: 1=Manufacturer, 2=Distributor, 3=Retailer
  const entities = [
    { address: manufacturerAddress, name: "PharmaCorp Ltd", license: "MFG-001", role: 1 },
    { address: distributorAddress, name: "DistribHub Inc", license: "DIST-001", role: 2 },
    { address: retailerAddress, name: "RetailMed Co", license: "RET-001", role: 3 },
  ];

  for (const entity of entities) {
    console.log(`Registering: ${entity.name} (${entity.address})...`);

    // Check if already registered
    const already = await registry.isWhitelisted(entity.address);
    if (already) {
      console.log(`  ⚠️  Already whitelisted — skipping\n`);
      continue;
    }

    const tx = await registry.registerEntity(
      entity.address,
      entity.name,
      entity.license,
      entity.role
    );
    await tx.wait();

    const role = await registry.getEntityRoleString(entity.address);
    console.log(`  ✅ Registered as: ${role}\n`);
  }

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   REGISTRY SETUP COMPLETE ✅                 ║");
  console.log("╚══════════════════════════════════════════════╝\n");
  console.log("You can now run: node src/generateBatch.js\n");
}

main().catch((err) => {
  console.error("\n❌ Setup failed:", err.message);
  process.exit(1);
});