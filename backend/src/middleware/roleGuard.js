const { getGovernmentRegistry } = require("../config/contracts");
const govRegistryDB = require("../db/govRegistry");

// Role enum values matching GovernmentRegistry.sol
const ROLES = {
  Manufacturer: 1,
  Distributor:  2,
  Retailer:     3,
};

/**
 * Role Guard Middleware Factory
 *
 * Usage: router.post("/scan", authSIWE, roleGuard("Distributor"), handler)
 *
 * Verification order:
 * 1. Smart contract (GovernmentRegistry.sol) — PRIMARY source of truth
 * 2. JSON mock DB (govt_registry.json) — SECONDARY / logging
 *
 * If contract says NOT whitelisted → 403 regardless of JSON DB
 */
function roleGuard(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const wallet = req.walletAddress;

      if (!wallet) {
        return res.status(401).json({
          success: false,
          error:   "No wallet address found. Authenticate first.",
        });
      }

      const registry = getGovernmentRegistry();

      // PRIMARY CHECK: Smart contract
      const isWhitelisted = await registry.isWhitelisted(wallet);
      if (!isWhitelisted) {
        return res.status(403).json({
          success: false,
          error:   "Wallet not whitelisted or license revoked",
        });
      }

      // ROLE CHECK: Verify the wallet holds one of the allowed roles
      let hasAllowedRole = false;
      let verifiedRole   = null;

      for (const role of allowedRoles) {
        const roleId = ROLES[role];
        if (!roleId) continue;
        const ok = await registry.hasRole(wallet, roleId);
        if (ok) {
          hasAllowedRole = true;
          verifiedRole   = role;
          break;
        }
      }

      if (!hasAllowedRole) {
        return res.status(403).json({
          success: false,
          error:   `Access denied. Required role(s): ${allowedRoles.join(", ")}`,
        });
      }

      // Attach role to request for downstream use
      req.entityRole = verifiedRole;

      // SECONDARY CHECK: Sync with JSON mock DB (non-blocking)
      const dbEntity = govRegistryDB.findByWallet(wallet);
      if (dbEntity && dbEntity.licenseStatus !== "Active") {
        // DB is out of sync with contract — log this discrepancy
        console.warn(`[roleGuard] DB/Contract sync issue for wallet: ${wallet}`);
      }

      next();
    } catch (err) {
      return res.status(500).json({
        success: false,
        error:   "Role verification failed: " + err.message,
      });
    }
  };
}

module.exports = { roleGuard, ROLES };