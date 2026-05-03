"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import RoleGate from "@/components/RoleGate";
import { govAPI } from "@/lib/api";

export default function DashboardPage() {
  const { entityRole, entityName, walletAddress } = useAuthStore();
  const router = useRouter();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    govAPI.getAnalytics()
      .then((r) => setStats(r.data.analytics))
      .catch(() => { });
  }, []);

  const roleActions = {
    Manufacturer: { path: "/manufacture", label: "Register Drug Strips", icon: "🏭" },
    Distributor: { path: "/distribute", label: "Record Distribution", icon: "🚚" },
    Retailer: { path: "/retail", label: "Record Retail Handoff", icon: "🏪" },
  };

  const action = roleActions[entityRole];

  return (
    <RoleGate>
      <div className="page">
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: ".25rem" }}>
          Welcome, {entityName || "Unknown Entity"}
        </h1>
        <p className="text-muted" style={{ marginBottom: "1.5rem" }}>
          <span className="mono">{walletAddress}</span>
        </p>

        {action && (
          <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="card-title" style={{ margin: 0 }}>{action.icon} Your Action</div>
              <p className="text-muted">{action.label}</p>
            </div>
            <button className="btn btn-primary" onClick={() => router.push(action.path)}>
              Go →
            </button>
          </div>
        )}

        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className="card-title" style={{ margin: 0 }}>🔍 Track a Drug Strip</div>
            <p className="text-muted">View full supply chain history for any drug ID</p>
          </div>
          <button className="btn btn-outline" onClick={() => router.push("/track")}>
            Track →
          </button>
        </div>

        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>

            {/* Consumption Events */}
            <div className="card">
              <div className="card-title">📊 Consumption Events</div>
              {Object.keys(stats.consumptionByDrug).length === 0 ? (
                <p className="text-muted">No verifications yet</p>
              ) : (
                Object.entries(stats.consumptionByDrug)
                  // Manufacturer sees only their batches
                  .filter(([drug]) =>
                    entityRole === "Manufacturer"
                      ? true  // filtered server-side in future
                      : true
                  )
                  .map(([drug, count]) => (
                    <div key={drug} style={{
                      display: "flex", justifyContent: "space-between",
                      marginBottom: ".4rem", padding: ".4rem .6rem",
                      background: "var(--bg)", borderRadius: "6px"
                    }}>
                      <span className="mono">{drug}</span>
                      <span className="badge badge-green">{count} verified</span>
                    </div>
                  ))
              )}
            </div>

            {/* Anomaly Summary — only for Manufacturer */}
            {entityRole === "Manufacturer" && (
              <div className="card">
                <div className="card-title">🚨 Anomaly Alerts</div>
                {Object.keys(stats.anomalyCounts).length === 0 ? (
                  <p className="text-muted">No anomalies detected ✅</p>
                ) : (
                  Object.entries(stats.anomalyCounts).map(([type, count]) => {
                    const severity = type === "POTENTIAL_CLONE_DETECTED" ? "badge-red" :
                      type === "REPLAY_ATTACK_DETECTED" ? "badge-red" :
                        "badge-yellow";
                    return (
                      <div key={type} style={{
                        display: "flex", justifyContent: "space-between",
                        marginBottom: ".5rem", padding: ".4rem .6rem",
                        background: "var(--bg)", borderRadius: "6px"
                      }}>
                        <span style={{ fontSize: ".82rem" }}>
                          {type === "REPLAY_ATTACK_DETECTED" && "🔁 Replay Attack"}
                          {type === "POTENTIAL_CLONE_DETECTED" && "⚠️ Potential Clone"}
                          {type === "RECALLED_BATCH_SCAN" && "📦 Recalled Batch Scan"}
                          {type === "UNREGISTERED_BATCH_SCAN" && "❓ Unregistered Scan"}
                          {type === "UNAUTHORIZED_ACTOR" && "🚫 Unauthorized Actor"}
                          {type === "OUT_OF_ORDER_SUPPLY_CHAIN" && "🔀 Out of Order"}
                          {!["REPLAY_ATTACK_DETECTED", "POTENTIAL_CLONE_DETECTED",
                            "RECALLED_BATCH_SCAN", "UNREGISTERED_BATCH_SCAN",
                            "UNAUTHORIZED_ACTOR", "OUT_OF_ORDER_SUPPLY_CHAIN"]
                            .includes(type) && type}
                        </span>
                        <span className={`badge ${severity}`}>{count}</span>
                      </div>
                    );
                  })
                )}
                {stats.unreviewedAnomalies > 0 && (
                  <div style={{
                    marginTop: ".75rem", padding: ".6rem .75rem",
                    background: "#7f1d1d33", border: "1px solid var(--danger)",
                    borderRadius: "6px", fontSize: ".82rem", color: "var(--danger)"
                  }}>
                    ⚠️ {stats.unreviewedAnomalies} unreviewed alerts require attention.
                    Contact the government regulatory body.
                  </div>
                )}
              </div>
            )}

            {/* Distributors & Retailers — no anomaly access */}
            {(entityRole === "Distributor" || entityRole === "Retailer") && (
              <div className="card">
                <div className="card-title">📋 Your Role</div>
                <p className="text-muted" style={{ fontSize: ".85rem" }}>
                  {entityRole === "Distributor"
                    ? "You are responsible for recording distribution custody transfers."
                    : "You are responsible for recording retail handoffs to consumers."}
                </p>
                <div style={{
                  marginTop: ".75rem", padding: ".6rem .75rem",
                  background: "#1e3a5f33", border: "1px solid var(--primary)",
                  borderRadius: "6px", fontSize: ".82rem", color: "var(--primary)"
                }}>
                  ℹ️ Anomaly monitoring is managed by the Government Regulatory Authority.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </RoleGate>
  );
}