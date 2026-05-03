const express = require("express");
const { verifyStrip } = require("../services/verificationService");

const router = express.Router();

/**
 * POST /api/consumer/verify
 * Core consumer verification endpoint.
 * Called by the PWA when a consumer scans the Hidden QR.
 *
 * No authentication required — consumers have no wallet.
 *
 * Body: {
 *   secret,      ← from decoded hidden QR payload
 *   batchId,     ← from decoded hidden QR payload
 *   leafIndex,   ← from decoded hidden QR payload
 *   drugId,      ← from public QR (optional, for logging)
 *   hashedNID    ← optional: keccak256(NID) from browser
 * }
 */
router.post("/verify", async (req, res) => {
  try {
    const { secret, batchId, leafIndex, drugId, hashedNID } = req.body;

    if (!secret || !batchId || leafIndex === undefined) {
      return res.status(400).json({
        success: false,
        error:   "Missing required fields: secret, batchId, leafIndex",
      });
    }

    const result = await verifyStrip({
      secret,
      batchId,
      leafIndex: Number(leafIndex),
      drugId:    drugId || batchId,
      hashedNID: hashedNID || null,
      ipAddress: req.ip,
    });

    res.json({ success: true, ...result });

  } catch (err) {
    res.status(500).json({
      success: false,
      error:   "Verification service error: " + err.message,
    });
  }
});

/**
 * GET /api/consumer/track/:drugId
 * Public tracking endpoint — scanned via Public QR.
 * Returns the supply chain timeline for a drug strip.
 * No auth required.
 */
router.get("/track/:drugId", async (req, res) => {
  try {
    const { drugId } = req.params;

    // Lazy-import supply chain service
    const { getDrugHistory, getDrugStatus } = require("../services/supplyChainService");

    const statusCode = await getDrugStatus(drugId);
    const history    = await getDrugHistory(drugId);

    const STATUS_LABELS = {
      0: "Not Registered",
      1: "Manufactured",
      2: "Distributed",
      3: "Retailed",
    };

    res.json({
      success: true,
      drugId,
      currentStatus:      statusCode,
      currentStatusLabel: STATUS_LABELS[statusCode] || "Unknown",
      verifiedByGovt:     statusCode > 0,
      history: history.map((h) => ({
        role:      h.role,
        timestamp: new Date(h.timestamp * 1000).toISOString(),
        location:  h.location,
        verified:  true,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/consumer/batch/:batchId
 * Get public batch info (drug name, expiry, etc.)
 * No auth required.
 */
router.get("/batch/:batchId", async (req, res) => {
  try {
    const { getManufacturerBatch } = require("../config/contracts");
    const contract = getManufacturerBatch();
    const batch    = await contract.getBatch(req.params.batchId);

    if (Number(batch.registeredAt) === 0) {
      return res.status(404).json({ success: false, error: "Batch not found" });
    }

    res.json({
      success:      true,
      batchId:      req.params.batchId,
      drugName:     batch.drugName,
      expiryDate:   new Date(Number(batch.expiryDate) * 1000).toISOString().split("T")[0],
      isActive:     batch.isActive,
      manufacturer: batch.manufacturer,
      registeredAt: new Date(Number(batch.registeredAt) * 1000).toISOString(),
      ipfsCID:      batch.ipfsCID,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;