const { MerkleTree } = require("merkletreejs");
const { keccak256 } = require("./utils");

/**
 * Build a Merkle tree from an array of strip secrets.
 *
 * Architecture note:
 * - Each strip has a `secret` (random string)
 * - leaf = keccak256(secret)  ← computed here
 * - All leaves → MerkleTree → merkleRoot stored on-chain
 * - Full tree JSON → IPFS (via Pinata) → CID stored on-chain
 *
 * @param {string[]} secrets - Array of raw secret strings, one per strip
 * @returns {{
 *   tree: MerkleTree,
 *   leaves: string[],
 *   merkleRoot: string,
 *   treeJSON: object
 * }}
 */
function buildMerkleTree(secrets) {
  if (!secrets || secrets.length === 0) {
    throw new Error("Cannot build Merkle tree: no secrets provided");
  }

  // Step 1: Hash each secret to produce leaves
  // leaf[i] = keccak256(secrets[i])
  const leaves = secrets.map((s) => keccak256(s));
  // Step 2: Build the tree
  // sortPairs: true — matches OpenZeppelin's MerkleProof.verify() behavior
  // hashLeaves: false — we pre-hashed them ourselves
  const tree = new MerkleTree(leaves, keccak256, {
    sortPairs: true,
    hashLeaves: false,
  });

  const merkleRoot = tree.getHexRoot();

  // Step 3: Build a serializable JSON representation for IPFS storage
  // This is what gets pinned to IPFS — the relayer downloads it to generate proofs
  const treeJSON = {
    merkleRoot,
    totalLeaves: leaves.length,
    leaves: leaves.map((leaf, index) => ({
      index,
      leaf,          // keccak256(secret) — safe to store publicly
      // NOTE: secrets are NOT stored here — they're printed on the physical QR
    })),
    // Store the full tree layers for proof reconstruction
    layers: tree.getLayersAsObject(),
  };

  return { tree, leaves, merkleRoot, treeJSON };
}

/**
 * Generate a Merkle proof for a specific leaf.
 * Called by the relayer when a consumer scans the Hidden QR.
 *
 * @param {MerkleTree} tree       - The tree object returned by buildMerkleTree
 * @param {string[]}   leaves     - The leaves array returned by buildMerkleTree
 * @param {number}     leafIndex  - Index of the strip being verified
 * @returns {string[]} proof      - Array of sibling hashes (the Merkle proof)
 */
function generateProof(tree, leaves, leafIndex) {
  if (leafIndex < 0 || leafIndex >= leaves.length) {
    throw new Error(`Invalid leafIndex: ${leafIndex}. Tree has ${leaves.length} leaves.`);
  }

  const leaf = leaves[leafIndex];
  const proof = tree.getHexProof(leaf);

  return proof;
}

/**
 * Verify a Merkle proof locally (used in tests and the relayer).
 * Mirrors what ManufacturerBatch.sol does on-chain.
 *
 * @param {string[]} proof      - The proof array
 * @param {string}   merkleRoot - The root stored on-chain
 * @param {string}   leaf       - keccak256(secret)
 * @returns {boolean}
 */
function verifyProof(proof, merkleRoot, leaf) {
  return MerkleTree.verify(proof, leaf, merkleRoot, keccak256, {
    sortPairs: true,
  });
}

module.exports = { buildMerkleTree, generateProof, verifyProof };