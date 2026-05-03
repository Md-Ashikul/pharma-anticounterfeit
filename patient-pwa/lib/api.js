import axios from "axios";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

const client = axios.create({ baseURL: BASE });

/**
 * Submit strip verification to the backend relayer.
 * The relayer fetches the Merkle proof from IPFS and calls verifyAndBurn() on-chain.
 *
 * @param {object} body
 * @param {string} body.secret      - Raw secret (from decoded hidden QR)
 * @param {string} body.batchId     - Batch ID
 * @param {number} body.leafIndex   - Leaf index in Merkle tree
 * @param {string} body.drugId      - Full drug strip ID
 * @param {string} body.hashedNID   - Optional: keccak256(NID) from browser
 *
 * @returns {Promise<{
 *   authentic: boolean,
 *   expired: boolean,
 *   status: string,
 *   message: string,
 *   txHash: string,
 *   drugName: string,
 *   expiryDate: string
 * }>}
 */
export async function verifyStrip(body) {
  const res = await client.post("/api/consumer/verify", body);
  return res.data;
}

/**
 * Get public supply chain tracking info for a drug strip.
 * Powers the /track page (Public QR scan).
 */
export async function trackDrug(drugId) {
  const res = await client.get(`/api/consumer/track/${drugId}`);
  return res.data;
}

/**
 * Get batch public info (drug name, expiry).
 */
export async function getBatch(batchId) {
  const res = await client.get(`/api/consumer/batch/${batchId}`);
  return res.data;
}