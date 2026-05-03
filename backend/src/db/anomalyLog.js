const fs   = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const DB_PATH = path.join(__dirname, "../../data/govt_anomaly_logs.json");

function readDB() {
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(raw);
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

/**
 * Log an anomaly event.
 * Called by the relayer when on-chain verification fails suspiciously.
 *
 * @param {object} entry
 * @param {string} entry.type        - "REPLAY_ATTACK" | "INVALID_PROOF" | "BATCH_INACTIVE" | "EXPIRED"
 * @param {string} entry.drugId      - The drugId that triggered the anomaly
 * @param {string} entry.batchId     - The batch ID
 * @param {string} entry.leafHash    - The leaf hash that was attempted
 * @param {string} entry.ipAddress   - Requester IP (for threat intelligence)
 * @param {string} entry.errorMsg    - Raw error message from contract
 */
function appendAnomaly({ type, drugId, batchId, leafHash, ipAddress, errorMsg }) {
  const db = readDB();
  db.logs.push({
    id:          uuidv4(),
    type,
    drugId,
    batchId:     batchId  || "unknown",
    leafHash:    leafHash  || "unknown",
    ipAddress:   ipAddress || "unknown",
    errorMsg,
    timestamp:   new Date().toISOString(),
    reviewed:    false,
    severity:    type === "REPLAY_ATTACK_DETECTED"  ? "HIGH"     :
                 type === "POTENTIAL_CLONE_DETECTED" ? "CRITICAL" : "MEDIUM",
  });
  writeDB(db);
}

/**
 * Get all anomaly logs, optionally filtered by type.
 */
function getAnomalies({ type = null, reviewed = null } = {}) {
  const db = readDB();
  let logs = db.logs;
  if (type     !== null) logs = logs.filter((l) => l.type === type);
  if (reviewed !== null) logs = logs.filter((l) => l.reviewed === reviewed);
  return logs;
}

/**
 * Mark an anomaly as reviewed by a government analyst.
 */
function markReviewed(id) {
  const db  = readDB();
  const idx = db.logs.findIndex((l) => l.id === id);
  if (idx === -1) return false;
  db.logs[idx].reviewed = true;
  writeDB(db);
  return true;
}

/**
 * Get anomaly counts grouped by type (for government dashboard).
 */
function getAnomalyStats() {
  const db = readDB();
  const stats = {};
  for (const log of db.logs) {
    stats[log.type] = (stats[log.type] || 0) + 1;
  }
  return stats;
}

module.exports = { appendAnomaly, getAnomalies, markReviewed, getAnomalyStats };