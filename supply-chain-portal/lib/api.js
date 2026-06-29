import axios from "axios";
import { ethers } from "ethers";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

// ── Dynamic Layer 1 / Layer 2 Routing Logic ───────────────────────────────
const ACTIVE_NETWORK = process.env.NEXT_PUBLIC_ACTIVE_NETWORK || "sepolia";

const TRACKER_ADDRESS = ACTIVE_NETWORK === "arbitrum"
  ? process.env.NEXT_PUBLIC_ARBITRUM_SUPPLY_CHAIN_TRACKER_ADDRESS
  : process.env.NEXT_PUBLIC_SUPPLY_CHAIN_TRACKER_ADDRESS;

const GOV_REGISTRY_ADDRESS = ACTIVE_NETWORK === "arbitrum"
  ? process.env.NEXT_PUBLIC_ARBITRUM_GOVERNMENT_REGISTRY_ADDRESS
  : process.env.NEXT_PUBLIC_GOVERNMENT_REGISTRY_ADDRESS;

// Optional dedicated RPC for read-only governance queries (regulator list,
// proposal event logs). Falls back to the injected MetaMask provider.
const GOV_RPC_URL = ACTIVE_NETWORK === "arbitrum"
  ? process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL
  : process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;

// Block the GovernmentRegistry was deployed at — keeps ProposalCreated log
// scans cheap. Defaults to 0 (full history) if not provided.
const GOV_DEPLOY_BLOCK = parseInt(process.env.NEXT_PUBLIC_GOV_REGISTRY_DEPLOY_BLOCK || "0", 10);
// ───────────────────────────────────────────────────────────────────────────

const SUPPLY_CHAIN_ABI = [
  "function registerDrug(string drugId, string location) external",
  "function distributeDrug(string drugId, string location) external",
  "function retailDrug(string drugId, string location) external",
  "function getDrugHistory(string drugId) external view returns (tuple(address actor, string role, uint8 status, uint256 timestamp, string location)[])",
  "function getDrugStatus(string drugId) external view returns (uint8)",
];

// Minimal GovernmentRegistry ABI for consortium governance (propose + vote)
// driven entirely from MetaMask — no private keys held by the backend.
const GOV_REGISTRY_ABI = [
  "function getRegulators() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function hasVoted(uint256, address) view returns (bool)",
  "function proposeRegisterEntity(address wallet, string name, string licenseNumber, uint8 role) returns (uint256)",
  "function proposeRevokeEntity(address wallet, string reason) returns (uint256)",
  "function proposeReinstateEntity(address wallet) returns (uint256)",
  "function voteOnProposal(uint256 proposalId, bool voteChoice)",
  "function getProposal(uint256 proposalId) view returns (tuple(uint256 id, uint8 action, address targetEntity, string proposalData, uint8 status, address proposer, uint256 createdAt, uint256 expiryAt, uint256 executedAt, uint256 approvalsCount) proposal, address[] voters, bool[] voteChoices)",
  "event ProposalCreated(uint256 proposalId, address proposer, uint8 action, address targetEntity, uint256 createdAt, uint256 expiryAt)",
];

function getGovReadProvider() {
  if (GOV_RPC_URL) return new ethers.JsonRpcProvider(GOV_RPC_URL);
  if (typeof window !== "undefined" && window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum);
  }
  throw new Error("No RPC provider available for governance reads.");
}

function getGovReadContract() {
  if (!GOV_REGISTRY_ADDRESS) {
    throw new Error(
      "GovernmentRegistry address is not configured. Set NEXT_PUBLIC_GOVERNMENT_REGISTRY_ADDRESS (or the Arbitrum variant)."
    );
  }
  return new ethers.Contract(GOV_REGISTRY_ADDRESS, GOV_REGISTRY_ABI, getGovReadProvider());
}

