"use client";
import { useState } from "react";
import { ethers } from "ethers";
import { buildSiweMessage } from "@/lib/siwe";
import { useAuthStore } from "@/lib/store";
import { govAPI } from "@/lib/api";

const HARDHAT_CHAIN_ID = parseInt(
  process.env.NEXT_PUBLIC_HARDHAT_CHAIN_ID || "31337"
);

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
      if (Number(network.chainId) !== HARDHAT_CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${HARDHAT_CHAIN_ID.toString(16)}` }],
          });
        } catch {
          throw new Error(
            `Wrong network. Please switch MetaMask to Hardhat (chainId ${HARDHAT_CHAIN_ID}).`
          );
        }
      }

      setWallet(address);
      setStatus("signing");

      const message = buildSiweMessage(address, HARDHAT_CHAIN_ID);
      const signature = await signer.signMessage(message);
      setSiweSession(message, signature);

      // Check if government wallet
      const GOV_WALLET = "0x60A05eb194b85eED4233f879af3F98d2d064f9a8";
      if (address.toLowerCase() === GOV_WALLET.toLowerCase()) {
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