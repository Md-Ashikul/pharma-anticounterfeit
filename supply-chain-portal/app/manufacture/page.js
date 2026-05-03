"use client";
import { useState }      from "react";
import RoleGate          from "@/components/RoleGate";
import DrugTimeline      from "@/components/DrugTimeline";
import { useAuthStore }  from "@/lib/store";
import { createAuthClient, supplyAPI } from "@/lib/api";

export default function ManufacturePage() {
  const { siweMessage, siweSignature } = useAuthStore();
  const [drugId,   setDrugId]   = useState("");
  const [location, setLocation] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState("");
  const [history,  setHistory]  = useState(null);

  async function handleSubmit() {
    if (!drugId.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const client = createAuthClient(siweMessage, siweSignature);
      const res    = await supplyAPI.manufacture(client, {
        drugId:   drugId.trim(),
        location: location.trim(),
      });
      setResult(res.data);
      const trackRes = await supplyAPI.getStatus(drugId.trim());
      setHistory(trackRes.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <RoleGate roles={["Manufacturer"]}>
      <div className="page">
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: ".25rem" }}>
          🏭 Register Drug Strip
        </h1>
        <p className="text-muted" style={{ marginBottom: "1.5rem" }}>
          Enter the Drug ID from the batch manifest to register a strip into the supply chain.
        </p>
        <div className="card">
          <label>Drug ID</label>
          <input
            className="input"
            placeholder="e.g. COMP-A-B1-S0001"
            value={drugId}
            onChange={(e) => setDrugId(e.target.value)}
          />
          <label>Location (optional)</label>
          <input
            className="input"
            placeholder="e.g. Dhaka Factory, Building A"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          {error  && <div className="alert alert-danger">{error}</div>}
          {result && (
            <div className="alert alert-success">
              ✅ Drug <strong>{result.drugId}</strong> registered on-chain.
              <div className="mono mt-1">{result.txHash}</div>
            </div>
          )}
          <button
            className="btn btn-primary w-full"
            onClick={handleSubmit}
            disabled={loading || !drugId.trim()}
          >
            {loading ? <><span className="spinner" /> Submitting...</> : "Register on Blockchain"}
          </button>
        </div>
        {history && (
          <DrugTimeline
            history={history.history}
            currentStatus={history.currentStatus}
            drugId={drugId}
          />
        )}
      </div>
    </RoleGate>
  );
}