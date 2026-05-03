const { ethers } = require("ethers");
const { SiweMessage } = require("siwe");
const { getGovernmentRegistry } = require("../config/contracts");

/**
 * SIWE Authentication Middleware
 *
 * Expects the request to carry these headers:
 *   x-siwe-message  : The raw SIWE message string
 *   x-siwe-signature: The wallet signature
 *
 * On success, attaches to req:
 *   req.walletAddress : Verified Ethereum address
 *   req.siweMessage   : Parsed SIWE message object
 */
async function authSIWE(req, res, next) {
  try {
    const encodedMessage = req.headers["x-siwe-message"];
    const signature = req.headers["x-siwe-signature"];

    if (!encodedMessage || !signature) {
      return res.status(401).json({
        success: false,
        error: "Missing SIWE message or signature headers",
      });
    }

    const rawMessage = Buffer.from(encodedMessage, "base64").toString("utf-8");

    // Parse and verify the SIWE message
    const siweMessage = new SiweMessage(rawMessage);
    const result = await siweMessage.verify({ signature });

    if (!result.success) {
      return res.status(401).json({
        success: false,
        error: "Invalid SIWE signature",
      });
    }

    // Attach verified address to request
    req.walletAddress = result.data.address;
    req.siweMessage = result.data;

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: "SIWE verification failed: " + err.message,
    });
  }
}

/**
 * Lightweight address extractor for routes that just need
 * the wallet address without full SIWE verification.
 * Used for read-only public routes.
 */
function extractAddress(req, res, next) {
  const address = req.headers["x-wallet-address"];
  if (address && ethers.isAddress(address)) {
    req.walletAddress = address;
  }
  next();
}

module.exports = { authSIWE, extractAddress };