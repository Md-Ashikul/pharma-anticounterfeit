/**
 * setupRegistry.js — Research Automation Utility (Consortium / M-of-N model)
 *
 * Registers the supply-chain entities (Manufacturer, Distributor, Retailer)
 * through the consortium governance flow, using ALL configured regulators
 * dynamically. The on-chain contract decides automatically: the moment the
 * approval tally reaches the threshold, the proposal auto-executes — no manual
 * key swapping and no backend changes required.
 *
 * Flow per entity:
 *   1. Regulator 1 calls proposeRegisterEntity(...)  -> auto-votes YES (1 approval)
 *   2. Each remaining regulator (2, 3, ...) calls voteOnProposal(id, choice)
 *      in turn. After every vote the script checks whether the proposal has
 *      already executed (threshold reached) and stops voting if so — because
 *      the contract reverts any vote on a non-Pending proposal.
 *
 * Because execution is driven purely by approvalsCount >= threshold, ANY
 * M-of-N subset of YES votes works (e.g. 1+2, 1+3, or 2+3 for a 2-of-3 setup).
 *
 * Usage:
 *   node src/setupRegistry.js sepolia
 *   node src/setupRegistry.js arbitrum
 *
 * Required .env vars (in crypto-service/.env):
 *   RPC_URL / ARBITRUM_RPC_URL
 *   GOVERNMENT_REGISTRY_ADDRESS / ARBITRUM_GOVERNMENT_REGISTRY_ADDRESS
 *   REGULATOR_1_PRIVATE_KEY   (proposer; usually Account 1 / GOVERNMENT_PRIVATE_KEY)
 *   REGULATOR_2_PRIVATE_KEY   (second regulator / Account 2)
 *   REGULATOR_3_PRIVATE_KEY   (third regulator / Account 3)
 *
 * Optional .env vars:
 *   REGULATOR_1_VOTE, REGULATOR_2_VOTE, REGULATOR_3_VOTE   ("yes"/"no", default "yes")
 *     - Lets you simulate a dissenting regulator. Note: the proposer's vote is
 *       always YES (the contract auto-casts it on proposal creation), so
 *       REGULATOR_1_VOTE is effectively ignored for whoever proposes.
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

function voteFromEnv(name) {
  // Defaults to YES unless explicitly set to a "no"-ish value.
  const raw = (process.env[name] || "yes").trim().toLowerCase();
  return !["no", "false", "0", "n", "reject", "nay"].includes(raw);
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

  // 3. Connect
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const networkDetails = await provider.getNetwork();
  console.log(`[Network Connected] Chain ID: ${networkDetails.chainId}`);
  console.log(`[Contract Target] Registry Address: ${registryAddress}\n`);

  // Read-only connection for status checks.
  const registryRead = new ethers.Contract(registryAddress, GOVERNMENT_REGISTRY_ABI, provider);

  // 4. Validate governance state
  const initialized = await registryRead.isInitialized();
  if (!initialized) {
    throw new Error("Governance is NOT initialized on this contract. Run the deploy script first.");
  }

  const threshold = Number(await registryRead.getThreshold());
  const onChainRegulators = (await registryRead.getRegulators()).map((r) => r.toLowerCase());
  console.log(`[Governance] Threshold: ${threshold}-of-${onChainRegulators.length}`);
  console.log(`[Governance] Regulators: ${onChainRegulators.join(", ")}\n`);

  // 5. Build the dynamic list of regulator signers from the env.
  //    Regulator 1 (the proposer) falls back to GOVERNMENT_PRIVATE_KEY.
  const regulatorConfigs = [
    { idx: 1, key: process.env.REGULATOR_1_PRIVATE_KEY || process.env.GOVERNMENT_PRIVATE_KEY, vote: voteFromEnv("REGULATOR_1_VOTE") },
    { idx: 2, key: process.env.REGULATOR_2_PRIVATE_KEY, vote: voteFromEnv("REGULATOR_2_VOTE") },
    { idx: 3, key: process.env.REGULATOR_3_PRIVATE_KEY, vote: voteFromEnv("REGULATOR_3_VOTE") },
  ];

  const regulators = [];
  for (const cfg of regulatorConfigs) {
    if (!cfg.key) continue; // skip unset keys
    const wallet = new ethers.Wallet(cfg.key, provider);
    const addr = (await wallet.getAddress()).toLowerCase();
    if (!onChainRegulators.includes(addr)) {
      console.log(`[Skip] REGULATOR_${cfg.idx} (${addr.slice(0, 10)}…) is NOT an on-chain regulator — ignoring.`);
      continue;
    }
    if (regulators.some((r) => r.addr === addr)) {
      console.log(`[Skip] REGULATOR_${cfg.idx} duplicates an already-loaded regulator — ignoring.`);
      continue;
    }
    regulators.push({
      idx: cfg.idx,
      addr,
      vote: cfg.vote,
      contract: new ethers.Contract(registryAddress, GOVERNMENT_REGISTRY_ABI, wallet),
    });
  }

  if (regulators.length === 0) {
    throw new Error("No valid regulator keys found in .env (need at least REGULATOR_1_PRIVATE_KEY).");
  }

  // The first loaded regulator acts as the proposer (auto-votes YES).
  const proposer = regulators[0];
  const voters = regulators.slice(1); // remaining regulators vote in turn

  // Sanity: can the configured YES votes even reach the threshold?
  const maxYes = 1 /* proposer auto-YES */ + voters.filter((v) => v.vote).length;
  console.log(`[Plan] Proposer: REGULATOR_${proposer.idx} (auto-YES).`);
  console.log(
    `[Plan] Other voters: ${
      voters.length ? voters.map((v) => `REGULATOR_${v.idx}=${v.vote ? "YES" : "NO"}`).join(", ") : "(none)"
    }`
  );
  console.log(`[Plan] Max achievable YES votes: ${maxYes} (threshold ${threshold}).`);
  if (maxYes < threshold) {
    console.log(
      `[Warning] Configured YES votes (${maxYes}) cannot reach the threshold (${threshold}). ` +
        `Proposals will be created but will stay Pending. Set more REGULATOR_*_VOTE=yes or add keys.\n`
    );
  } else {
    console.log("");
  }

  // 6. Supply-chain wallets (overridable via env). Roles: 1=Mfg, 2=Dist, 3=Retail.
  const manufacturerAddress =
    process.env.MANUFACTURER_ADDRESS || "0x4dEE81d53d984F6B1F3d6Ca9c4F2023E825E939F";
  const distributorAddress = process.env.DISTRIBUTOR_ADDRESS || "0xD528...REPLACE_ME";
  const retailerAddress = process.env.RETAILER_ADDRESS || "0x....REPLACE_ME";

  const entities = [
    { address: manufacturerAddress, name: "PharmaCorp Ltd", license: "MFG-001", role: 1 },
    { address: distributorAddress, name: "DistribHub Inc", license: "DIST-001", role: 2 },
    { address: retailerAddress, name: "RetailMed Co", license: "RET-001", role: 3 },
  ];

  // 7. Register each entity via the consortium flow.
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

      // Step 1: proposer proposes (auto-votes YES => 1 approval).
      console.log(`  📡 [Reg${proposer.idx} ${proposer.addr.slice(0, 8)}…] proposing registration...`);
      const proposeTx = await proposer.contract.proposeRegisterEntity(
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
          const parsed = proposer.contract.interface.parseLog(log);
          if (parsed && parsed.name === "ProposalCreated") {
            proposalId = parsed.args.proposalId;
            break;
          }
        } catch {
          /* not our event */
        }
      }
      if (proposalId === null) throw new Error("Could not find ProposalCreated event / proposalId.");
      console.log(`  ✓ Proposal #${proposalId.toString()} created (1/${threshold} approvals from proposer).`);

      // Step 2: every other regulator casts its vote, in order. After each
      // vote, check if the proposal already executed — if so, stop (further
      // votes would revert because the proposal is no longer Pending).
      for (const voter of voters) {
        if (await registryRead.isWhitelisted(entity.address)) {
          console.log(`  ⏹️  Threshold already met — skipping remaining votes.`);
          break;
        }
        console.log(`  🗳️  [Reg${voter.idx} ${voter.addr.slice(0, 8)}…] voting ${voter.vote ? "YES" : "NO"}...`);
        const voteTx = await voter.contract.voteOnProposal(proposalId, voter.vote);
        const voteReceipt = await voteTx.wait();
        if (voteReceipt.status === 0) throw new Error("Vote tx reverted (status 0).");
      }

      // Confirm execution.
      const nowWhitelisted = await registryRead.isWhitelisted(entity.address);
      if (nowWhitelisted) {
        const role = await registryRead.getEntityRoleString(entity.address);
        console.log(`  ✅ Registered & executed automatically! Role: ${role}\n`);
      } else {
        console.log(`  ⏳ Proposal still Pending — YES votes did not reach the threshold.\n`);
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
