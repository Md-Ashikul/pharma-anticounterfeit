const { ethers } = require("ethers");

/**
 * Compute keccak256 hash of a UTF-8 string.
 * This is the core one-way function used to convert a strip secret into a Merkle leaf.
 * Matches exactly what Solidity's keccak256(abi.encodePacked(secret)) produces
 * when the secret is passed as raw bytes.
 *
 * @param {string} value - The raw secret string
 * @returns {string} - 0x-prefixed hex hash
 */
function keccak256(value) {
  // Called by merkletreejs internally with Buffer objects
  if (Buffer.isBuffer(value)) {
    return Buffer.from(ethers.keccak256(value).slice(2), "hex");
  }
  // Called with 0x-prefixed hex string (our generated secrets)
  if (typeof value === "string" && value.startsWith("0x")) {
    return ethers.keccak256(value);
  }
  // Called with plain UTF-8 string
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}

/**
 * Encode secret + batchId + leafIndex into a Base64 string.
 * This is what goes into the Hidden QR code.
 * The consumer PWA will decode this to extract the three values.
 *
 * @param {string} secret     - Raw secret for this strip
 * @param {string} batchId    - e.g. "COMP-A-B1"
 * @param {number} leafIndex  - Index of this strip in the Merkle tree
 * @returns {string} Base64-encoded payload
 */
function encodeHiddenPayload(secret, batchId, leafIndex) {
  const payload = JSON.stringify({ secret, batchId, leafIndex });
  return Buffer.from(payload).toString("base64");
}

/**
 * Decode a Base64 hidden QR payload back into its components.
 * Used by the backend/relayer when the consumer scans the Hidden QR.
 *
 * @param {string} base64 - The encoded string from the QR
 * @returns {{ secret: string, batchId: string, leafIndex: number }}
 */
function decodeHiddenPayload(base64) {
  const json = Buffer.from(base64, "base64").toString("utf-8");
  return JSON.parse(json);
}

/**
 * Generate a cryptographically random secret string for a strip.
 * Uses Node.js crypto module — not predictable or guessable.
 *
 * @returns {string} - 32-byte hex string (64 characters)
 */
function generateSecret() {
  const { randomBytes } = require("crypto");
  return "0x" + randomBytes(32).toString("hex");
}

/**
 * Format a Unix timestamp as a human-readable date string.
 */
function formatDate(unixTimestamp) {
  return new Date(unixTimestamp * 1000).toISOString().split("T")[0];
}

module.exports = {
  keccak256,
  encodeHiddenPayload,
  decodeHiddenPayload,
  generateSecret,
  formatDate,
};