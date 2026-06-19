/**
 * test-governance.js
 *
 * Example script demonstrating the M-of-N voting flow.
 * Shows how to:
 *   1. Initialize governance with 3 regulators, 2-of-3 threshold
 *   2. Propose a manufacturer registration
 *   3. Vote on the proposal (auto-executes at threshold)
 *
 * Run: npx hardhat run scripts/test-governance.js --network arbitrumSepolia
 */

const { ethers, network } = require("hardhat");

async function main() {
  const [deployer, regulator1, regulator2, regulator3, manufacturer] = await ethers.getSigners();

  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║         M-of-N Governance Voting Flow Demo                 ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Deploy contracts
  // ─────────────────────────────────────────────────────────────────────────

  console.log("📋 STEP 1: Deploying contracts...\n");

  const GovReg = await ethers.getContractFactory("GovernmentRegistry");
  const govReg = await GovReg.deploy(deployer.address);
  await govReg.waitForDeployment();
  const govRegAddr = await govReg.getAddress();

  console.log(`✓ GovernmentRegistry: ${govRegAddr}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: Initialize governance (2-of-3 threshold)
  // ─────────────────────────────────────────────────────────────────────────

  console.log("📋 STEP 2: Initializing M-of-N governance (2-of-3 threshold)...\n");

  const regulators = [regulator1.address, regulator2.address, regulator3.address];
  const threshold = 2;

  const initTx = await govReg.initializeGovernance(regulators, threshold);
  await initTx.wait();

  console.log(`✓ Governance initialized:`);
  console.log(`  Regulators: ${regulators.map(r => r.slice(0, 10) + "...").join(", ")}`);
  console.log(`  Threshold: ${threshold}-of-${regulators.length}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: Regulator 1 proposes registering a manufacturer
  // ─────────────────────────────────────────────────────────────────────────

  console.log("📋 STEP 3: Regulator 1 proposes manufacturer registration...\n");

  const govRegReg1 = govReg.connect(regulator1);

  const proposeTx = await govRegReg1.proposeRegisterEntity(
    manufacturer.address,
    "Pharma Corp A",
    "LIC-2025-001",
    1 // EntityRole.Manufacturer
  );
  const proposeReceipt = await proposeTx.wait();

  // Extract proposal ID from logs
  const proposalEvent = proposeReceipt.logs
    .map(log => {
      try {
        return govReg.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find(evt => evt?.name === "ProposalCreated");

  const proposalId = proposalEvent.args.proposalId.toString();

  console.log(`✓ Proposal #${proposalId} created by Regulator 1`);
  console.log(`  Action: Register Entity`);
  console.log(`  Target: ${manufacturer.address.slice(0, 10)}...`);
  console.log(`  Status: PENDING (Regulator 1 auto-voted YES)\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4: Check proposal details
  // ─────────────────────────────────────────────────────────────────────────

  console.log("📋 STEP 4: Checking proposal details...\n");

  const proposal = await govReg.getProposal(proposalId);
  console.log(`✓ Proposal Status: ${["Pending", "Executed", "Expired", "Cancelled"][proposal[0].status]}`);
  console.log(`  Approvals: 1 / ${threshold}`);
  console.log(`  Voters: ${proposal[1].length} voted\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 5: Regulator 2 votes YES → THRESHOLD MET → AUTO-EXECUTES
  // ─────────────────────────────────────────────────────────────────────────

  console.log("📋 STEP 5: Regulator 2 votes YES...\n");

  const govRegReg2 = govReg.connect(regulator2);
  const voteTx = await govRegReg2.voteOnProposal(proposalId, true);
  const voteReceipt = await voteTx.wait();

  const executedEvent = voteReceipt.logs
    .map(log => {
      try {
        return govReg.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find(evt => evt?.name === "ProposalExecuted");

  if (executedEvent) {
    console.log(`✓ Regulator 2 voted YES`);
    console.log(`  Approvals reached threshold (2/2) → PROPOSAL AUTO-EXECUTED!\n`);
  } else {
    console.log(`✓ Regulator 2 voted YES`);
    console.log(`  Approvals: 2 / ${threshold} (threshold met)\n`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 6: Verify manufacturer is now registered
  // ─────────────────────────────────────────────────────────────────────────

  console.log("📋 STEP 6: Verifying manufacturer is registered on-chain...\n");

  const isWhitelisted = await govReg.isWhitelisted(manufacturer.address);
  const entity = await govReg.getEntity(manufacturer.address);

  console.log(`✓ Is Whitelisted: ${isWhitelisted}`);
  console.log(`  Name: ${entity.name}`);
  console.log(`  License: ${entity.licenseNumber}`);
  console.log(`  Role: ${{ 0: "None", 1: "Manufacturer", 2: "Distributor", 3: "Retailer" }[entity.role]}`);
  console.log(`  Status: ${{ 0: "NotRegistered", 1: "Active", 2: "Revoked" }[entity.status]}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 7: Demo vote change (Regulator 3 votes NO, approval count stays at 1)
  // ─────────────────────────────────────────────────────────────────────────

  console.log("📋 STEP 7: Demo—create another proposal to show vote changes...\n");

  const proposeTx2 = await govRegReg1.proposeRegisterEntity(
    ethers.getAddress("0x0000000000000000000000000000000000000001"),
    "Another Corp",
    "LIC-2025-002",
    2 // Distributor
  );
  const proposeReceipt2 = await proposeTx2.wait();

  const proposalEvent2 = proposeReceipt2.logs
    .map(log => {
      try {
        return govReg.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find(evt => evt?.name === "ProposalCreated");

  const proposalId2 = proposalEvent2.args.proposalId.toString();

  console.log(`✓ Proposal #${proposalId2} created (Similar registration)`);
  console.log(`  Regulator 1: YES (auto-voted)`);
  console.log(`  Regulator 2: votes NO (demo)\n`);

  const govRegReg2b = govReg.connect(regulator2);
  const voteTx2 = await govRegReg2b.voteOnProposal(proposalId2, false);
  await voteTx2.wait();

  const proposal2 = await govReg.getProposal(proposalId2);
  console.log(`✓ Regulator 2 voted NO`);
  console.log(`  Approvals: ${proposal2[0].approvalsCount} / ${threshold} (not yet executed)\n`);

  console.log("  Now if Regulator 2 changes mind and votes YES...\n");

  const voteTx2b = await govRegReg2b.voteOnProposal(proposalId2, true);
  await voteTx2b.wait();

  const proposal2b = await govReg.getProposal(proposalId2);
  console.log(`✓ Regulator 2 changed vote to YES`);
  console.log(`  Approvals: ${proposal2b[0].approvalsCount} / ${threshold} (recalculated)\n`);

  console.log("═══════════════════════════════════════════════════════════");
  console.log("✓ M-of-N Governance demo complete!");
  console.log("═══════════════════════════════════════════════════════════\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
