const { appendAnomaly } = require("../db/anomalyLog");

/**
 * Detect and log anomalies from contract revert errors.
 * Called whenever verifyAndBurn() or supply chain actions fail.
 *
 * @param {Error}  error      - The caught error from ethers.js
 * @param {object} context    - { drugId, batchId, leafHash, ipAddress }
 * @returns {string} anomalyType - The classified anomaly type
 */
function detectAndLogAnomaly(error, { drugId, batchId, leafHash, ipAddress }) {
  const msg = error.message || "";

  let type = "UNKNOWN_ERROR";

  if (msg.includes("Already used") || msg.includes("StripAlreadyConsumed")) {
    type = "REPLAY_ATTACK_DETECTED";
  } else if (msg.includes("InvalidMerkleProof")) {
    type = "POTENTIAL_CLONE_DETECTED";
  } else if (msg.includes("BatchInactive")) {
    type = "RECALLED_BATCH_SCAN";
  } else if (msg.includes("BatchNotFound")) {
    type = "UNREGISTERED_BATCH_SCAN";
  } else if (msg.includes("Not authorized") || msg.includes("NotWhitelisted")) {
    type = "UNAUTHORIZED_ACTOR";
  } else if (msg.includes("OutOfOrderTransition")) {
    type = "OUT_OF_ORDER_SUPPLY_CHAIN";
  }

  // Also check decoded error name from err.data
  if (type === "UNKNOWN_ERROR" && error.data) {
    const { ethers } = require("ethers");
    const iface = new ethers.Interface([
      "error StripAlreadyConsumed(bytes32 leafHash)",
      "error InvalidMerkleProof()",
    ]);
    try {
      const decoded = iface.parseError(error.data);
      if (decoded.name === "StripAlreadyConsumed") type = "REPLAY_ATTACK_DETECTED";
      if (decoded.name === "InvalidMerkleProof")   type = "POTENTIAL_CLONE_DETECTED";
    } catch {}
  }
  
  // Write to govt_anomaly_logs.json
  appendAnomaly({
    type,
    drugId:   drugId   || "unknown",
    batchId:  batchId  || "unknown",
    leafHash: leafHash || "unknown",
    ipAddress,
    errorMsg: msg,
  });

  console.warn(`[AnomalyService] 🚨 ${type} detected — drugId: ${drugId}`);

  return type;
}

module.exports = { detectAndLogAnomaly };