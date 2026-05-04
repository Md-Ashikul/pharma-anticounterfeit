import axios from "axios";
import { ethers } from "ethers";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

const TRACKER_ADDRESS = process.env.NEXT_PUBLIC_SUPPLY_CHAIN_TRACKER_ADDRESS;

const SUPPLY_CHAIN_ABI = [
  "function registerDrug(string drugId, string location) external",
  "function distributeDrug(string drugId, string location) external",
  "function retailDrug(string drugId, string location) external",
  "function getDrugHistory(string drugId) external view returns (tuple(address actor, string role, uint8 status, uint256 timestamp, string location)[])",
  "function getDrugStatus(string drugId) external view returns (uint8)",
];

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
  registerEntity: (client, body) => client.post("/api/government/entities/register", body),
  revokeEntity:   (client, body) => client.post("/api/government/entities/revoke", body),
  reinstateEntity:(client, body) => client.post("/api/government/entities/reinstate", body),
  reviewAnomaly:  (client, id)   => client.patch(`/api/government/anomalies/${id}/review`),
};

export const supplyAPI = {
  getStatus: (drugId) => publicClient.get(`/api/supply-chain/status/${drugId}`),

  manufacture: async (client, { drugId, location }) => {
    const receipt = await signAndSubmit("registerDrug", drugId, location);
    return client.post("/api/supply-chain/manufacture", {
      drugId,
      location,
      txHash: receipt.hash,
    });
  },

  distribute: async (client, { drugId, location }) => {
    const receipt = await signAndSubmit("distributeDrug", drugId, location);
    return client.post("/api/supply-chain/distribute", {
      drugId,
      location,
      txHash: receipt.hash,
    });
  },

  retail: async (client, { drugId, location }) => {
    const receipt = await signAndSubmit("retailDrug", drugId, location);
    return client.post("/api/supply-chain/retail", {
      drugId,
      location,
      txHash: receipt.hash,
    });
  },
};

export const consumerAPI = {
  getBatch: (batchId) => publicClient.get(`/api/consumer/batch/${batchId}`),
  track:    (drugId)  => publicClient.get(`/api/consumer/track/${drugId}`),
  verify:   (body)    => publicClient.post("/api/consumer/verify", body),
};