async function getGovWriteContract() {
  if (!window.ethereum) throw new Error("MetaMask not found.");
  if (!GOV_REGISTRY_ADDRESS) {
    throw new Error(
      "GovernmentRegistry address is not configured. Set NEXT_PUBLIC_GOVERNMENT_REGISTRY_ADDRESS (or the Arbitrum variant)."
    );
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer   = await provider.getSigner();
  return new ethers.Contract(GOV_REGISTRY_ADDRESS, GOV_REGISTRY_ABI, signer);
}

export function createAuthClient(siweMessage, siweSignature) {
  return axios.create({
    baseURL: BASE,
    headers: {
      "Content-Type":     "application/json",
      "x-siwe-message":   Buffer.from(siweMessage).toString("base64"),
      "x-siwe-signature": siweSignature,
    },
  });
}

export const publicClient = axios.create({ baseURL: BASE });

/**
 * Sign and submit supply chain transaction directly via MetaMask.
 * No private keys stored in backend.
 */
async function signAndSubmit(method, drugId, location) {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer   = await provider.getSigner();
  const contract = new ethers.Contract(TRACKER_ADDRESS, SUPPLY_CHAIN_ABI, signer);

  const tx      = await contract[method](drugId, location || "");
  const receipt = await tx.wait();
  return receipt;
}

export const govAPI = {
  getEntities:    ()             => publicClient.get("/api/government/entities"),
  getEntity:      (wallet)       => publicClient.get(`/api/government/entities/${wallet}`),
  getAnalytics:   ()             => publicClient.get("/api/government/analytics"),
  getAnomalies:   (params)       => publicClient.get("/api/government/anomalies", { params }),
  reviewAnomaly:  (client, id)   => client.patch(`/api/government/anomalies/${id}/review`),
};

// On-chain consortium governance, signed directly through MetaMask.
// Registering / revoking / reinstating an entity now creates a PROPOSAL that
// must reach the M-of-N regulator threshold before it executes. The proposer
// auto-votes YES on-chain; other regulators connect their own wallet and vote.
export const governanceWeb3 = {
  async getRegulators() {
    const c = getGovReadContract();
    return await c.getRegulators();
  },

  async isRegulator(address) {
    if (!address) return false;
    const regulators = await this.getRegulators();
    return regulators.map((r) => r.toLowerCase()).includes(address.toLowerCase());
  },

  async getThreshold() {
    const c = getGovReadContract();
    return Number(await c.getThreshold());
  },

  async hasVoted(proposalId, address) {
    const c = getGovReadContract();
    return await c.hasVoted(proposalId, address);
  },

  // ── Proposals (write via MetaMask) ───────────────────────────────────────
  async proposeRegister({ wallet, name, licenseNumber, role }) {
    const c  = await getGovWriteContract();
    const tx = await c.proposeRegisterEntity(wallet, name, licenseNumber, role);
    return await tx.wait();
  },

  async proposeRevoke({ wallet, reason }) {
    const c  = await getGovWriteContract();
    const tx = await c.proposeRevokeEntity(wallet, reason);
    return await tx.wait();
  },

  async proposeReinstate({ wallet }) {
    const c  = await getGovWriteContract();
    const tx = await c.proposeReinstateEntity(wallet);
    return await tx.wait();
  },

  async vote(proposalId, choice) {
    const c  = await getGovWriteContract();
    const tx = await c.voteOnProposal(proposalId, choice);
    return await tx.wait();
  },

  // ── Proposal discovery (read via ProposalCreated event logs) ─────────────
  async listProposals() {
    const c         = getGovReadContract();
    const threshold = Number(await c.getThreshold());
    const logs      = await c.queryFilter(c.filters.ProposalCreated(), GOV_DEPLOY_BLOCK, "latest");

    const proposals = [];
    for (const log of logs) {
      const id = log.args.proposalId;
      const data = await c.getProposal(id);
      const p = data.proposal;
      proposals.push({
        id:             id.toString(),
        action:         Number(p.action),
        targetEntity:   p.targetEntity,
        proposalData:   p.proposalData,
        status:         Number(p.status),
        proposer:       p.proposer,
        createdAt:      Number(p.createdAt),
        expiryAt:       Number(p.expiryAt),
        approvalsCount: Number(p.approvalsCount),
        voters:         data.voters,
        threshold,
      });
    }
    // newest first
    return proposals.reverse();
  },
};

export const supplyAPI = {
  getStatus: (drugId) => publicClient.get(`/api/supply-chain/status/${drugId}`),

  manufacture: async (client, { drugId, location }) => {
    const startTime = Date.now(); // <-- Captures exact time before MetaMask pops up
    const receipt = await signAndSubmit("registerDrug", drugId, location);
    return client.post("/api/supply-chain/manufacture", {
      drugId,
      location,
      txHash: receipt.hash,
      startTime, // <-- Sends time to backend for latency math
    });
  },

  distribute: async (client, { drugId, location }) => {
    const startTime = Date.now();
    const receipt = await signAndSubmit("distributeDrug", drugId, location);
    return client.post("/api/supply-chain/distribute", {
      drugId,
      location,
      txHash: receipt.hash,
      startTime,
    });
  },

  retail: async (client, { drugId, location }) => {
    const startTime = Date.now();
    const receipt = await signAndSubmit("retailDrug", drugId, location);
    return client.post("/api/supply-chain/retail", {
      drugId,
      location,
      txHash: receipt.hash,
      startTime,
    });
  },
};

export const consumerAPI = {
  getBatch: (batchId) => publicClient.get(`/api/consumer/batch/${batchId}`),
  track:    (drugId)  => publicClient.get(`/api/consumer/track/${drugId}`),
  verify:   (body)    => publicClient.post("/api/consumer/verify", body),
};
