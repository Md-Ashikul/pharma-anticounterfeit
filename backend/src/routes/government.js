const express  = require("express");
const { v4: uuidv4 } = require("uuid");
const { getGovernmentRegistry, getGovSigner } = require("../config/contracts");
const govDB         = require("../db/govRegistry");
const anomalyDB     = require("../db/anomalyLog");
const consumptionDB = require("../db/consumptionLog");

const router = express.Router();

// ─── Governance / Regulators ───────────────────────────────────────────────

/**
 * GET /api/government/governance/status
 * Returns governance configuration: regulators, threshold, initialization status
 */
router.get("/governance/status", async (req, res) => {
  try {
    const registry = getGovernmentRegistry();

    try {
      const regulators = await registry.getRegulators();
      const threshold = await registry.getThreshold();

      res.json({
        success: true,
        initialized: true,
        regulators,
        threshold,
        regulatorCount: regulators.length,
      });
    } catch (err) {
      // If governance not initialized, return empty state
      if (err.message.includes("not initialized") || err.message.includes("NotInitialized")) {
        return res.json({
          success: true,
          initialized: false,
          regulators: [],
          threshold: 0,
          message: "Governance not yet initialized. Call POST /governance/initialize."
        });
      }
      throw err;
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/government/governance/initialize
 * Owner-only: Initialize M-of-N governance with list of regulators
 * Example body:
 *   {
 *     "regulators": ["0x111...", "0x222...", "0x333..."],
 *     "threshold": 2
 *   }
 */
router.post("/governance/initialize", async (req, res) => {
  try {
    const { regulators, threshold } = req.body;

    if (!regulators || !Array.isArray(regulators) || regulators.length === 0) {
      return res.status(400).json({ success: false, error: "regulators must be a non-empty array" });
    }

    if (typeof threshold !== "number" || threshold <= 0 || threshold > regulators.length) {
      return res.status(400).json({ success: false, error: "threshold must be > 0 and <= regulator count" });
    }

    const registry = getGovernmentRegistry(getGovSigner());
    const tx = await registry.initializeGovernance(regulators, threshold);
    const receipt = await tx.wait();

    res.json({
      success: true,
      message: `Governance initialized: ${regulators.length} regulators, ${threshold}-of-${regulators.length} threshold`,
      regulators,
      threshold,
      txHash: receipt.hash,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Proposals: Create (Entity Registration/Revocation/Reinstatement) ──────

/**
 * POST /api/government/entities/propose/register
 * Any regulator proposes registering a new entity. Proposer auto-votes YES.
 * Example body:
 *   {
 *     "wallet": "0x123...",
 *     "name": "Pharma Corp A",
 *     "licenseNumber": "LIC-2025-001",
 *     "role": 1
 *   }
 * role: 1=Manufacturer, 2=Distributor, 3=Retailer
 */
router.post("/entities/propose/register", async (req, res) => {
  try {
    const { wallet, name, licenseNumber, role } = req.body;

    if (!wallet || !name || !licenseNumber || !role) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const registry = getGovernmentRegistry(getGovSigner());
    const tx = await registry.proposeRegisterEntity(wallet, name, licenseNumber, role);
    const receipt = await tx.wait();

    // Extract proposalId from receipt events
    const event = receipt.logs
      .map(log => {
        try {
          return registry.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find(evt => evt?.name === "ProposalCreated");

    const proposalId = event?.args?.proposalId?.toString() || "unknown";

    res.json({
      success: true,
      message: `Registration proposal created (ID: ${proposalId}). Proposer auto-voted YES.`,
      proposalId,
      wallet,
      name,
      txHash: receipt.hash,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/government/entities/propose/revoke
 * Any regulator proposes revoking an entity. Proposer auto-votes YES.
 */
router.post("/entities/propose/revoke", async (req, res) => {
  try {
    const { wallet, reason } = req.body;

    if (!wallet || !reason) {
      return res.status(400).json({ success: false, error: "Missing wallet or reason" });
    }

    const registry = getGovernmentRegistry(getGovSigner());
    const tx = await registry.proposeRevokeEntity(wallet, reason);
    const receipt = await tx.wait();

    const event = receipt.logs
      .map(log => {
        try {
          return registry.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find(evt => evt?.name === "ProposalCreated");

    const proposalId = event?.args?.proposalId?.toString() || "unknown";

    res.json({
      success: true,
      message: `Revocation proposal created (ID: ${proposalId}). Proposer auto-voted YES.`,
      proposalId,
      wallet,
      reason,
      txHash: receipt.hash,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/government/entities/propose/reinstate
 */
router.post("/entities/propose/reinstate", async (req, res) => {
  try {
    const { wallet } = req.body;

    if (!wallet) {
      return res.status(400).json({ success: false, error: "Missing wallet" });
    }

    const registry = getGovernmentRegistry(getGovSigner());
    const tx = await registry.proposeReinstateEntity(wallet);
    const receipt = await tx.wait();

    const event = receipt.logs
      .map(log => {
        try {
          return registry.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find(evt => evt?.name === "ProposalCreated");

    const proposalId = event?.args?.proposalId?.toString() || "unknown";

    res.json({
      success: true,
      message: `Reinstatement proposal created (ID: ${proposalId}). Proposer auto-voted YES.`,
      proposalId,
      wallet,
      txHash: receipt.hash,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Proposals: Vote & View ────────────────────────────────────────────────

/**
 * POST /api/government/governance/proposals/:id/vote
 * Any regulator votes on a proposal. Auto-executes if threshold reached.
 * Example body: { "vote": true }
 */
router.post("/governance/proposals/:id/vote", async (req, res) => {
  try {
    const { id } = req.params;
    const { vote } = req.body;

    if (typeof vote !== "boolean") {
      return res.status(400).json({ success: false, error: "vote must be true or false" });
    }

    const registry = getGovernmentRegistry(getGovSigner());
    const tx = await registry.voteOnProposal(id, vote);
    const receipt = await tx.wait();

    // Check if proposal was auto-executed
    const proposalEvent = receipt.logs
      .map(log => {
        try {
          return registry.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find(evt => evt?.name === "ProposalExecuted");

    const executed = !!proposalEvent;

    res.json({
      success: true,
      message: executed
        ? `Vote cast. Proposal #${id} auto-executed!`
        : `Vote cast for proposal #${id}`,
      proposalId: id,
      vote,
      executed,
      txHash: receipt.hash,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/government/governance/proposals
 * List all proposals (with optional filter by status)
 */
router.get("/governance/proposals", async (req, res) => {
  try {
    const registry = getGovernmentRegistry();

    // Note: On-chain proposals don't have a "list" function; you'd need to track proposalIds off-chain
    // For now, return a message that clients should query the database or listen to events
    res.json({
      success: true,
      message: "Proposals are emitted as blockchain events. Listen to ProposalCreated, ProposalVoted, ProposalExecuted events.",
      note: "For a full proposal management UI, index events with a service like The Graph or Covalent.",
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/government/governance/proposals/:id
 * Get proposal details
 */
router.get("/governance/proposals/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const registry = getGovernmentRegistry();
    const proposal = await registry.getProposal(id);

    res.json({
      success: true,
      proposal,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Regulator Management (Propose Add/Remove) ─────────────────────────────

/**
 * POST /api/government/governance/propose/add-regulator
 */
router.post("/governance/propose/add-regulator", async (req, res) => {
  try {
    const { newRegulator } = req.body;

    if (!newRegulator) {
      return res.status(400).json({ success: false, error: "Missing newRegulator address" });
    }

    const registry = getGovernmentRegistry(getGovSigner());
    const tx = await registry.proposeAddRegulator(newRegulator);
    const receipt = await tx.wait();

    const event = receipt.logs
      .map(log => {
        try {
          return registry.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find(evt => evt?.name === "ProposalCreated");

    const proposalId = event?.args?.proposalId?.toString() || "unknown";

    res.json({
      success: true,
      message: `Proposal to add regulator created (ID: ${proposalId}). Proposer auto-voted YES.`,
      proposalId,
      newRegulator,
      txHash: receipt.hash,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/government/governance/propose/remove-regulator
 */
router.post("/governance/propose/remove-regulator", async (req, res) => {
  try {
    const { regulatorToRemove } = req.body;

    if (!regulatorToRemove) {
      return res.status(400).json({ success: false, error: "Missing regulatorToRemove address" });
    }

    const registry = getGovernmentRegistry(getGovSigner());
    const tx = await registry.proposeRemoveRegulator(regulatorToRemove);
    const receipt = await tx.wait();

    const event = receipt.logs
      .map(log => {
        try {
          return registry.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find(evt => evt?.name === "ProposalCreated");

    const proposalId = event?.args?.proposalId?.toString() || "unknown";

    res.json({
      success: true,
      message: `Proposal to remove regulator created (ID: ${proposalId}). Proposer auto-voted YES.`,
      proposalId,
      regulatorToRemove,
      txHash: receipt.hash,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Entity Queries (Keep Existing) ────────────────────────────────────────

/**
 * GET /api/government/entities
 */
router.get("/entities", async (req, res) => {
  try {
    const role     = req.query.role || null;
    const entities = await govDB.getAllEntities(role);
    res.json({ success: true, count: entities.length, entities });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/government/entities/:wallet
 */
router.get("/entities/:wallet", async (req, res) => {
  try {
    const { wallet } = req.params;
    const registry   = getGovernmentRegistry();

    const onChain = await registry.getEntity(wallet);
    const inDB    = await govDB.findByWallet(wallet);

    res.json({
      success: true,
      onChain: {
        name:          onChain.name,
        licenseNumber: onChain.licenseNumber,
        role:          Number(onChain.role),
        status:        Number(onChain.status),
        registeredAt:  Number(onChain.registeredAt),
        revokedAt:     Number(onChain.revokedAt),
      },
      offChain: inDB,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Analytics (Keep Existing) ────────────────────────────────────────────

/**
 * GET /api/government/analytics
 */
router.get("/analytics", async (req, res) => {
  try {
    const consumptionStats = await consumptionDB.getConsumptionStats();
    const anomalyStats     = await anomalyDB.getAnomalyStats();
    const recentAnomalies  = await anomalyDB.getAnomalies({ reviewed: false });

    res.json({
      success: true,
      analytics: {
        consumptionByDrug:   consumptionStats,
        anomalyCounts:       anomalyStats,
        unreviewedAnomalies: recentAnomalies.length,
        recentAnomalies:     recentAnomalies.slice(0, 10),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/government/anomalies
 */
router.get("/anomalies", async (req, res) => {
  try {
    const { type, reviewed, batchId } = req.query;
    let anomalies = await anomalyDB.getAnomalies({
      type:     type     || null,
      reviewed: reviewed !== undefined ? reviewed === "true" : null,
    });

    if (batchId) {
      anomalies = anomalies.filter((a) => a.batchId === batchId);
    }

    res.json({ success: true, count: anomalies.length, anomalies });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/government/anomalies/:id/review
 */
router.patch("/anomalies/:id/review", async (req, res) => {
  try {
    const ok = await anomalyDB.markReviewed(req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: "Anomaly not found" });
    res.json({ success: true, message: "Marked as reviewed" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
