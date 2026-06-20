require("dotenv").config();
const { ethers } = require("ethers");

// ─────────────────────────────────────────────────────────────────────────────
// ABIs are loaded directly from the compiled Hardhat artifacts so they ALWAYS
// match the most recently compiled/deployed contracts. After any contract change
// run `npx hardhat compile` in the blockchain folder and the backend picks up
// the new ABI automatically — no manual editing of this file required.
//
// NOTE: The blockchain/artifacts folder is git-ignored, so it only exists locally
// after compiling. If you ever deploy the backend WITHOUT the blockchain folder
// present (e.g. a standalone backend host), compile first and ship the artifacts,
// or switch back to inline ABIs.
// ─────────────────────────────────────────────────────────────────────────────
const ARTIFACTS_DIR = "../../../blockchain/artifacts/contracts";

const GOVERNMENT_REGISTRY_ABI = require(
  `${ARTIFACTS_DIR}/GovernmentRegistry.sol/GovernmentRegistry.json`
).abi;

const MANUFACTURER_BATCH_ABI = require(
  `${ARTIFACTS_DIR}/ManufacturerBatch.sol/ManufacturerBatch.json`
).abi;

const SUPPLY_CHAIN_TRACKER_ABI = require(
  `${ARTIFACTS_DIR}/SupplyChainTracker.sol/SupplyChainTracker.json`
).abi;

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
