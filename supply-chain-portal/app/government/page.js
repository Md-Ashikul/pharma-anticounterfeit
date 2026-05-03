"use client";
import { useState, useEffect } from "react";
import { useRouter }           from "next/navigation";
import { useAuthStore }        from "@/lib/store";
import { govAPI, createAuthClient } from "@/lib/api";
import RoleGate                from "@/components/RoleGate";

const SEVERITY_COLOR = {
  CRITICAL: { bg: "#7f1d1d33", border: "#ef4444", text: "#ef4444", label: "🔴 CRITICAL" },
  HIGH:     { bg: "#78350f33", border: "#f59e0b", text: "#f59e0b", label: "🟠 HIGH"     },
  MEDIUM:   { bg: "#1e3a5f33", border: "#4f8ef7", text: "#4f8ef7", label: "🔵 MEDIUM"   },
};

const ANOMALY_LABELS = {
  REPLAY_ATTACK_DETECTED:    "🔁 Replay Attack",
  POTENTIAL_CLONE_DETECTED:  "⚠️ Potential Clone",
  RECALLED_BATCH_SCAN:       "📦 Recalled Batch Scan",
  UNREGISTERED_BATCH_SCAN:   "❓ Unregistered Scan",
  UNAUTHORIZED_ACTOR:        "🚫 Unauthorized Actor",
  OUT_OF_ORDER_SUPPLY_CHAIN: "🔀 Out of Order",
};

const ROLE_NAMES = { 1: "Manufacturer", 2: "Distributor", 3: "Retailer" };

