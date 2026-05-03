require("dotenv").config();

const { ethers }              = require("ethers");
const { MerkleTree }          = require("merkletreejs");
const { getManufacturerBatch, getGovSigner } = require("../config/contracts");
const { appendLog }           = require("../db/consumptionLog");
const { detectAndLogAnomaly } = require("./anomalyService");
const { consumeDrug }         = require("./supplyChainService");

async function fetchJSON(url) {
  const { default: fetch } = await import("node-fetch");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IPFS fetch failed: ${res.status}`);
  return res.json();
}

function keccak256Buffer(value) {
  if (Buffer.isBuffer(value)) {
    return Buffer.from(ethers.keccak256(value).slice(2), "hex");
  }
  if (typeof value === "string" && value.startsWith("0x")) {
    return Buffer.from(value.slice(2), "hex");
  }
  return Buffer.from(
    ethers.keccak256(ethers.toUtf8Bytes(value)).slice(2), "hex"
  );
}

async function verifyStrip({
  secret,
  batchId,
  leafIndex,
  drugId,
  hashedNID,
  ipAddress,
}) {
  const contract = getManufacturerBatch(getGovSigner());
  const metrics  = {};
  const t0       = Date.now();

  // ── Step 1: Compute leaf hash ─────────────────────────────────────────────
  // Ensure leafHash is always a proper 32-byte hex string
  const rawHash  = ethers.keccak256(secret);
  const t1_start = Date.now();
  const leafHash = ethers.keccak256(secret);
  metrics.localHashComputation_ms = Date.now() - t1_start;
  console.log("DEBUG leafHash padded:", leafHash);
  console.log("DEBUG leafHash length:", leafHash.length); // must be 66 (0x + 64 chars)

  // ── Step 2: Fetch batch from chain ────────────────────────────────────────
  let batch;
  try {
    batch = await contract.getBatch(batchId);
    if (batch.registeredAt === 0n) {
      return {
        authentic: false, expired: false, status: "FAKE",
        message: "Batch not found on blockchain",
        txHash: null, drugName: null, batchId, expiryDate: null,
      };
    }
  } catch (err) {
    return {
      authentic: false, expired: false, status: "FAKE",
      message: "Failed to fetch batch from blockchain",
      txHash: null, drugName: null, batchId, expiryDate: null,
    };
  }

  console.log("DEBUG batch.merkleRoot:", batch.merkleRoot);
  console.log("DEBUG batch.ipfsCID:",   batch.ipfsCID);

  // ── Step 3: Download Merkle tree from IPFS ────────────────────────────────
  const t3_start = Date.now();
  const ipfsUrl  = `${process.env.PINATA_GATEWAY}/${batch.ipfsCID}`;
  let merkleTree;
  try {
    merkleTree = await fetchJSON(ipfsUrl);
  } catch (err) {
    throw new Error(`Failed to fetch Merkle tree from IPFS: ${err.message}`);
  }
  metrics.ipfsRetrieval_ms = Date.now() - t3_start;

  // ── Step 4: Get leaf entry ────────────────────────────────────────────────
  const leafEntry = merkleTree.leaves[leafIndex];
  if (!leafEntry) {
    detectAndLogAnomaly(
      new Error("InvalidMerkleProof"),
      { drugId, batchId, leafHash, ipAddress }
    );
    return {
      authentic: false, expired: false, status: "FAKE",
      message: "Invalid leaf index — strip not found in batch",
      txHash: null, drugName: batch.drugName, batchId,
      expiryDate: new Date(Number(batch.expiryDate) * 1000)
        .toISOString().split("T")[0],
    };
  }

  console.log("DEBUG leafEntry.leaf:", leafEntry.leaf);
  console.log("DEBUG leafHash matches leafEntry:", leafHash === leafEntry.leaf);

  // ── Step 5: Rebuild Merkle tree and generate proof ────────────────────────
  const leaves     = merkleTree.leaves.map((l) =>
    Buffer.from(l.leaf.slice(2), "hex")
  );
  const tree       = new MerkleTree(leaves, keccak256Buffer, {
    sortPairs:  true,
    hashLeaves: false,
  });
  const targetLeaf = Buffer.from(leafEntry.leaf.slice(2), "hex");
  const hexProof   = tree.getHexProof(targetLeaf);

  console.log("DEBUG proof length:", hexProof.length);
  console.log("DEBUG proof:", hexProof);
  console.log("DEBUG locallyValid:", tree.verify(hexProof, targetLeaf, tree.getRoot()));
  console.log("DEBUG tree root:", tree.getHexRoot());

  // ── Step 6: Call verifyAndBurn on-chain ───────────────────────────────────
  let txHash  = null;
  let expired = false;

  try {
    const t6_start = Date.now();
    const tx       = await contract.verifyAndBurn(batchId, hexProof, leafHash);
    const receipt  = await tx.wait();
    txHash  = receipt.hash;
    metrics.blockchainVerification_ms = Date.now() - t6_start;
    metrics.verifyAndBurn_gasUsed     = receipt.gasUsed.toString();
    metrics.totalVerification_ms      = Date.now() - t0;

    const now        = Math.floor(Date.now() / 1000);
    const expiryTime = Number(batch.expiryDate);
    expired = now > expiryTime;

    // ── Record consumption on SupplyChainTracker ──────────────────────────
    // drugId format: batchId-S000X
    await consumeDrug(drugId, "Consumer Verified");

    // ── Print Research Paper Metrics ─────────────────────────────────────────
    console.log("\n╔══════════════════════════════════════════════════════╗");
    console.log("║         VERIFICATION LATENCY METRICS                 ║");
    console.log("╠══════════════════════════════════════════════════════╣");
    console.log(`║  QR Decode & Local Hash Computation : ${String(metrics.localHashComputation_ms + " ms").padEnd(14)}║`);
    console.log(`║  IPFS Retrieval (Merkle Proof)      : ${String(metrics.ipfsRetrieval_ms + " ms").padEnd(14)}║`);
    console.log(`║  Blockchain Verification + Burn     : ${String(metrics.blockchainVerification_ms + " ms").padEnd(14)}║`);
    console.log(`║  Total End-to-End Latency           : ${String(metrics.totalVerification_ms + " ms").padEnd(14)}║`);
    console.log("╠══════════════════════════════════════════════════════╣");
    console.log("║         GAS COST METRICS                             ║");
    console.log("╠══════════════════════════════════════════════════════╣");
    console.log(`║  verifyAndBurn() Gas Used           : ${String(metrics.verifyAndBurn_gasUsed).padEnd(14)}║`);
    console.log("╚══════════════════════════════════════════════════════╝\n");

  } catch (err) {
    const errMsg = err.message || "";

    // Decode custom error using ABI
    if (err.data) {
      const iface = new ethers.Interface([
        "error StripAlreadyConsumed(bytes32 leafHash)",
        "error InvalidMerkleProof()",
        "error BatchNotFound(string batchId)",
        "error BatchInactive(string batchId)",
      ]);
      try {
        const decoded = iface.parseError(err.data);
        console.log("DEBUG decoded error:", decoded.name);

        if (decoded.name === "StripAlreadyConsumed") {
          detectAndLogAnomaly(err, { drugId, batchId, leafHash, ipAddress });
          return {
            authentic: false, expired: false, status: "ALREADY_USED",
            message: "❌ This QR code has already been used. Possible counterfeit.",
            txHash: null, drugName: batch.drugName, batchId,
            expiryDate: new Date(Number(batch.expiryDate) * 1000)
              .toISOString().split("T")[0],
          };
        }

        if (decoded.name === "InvalidMerkleProof") {
          detectAndLogAnomaly(err, { drugId, batchId, leafHash, ipAddress });
          return {
            authentic: false, expired: false, status: "FAKE",
            message: "❌ Invalid proof. This medicine is likely counterfeit.",
            txHash: null, drugName: batch.drugName, batchId,
            expiryDate: new Date(Number(batch.expiryDate) * 1000)
              .toISOString().split("T")[0],
          };
        }
      } catch (decodeErr) {
        console.log("DEBUG could not decode error:", decodeErr.message);
      }
    }

    // Fallback string matching
    if (errMsg.includes("StripAlreadyConsumed") || errMsg.includes("Already used")) {
      detectAndLogAnomaly(err, { drugId, batchId, leafHash, ipAddress });
      return {
        authentic: false, expired: false, status: "ALREADY_USED",
        message: "❌ This QR code has already been used. Possible counterfeit.",
        txHash: null, drugName: batch.drugName, batchId,
        expiryDate: new Date(Number(batch.expiryDate) * 1000)
          .toISOString().split("T")[0],
      };
    }

    if (errMsg.includes("InvalidMerkleProof")) {
      detectAndLogAnomaly(err, { drugId, batchId, leafHash, ipAddress });
      return {
        authentic: false, expired: false, status: "FAKE",
        message: "❌ Invalid proof. This medicine is likely counterfeit.",
        txHash: null, drugName: batch.drugName, batchId,
        expiryDate: new Date(Number(batch.expiryDate) * 1000)
          .toISOString().split("T")[0],
      };
    }

    detectAndLogAnomaly(err, { drugId, batchId, leafHash, ipAddress });
    throw err;
  }

  // ── Step 7: Log consumption ───────────────────────────────────────────────
  appendLog({
    hashedNID,
    drugPrefix: batchId,
    batchId,
    expired,
    txHash,
  });

  // ── Step 8: Return result ─────────────────────────────────────────────────
  const expiryDate = new Date(Number(batch.expiryDate) * 1000)
    .toISOString().split("T")[0];

  if (expired) {
    return {
      authentic: true, expired: true, status: "AUTHENTIC_EXPIRED",
      message: "⚠️ Authentic medicine but EXPIRED. Do not consume.",
      txHash, drugName: batch.drugName, batchId, expiryDate,
    };
  }

  return {
    authentic: true, expired: false, status: "AUTHENTIC",
    message: "✅ Authentic medicine. Safe to consume.",
    txHash, drugName: batch.drugName, batchId, expiryDate,
  };
}

module.exports = { verifyStrip };