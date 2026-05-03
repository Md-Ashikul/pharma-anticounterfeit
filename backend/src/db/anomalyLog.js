const { v4: uuidv4 } = require("uuid");
const { AnomalyLog } = require("./models");

async function appendAnomaly({ type, drugId, batchId, leafHash, ipAddress, errorMsg }) {
  const log = new AnomalyLog({
    id:        uuidv4(),
    type,
    drugId:    drugId    || "unknown",
    batchId:   batchId   || "unknown",
    leafHash:  leafHash  || "unknown",
    ipAddress: ipAddress || "unknown",
    errorMsg,
    timestamp: new Date().toISOString(),
    reviewed:  false,
    severity:  type === "REPLAY_ATTACK_DETECTED"  ? "HIGH"     :
               type === "POTENTIAL_CLONE_DETECTED" ? "CRITICAL" : "MEDIUM",
  });
  await log.save();
}

async function getAnomalies({ type = null, reviewed = null } = {}) {
  const query = {};
  if (type     !== null) query.type     = type;
  if (reviewed !== null) query.reviewed = reviewed;
  return AnomalyLog.find(query).sort({ timestamp: -1 }).lean();
}

async function markReviewed(id) {
  const result = await AnomalyLog.updateOne({ id }, { $set: { reviewed: true } });
  return result.modifiedCount > 0;
}

async function getAnomalyStats() {
  const logs  = await AnomalyLog.find().lean();
  const stats = {};
  for (const log of logs) {
    stats[log.type] = (stats[log.type] || 0) + 1;
  }
  return stats;
}

module.exports = { appendAnomaly, getAnomalies, markReviewed, getAnomalyStats };