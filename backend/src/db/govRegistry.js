const fs   = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "../../data/govt_registry.json");

function readDB() {
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(raw);
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

/**
 * Find entity by wallet address (case-insensitive).
 */
function findByWallet(walletAddress) {
  const db = readDB();
  return db.entities.find(
    (e) => e.walletAddress.toLowerCase() === walletAddress.toLowerCase()
  ) || null;
}

/**
 * Find entity by license number.
 */
function findByLicense(licenseNumber) {
  const db = readDB();
  return db.entities.find((e) => e.licenseNumber === licenseNumber) || null;
}

/**
 * Get all entities, optionally filtered by role.
 */
function getAllEntities(role = null) {
  const db = readDB();
  if (role) return db.entities.filter((e) => e.role === role);
  return db.entities;
}

/**
 * Add a new entity to the mock DB.
 * Called after successful on-chain registration.
 */
function addEntity(entity) {
  const db = readDB();
  db.entities.push(entity);
  writeDB(db);
}

/**
 * Update an entity's license status.
 * Called after on-chain revocation/reinstatement.
 */
function updateStatus(walletAddress, status, revokedAt = null) {
  const db = readDB();
  const idx = db.entities.findIndex(
    (e) => e.walletAddress.toLowerCase() === walletAddress.toLowerCase()
  );
  if (idx === -1) return false;
  db.entities[idx].licenseStatus = status;
  db.entities[idx].revokedAt     = revokedAt;
  writeDB(db);
  return true;
}

module.exports = { findByWallet, findByLicense, getAllEntities, addEntity, updateStatus };