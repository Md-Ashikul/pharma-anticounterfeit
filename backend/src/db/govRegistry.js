const { v4: uuidv4 } = require("uuid");
const { Entity } = require("./models");

async function findByWallet(walletAddress) {
  return Entity.findOne({
    walletAddress: { $regex: new RegExp(`^${walletAddress}$`, "i") }
  }).lean();
}

async function findByLicense(licenseNumber) {
  return Entity.findOne({ licenseNumber }).lean();
}

async function getAllEntities(role = null) {
  const query = role ? { role } : {};
  return Entity.find(query).lean();
}

async function addEntity(entity) {
  const newEntity = new Entity({
    id:            entity.id || uuidv4(),
    name:          entity.name,
    licenseNumber: entity.licenseNumber,
    licenseStatus: entity.licenseStatus || "Active",
    role:          entity.role,
    walletAddress: entity.walletAddress,
    registeredAt:  entity.registeredAt || new Date().toISOString(),
    revokedAt:     entity.revokedAt || null,
  });
  await newEntity.save();
}

async function updateStatus(walletAddress, status, revokedAt = null) {
  const result = await Entity.updateOne(
    { walletAddress: { $regex: new RegExp(`^${walletAddress}$`, "i") } },
    { $set: { licenseStatus: status, revokedAt } }
  );
  return result.modifiedCount > 0;
}

module.exports = { findByWallet, findByLicense, getAllEntities, addEntity, updateStatus };