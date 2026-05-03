import { ethers } from "ethers";

/**
 * Compute keccak256 hash of a secret string.
 * This runs entirely in the browser — the raw secret never leaves the device.
 *
 * Mirrors exactly what ManufacturerBatch.sol expects:
 * keccak256(secret) where secret is a 0x-prefixed hex string.
 *
 * @param {string} secret - Raw secret from decoded Hidden QR
 * @returns {string} - 0x-prefixed hex hash (the Merkle leaf)
 */
export function hashSecret(secret) {
  if (secret.startsWith("0x")) {
    return ethers.keccak256(secret);
  }
  return ethers.keccak256(ethers.toUtf8Bytes(secret));
}

/**
 * Compute keccak256 of a plain string (used for NID hashing).
 * Done locally in browser — raw NID never sent to server.
 *
 * @param {string} value - Raw NID string
 * @returns {string} - 0x-prefixed hex hash
 */
export function hashNID(value) {
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}