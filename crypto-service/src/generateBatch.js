/**
 * generateBatch.js — Master Batch Generation Script
 * Academic/Research Edition with Multi-Network routing support.
 *
 * This is the main script run by a licensed Manufacturer to:
 * 1. Generate secrets for every strip in the batch
 * 2. Hash secrets → Merkle leaves
 * 3. Build Merkle tree → get merkleRoot
 * 4. Upload tree JSON to IPFS via Pinata → get CID
 * 5. Register the batch on-chain via ManufacturerBatch.sol
 * 6. Generate dual QR codes (Public + Hidden) for every strip
 * 7. Save full batch manifest to output/<network>/<batchId>
 *
 * Usage:
 * node src/generateBatch.js sepolia
 * node src/generateBatch.js arbitrum
 */

require("dotenv").config();

const { ethers }      = require("ethers");
const fs              = require("fs");
const path            = require("path");
const { generateSecret, keccak256, formatDate } = require("./utils");
const { buildMerkleTree, generateProof, verifyProof } = require("./merkle");
const { pinJSONToIPFS, testPinataConnection }         = require("./ipfs");
const { generateStripQRCodes }                        = require("./qrGenerator");

// ─── ABI (only the functions we need) ────────────────────────────────────────
const MANUFACTURER_BATCH_ABI = [
  "function registerBatch(string batchId, bytes32 merkleRoot, string ipfsCID, uint256 expiryDate, string drugName) external",
  "function getBatch(string batchId) external view returns (tuple(bytes32 merkleRoot, string ipfsCID, uint256 expiryDate, uint256 registeredAt, address manufacturer, string drugName, bool isActive))",
  "event BatchRegistered(string indexed batchId, address indexed manufacturer, bytes32 merkleRoot, string ipfsCID, uint256 expiryDate, uint256 timestamp)",
];

// ─── PARSE NETWORK ARGUMENT ──────────────────────────────────────────────────
const targetArg = process.argv[2] ? process.argv[2].toLowerCase() : "sepolia";
const isArbitrum = targetArg === "arbitrum" || targetArg === "l2";
const networkLabel = isArbitrum ? "ARBITRUM SEPOLIA (L2)" : "ETHEREUM SEPOLIA (L1)";

