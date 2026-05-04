const express = require("express");
const { authSIWE } = require("../middleware/authSIWE");
const { roleGuard } = require("../middleware/roleGuard");
const { getDrugHistory, getDrugStatus } = require("../services/supplyChainService");
const { detectAndLogAnomaly } = require("../services/anomalyService");

const router = express.Router();

const STATUS_LABELS = {
  0: "Not Registered",
  1: "Manufactured",
  2: "Distributed",
  3: "Retailed",
  4: "Consumed",
};

/**
 * GET /api/supply-chain/status/:drugId
 * Public — no auth needed
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
 * Now just validates role — frontend signs transaction directly
 * Body: { drugId, txHash } ← frontend sends confirmed tx hash
 */
router.post(
  "/manufacture",
  authSIWE,
  roleGuard("Manufacturer"),
  async (req, res) => {
    try {
      const { drugId, txHash, location } = req.body;
      if (!drugId) {
        return res.status(400).json({ success: false, error: "Missing drugId" });
      }

      console.log(`\n[GAS+LATENCY] registerDrug() confirmed by frontend. TxHash: ${txHash}`);

      res.json({
        success:  true,
        message:  "Drug registered in supply chain",
        drugId,
        txHash:   txHash || "signed-by-frontend",
        actor:    req.walletAddress,
        role:     "Manufacturer",
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * POST /api/supply-chain/distribute
 */
router.post(
  "/distribute",
  authSIWE,
  roleGuard("Distributor"),
  async (req, res) => {
    try {
      const { drugId, txHash, location } = req.body;
      if (!drugId) {
        return res.status(400).json({ success: false, error: "Missing drugId" });
      }

      console.log(`\n[GAS+LATENCY] distributeDrug() confirmed by frontend. TxHash: ${txHash}`);

      res.json({
        success:  true,
        message:  "Distribution recorded on blockchain",
        drugId,
        txHash:   txHash || "signed-by-frontend",
        actor:    req.walletAddress,
        role:     "Distributor",
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * POST /api/supply-chain/retail
 */
router.post(
  "/retail",
  authSIWE,
  roleGuard("Retailer"),
  async (req, res) => {
    try {
      const { drugId, txHash, location } = req.body;
      if (!drugId) {
        return res.status(400).json({ success: false, error: "Missing drugId" });
      }

      console.log(`\n[GAS+LATENCY] retailDrug() confirmed by frontend. TxHash: ${txHash}`);

      res.json({
        success:  true,
        message:  "Retail handoff recorded on blockchain",
        drugId,
        txHash:   txHash || "signed-by-frontend",
        actor:    req.walletAddress,
        role:     "Retailer",
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

module.exports = router;