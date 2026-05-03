require("dotenv").config();
const { ethers } = require("ethers");

// ─── ABIs (only functions the backend needs) ──────────────────────────────────

const GOVERNMENT_REGISTRY_ABI = [
  "function isWhitelisted(address wallet) external view returns (bool)",
  "function hasRole(address wallet, uint8 role) external view returns (bool)",
  "function getEntity(address wallet) external view returns (tuple(string name, string licenseNumber, uint8 role, uint8 status, uint256 registeredAt, uint256 revokedAt))",
  "function getEntityRoleString(address wallet) external view returns (string)",
  "function registerEntity(address wallet, string name, string licenseNumber, uint8 role) external",
  "function revokeEntity(address wallet, string reason) external",
  "function reinstateEntity(address wallet) external",
];

const MANUFACTURER_BATCH_ABI = [
  "function getBatch(string batchId) external view returns (tuple(bytes32 merkleRoot, string ipfsCID, uint256 expiryDate, uint256 registeredAt, address manufacturer, string drugName, bool isActive))",
  "function verifyAndBurn(string batchId, bytes32[] proof, bytes32 leafHash) external returns (bool expired)",
  "function isLeafConsumed(bytes32 leafHash) external view returns (bool)",
  "function getManufacturerBatches(address manufacturer) external view returns (string[])",
  "error StripAlreadyConsumed(bytes32 leafHash)",
  "error InvalidMerkleProof()",
  "error BatchNotFound(string batchId)",
  "error BatchInactive(string batchId)",
  "error InvalidExpiry()",
  "error NotAuthorized(address caller)",
  "error NotAManufacturer(address caller)",
  "error BatchAlreadyExists(string batchId)",
];

const SUPPLY_CHAIN_TRACKER_ABI = [
  "function registerDrug(string drugId, string location) external",
  "function distributeDrug(string drugId, string location) external",
  "function retailDrug(string drugId, string location) external",
  "function consumeDrug(string drugId, string location) external",
  "function getDrugHistory(string drugId) external view returns (tuple(address actor, string role, uint8 status, uint256 timestamp, string location)[])",
  "function getDrugStatus(string drugId) external view returns (uint8)",
  "error OutOfOrderTransition(string drugId, uint8 current, uint8 attempted)",
  "error NotWhitelisted(address caller)",
  "error WrongRole(address caller, string expectedRole)",
  "error DrugAlreadyRegistered(string drugId)",
  "error DrugNotFound(string drugId)",
];

// ─── Provider & Signers ───────────────────────────────────────────────────────

let _provider = null;
let _govSigner = null;

function getProvider() {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  }
  return _provider;
}

function getGovSigner() {
  if (!_govSigner) {
    _govSigner = new ethers.Wallet(
      process.env.GOVERNMENT_PRIVATE_KEY,
      getProvider()
    );
  }
  return _govSigner;
}

/**
 * Get a signer from a private key (used for supply chain actors).
 * In production this would be replaced by a proper wallet/relayer.
 */
function getSignerFromKey(privateKey) {
  return new ethers.Wallet(privateKey, getProvider());
}

// ─── Contract Instances (read-only) ───────────────────────────────────────────

function getGovernmentRegistry(signerOrProvider = null) {
  return new ethers.Contract(
    process.env.GOVERNMENT_REGISTRY_ADDRESS,
    GOVERNMENT_REGISTRY_ABI,
    signerOrProvider || getProvider()
  );
}

function getManufacturerBatch(signerOrProvider = null) {
  return new ethers.Contract(
    process.env.MANUFACTURER_BATCH_ADDRESS,
    MANUFACTURER_BATCH_ABI,
    signerOrProvider || getProvider()
  );
}

function getSupplyChainTracker(signerOrProvider = null) {
  return new ethers.Contract(
    process.env.SUPPLY_CHAIN_TRACKER_ADDRESS,
    SUPPLY_CHAIN_TRACKER_ABI,
    signerOrProvider || getProvider()
  );
}

module.exports = {
  getProvider,
  getGovSigner,
  getSignerFromKey,
  getGovernmentRegistry,
  getManufacturerBatch,
  getSupplyChainTracker,
};