export default function GovernmentPage() {
  const { siweMessage, siweSignature, entityRole } = useAuthStore();
  const router = useRouter();

  // ── State ─────────────────────────────────────────────────────────────────
  const [tab,          setTab]          = useState("overview");
  const [analytics,    setAnalytics]    = useState(null);
  const [anomalies,    setAnomalies]    = useState([]);
  const [entities,     setEntities]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [actionMsg,    setActionMsg]    = useState("");
  const [actionError,  setActionError]  = useState("");

  // Register form
  const [regWallet,   setRegWallet]   = useState("");
  const [regName,     setRegName]     = useState("");
  const [regLicense,  setRegLicense]  = useState("");
  const [regRole,     setRegRole]     = useState("1");
  const [regLoading,  setRegLoading]  = useState(false);

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [analyticsRes, anomaliesRes, entitiesRes] = await Promise.all([
        govAPI.getAnalytics(),
        govAPI.getAnomalies({}),
        govAPI.getEntities(),
      ]);
      setAnalytics(analyticsRes.data.analytics);
      setAnomalies(anomaliesRes.data.anomalies);
      setEntities(entitiesRes.data.entities);
    } catch (err) {
      console.error("Failed to load government data:", err);
    } finally {
      setLoading(false);
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleRevoke(wallet, name) {
    const reason = prompt(`Reason for revoking ${name}:`);
    if (!reason) return;
    setActionMsg("");
    setActionError("");
    try {
      const client = createAuthClient(siweMessage, siweSignature);
      await govAPI.revokeEntity(client, { wallet, reason });
      setActionMsg(`✅ ${name} revoked successfully.`);
      loadAll();
    } catch (err) {
      setActionError(err.response?.data?.error || err.message);
    }
  }

  async function handleReinstate(wallet, name) {
    setActionMsg("");
    setActionError("");
    try {
      const client = createAuthClient(siweMessage, siweSignature);
      await govAPI.reinstateEntity(client, { wallet });
      setActionMsg(`✅ ${name} reinstated successfully.`);
      loadAll();
    } catch (err) {
      setActionError(err.response?.data?.error || err.message);
    }
  }

  async function handleRegister() {
    if (!regWallet || !regName || !regLicense) return;
    setRegLoading(true);
    setActionMsg("");
    setActionError("");
    try {
      const client = createAuthClient(siweMessage, siweSignature);
      await govAPI.registerEntity(client, {
        wallet:        regWallet,
        name:          regName,
        licenseNumber: regLicense,
        role:          parseInt(regRole),
      });
      setActionMsg(`✅ ${regName} registered successfully.`);
      setRegWallet(""); setRegName(""); setRegLicense("");
      loadAll();
    } catch (err) {
      setActionError(err.response?.data?.error || err.message);
    } finally {
      setRegLoading(false);
    }
  }

  async function handleReviewAnomaly(id) {
    try {
      const client = createAuthClient(siweMessage, siweSignature);
      await govAPI.reviewAnomaly(client, id);
      setAnomalies((prev) =>
        prev.map((a) => a.id === id ? { ...a, reviewed: true } : a)
      );
    } catch (err) {
      console.error("Review failed:", err);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const unreviewedCount = anomalies.filter((a) => !a.reviewed).length;
  const criticalCount   = anomalies.filter((a) => a.severity === "CRITICAL").length;

  return (
    <RoleGate roles={["Government"]}>
      <div style={{ padding: "1.5rem", maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{
          background:   "var(--surface)",
          border:       "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding:      "1.25rem 1.5rem",
          marginBottom: "1.5rem",
          display:      "flex",
          alignItems:   "center",
          justifyContent: "space-between",
        }}>
          <div>
            <h1 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: ".25rem" }}>
              🏛️ Government Regulatory Dashboard
            </h1>
            <p style={{ color: "var(--muted)", fontSize: ".85rem" }}>
              National Pharmaceutical Anti-Counterfeiting Control Center
            </p>
          </div>
          <div style={{ display: "flex", gap: ".75rem" }}>
            {unreviewedCount > 0 && (
              <div style={{
                background: "#7f1d1d33", border: "1px solid #ef4444",
                borderRadius: "8px", padding: ".5rem .85rem",
                fontSize: ".82rem", color: "#ef4444",
              }}>
                🚨 {unreviewedCount} Unreviewed Alerts
              </div>
            )}
            {criticalCount > 0 && (
              <div style={{
                background: "#78350f33", border: "1px solid #f59e0b",
                borderRadius: "8px", padding: ".5rem .85rem",
                fontSize: ".82rem", color: "#f59e0b",
              }}>
                ⚠️ {criticalCount} Critical
              </div>
            )}
          </div>
        </div>

        {/* Action messages */}
        {actionMsg   && <div className="alert alert-success">{actionMsg}</div>}
        {actionError && <div className="alert alert-danger">{actionError}</div>}

        {/* Tabs */}
        <div style={{
          display:      "flex",
          gap:          ".5rem",
          marginBottom: "1.5rem",
          borderBottom: "1px solid var(--border)",
          paddingBottom: ".75rem",
        }}>
          {[
            { id: "overview",  label: "📊 Overview"    },
            { id: "anomalies", label: "🚨 Anomalies"   },
            { id: "entities",  label: "🏢 Entities"    },
            { id: "register",  label: "➕ Register"    },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding:      ".5rem 1rem",
                borderRadius: "8px",
                border:       "1px solid",
                borderColor:  tab === t.id ? "var(--primary)" : "var(--border)",
                background:   tab === t.id ? "#1e3a5f55" : "transparent",
                color:        tab === t.id ? "var(--primary)" : "var(--muted)",
                cursor:       "pointer",
                fontSize:     ".88rem",
                fontWeight:   tab === t.id ? 600 : 400,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "3rem" }}>
            <div className="spinner" style={{ margin: "0 auto" }} />
          </div>
        )}

        {/* ── OVERVIEW TAB ── */}
        {!loading && tab === "overview" && analytics && (
          <div>
            {/* Stats grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}>
              {[
                {
                  icon:  "🏢",
                  label: "Total Entities",
                  value: entities.length,
                  color: "var(--primary)",
                },
                {
                  icon:  "✅",
                  label: "Active Licenses",
                  value: entities.filter((e) => e.licenseStatus === "Active").length,
                  color: "var(--success)",
                },
                {
                  icon:  "💊",
                  label: "Verifications",
                  value: Object.values(analytics.consumptionByDrug)
                    .reduce((a, b) => a + b, 0),
                  color: "var(--primary)",
                },
                {
                  icon:  "🚨",
                  label: "Total Anomalies",
                  value: anomalies.length,
                  color: anomalies.length > 0 ? "var(--danger)" : "var(--success)",
                },
              ].map((stat) => (
                <div key={stat.label} style={{
                  background:   "var(--surface)",
                  border:       "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding:      "1.25rem",
                  textAlign:    "center",
                }}>
                  <div style={{ fontSize: "1.75rem", marginBottom: ".4rem" }}>
                    {stat.icon}
                  </div>
                  <div style={{
                    fontSize:   "1.6rem",
                    fontWeight: 700,
                    color:      stat.color,
                    marginBottom: ".2rem",
                  }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: ".78rem", color: "var(--muted)" }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Consumption by drug */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
            }}>
              <div style={{
                background:   "var(--surface)",
                border:       "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding:      "1.25rem",
              }}>
                <div style={{ fontWeight: 600, marginBottom: "1rem" }}>
                  📊 National Consumption by Batch
                </div>
                {Object.keys(analytics.consumptionByDrug).length === 0 ? (
                  <p style={{ color: "var(--muted)", fontSize: ".85rem" }}>
                    No verifications yet
                  </p>
                ) : (
                  Object.entries(analytics.consumptionByDrug).map(([drug, count]) => (
                    <div key={drug} style={{
                      display:       "flex",
                      justifyContent: "space-between",
                      alignItems:    "center",
                      padding:       ".5rem .75rem",
                      background:    "var(--bg)",
                      borderRadius:  "6px",
                      marginBottom:  ".5rem",
                    }}>
                      <span style={{ fontFamily: "monospace", fontSize: ".85rem" }}>
                        {drug}
                      </span>
                      <span style={{
                        background: "#14532d55", color: "var(--success)",
                        padding: ".2rem .6rem", borderRadius: "999px",
                        fontSize: ".78rem", fontWeight: 600,
                      }}>
                        {count} verified
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Anomaly breakdown */}
              <div style={{
                background:   "var(--surface)",
                border:       "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding:      "1.25rem",
              }}>
                <div style={{ fontWeight: 600, marginBottom: "1rem" }}>
                  🚨 Anomaly Breakdown
                </div>
                {Object.keys(analytics.anomalyCounts).length === 0 ? (
                  <p style={{ color: "var(--success)", fontSize: ".85rem" }}>
                    ✅ No anomalies detected nationwide
                  </p>
                ) : (
                  Object.entries(analytics.anomalyCounts).map(([type, count]) => {
                    const sev = type === "POTENTIAL_CLONE_DETECTED" ? SEVERITY_COLOR.CRITICAL :
                                type === "REPLAY_ATTACK_DETECTED"   ? SEVERITY_COLOR.HIGH :
                                SEVERITY_COLOR.MEDIUM;
                    return (
                      <div key={type} style={{
                        display:       "flex",
                        justifyContent: "space-between",
                        alignItems:    "center",
                        padding:       ".5rem .75rem",
                        background:    sev.bg,
                        border:        `1px solid ${sev.border}`,
                        borderRadius:  "6px",
                        marginBottom:  ".5rem",
                      }}>
                        <span style={{ fontSize: ".85rem", color: sev.text }}>
                          {ANOMALY_LABELS[type] || type}
                        </span>
                        <span style={{
                          background: sev.bg, color: sev.text,
                          padding: ".2rem .6rem", borderRadius: "999px",
                          fontSize: ".78rem", fontWeight: 600,
                          border: `1px solid ${sev.border}`,
                        }}>
                          {count}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── ANOMALIES TAB ── */}
        {!loading && tab === "anomalies" && (
          <div>
            <div style={{
              display:       "flex",
              justifyContent: "space-between",
              alignItems:    "center",
              marginBottom:  "1rem",
            }}>
              <div style={{ fontWeight: 600 }}>
                All Anomalies — {anomalies.length} total
              </div>
              <div style={{ fontSize: ".82rem", color: "var(--muted)" }}>
                {unreviewedCount} unreviewed
              </div>
            </div>

            {anomalies.length === 0 ? (
              <div style={{
                background:   "var(--surface)",
                border:       "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding:      "2rem",
                textAlign:    "center",
                color:        "var(--success)",
              }}>
                ✅ No anomalies detected nationwide
              </div>
            ) : (
              anomalies.map((anomaly) => {
                const sev = SEVERITY_COLOR[anomaly.severity] || SEVERITY_COLOR.MEDIUM;
                return (
                  <div key={anomaly.id} style={{
                    background:   "var(--surface)",
                    border:       `1px solid ${anomaly.reviewed ? "var(--border)" : sev.border}`,
                    borderRadius: "var(--radius)",
                    padding:      "1rem 1.25rem",
                    marginBottom: "1rem",
                    opacity:      anomaly.reviewed ? 0.6 : 1,
                  }}>
                    <div style={{
                      display:       "flex",
                      justifyContent: "space-between",
                      alignItems:    "flex-start",
                      marginBottom:  ".75rem",
                    }}>
                      <div>
                        <span style={{
                          fontWeight: 600, fontSize: ".95rem",
                          color: anomaly.reviewed ? "var(--muted)" : sev.text,
                        }}>
                          {ANOMALY_LABELS[anomaly.type] || anomaly.type}
                        </span>
                        <span style={{
                          marginLeft:  ".5rem",
                          fontSize:    ".75rem",
                          padding:     ".15rem .5rem",
                          borderRadius: "999px",
                          background:  sev.bg,
                          color:       sev.text,
                          border:      `1px solid ${sev.border}`,
                        }}>
                          {sev.label}
                        </span>
                        {anomaly.reviewed && (
                          <span style={{
                            marginLeft:  ".5rem",
                            fontSize:    ".75rem",
                            color:       "var(--success)",
                          }}>
                            ✓ Reviewed
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: ".78rem", color: "var(--muted)" }}>
                        {new Date(anomaly.timestamp).toLocaleString()}
                      </div>
                    </div>

                    <div style={{
                      display:             "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap:                 ".5rem",
                      fontSize:            ".8rem",
                      marginBottom:        ".75rem",
                    }}>
                      <div style={{
                        background: "var(--bg)", borderRadius: "6px", padding: ".5rem",
                      }}>
                        <div style={{ color: "var(--muted)", marginBottom: ".2rem" }}>
                          Drug ID
                        </div>
                        <div style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                          {anomaly.drugId}
                        </div>
                      </div>
                      <div style={{
                        background: "var(--bg)", borderRadius: "6px", padding: ".5rem",
                      }}>
                        <div style={{ color: "var(--muted)", marginBottom: ".2rem" }}>
                          Batch ID
                        </div>
                        <div style={{ fontFamily: "monospace" }}>
                          {anomaly.batchId}
                        </div>
                      </div>
                      <div style={{
                        background: "var(--bg)", borderRadius: "6px", padding: ".5rem",
                      }}>
                        <div style={{ color: "var(--muted)", marginBottom: ".2rem" }}>
                          IP Address
                        </div>
                        <div style={{ fontFamily: "monospace" }}>
                          {anomaly.ipAddress}
                        </div>
                      </div>
                    </div>

                    {!anomaly.reviewed && (
                      <button
                        onClick={() => handleReviewAnomaly(anomaly.id)}
                        style={{
                          padding:      ".4rem .85rem",
                          borderRadius: "6px",
                          border:       "1px solid var(--border)",
                          background:   "transparent",
                          color:        "var(--text)",
                          cursor:       "pointer",
                          fontSize:     ".82rem",
                        }}
                      >
                        ✓ Mark as Reviewed
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── ENTITIES TAB ── */}
        {!loading && tab === "entities" && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: "1rem" }}>
              All Registered Entities — {entities.length} total
            </div>

            {entities.map((entity) => (
              <div key={entity.id} style={{
                background:   "var(--surface)",
                border:       "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding:      "1rem 1.25rem",
                marginBottom: "1rem",
                display:      "flex",
                alignItems:   "center",
                justifyContent: "space-between",
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{
                    display:    "flex",
                    alignItems: "center",
                    gap:        ".75rem",
                    marginBottom: ".4rem",
                  }}>
                    <span style={{ fontWeight: 600 }}>{entity.name}</span>
                    <span style={{
                      padding:      ".15rem .55rem",
                      borderRadius: "999px",
                      fontSize:     ".75rem",
                      fontWeight:   600,
                      background:   entity.role === "Manufacturer" ? "#1e3a5f55" :
                                    entity.role === "Distributor"  ? "#78350f55" : "#14532d55",
                      color:        entity.role === "Manufacturer" ? "var(--primary)" :
                                    entity.role === "Distributor"  ? "var(--warning)" :
                                    "var(--success)",
                    }}>
                      {entity.role}
                    </span>
                    <span style={{
                      padding:      ".15rem .55rem",
                      borderRadius: "999px",
                      fontSize:     ".75rem",
                      fontWeight:   600,
                      background:   entity.licenseStatus === "Active" ? "#14532d55" : "#7f1d1d55",
                      color:        entity.licenseStatus === "Active" ? "var(--success)" : "var(--danger)",
                    }}>
                      {entity.licenseStatus}
                    </span>
                  </div>
                  <div style={{ fontSize: ".8rem", color: "var(--muted)" }}>
                    License: {entity.licenseNumber} ·{" "}
                    <span style={{ fontFamily: "monospace" }}>
                      {entity.walletAddress}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: ".5rem" }}>
                  {entity.licenseStatus === "Active" ? (
                    <button
                      onClick={() => handleRevoke(entity.walletAddress, entity.name)}
                      style={{
                        padding:      ".4rem .85rem",
                        borderRadius: "6px",
                        border:       "1px solid var(--danger)",
                        background:   "#7f1d1d33",
                        color:        "var(--danger)",
                        cursor:       "pointer",
                        fontSize:     ".82rem",
                        fontWeight:   600,
                      }}
                    >
                      Revoke License
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReinstate(entity.walletAddress, entity.name)}
                      style={{
                        padding:      ".4rem .85rem",
                        borderRadius: "6px",
                        border:       "1px solid var(--success)",
                        background:   "#14532d33",
                        color:        "var(--success)",
                        cursor:       "pointer",
                        fontSize:     ".82rem",
                        fontWeight:   600,
                      }}
                    >
                      Reinstate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── REGISTER TAB ── */}
        {!loading && tab === "register" && (
          <div style={{ maxWidth: 560 }}>
            <div style={{
              background:   "var(--surface)",
              border:       "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding:      "1.5rem",
            }}>
              <div style={{ fontWeight: 600, marginBottom: "1.25rem", fontSize: "1rem" }}>
                ➕ Register New Licensed Entity
              </div>

              <label style={{ display: "block", fontSize: ".82rem", color: "var(--muted)", marginBottom: ".3rem" }}>
                Wallet Address
              </label>
              <input
                className="input"
                placeholder="0x..."
                value={regWallet}
                onChange={(e) => setRegWallet(e.target.value)}
              />

              <label style={{ display: "block", fontSize: ".82rem", color: "var(--muted)", marginBottom: ".3rem" }}>
                Entity Name
              </label>
              <input
                className="input"
                placeholder="e.g. PharmaCorp Ltd"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
              />

              <label style={{ display: "block", fontSize: ".82rem", color: "var(--muted)", marginBottom: ".3rem" }}>
                License Number
              </label>
              <input
                className="input"
                placeholder="e.g. MFG-002"
                value={regLicense}
                onChange={(e) => setRegLicense(e.target.value)}
              />

              <label style={{ display: "block", fontSize: ".82rem", color: "var(--muted)", marginBottom: ".3rem" }}>
                Role
              </label>
              <select
                className="input"
                value={regRole}
                onChange={(e) => setRegRole(e.target.value)}
                style={{ marginBottom: ".75rem" }}
              >
                <option value="1">Manufacturer</option>
                <option value="2">Distributor</option>
                <option value="3">Retailer</option>
              </select>

              <button
                className="btn btn-primary"
                onClick={handleRegister}
                disabled={regLoading || !regWallet || !regName || !regLicense}
                style={{ width: "100%" }}
              >
                {regLoading
                  ? <><span className="spinner" /> Registering...</>
                  : "Register on Blockchain"
                }
              </button>
            </div>
          </div>
        )}

      </div>
    </RoleGate>
  );
}