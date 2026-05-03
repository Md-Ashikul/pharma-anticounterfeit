const express  = require("express");
const { v4: uuidv4 } = require("uuid");
const { getGovernmentRegistry, getGovSigner } = require("../config/contracts");
const govDB         = require("../db/govRegistry");
const anomalyDB     = require("../db/anomalyLog");
const consumptionDB = require("../db/consumptionLog");

const router = express.Router();

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

/**
 * POST /api/government/entities/register
 */
router.post("/entities/register", async (req, res) => {
  try {
    const { wallet, name, licenseNumber, role } = req.body;

    if (!wallet || !name || !licenseNumber || !role) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const registry = getGovernmentRegistry(getGovSigner());
    const tx       = await registry.registerEntity(wallet, name, licenseNumber, role);
    const receipt  = await tx.wait();

    const roleNames = { 1: "Manufacturer", 2: "Distributor", 3: "Retailer" };
    await govDB.addEntity({
      id:            uuidv4(),
      name,
      licenseNumber,
      licenseStatus: "Active",
      role:          roleNames[role] || "Unknown",
      walletAddress: wallet,
      registeredAt:  new Date().toISOString(),
      revokedAt:     null,
    });

    res.json({
      success: true,
      message: "Entity registered successfully",
      txHash:  receipt.hash,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/government/entities/revoke
 */
router.post("/entities/revoke", async (req, res) => {
  try {
    const { wallet, reason } = req.body;
    if (!wallet || !reason) {
      return res.status(400).json({ success: false, error: "Missing wallet or reason" });
    }

    const registry = getGovernmentRegistry(getGovSigner());
    const tx       = await registry.revokeEntity(wallet, reason);
    const receipt  = await tx.wait();

    await govDB.updateStatus(wallet, "Revoked", new Date().toISOString());

    res.json({
      success: true,
      message: "Entity revoked successfully",
      txHash:  receipt.hash,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/government/entities/reinstate
 */
router.post("/entities/reinstate", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) {
      return res.status(400).json({ success: false, error: "Missing wallet" });
    }

    const registry = getGovernmentRegistry(getGovSigner());
    const tx       = await registry.reinstateEntity(wallet);
    const receipt  = await tx.wait();

    await govDB.updateStatus(wallet, "Active", null);

    res.json({
      success: true,
      message: "Entity reinstated successfully",
      txHash:  receipt.hash,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

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