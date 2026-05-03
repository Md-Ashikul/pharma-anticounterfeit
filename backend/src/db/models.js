const mongoose = require("mongoose");

// ── Government Registry ───────────────────────────────────────────────────────
const EntitySchema = new mongoose.Schema({
  id:            { type: String, required: true, unique: true },
  name:          { type: String, required: true },
  licenseNumber: { type: String, required: true },
  licenseStatus: { type: String, default: "Active" },
  role:          { type: String, required: true },
  walletAddress: { type: String, required: true, unique: true },
  registeredAt:  { type: String, default: () => new Date().toISOString() },
  revokedAt:     { type: String, default: null },
});

// ── Consumption Log ───────────────────────────────────────────────────────────
const ConsumptionLogSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  hashedNID: { type: String, default: null },
  drugPrefix:{ type: String, required: true },
  batchId:   { type: String, required: true },
  expired:   { type: Boolean, default: false },
  txHash:    { type: String, default: null },
  timestamp: { type: String, default: () => new Date().toISOString() },
});

// ── Anomaly Log ───────────────────────────────────────────────────────────────
const AnomalyLogSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  type:      { type: String, required: true },
  drugId:    { type: String, default: "unknown" },
  batchId:   { type: String, default: "unknown" },
  leafHash:  { type: String, default: "unknown" },
  ipAddress: { type: String, default: "unknown" },
  errorMsg:  { type: String, default: "" },
  timestamp: { type: String, default: () => new Date().toISOString() },
  reviewed:  { type: Boolean, default: false },
  severity:  { type: String, default: "MEDIUM" },
});

const Entity         = mongoose.model("Entity",         EntitySchema);
const ConsumptionLog = mongoose.model("ConsumptionLog", ConsumptionLogSchema);
const AnomalyLog     = mongoose.model("AnomalyLog",     AnomalyLogSchema);

module.exports = { Entity, ConsumptionLog, AnomalyLog };