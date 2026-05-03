const { v4: uuidv4 } = require("uuid");
const { ConsumptionLog } = require("./models");

async function appendLog({ hashedNID, drugPrefix, batchId, expired, txHash }) {
  const log = new ConsumptionLog({
    id: uuidv4(),
    hashedNID: hashedNID || null,
    drugPrefix,
    batchId,
    expired,
    txHash,
    timestamp: new Date().toISOString(),
  });
  await log.save();
}

async function getLogs({ drugPrefix = null, batchId = null } = {}) {
  const query = {};
  if (drugPrefix) query.drugPrefix = drugPrefix;
  if (batchId)   query.batchId    = batchId;
  return ConsumptionLog.find(query).lean();
}

async function getConsumptionStats() {
  const logs  = await ConsumptionLog.find().lean();
  const stats = {};
  for (const log of logs) {
    stats[log.drugPrefix] = (stats[log.drugPrefix] || 0) + 1;
  }
  return stats;
}

module.exports = { appendLog, getLogs, getConsumptionStats };