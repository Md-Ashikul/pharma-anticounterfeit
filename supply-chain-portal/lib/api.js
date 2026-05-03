import axios from "axios";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

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

export const govAPI = {
  getEntities:   ()              => publicClient.get("/api/government/entities"),
  getEntity:     (wallet)        => publicClient.get(`/api/government/entities/${wallet}`),
  getAnalytics:  ()              => publicClient.get("/api/government/analytics"),
  getAnomalies:  (params)        => publicClient.get("/api/government/anomalies", { params }),
  registerEntity:(client, body)  => client.post("/api/government/entities/register", body),
  revokeEntity:  (client, body)  => client.post("/api/government/entities/revoke", body),
  reinstateEntity:(client, body) => client.post("/api/government/entities/reinstate", body),
  reviewAnomaly: (client, id)    => client.patch(`/api/government/anomalies/${id}/review`),
};

export const supplyAPI = {
  getStatus:   (drugId)        => publicClient.get(`/api/supply-chain/status/${drugId}`),
  manufacture: (client, body)  => client.post("/api/supply-chain/manufacture", body),
  distribute:  (client, body)  => client.post("/api/supply-chain/distribute",  body),
  retail:      (client, body)  => client.post("/api/supply-chain/retail",       body),
};

export const consumerAPI = {
  getBatch: (batchId) => publicClient.get(`/api/consumer/batch/${batchId}`),
  track:    (drugId)  => publicClient.get(`/api/consumer/track/${drugId}`),
  verify:   (body)    => publicClient.post("/api/consumer/verify", body),
};