"use client";
import { useState }  from "react";
import DrugTimeline  from "@/components/DrugTimeline";
import { supplyAPI } from "@/lib/api";

export default function TrackPage() {
  const [drugId,  setDrugId]  = useState("");
  const [loading, setLoading] = useState(false);
  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState("");

  async function handleTrack() {
    if (!drugId.trim()) return;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await supplyAPI.getStatus(drugId.trim());
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || "Drug not found");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: ".25rem" }}>
        🔍 Track Drug Strip
      </h1>
      <p className="text-muted" style={{ marginBottom: "1.5rem" }}>
        Enter a Drug ID to view its full government-verified supply chain history.
        No login required.
      </p>
      <div className="card">
        <label>Drug ID</label>
        <div style={{ display: "flex", gap: ".75rem" }}>
          <input
            className="input"
            style={{ margin: 0, flex: 1 }}
            placeholder="e.g. COMP-A-B1-S0001"
            value={drugId}
            onChange={(e) => setDrugId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTrack()}
          />
          <button
            className="btn btn-primary"
            onClick={handleTrack}
            disabled={loading || !drugId.trim()}
          >
            {loading ? <span className="spinner" /> : "Track"}
          </button>
        </div>
        {error && <div className="alert alert-danger mt-1">{error}</div>}
      </div>
      {data && (
        <DrugTimeline
          history={data.history}
          currentStatus={data.currentStatus}
          drugId={drugId}
        />
      )}
    </div>
  );
}