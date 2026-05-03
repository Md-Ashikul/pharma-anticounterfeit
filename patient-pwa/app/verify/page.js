"use client";
import { useState, useEffect } from "react";
import { useRouter }           from "next/navigation";
import { decodeHiddenPayload, extractPayloadFromURL } from "@/lib/qrDecoder";
import { hashSecret }          from "@/lib/crypto";
import { verifyStrip }         from "@/lib/api";
import VerifyResult            from "@/components/VerifyResult";
import NIDInput                from "@/components/NIDInput";

export default function VerifyPage() {
  const router = useRouter();

  // Steps: "loading" | "input" | "verifying" | "result" | "error"
  const [step,      setStep]      = useState("loading");
  const [payload,   setPayload]   = useState(null);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState("");
  const [hashedNID, setHashedNID] = useState(null);

  // Manual input fallback (if QR scan not available)
  const [manualData, setManualData] = useState("");

  useEffect(() => {
    // Try to extract payload from URL (QR scan result)
    const data = extractPayloadFromURL();
    if (data) {
      try {
        const decoded = decodeHiddenPayload(data);
        setPayload(decoded);
        setStep("confirm");
      } catch {
        setStep("input");
      }
    } else {
      setStep("input");
    }
  }, []);

  function handleManualDecode() {
    try {
      const decoded = decodeHiddenPayload(manualData.trim());
      setPayload(decoded);
      setStep("confirm");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleVerify() {
    if (!payload) return;
    setStep("verifying");
    setError("");

    try {
      // Hash the secret locally in the browser
      const leafHash = hashSecret(payload.secret);

      const res = await verifyStrip({
        secret:    payload.secret,
        batchId:   payload.batchId,
        leafIndex: payload.leafIndex,
        drugId:    `${payload.batchId}-S${String(payload.leafIndex + 1).padStart(4, "0")}`,
        hashedNID: hashedNID || null,
      });

      setResult(res);
      setStep("result");
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Verification failed");
      setStep("error");
    }
  }

  // ── Step indicator ────────────────────────────────────────────────────────
  const stepIndex = { loading: 0, input: 0, confirm: 1, verifying: 2, result: 3, error: 2 };
  const currentStep = stepIndex[step] || 0;

  return (
    <div className="page">

      {/* Step indicator */}
      <div className="steps">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`step ${i < currentStep ? "done" : i === currentStep ? "active" : ""}`} />
        ))}
      </div>

      {/* ── LOADING ── */}
      {step === "loading" && (
        <div style={{ textAlign: "center", padding: "3rem 0" }}>
          <div className="spinner" style={{ margin: "0 auto 1rem" }} />
          <div className="text-muted">Reading QR code...</div>
        </div>
      )}

      {/* ── MANUAL INPUT ── */}
      {step === "input" && (
        <div>
          <div className="card">
            <div className="card-title">🔐 Verify Hidden QR</div>
            <p className="text-muted" style={{ fontSize: ".85rem", marginBottom: "1rem" }}>
              Paste the data from the Hidden QR code below, or scan the QR
              directly from your camera app.
            </p>
            <label>QR Data (Base64 payload)</label>
            <input
              className="input"
              placeholder="Paste QR payload here..."
              value={manualData}
              onChange={(e) => setManualData(e.target.value)}
            />
            {error && <div className="alert alert-danger">{error}</div>}
            <button
              className="btn btn-primary"
              onClick={handleManualDecode}
              disabled={!manualData.trim()}
            >
              Decode & Continue
            </button>
          </div>

          <div className="alert alert-info" style={{ fontSize: ".82rem" }}>
            💡 In production: scanning the Hidden QR with your phone camera
            automatically opens this page with the payload pre-filled.
          </div>
        </div>
      )}

      {/* ── CONFIRM ── */}
      {step === "confirm" && payload && (
        <div>
          <div className="card">
            <div className="card-title">📋 Strip Details</div>
            <div style={{ fontSize: ".85rem", lineHeight: 1.8 }}>
              <div><strong>Batch ID:</strong> {payload.batchId}</div>
              <div><strong>Strip Index:</strong> #{payload.leafIndex + 1}</div>
              <div style={{ marginTop: ".5rem" }}>
                <strong>Secret Hash (local):</strong>
                <div className="mono">{hashSecret(payload.secret)}</div>
              </div>
            </div>
            <div className="alert alert-info mt-1" style={{ fontSize: ".78rem" }}>
              🔒 Your secret is hashed locally. Only the hash is sent for verification.
            </div>
          </div>

          {/* Optional NID */}
          <NIDInput onHash={setHashedNID} />

          <button
            className="btn btn-success"
            onClick={handleVerify}
          >
            ✅ Verify on Blockchain
          </button>

          <button
            className="btn btn-outline mt-1"
            onClick={() => { setStep("input"); setPayload(null); }}
          >
            ← Back
          </button>
        </div>
      )}

      {/* ── VERIFYING ── */}
      {step === "verifying" && (
        <div style={{ textAlign: "center", padding: "3rem 0" }}>
          <div className="spinner" style={{ margin: "0 auto 1rem" }} />
          <div style={{ fontWeight: 600, marginBottom: ".5rem" }}>
            Verifying on Blockchain...
          </div>
          <div className="text-muted" style={{ fontSize: ".85rem" }}>
            Fetching Merkle proof from IPFS and submitting transaction...
          </div>
        </div>
      )}

      {/* ── RESULT ── */}
      {step === "result" && result && (
        <div>
          <VerifyResult result={result} />

          <button
            className="btn btn-outline mt-1"
            onClick={() => router.push(`/track?drugId=${payload?.batchId}-S${String((payload?.leafIndex || 0) + 1).padStart(4, "0")}`)}
          >
            🔍 View Supply Chain Timeline
          </button>

          <button
            className="btn btn-outline mt-1"
            onClick={() => { setStep("input"); setPayload(null); setResult(null); }}
          >
            Verify Another Strip
          </button>
        </div>
      )}

      {/* ── ERROR ── */}
      {step === "error" && (
        <div>
          <div className="alert alert-danger">{error}</div>
          <button
            className="btn btn-outline"
            onClick={() => { setStep("input"); setError(""); }}
          >
            ← Try Again
          </button>
        </div>
      )}
    </div>
  );
}