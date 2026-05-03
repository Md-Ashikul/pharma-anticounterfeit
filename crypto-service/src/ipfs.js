require("dotenv").config();
const PinataSDK = require("@pinata/sdk");

// Lazy-initialize Pinata client so the module can be imported
// even before .env is loaded (useful in tests)
let _pinata = null;

function getPinata() {
  if (!_pinata) {
    const apiKey    = process.env.PINATA_API_KEY;
    const apiSecret = process.env.PINATA_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error(
        "Missing Pinata credentials. Set PINATA_API_KEY and PINATA_API_SECRET in .env"
      );
    }

    _pinata = new PinataSDK(apiKey, apiSecret);
  }
  return _pinata;
}

/**
 * Pin a JSON object to IPFS via Pinata.
 * Returns the IPFS CID (Content Identifier) of the pinned file.
 *
 * This is called once per batch after the Merkle tree is built.
 * The CID is then stored on-chain in ManufacturerBatch.sol.
 *
 * @param {object} jsonData   - The data to pin (e.g., treeJSON from merkle.js)
 * @param {string} name       - Human-readable pin name (shows in Pinata dashboard)
 * @returns {Promise<string>} - The IPFS CID (e.g., "QmXyz...")
 */
async function pinJSONToIPFS(jsonData, name) {
  const pinata = getPinata();

  const options = {
    pinataMetadata: { name },
    pinataOptions:  { cidVersion: 0 },
  };

  const result = await pinata.pinJSONToIPFS(jsonData, options);
  return result.IpfsHash; // This is the CID
}

/**
 * Fetch a JSON object from IPFS via the Pinata gateway.
 * Used by the relayer to download the Merkle tree for a given batch.
 *
 * @param {string} cid - The IPFS CID to fetch
 * @returns {Promise<object>} - The parsed JSON object
 */
async function fetchFromIPFS(cid) {
  // Use the public Pinata gateway — no auth needed for public pins
  const url = `https://gateway.pinata.cloud/ipfs/${cid}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch from IPFS. CID: ${cid}, Status: ${response.status}`);
  }

  return response.json();
}

/**
 * Test Pinata authentication — call this on startup to verify credentials.
 * @returns {Promise<boolean>}
 */
async function testPinataConnection() {
  try {
    const pinata = getPinata();
    const result = await pinata.testAuthentication();
    return result.authenticated === true;
  } catch (err) {
    console.error("Pinata auth failed:", err.message);
    return false;
  }
}

module.exports = { pinJSONToIPFS, fetchFromIPFS, testPinataConnection };