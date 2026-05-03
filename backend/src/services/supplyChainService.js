const { getSupplyChainTracker, getSignerFromKey } = require("../config/contracts");

// Private keys for Hardhat test accounts
// In production: use a proper KMS or hardware wallet
const ACTOR_KEYS = {
  "0xF4A4b36D818804720b3443438eBdA1aB01AfF22e":
    process.env.MANUFACTURER_PRIVATE_KEY,
  "0xAcb9bf874Cc3eA2a67cb94a60575192CEfeF831b":
    process.env.DISTRIBUTOR_PRIVATE_KEY,
  "0x4dEE81d53d984F6B1F3d6Ca9c4F2023E825E939F":
    process.env.RETAILER_PRIVATE_KEY,
  "0xD528413aa036E01b86D416c38887E2F68889cF64":
    process.env.RETAILER2_PRIVATE_KEY,
};

/**
 * Register a drug into the supply chain (Manufacturer action).
 */
async function registerDrug(walletAddress, drugId, location) {
  const key = ACTOR_KEYS[walletAddress];
  if (!key) throw new Error("Unknown wallet — no private key configured");
  const signer = getSignerFromKey(key);
  const tracker = getSupplyChainTracker(signer);
  const t_start = Date.now();
  const tx = await tracker.registerDrug(drugId, location || "");
  const receipt = await tx.wait();
  const latency = Date.now() - t_start;
  console.log(`\n[GAS+LATENCY] registerDrug()   Gas: ${receipt.gasUsed.toString()} | Latency: ${latency} ms`);
  return receipt;
}

/**
 * Record distribution (Distributor action).
 */
async function distributeDrug(walletAddress, drugId, location) {
  const key = ACTOR_KEYS[walletAddress];
  if (!key) throw new Error("Unknown wallet — no private key configured");
  const signer = getSignerFromKey(key);
  const tracker = getSupplyChainTracker(signer);
  const t_start = Date.now();
  const tx = await tracker.distributeDrug(drugId, location || "");
  const receipt = await tx.wait();
  const latency = Date.now() - t_start;
  console.log(`\n[GAS+LATENCY] distributeDrug() Gas: ${receipt.gasUsed.toString()} | Latency: ${latency} ms`);
  return receipt;
}

/**
 * Record retail (Retailer action).
 */
async function retailDrug(walletAddress, drugId, location) {
  const key = ACTOR_KEYS[walletAddress];
  if (!key) throw new Error("Unknown wallet — no private key configured");
  const signer = getSignerFromKey(key);
  const tracker = getSupplyChainTracker(signer);
  const t_start = Date.now();
  const tx = await tracker.retailDrug(drugId, location || "");
  const receipt = await tx.wait();
  const latency = Date.now() - t_start;
  console.log(`\n[GAS+LATENCY] retailDrug()     Gas: ${receipt.gasUsed.toString()} | Latency: ${latency} ms`);
  return receipt;
}

/**
 * Get full supply chain history for a drug strip.
 * Powers the consumer-facing timeline.
 */
async function getDrugHistory(drugId) {
  const tracker = getSupplyChainTracker();
  const history = await tracker.getDrugHistory(drugId);

  // Convert BigInt timestamps to numbers for JSON serialization
  return history.map((v) => ({
    actor: v.actor,
    role: v.role,
    status: Number(v.status),
    timestamp: Number(v.timestamp),
    location: v.location,
  }));
}

/**
 * Get current status of a drug strip.
 * Returns: 0=NotRegistered, 1=Manufactured, 2=Distributed, 3=Retailed
 */
async function getDrugStatus(drugId) {
  const tracker = getSupplyChainTracker();
  const status = await tracker.getDrugStatus(drugId);
  return Number(status);
}

/**
 * Record consumption (called by relayer after verifyAndBurn succeeds).
 * Uses the government wallet as the relayer — no consumer wallet needed.
 */
async function consumeDrug(drugId, location) {
  // Use government signer as relayer
  const { getGovSigner } = require("../config/contracts");
  const signer = getGovSigner();
  const tracker = getSupplyChainTracker(signer);

  try {
    const t_start = Date.now();
    const tx = await tracker.consumeDrug(drugId, location || "");
    const receipt = await tx.wait();
    const latency = Date.now() - t_start;
    console.log(`[SupplyChain] Drug ${drugId} marked as Consumed. Tx: ${receipt.hash}`);
    console.log(`\n[GAS+LATENCY] consumeDrug()    Gas: ${receipt.gasUsed.toString()} | Latency: ${latency} ms`);
    return receipt;
  } catch (err) {
    // Non-critical — log but don't fail verification
    console.warn(`[SupplyChain] Could not mark ${drugId} as consumed:`, err.message);
    return null;
  }
}

module.exports = { registerDrug, distributeDrug, retailDrug, consumeDrug, getDrugHistory, getDrugStatus };