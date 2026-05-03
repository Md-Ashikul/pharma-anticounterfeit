const fs   = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const DB_PATH = path.join(__dirname, "../../data/govt_consumption_log.json");

function readDB() {
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(raw);
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

/**
 * Append a new consumption log entry.
 *
 * Privacy note: hashedNID is keccak256(NID) computed in browser.
 * Raw NID never reaches this server.
 *
 * @param {object} entry
 * @param {string} entry.hashedNID   - keccak256(NID) or null if user skipped
 * @param {string} entry.drugPrefix  - First segment of drugId (e.g. "COMP-A-B1")
 * @param {string} entry.batchId     - The batch ID
 * @param {boolean} entry.expired    - Whether the drug was expired at verification
 * @param {string} entry.txHash      - On-chain transaction hash
 */
function appendLog({ hashedNID, drugPrefix, batchId, expired, txHash }) {
  const db = readDB();
  db.logs.push({
    id:        uuidv4(),
    hashedNID: hashedNID || null,
    drugPrefix,
    batchId,
    expired,
    txHash,
    timestamp: new Date().toISOString(),
  });
  writeDB(db);
}

/**
 * Get all logs, optionally filtered by drugPrefix or batchId.
 */
function getLogs({ drugPrefix = null, batchId = null } = {}) {
  const db = readDB();
  let logs = db.logs;
  if (drugPrefix) logs = logs.filter((l) => l.drugPrefix === drugPrefix);
  if (batchId)   logs = logs.filter((l) => l.batchId === batchId);
  return logs;
}

/**
 * Get consumption count per drug prefix (for government analytics).
 */
function getConsumptionStats() {
  const db = readDB();
  const stats = {};
  for (const log of db.logs) {
    stats[log.drugPrefix] = (stats[log.drugPrefix] || 0) + 1;
  }
  return stats;
}

module.exports = { appendLog, getLogs, getConsumptionStats };