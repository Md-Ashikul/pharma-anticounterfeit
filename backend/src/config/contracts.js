require("dotenv").config();
const { ethers } = require("ethers");

// ─────────────────────────────────────────────────────────────────────────────
// ABIs are bundled with the backend as standalone JSON files in ./abi so the
// backend is fully self-contained and deploys anywhere (Render, etc.) WITHOUT
// needing the git-ignored blockchain/artifacts folder.
//
// When you change a contract's INTERFACE (add/remove/rename a function or event,
// or change its parameters), regenerate these files by running, from the repo root:
//   npm run sync-abi   (defined in backend/package.json)
// which recompiles the contracts and copies the fresh ABIs into ./abi.
// A plain redeploy with no interface change only needs the address env vars
// updated — the ABI stays identical.
// ─────────────────────────────────────────────────────────────────────────────
const GOVERNMENT_REGISTRY_ABI = require("../abi/GovernmentRegistry.json");
const MANUFACTURER_BATCH_ABI = require("../abi/ManufacturerBatch.json");
const SUPPLY_CHAIN_TRACKER_ABI = require("../abi/SupplyChainTracker.json");

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
