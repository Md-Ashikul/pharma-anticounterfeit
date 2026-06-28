/**
 * setupRegistry.js — Research Automation Utility (Consortium / M-of-N model)
 *
 * Registers the supply-chain entities (Manufacturer, Distributor, Retailer)
 * through the consortium governance flow:
 *
 *   1. Regulator 1 calls proposeRegisterEntity(...)  -> auto-votes YES (1 approval)
 *   2. Regulator 2 calls voteOnProposal(id, true)    -> 2 approvals -> auto-executes
 *
 * This replaces the old direct registerEntity() call, which no longer exists
 * on the consortium GovernmentRegistry contract.
 *
 * Usage:
 *   node src/setupRegistry.js sepolia
 *   node src/setupRegistry.js arbitrum
 *
 * Required .env vars (in crypto-service/.env):
 *   RPC_URL / ARBITRUM_RPC_URL
 *   GOVERNMENT_REGISTRY_ADDRESS / ARBITRUM_GOVERNMENT_REGISTRY_ADDRESS
 *   REGULATOR_1_PRIVATE_KEY   (proposer; usually Account 1 / GOVERNMENT_PRIVATE_KEY)
 *   REGULATOR_2_PRIVATE_KEY   (second voter; Account 2)
 *
 * Optional .env vars to override the supply-chain wallets:
 *   MANUFACTURER_ADDRESS, DISTRIBUTOR_ADDRESS, RETAILER_ADDRESS
 */

require("dotenv").config();
const { ethers } = require("ethers");

// Human-readable ABI matching the consortium contract interface.
const GOVERNMENT_REGISTRY_ABI = [
  "function proposeRegisterEntity(address wallet, string name, string licenseNumber, uint8 role) external returns (uint256)",
  "function voteOnProposal(uint256 proposalId, bool voteChoice) external",
  "function isWhitelisted(address wallet) external view returns (bool)",
  "function getEntityRoleString(address wallet) external view returns (string)",
  "function getThreshold() external view returns (uint256)",
  "function getRegulators() external view returns (address[])",
  "function isInitialized() external view returns (bool)",
  "event ProposalCreated(uint256 indexed proposalId, address indexed proposer, uint8 action, address targetEntity, uint256 createdAt, uint256 expiryAt)",
];

function parseError(err) {
  if (err.reason) return err.reason;
  if (err.shortMessage) return err.shortMessage;
  if (err.message) return err.message;
  return "Unknown Smart Contract Revert Condition";
}

