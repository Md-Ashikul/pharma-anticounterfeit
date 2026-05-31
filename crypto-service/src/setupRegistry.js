/**
 * setupRegistry.js — Research Automation Utility
 * Dynamic whitelisting script supporting Ethereum Sepolia and Arbitrum Sepolia targets.
 *
 * Usage: 
 * node src/setupRegistry.js sepolia
 * node src/setupRegistry.js arbitrum
 */

require("dotenv").config();
const { ethers } = require("ethers");

// Human-Readable ABI matching contract interfaces
const GOVERNMENT_REGISTRY_ABI = [
  "function registerEntity(address wallet, string name, string licenseNumber, uint8 role) external",
  "function isWhitelisted(address wallet) external view returns (bool)",
  "function getEntityRoleString(address wallet) external view returns (string)",
];

async function main() {
  // 1. Process Network Arguments cleanly
  const targetArg = process.argv[2] ? process.argv[2].toLowerCase() : "sepolia";
  const isArbitrum = targetArg === "arbitrum" || targetArg === "l2";
  const networkName = isArbitrum ? "ARBITRUM SEPOLIA (L2)" : "ETHEREUM SEPOLIA (L1)";

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║    REGISTRY SETUP — Whitelisting Entities    ║");
  console.log(`  TARGET NETWORK: ${networkName}`);
  console.log("╚══════════════════════════════════════════════╝\n");

  // 2. Resolve Environment Variables Based on Chosen Track
  const rpcUrl = isArbitrum ? process.env.ARBITRUM_RPC_URL : process.env.RPC_URL;
  const registryAddress = isArbitrum 
    ? process.env.ARBITRUM_GOVERNMENT_REGISTRY_ADDRESS 
    : process.env.GOVERNMENT_REGISTRY_ADDRESS;

  if (!rpcUrl) {
    throw new Error(`Missing RPC configuration for ${targetArg} in .env file.`);
  }
  if (!registryAddress) {
    throw new Error(`Missing Government Registry Address configuration for ${targetArg} in .env file.`);
  }

  // 3. Initialize Connections
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  // Verify provider connection before attempting transaction routines
  const networkDetails = await provider.getNetwork();
  console.log(`[Network Connected] Chain ID: ${networkDetails.chainId}`);
  console.log(`[Contract Target] Registry Address: ${registryAddress}\n`);

  const govWallet = new ethers.Wallet(
    process.env.GOVERNMENT_PRIVATE_KEY,
    provider
  );

  const registryContract = new ethers.Contract(
    registryAddress,
    GOVERNMENT_REGISTRY_ABI,
    govWallet
  );

  // Supply Chain Wallet Target Declarations
  const manufacturerAddress = "0xF4A4b36D818804720b3443438eBdA1aB01AfF22e";
  const distributorAddress = "0xAcb9bf874Cc3eA2a67cb94a60575192CEfeF831b";
  const retailerAddress = "0x4dEE81d53d984F6B1F3d6Ca9c4F2023E825E939F";

  // Entity Array Config (Role mapping: 1 = Manufacturer, 2 = Distributor, 3 = Retailer)
  const entities = [
    { address: manufacturerAddress, name: "PharmaCorp Ltd", license: "MFG-001", role: 1 },
    { address: distributorAddress, name: "DistribHub Inc", license: "DIST-001", role: 2 },
    { address: retailerAddress, name: "RetailMed Co", license: "RET-001", role: 3 },
  ];

  // 4. Sequential Execution Pipeline
  for (const entity of entities) {
    console.log(`Processing Registration: ${entity.name} (${entity.address})...`);

    try {
      // Direct state lookup check
      const alreadyWhitelisted = await registryContract.isWhitelisted(entity.address);

      if (alreadyWhitelisted) {
        const assignedRole = await registryContract.getEntityRoleString(entity.address);
        console.log(`  ⚠️  Entity already active — Verified Role: [${assignedRole || "Unknown State"}]\n`);
        continue;
      }

      // Dispatch write transaction
      const tx = await registryContract.registerEntity(
        entity.address,
        entity.name,
        entity.license,
        entity.role
      );

      console.log(`  📡 Transaction broadcasted! Hash: ${tx.hash}`);
      console.log(`  ⏳ Awaiting block inclusion confirmations...`);
      
      // Wait for block finalization receipt
      const receipt = await tx.wait();
      
      if (receipt.status === 0) {
        throw new Error("Blockchain node reports transaction receipt execution status failure (Status 0).");
      }

      // Fetch newly committed role representation to confirm updates
      const confirmedRole = await registryContract.getEntityRoleString(entity.address);
      console.log(`  ✅ Successfully Whitelisted! Registered as: ${confirmedRole}\n`);

    } catch (err) {
      // Fail-safe error parsing capturing standard or custom errors across Ethers versions
      let errorReason = "Unknown Smart Contract Revert Condition";
      
      if (err.reason) errorReason = err.reason;
      else if (err.shortMessage) errorReason = err.shortMessage;
      else if (err.message) errorReason = err.message;
      
      console.log(`  ❌ Operational Exception Caught: ${errorReason}\n`);
    }
  }

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║         REGISTRY SETUP COMPLETE ✅           ║");
  console.log("╚══════════════════════════════════════════════╝\n");
  console.log(`Execution complete. You can now execute: node src/generateBatch.js ${targetArg}\n`);
}

main().catch((err) => {
  console.error("\n❌ Critical Failure During Setup Loop Execution:", err.message);
  process.exit(1);
});