"use client";
import { useState } from "react";
import { ethers } from "ethers";
import { buildSiweMessage } from "@/lib/siwe";
import { useAuthStore } from "@/lib/store";
import { govAPI, governanceWeb3 } from "@/lib/api";

// ── Dynamic Layer 1 / Layer 2 Network Toggle Configuration ────────────────
const ACTIVE_NETWORK = process.env.NEXT_PUBLIC_ACTIVE_NETWORK || "sepolia";

const TARGET_CHAIN_ID = ACTIVE_NETWORK === "arbitrum"
  ? parseInt(process.env.NEXT_PUBLIC_ARBITRUM_CHAIN_ID || "421614")
  : parseInt(process.env.NEXT_PUBLIC_SEPOLIA_CHAIN_ID || "11155111");

const NETWORK_NAME = ACTIVE_NETWORK === "arbitrum" ? "Arbitrum Sepolia" : "Ethereum Sepolia";
// ───────────────────────────────────────────────────────────────────────────

export default function WalletConnect() {
  const { setWallet, setSiweSession, setEntityInfo } = useAuthStore();
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function connect() {
    setStatus("connecting");
    setErrorMsg("");
    try {
      if (!window.ethereum) {
        throw new Error("MetaMask not found. Please install MetaMask.");
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      const network = await provider.getNetwork();
      if (Number(network.chainId) !== TARGET_CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${TARGET_CHAIN_ID.toString(16)}` }],
          });
        } catch {
          throw new Error(
            `Wrong network. Please switch MetaMask to ${NETWORK_NAME} (chainId ${TARGET_CHAIN_ID}).`
          );
        }
      }

      setWallet(address);
      setStatus("signing");

      const message = buildSiweMessage(address, TARGET_CHAIN_ID);
      const signature = await signer.signMessage(message);
      setSiweSession(message, signature);

      // Determine role. Regulators are read dynamically from the on-chain
      // consortium list (GovernmentRegistry.getRegulators), so any of the
      // current regulator wallets is recognized as Government — no hardcoded
      // address, and it stays correct when regulators are added/removed.
      let isRegulator = false;
      try {
        isRegulator = await governanceWeb3.isRegulator(address);
      } catch (e) {
        console.log("[v0] regulator lookup failed:", e.message);
      }

      if (isRegulator) {
        const { setGovernment } = useAuthStore.getState();
        setGovernment();
      } else {
        try {
          const res = await govAPI.getEntity(address);
          const entity = res.data?.offChain;
          if (entity) {
            setEntityInfo(entity.role, entity.name);
          } else {
            setEntityInfo(null, null);
          }
        } catch {
          setEntityInfo(null, null);
        }
      }

      setStatus("done");
    } catch (err) {
      setErrorMsg(err.message || "Connection failed");
      setStatus("error");
    }
  }

  if (status === "done") return null;

  return (
    <div className="card" style={{ maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
      <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🦊</div>
      <h2 style={{ marginBottom: ".5rem" }}>Connect Your Wallet</h2>
      <p className="text-muted" style={{ marginBottom: "1.5rem" }}>
        Sign in with MetaMask to access the supply chain portal.
        Only government-licensed entities can perform write operations.
      </p>
      {status === "error" && (
        <div className="alert alert-danger">{errorMsg}</div>
      )}
      <button
        className="btn btn-primary w-full"
        onClick={connect}
        disabled={status === "connecting" || status === "signing"}
      >
        {status === "connecting" && <span className="spinner" />}
        {status === "signing" && <span className="spinner" />}
        {status === "idle" && "Connect MetaMask"}
        {status === "connecting" && "Connecting..."}
        {status === "signing" && "Sign the message in MetaMask..."}
        {status === "error" && "Retry"}
      </button>
      <p className="text-muted mt-1" style={{ fontSize: ".78rem" }}>
        Your signature proves wallet ownership. No gas is used.
      </p>
    </div>
  );
}
