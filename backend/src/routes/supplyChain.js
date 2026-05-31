const express = require("express");
const { authSIWE } = require("../middleware/authSIWE");
const { roleGuard } = require("../middleware/roleGuard");
const { getDrugHistory, getDrugStatus } = require("../services/supplyChainService");
const { detectAndLogAnomaly } = require("../services/anomalyService");
const { getGovSigner } = require("../config/contracts"); // <-- INJECTED FOR BLOCKCHAIN LOOKUP

const router = express.Router();

const STATUS_LABELS = {
  0: "Not Registered",
  1: "Manufactured",
  2: "Distributed",
  3: "Retailed",
  4: "Consumed",
};

// ── Shared Metric Calculation Engine ────────────────────────────────────────
async function processAndPrintMetrics(stepName, txHash, startTime) {
  try {
    if (!txHash || txHash === "signed-by-frontend") return;

    const signer = getGovSigner();
    const provider = signer.provider;
    
    // Fetch the actual mined block receipt from Arbitrum Sepolia
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      console.log(`[GAS+LATENCY] Warning: Transaction receipt not found yet for ${txHash}`);
      return;
    }

    const gasUsed = receipt.gasUsed.toString();
    const totalTime = startTime ? `${Date.now() - Number(startTime)} ms` : "N/A (Pass startTime from frontend)";

    console.log(`\n╔══════════════════════════════════════════════════════╗`);
    console.log(`║      SUPPLY CHAIN METRICS - ${stepName.toUpperCase().padEnd(24)} ║`);
    console.log(`╠══════════════════════════════════════════════════════╣`);
    console.log(`║  Total Step Latency (Click to Mine) : ${totalTime.padEnd(14)}║`);
    console.log(`╠══════════════════════════════════════════════════════╣`);
    console.log(`║  GAS COST METRICS                                    ║`);
    console.log(`╠══════════════════════════════════════════════════════╣`);
    console.log(`║  Transaction Gas Used               : ${gasUsed.padEnd(14)}║`);
    console.log(`╚══════════════════════════════════════════════════════╝\n`);
  } catch (err) {
    console.log(`[GAS+LATENCY ERROR] Failed to evaluate block parameters: ${err.message}`);
  }
}

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
 * Body: { drugId, txHash, startTime, location }
 */
router.post(
  "/manufacture",
  authSIWE,
  roleGuard("Manufacturer"),
  async (req, res) => {
    try {
      const { drugId, txHash, startTime, location } = req.body;
      if (!drugId) {
        return res.status(400).json({ success: false, error: "Missing drugId" });
      }

      // Process and display performance metrics in the console
      await processAndPrintMetrics("Manufacture Step", txHash, startTime);

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
      const { drugId, txHash, startTime, location } = req.body;
      if (!drugId) {
        return res.status(400).json({ success: false, error: "Missing drugId" });
      }

      await processAndPrintMetrics("Distribution Step", txHash, startTime);

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
      const { drugId, txHash, startTime, location } = req.body;
      if (!drugId) {
        return res.status(400).json({ success: false, error: "Missing drugId" });
      }

      await processAndPrintMetrics("Retail Handoff Step", txHash, startTime);

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