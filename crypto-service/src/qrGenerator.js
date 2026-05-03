const QRCode  = require("qrcode");
const path    = require("path");
const fs      = require("fs");
const { encodeHiddenPayload } = require("./utils");

/**
 * Generate both QR codes for a single medicine strip.
 *
 * PUBLIC QR  → Tracking URL — scanned by Distributor/Retailer/Consumer
 *              Example: http://localhost:3000/track?drugId=COMP-A-B1-S1
 *              Safe to display openly on the packaging.
 *
 * HIDDEN QR  → Verification URL — printed under a scratch panel
 *              Contains Base64(secret + batchId + leafIndex)
 *              Example: http://localhost:3000/verify?data=BASE64PAYLOAD
 *              Consumer scratches this and scans to prove authenticity.
 *
 * @param {object} params
 * @param {string} params.drugId      - Strip ID, e.g. "COMP-A-B1-S1"
 * @param {string} params.batchId     - Batch ID, e.g. "COMP-A-B1"
 * @param {string} params.secret      - Raw secret for this strip
 * @param {number} params.leafIndex   - Index in the Merkle tree
 * @param {string} params.outputDir   - Directory to save QR PNG files
 * @param {string} params.appBaseUrl  - Base URL, e.g. "http://localhost:3000"
 *
 * @returns {Promise<{
 *   publicQR:  { url: string, filePath: string, dataUrl: string },
 *   hiddenQR:  { url: string, filePath: string, dataUrl: string, payload: string }
 * }>}
 */
async function generateStripQRCodes({
  drugId,
  batchId,
  secret,
  leafIndex,
  outputDir,
  appBaseUrl,
}) {
  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // ── Public QR ────────────────────────────────────────────────────────────
  const publicUrl = `${appBaseUrl}/track?drugId=${encodeURIComponent(drugId)}`;

  const publicFilePath = path.join(outputDir, `${drugId}_PUBLIC.png`);
  await QRCode.toFile(publicFilePath, publicUrl, {
    errorCorrectionLevel: "H",
    width: 300,
    margin: 2,
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  const publicDataUrl = await QRCode.toDataURL(publicUrl, {
    errorCorrectionLevel: "H",
    width: 300,
  });

  // ── Hidden QR ─────────────────────────────────────────────────────────────
  const hiddenPayload = encodeHiddenPayload(secret, batchId, leafIndex);
  const hiddenUrl     = `${appBaseUrl}/verify?data=${hiddenPayload}`;

  const hiddenFilePath = path.join(outputDir, `${drugId}_HIDDEN.png`);
  await QRCode.toFile(hiddenFilePath, hiddenUrl, {
    errorCorrectionLevel: "H",
    width: 300,
    margin: 2,
    color: { dark: "#1a0050", light: "#FFFFFF" }, // Purple tint — visually distinct
  });

  const hiddenDataUrl = await QRCode.toDataURL(hiddenUrl, {
    errorCorrectionLevel: "H",
    width: 300,
  });

  return {
    publicQR: {
      url:      publicUrl,
      filePath: publicFilePath,
      dataUrl:  publicDataUrl,
    },
    hiddenQR: {
      url:      hiddenUrl,
      filePath: hiddenFilePath,
      dataUrl:  hiddenDataUrl,
      payload:  hiddenPayload, // Store this for the batch manifest
    },
  };
}

module.exports = { generateStripQRCodes };