// ─── BATCH CONFIGURATION ─────────────────────────────────────────────────────
// Note: Changed outputDir to include targetArg so L1 and L2 data stay separated
const CONFIG = {
  batchId:    "COMP-ARB-B3", 
  drugName:   "Paracetamol 500mg",
  stripCount: 10,
  expiryDate: "2027-12-31",
  appBaseUrl: process.env.APP_BASE_URL,
  outputDir:  path.join(__dirname, "../output", targetArg, "COMP-ARB-B3"),
};
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   PHARMA BATCH GENERATION — Step 2           ║");
  console.log(`  TARGET NETWORK: ${networkLabel}`);
  console.log("╚══════════════════════════════════════════════╝\n");

  // ── 0. Resolve Network-Specific Values ─────────────────────────────────────
  const rpcUrl = isArbitrum ? process.env.ARBITRUM_RPC_URL : process.env.RPC_URL;
  const contractAddress = isArbitrum 
    ? process.env.ARBITRUM_MANUFACTURER_BATCH_ADDRESS 
    : process.env.MANUFACTURER_BATCH_ADDRESS;

  // ── 0.1 Validate environment ───────────────────────────────────────────────
  const requiredEnv = ["PINATA_API_KEY", "PINATA_API_SECRET", "MANUFACTURER_PRIVATE_KEY"];
  for (const key of requiredEnv) {
    if (!process.env[key]) throw new Error(`Missing global env var: ${key}`);
  }

  if (!rpcUrl) throw new Error(`Missing RPC URL for track: ${targetArg}`);
  if (!contractAddress) throw new Error(`Missing ManufacturerBatch contract address for track: ${targetArg}`);

  // ── 1. Test Pinata connection ─────────────────────────────────────────────
  console.log("[ 1/7 ] Testing Pinata IPFS connection...");
  const pinataOk = await testPinataConnection();
  if (!pinataOk) throw new Error("Pinata authentication failed. Check your API keys in .env");
  console.log("        ✅ Pinata connected\n");

  // ── 2. Generate secrets for every strip ───────────────────────────────────
  console.log(`[ 2/7 ] Generating ${CONFIG.stripCount} strip secrets...`);
  const secrets = Array.from({ length: CONFIG.stripCount }, () => generateSecret());
  console.log(`        ✅ ${secrets.length} secrets generated\n`);

  // ── 3. Build Merkle tree ──────────────────────────────────────────────────
  console.log("[ 3/7 ] Building Merkle tree...");
  const { tree, leaves, merkleRoot, treeJSON } = buildMerkleTree(secrets);
  console.log(`        ✅ Merkle Root: ${merkleRoot}`);
  console.log(`        ✅ Total leaves: ${leaves.length}\n`);

  // Sanity check: verify a random proof locally before going on-chain
  const testIndex = Math.floor(Math.random() * CONFIG.stripCount);
  const testProof = generateProof(tree, leaves, testIndex);
  const testLeaf  = leaves[testIndex];
  const proofValid = verifyProof(testProof, merkleRoot, testLeaf);
  if (!proofValid) throw new Error("Merkle proof self-test FAILED — aborting");
  console.log(`        ✅ Self-test proof verified for leaf index ${testIndex}\n`);

  // ── 4. Upload Merkle tree JSON to IPFS ────────────────────────────────────
  console.log("[ 4/7 ] Uploading Merkle tree to IPFS via Pinata...");
  const ipfsCID = await pinJSONToIPFS(treeJSON, `${CONFIG.batchId}-merkle-tree`);
  console.log(`        ✅ IPFS CID: ${ipfsCID}`);
  console.log(`        🔗 https://gateway.pinata.cloud/ipfs/${ipfsCID}\n`);

  // ── 5. Register batch on-chain ────────────────────────────────────────────
  console.log(`[ 5/7 ] Registering batch on ManufacturerBatch.sol [${targetArg}]...`);
  console.log(`        Target Contract: ${contractAddress}`);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet   = new ethers.Wallet(process.env.MANUFACTURER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(contractAddress, MANUFACTURER_BATCH_ABI, wallet);

  // Convert expiry date string to Unix timestamp
  const expiryTimestamp = Math.floor(new Date(CONFIG.expiryDate).getTime() / 1000);

  // Send registration transaction with robust error catching for Custom Errors
  let tx;
  try {
    tx = await contract.registerBatch(
      CONFIG.batchId,
      merkleRoot,
      ipfsCID,
      expiryTimestamp,
      CONFIG.drugName
    );
    console.log(`        📡 Transaction sent: ${tx.hash}`);
    console.log(`        ⏳ Awaiting block inclusion confirmations...`);
  } catch (err) {
    console.error(`\n❌ Transaction initialization failed.`);
    if (err.data || err.error) {
      console.error(`💡 Smart Contract Reverted. Raw Data: ${err.data || JSON.stringify(err.error)}`);
      console.error(`Ensure this Manufacturer wallet is fully whitelisted on this specific network's GovernmentRegistry.`);
    } else {
      console.error(`Error Details: ${err.shortMessage || err.message}`);
    }
    process.exit(1);
  }

  const receipt = await tx.wait();
  if (receipt.status === 0) {
    throw new Error("Transaction execution was reverted on-chain by the EVM runtime.");
  }

  console.log(`        ✅ Confirmed in block ${receipt.blockNumber}`);
  console.log(`        ✅ Gas used: ${receipt.gasUsed.toString()}\n`);

  // ── 6. Generate QR codes for every strip ─────────────────────────────────
  console.log("[ 6/7 ] Generating QR codes for all strips...");
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  const strips = [];

  for (let i = 0; i < CONFIG.stripCount; i++) {
    const drugId = `${CONFIG.batchId}-S${String(i + 1).padStart(4, "0")}`;
    const secret = secrets[i];
    const leaf   = leaves[i];
    const proof  = generateProof(tree, leaves, i);

    const { publicQR, hiddenQR } = await generateStripQRCodes({
      drugId,
      batchId:    CONFIG.batchId,
      secret,
      leafIndex:  i,
      outputDir:  path.join(CONFIG.outputDir, "qrcodes"),
      appBaseUrl: CONFIG.appBaseUrl,
    });

    strips.push({
      index:     i,
      drugId,
      secret,    // ⚠️ SENSITIVE — printed physically, never stored in DB
      leaf,
      proof,
      publicQR:  { url: publicQR.url },
      hiddenQR:  { url: hiddenQR.url, payload: hiddenQR.payload },
    });

    // Progress indicator for large batches
    if ((i + 1) % Math.max(1, Math.floor(CONFIG.stripCount / 5)) === 0) {
      console.log(`        ... ${i + 1}/${CONFIG.stripCount} strips processed`);
    }
  }
  console.log(`        ✅ All QR codes generated in: ${CONFIG.outputDir}/qrcodes\n`);

  // ── 7. Save batch manifest ────────────────────────────────────────────────
  console.log("[ 7/7 ] Saving batch manifest...");

  const manifest = {
    network:        targetArg,
    batchId:        CONFIG.batchId,
    drugName:       CONFIG.drugName,
    merkleRoot,
    ipfsCID,
    ipfsUrl:        `https://gateway.pinata.cloud/ipfs/${ipfsCID}`,
    expiryDate:     CONFIG.expiryDate,
    expiryTimestamp,
    totalStrips:    CONFIG.stripCount,
    registeredAt:   new Date().toISOString(),
    txHash:         tx.hash,
    blockNumber:    receipt.blockNumber,
    manufacturer:   wallet.address,
    contractAddress: contractAddress,
    strips,         // Full strip data — keep this file SECURE (contains secrets)
  };

  const manifestPath = path.join(CONFIG.outputDir, "batch-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`        ✅ Manifest saved to: ${manifestPath}`);

  // Also save a public-safe summary (no secrets)
  const publicSummary = {
    network:        targetArg,
    batchId:        manifest.batchId,
    drugName:       manifest.drugName,
    merkleRoot:     manifest.merkleRoot,
    ipfsCID:        manifest.ipfsCID,
    ipfsUrl:        manifest.ipfsUrl,
    expiryDate:     manifest.expiryDate,
    totalStrips:    manifest.totalStrips,
    registeredAt:   manifest.registeredAt,
    txHash:         manifest.txHash,
    manufacturer:   manifest.manufacturer,
  };

  const summaryPath = path.join(CONFIG.outputDir, "batch-summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(publicSummary, null, 2));
  console.log(`        ✅ Public summary saved to: ${summaryPath}`);

  // ── Final Summary ─────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   BATCH GENERATION COMPLETE ✅               ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Network     : ${networkLabel}`);
  console.log(`  Batch ID    : ${CONFIG.batchId}`);
  console.log(`  Drug        : ${CONFIG.drugName}`);
  console.log(`  Strips      : ${CONFIG.stripCount}`);
  console.log(`  Expiry      : ${CONFIG.expiryDate}`);
  console.log(`  Merkle Root : ${merkleRoot}`);
  console.log(`  IPFS CID    : ${ipfsCID}`);
  console.log(`  Tx Hash     : ${tx.hash}`);
  console.log(`  Output Dir  : ${CONFIG.outputDir}\n`);
}

main().catch((err) => {
  console.error("\n❌ Critical Failure During Batch Processing Loop:", err.message);
  process.exit(1);
});