async function main() {
  // 1. Network argument
  const targetArg = process.argv[2] ? process.argv[2].toLowerCase() : "sepolia";
  const isArbitrum = targetArg === "arbitrum" || targetArg === "l2";
  const networkName = isArbitrum ? "ARBITRUM SEPOLIA (L2)" : "ETHEREUM SEPOLIA (L1)";

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   REGISTRY SETUP — Consortium Registration   ║");
  console.log(`  TARGET NETWORK: ${networkName}`);
  console.log("╚══════════════════════════════════════════════╝\n");

  // 2. Resolve environment per network
  const rpcUrl = isArbitrum ? process.env.ARBITRUM_RPC_URL : process.env.RPC_URL;
  const registryAddress = isArbitrum
    ? process.env.ARBITRUM_GOVERNMENT_REGISTRY_ADDRESS
    : process.env.GOVERNMENT_REGISTRY_ADDRESS;

  if (!rpcUrl) throw new Error(`Missing RPC configuration for ${targetArg} in .env file.`);
  if (!registryAddress) {
    throw new Error(`Missing Government Registry Address for ${targetArg} in .env file.`);
  }

  // Regulator keys for the multisig flow. Falls back to GOVERNMENT_PRIVATE_KEY
  // for regulator 1 so existing setups keep working.
  const reg1Key = process.env.REGULATOR_1_PRIVATE_KEY || process.env.GOVERNMENT_PRIVATE_KEY;
  const reg2Key = process.env.REGULATOR_2_PRIVATE_KEY;

  if (!reg1Key) {
    throw new Error("Missing REGULATOR_1_PRIVATE_KEY (or GOVERNMENT_PRIVATE_KEY) in .env.");
  }

  // 3. Connect
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const networkDetails = await provider.getNetwork();
  console.log(`[Network Connected] Chain ID: ${networkDetails.chainId}`);
  console.log(`[Contract Target] Registry Address: ${registryAddress}\n`);

  const reg1Wallet = new ethers.Wallet(reg1Key, provider);
  const registryAsReg1 = new ethers.Contract(registryAddress, GOVERNMENT_REGISTRY_ABI, reg1Wallet);

  // Read-only connection for status checks.
  const registryRead = new ethers.Contract(registryAddress, GOVERNMENT_REGISTRY_ABI, provider);

  // 4. Validate governance state
  const initialized = await registryRead.isInitialized();
  if (!initialized) {
    throw new Error("Governance is NOT initialized on this contract. Run the deploy script first.");
  }

  const threshold = Number(await registryRead.getThreshold());
  const regulators = await registryRead.getRegulators();
  console.log(`[Governance] Threshold: ${threshold}-of-${regulators.length}`);
  console.log(`[Governance] Regulators: ${regulators.join(", ")}\n`);

  const reg1Addr = await reg1Wallet.getAddress();
  if (!regulators.map((r) => r.toLowerCase()).includes(reg1Addr.toLowerCase())) {
    throw new Error(`Proposer ${reg1Addr} is NOT an on-chain regulator. Use a regulator key for REGULATOR_1_PRIVATE_KEY.`);
  }

  // A second regulator is only needed when threshold > 1.
  let registryAsReg2 = null;
  let reg2Addr = null;
  if (threshold > 1) {
    if (!reg2Key) {
      throw new Error(
        `Threshold is ${threshold} but REGULATOR_2_PRIVATE_KEY is not set. ` +
          `A second regulator must vote to reach the threshold.`
      );
    }
    const reg2Wallet = new ethers.Wallet(reg2Key, provider);
    reg2Addr = await reg2Wallet.getAddress();
    if (!regulators.map((r) => r.toLowerCase()).includes(reg2Addr.toLowerCase())) {
      throw new Error(`Second voter ${reg2Addr} is NOT an on-chain regulator.`);
    }
    if (reg2Addr.toLowerCase() === reg1Addr.toLowerCase()) {
      throw new Error("REGULATOR_2 must be a DIFFERENT address than REGULATOR_1 to add a second approval.");
    }
    registryAsReg2 = new ethers.Contract(registryAddress, GOVERNMENT_REGISTRY_ABI, reg2Wallet);
  }

  // 5. Supply-chain wallets (overridable via env). Roles: 1=Mfg, 2=Dist, 3=Retail.
  const manufacturerAddress =
    process.env.MANUFACTURER_ADDRESS || "0x4dEE81d53d984F6B1F3d6Ca9c4F2023E825E939F";
  const distributorAddress =
    process.env.DISTRIBUTOR_ADDRESS || "0xD528...REPLACE_ME";
  const retailerAddress =
    process.env.RETAILER_ADDRESS || "0x....REPLACE_ME";

  const entities = [
    { address: manufacturerAddress, name: "PharmaCorp Ltd", license: "MFG-001", role: 1 },
    { address: distributorAddress, name: "DistribHub Inc", license: "DIST-001", role: 2 },
    { address: retailerAddress, name: "RetailMed Co", license: "RET-001", role: 3 },
  ];

  // 6. Register each entity via the consortium flow.
  for (const entity of entities) {
    console.log(`Processing: ${entity.name} (${entity.address}) — role ${entity.role}...`);

    if (!ethers.isAddress(entity.address)) {
      console.log(`  ⏭️  Skipped — address is a placeholder. Set its *_ADDRESS env var.\n`);
      continue;
    }

    try {
      // Skip if already registered (idempotent).
      if (await registryRead.isWhitelisted(entity.address)) {
        const role = await registryRead.getEntityRoleString(entity.address);
        console.log(`  ⚠️  Already active — Verified Role: [${role || "Unknown"}]\n`);
        continue;
      }

      // Step 1: regulator 1 proposes (auto-votes YES).
      console.log(`  📡 [Reg1 ${reg1Addr.slice(0, 8)}…] proposing registration...`);
      const proposeTx = await registryAsReg1.proposeRegisterEntity(
        entity.address,
        entity.name,
        entity.license,
        entity.role
      );
      const proposeReceipt = await proposeTx.wait();
      if (proposeReceipt.status === 0) throw new Error("Propose tx reverted (status 0).");

      // Extract proposalId from the ProposalCreated event.
      let proposalId = null;
      for (const log of proposeReceipt.logs) {
        try {
          const parsed = registryAsReg1.interface.parseLog(log);
          if (parsed && parsed.name === "ProposalCreated") {
            proposalId = parsed.args.proposalId;
            break;
          }
        } catch {
          /* not our event */
        }
      }
      if (proposalId === null) throw new Error("Could not find ProposalCreated event / proposalId.");
      console.log(`  ✓ Proposal #${proposalId.toString()} created (1/${threshold} approvals).`);

      // Step 2: if threshold > 1, regulator 2 votes YES -> auto-executes.
      if (threshold > 1) {
        console.log(`  🗳️  [Reg2 ${reg2Addr.slice(0, 8)}…] voting YES...`);
        const voteTx = await registryAsReg2.voteOnProposal(proposalId, true);
        const voteReceipt = await voteTx.wait();
        if (voteReceipt.status === 0) throw new Error("Vote tx reverted (status 0).");
      }

      // Confirm execution.
      const nowWhitelisted = await registryRead.isWhitelisted(entity.address);
      if (nowWhitelisted) {
        const role = await registryRead.getEntityRoleString(entity.address);
        console.log(`  ✅ Registered & executed! Role: ${role}\n`);
      } else {
        console.log(`  ⏳ Proposal created but not yet executed (need more approvals).\n`);
      }
    } catch (err) {
      console.log(`  ❌ Exception: ${parseError(err)}\n`);
    }
  }

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║         REGISTRY SETUP COMPLETE ✅           ║");
  console.log("╚══════════════════════════════════════════════╝\n");
  console.log(`Next: node src/generateBatch.js ${targetArg}\n`);
}

main().catch((err) => {
  console.error("\n❌ Critical Failure During Setup:", err.message);
  process.exit(1);
});
