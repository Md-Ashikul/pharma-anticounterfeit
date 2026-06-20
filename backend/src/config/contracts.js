require("dotenv").config();
const { ethers } = require("ethers");

const GOVERNMENT_REGISTRY_ABI = [
  // Entity view functions
  "function isWhitelisted(address wallet) external view returns (bool)",
  "function hasRole(address wallet, uint8 role) external view returns (bool)",
  "function getEntity(address wallet) external view returns (tuple(string name, string licenseNumber, uint8 role, uint8 status, uint256 registeredAt, uint256 revokedAt))",
  "function getEntityRoleString(address wallet) external view returns (string)",
  "function getAllRegisteredAddresses() external view returns (address[])",

  // Governance view functions
  "function isInitialized() external view returns (bool)",
  "function getRegulators() external view returns (address[])",
  "function getThreshold() external view returns (uint256)",
  "function getProposal(uint256 proposalId) external view returns (tuple(uint256 id, uint8 action, address targetEntity, string proposalData, uint8 status, address proposer, uint256 createdAt, uint256 expiryAt, uint256 executedAt, uint256 approvalsCount) proposal, address[] voters, bool[] voteChoices)",
  "function hasVoted(uint256 proposalId, address regulator) external view returns (bool)",
  "function votes(uint256 proposalId, address regulator) external view returns (bool)",

  // Governance init (owner only)
  "function initializeGovernance(address[] regulators, uint256 threshold) external",

  // Proposal creation (regulators only)
  "function proposeRegisterEntity(address wallet, string name, string licenseNumber, uint8 role) external returns (uint256)",
  "function proposeRevokeEntity(address wallet, string reason) external returns (uint256)",
  "function proposeReinstateEntity(address wallet) external returns (uint256)",
  "function proposeAddRegulator(address newRegulator) external returns (uint256)",
  "function proposeRemoveRegulator(address regulatorToRemove) external returns (uint256)",

  // Voting & execution
  "function voteOnProposal(uint256 proposalId, bool voteChoice) external",
  "function executeProposalManually(uint256 proposalId) external",

  // Events (needed to parse proposalId from tx receipts)
  "event ProposalCreated(uint256 indexed proposalId, address indexed proposer, uint8 action, address targetEntity, uint256 createdAt, uint256 expiryAt)",
  "event ProposalVoted(uint256 indexed proposalId, address indexed regulator, bool voteChoice, uint256 currentApprovals, uint256 threshold)",
  "event ProposalExecuted(uint256 indexed proposalId, uint8 action, address targetEntity, uint256 executedAt)",
  "event EntityRegistered(address indexed wallet, string name, string licenseNumber, uint8 role, uint256 timestamp)",
  "event EntityRevoked(address indexed wallet, string reason, uint256 timestamp)",
  "event EntityReinstated(address indexed wallet, uint256 timestamp)",
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

let _provider = null;
let _govSigner = null;

function getProvider() {
  if (!_provider) {
    const isArbitrum = process.env.ACTIVE_NETWORK === "arbitrum";
    const rpcUrl = isArbitrum 
        ? process.env.ARBITRUM_RPC_URL 
        : process.env.RPC_URL;
        
    console.log(`[Backend RPC] Connecting to ${isArbitrum ? 'Arbitrum Sepolia (L2)' : 'Ethereum Sepolia (L1)'}`);
    _provider = new ethers.JsonRpcProvider(rpcUrl);
  }
  return _provider;
}

function resetProvider() {
  _provider = null;
  _govSigner = null;
}

function getNetworkAddresses() {
  const isArbitrum = process.env.ACTIVE_NETWORK === "arbitrum";
  return {
    governmentRegistry: isArbitrum
      ? process.env.ARBITRUM_GOVERNMENT_REGISTRY_ADDRESS
      : process.env.GOVERNMENT_REGISTRY_ADDRESS,
    manufacturerBatch: isArbitrum
      ? process.env.ARBITRUM_MANUFACTURER_BATCH_ADDRESS
      : process.env.MANUFACTURER_BATCH_ADDRESS,
    supplyChainTracker: isArbitrum
      ? process.env.ARBITRUM_SUPPLY_CHAIN_TRACKER_ADDRESS
      : process.env.SUPPLY_CHAIN_TRACKER_ADDRESS,
  };
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

function getSignerFromKey(privateKey) {
  return new ethers.Wallet(privateKey, getProvider());
}

function getGovernmentRegistry(signerOrProvider = null) {
  const { governmentRegistry } = getNetworkAddresses();
  return new ethers.Contract(
    governmentRegistry,
    GOVERNMENT_REGISTRY_ABI,
    signerOrProvider || getProvider()
  );
}

function getManufacturerBatch(signerOrProvider = null) {
  const { manufacturerBatch } = getNetworkAddresses();
  return new ethers.Contract(
    manufacturerBatch,
    MANUFACTURER_BATCH_ABI,
    signerOrProvider || getProvider()
  );
}

function getSupplyChainTracker(signerOrProvider = null) {
  const { supplyChainTracker } = getNetworkAddresses();
  return new ethers.Contract(
    supplyChainTracker,
    SUPPLY_CHAIN_TRACKER_ABI,
    signerOrProvider || getProvider()
  );
}

module.exports = {
  getProvider,
  resetProvider,
  getNetworkAddresses,
  getGovSigner,
  getSignerFromKey,
  getGovernmentRegistry,
  getManufacturerBatch,
  getSupplyChainTracker,
};
