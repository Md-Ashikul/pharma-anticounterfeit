"use client";
import { useState, useEffect } from "react";
import { useRouter }           from "next/navigation";
import { extractDrugIdFromURL } from "@/lib/qrDecoder";
import { trackDrug }            from "@/lib/api";
import DrugTimeline             from "@/components/DrugTimeline";

export default function TrackPage() {
  const router = useRouter();
  const [drugId,  setDrugId]  = useState("");
  const [loading, setLoading] = useState(false);
  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState("");

  useEffect(() => {
    // Auto-load if drugId is in URL (Public QR scan)
    const id = extractDrugIdFromURL();
    if (id) {
      setDrugId(id);
      fetchTrack(id);
    }
  }, []);

  async function fetchTrack(id) {
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await trackDrug(id);
      setData(res);
    } catch (err) {
      setError(err.response?.data?.error || "Drug not found on blockchain");
    } finally {
      setLoading(false);
    }
  }

  function handleTrack() {
    if (!drugId.trim()) return;
    fetchTrack(drugId.trim());
  }

  return (
    <div className="page">
      <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: ".25rem" }}>
        📦 Track Medicine
      </h2>
      <p className="text-muted" style={{ fontSize: ".85rem", marginBottom: "1.25rem" }}>
        View the government-verified journey of this medicine strip.
      </p>

      <div className="card">
        <label>Drug ID</label>
        <div style={{ display: "flex", gap: ".5rem" }}>
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
            style={{ width: "auto", padding: ".75rem 1rem" }}
            onClick={handleTrack}
            disabled={loading || !drugId.trim()}
          >
            {loading ? <span className="spinner" /> : "Track"}
          </button>
        </div>
        {error && <div className="alert alert-danger mt-1">{error}</div>}
      </div>

      {data && <DrugTimeline data={data} />}

      {data && (
        <button
          className="btn btn-success mt-1"
          onClick={() => router.push("/verify")}
        >
          🔐 Verify Authenticity (Scan Hidden QR)
        </button>
      )}

      <button
        className="btn btn-outline mt-1"
        onClick={() => router.push("/")}
      >
        ← Home
      </button>
    </div>
  );
}