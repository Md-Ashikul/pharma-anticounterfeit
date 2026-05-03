const express = require("express");
const { authSIWE } = require("../middleware/authSIWE");
const { roleGuard } = require("../middleware/roleGuard");
const {
  registerDrug,
  distributeDrug,
  retailDrug,
  getDrugHistory,
  getDrugStatus,
} = require("../services/supplyChainService");
const { detectAndLogAnomaly } = require("../services/anomalyService");

const router = express.Router();

const STATUS_LABELS = {
  0: "Not Registered",
  1: "Manufactured",
  2: "Distributed",
  3: "Retailed",
};

/**
 * GET /api/supply-chain/status/:drugId
 * Public: get current status + full history of a drug strip.
 * Powers the consumer-facing timeline when scanning the Public QR.
 */
router.get("/status/:drugId", async (req, res) => {
  try {
    const { drugId }  = req.params;
    const statusCode  = await getDrugStatus(drugId);
    const history     = await getDrugHistory(drugId);

    res.json({
      success: true,
      drugId,
      currentStatus:      statusCode,
      currentStatusLabel: STATUS_LABELS[statusCode] || "Unknown",
      history: history.map((h) => ({
        actor:     h.actor,
        role:      h.role,
        timestamp: new Date(h.timestamp * 1000).toISOString(),
        location:  h.location,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/supply-chain/manufacture
 * Manufacturer registers a drug strip into the supply chain.
 * Requires SIWE auth + Manufacturer role.
 * Body: { drugId, location }
 */
router.post(
  "/manufacture",
  authSIWE,
  roleGuard("Manufacturer"),
  async (req, res) => {
    try {
      const { drugId, location } = req.body;
      if (!drugId) {
        return res.status(400).json({ success: false, error: "Missing drugId" });
      }

      const receipt = await registerDrug(req.walletAddress, drugId, location);

      res.json({
        success:  true,
        message:  "Drug registered in supply chain",
        drugId,
        txHash:   receipt.hash,
        actor:    req.walletAddress,
        role:     "Manufacturer",
      });
    } catch (err) {
      detectAndLogAnomaly(err, {
        drugId:    req.body.drugId,
        batchId:   req.body.drugId?.split("-S")[0],
        leafHash:  null,
        ipAddress: req.ip,
      });
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * POST /api/supply-chain/distribute
 * Distributor scans Public QR and takes custody.
 * Requires SIWE auth + Distributor role.
 * Body: { drugId, location }
 */
router.post(
  "/distribute",
  authSIWE,
  roleGuard("Distributor"),
  async (req, res) => {
    try {
      const { drugId, location } = req.body;
      if (!drugId) {
        return res.status(400).json({ success: false, error: "Missing drugId" });
      }

      const receipt = await distributeDrug(req.walletAddress, drugId, location);

      res.json({
        success:  true,
        message:  "Distribution recorded on blockchain",
        drugId,
        txHash:   receipt.hash,
        actor:    req.walletAddress,
        role:     "Distributor",
      });
    } catch (err) {
      detectAndLogAnomaly(err, {
        drugId:    req.body.drugId,
        batchId:   req.body.drugId?.split("-S")[0],
        leafHash:  null,
        ipAddress: req.ip,
      });
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * POST /api/supply-chain/retail
 * Retailer scans Public QR and takes custody.
 * Requires SIWE auth + Retailer role.
 * Body: { drugId, location }
 */
router.post(
  "/retail",
  authSIWE,
  roleGuard("Retailer"),
  async (req, res) => {
    try {
      const { drugId, location } = req.body;
      if (!drugId) {
        return res.status(400).json({ success: false, error: "Missing drugId" });
      }

      const receipt = await retailDrug(req.walletAddress, drugId, location);

      res.json({
        success:  true,
        message:  "Retail handoff recorded on blockchain",
        drugId,
        txHash:   receipt.hash,
        actor:    req.walletAddress,
        role:     "Retailer",
      });
    } catch (err) {
      detectAndLogAnomaly(err, {
        drugId:    req.body.drugId,
        batchId:   req.body.drugId?.split("-S")[0],
        leafHash:  null,
        ipAddress: req.ip,
      });
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

module.exports = router;