const { getSupplyChainTracker, getProvider } = require("../config/contracts");

const STATUS_LABELS = {
  0: "Not Registered",
  1: "Manufactured",
  2: "Distributed",
  3: "Retailed",
  4: "Consumed",
};

/**
 * Get full supply chain history for a drug strip.
 */
async function getDrugHistory(drugId) {
  const tracker = getSupplyChainTracker();
  const history = await tracker.getDrugHistory(drugId);
  return history.map((v) => ({
    actor:     v.actor,
    role:      v.role,
    status:    Number(v.status),
    timestamp: Number(v.timestamp),
    location:  v.location,
  }));
}

/**
 * Get current status of a drug strip.
 */
async function getDrugStatus(drugId) {
  const tracker = getSupplyChainTracker();
  const status  = await tracker.getDrugStatus(drugId);
  return Number(status);
}

/**
 * consumeDrug — called by backend relayer after verifyAndBurn.
 * Only this function still uses government key as relayer.
 * This is acceptable because consumer has no wallet.
 */
async function consumeDrug(drugId, location) {
  const { getGovSigner } = require("../config/contracts");
  const signer  = getGovSigner();
  const tracker = getSupplyChainTracker(signer);
  try {
    const t_start = Date.now();
    const tx      = await tracker.consumeDrug(drugId, location || "");
    const receipt = await tx.wait();
    const latency = Date.now() - t_start;
    console.log(`[SupplyChain] Drug ${drugId} marked as Consumed. Tx: ${receipt.hash}`);
    console.log(`\n[GAS+LATENCY] consumeDrug() Gas: ${receipt.gasUsed.toString()} | Latency: ${latency} ms`);
    return receipt;
  } catch (err) {
    console.warn(`[SupplyChain] Could not mark ${drugId} as consumed:`, err.message);
    return null;
  }
}

module.exports = { getDrugHistory, getDrugStatus, consumeDrug };