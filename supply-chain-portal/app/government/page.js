"use client";
import { useState, useEffect } from "react";
import { useRouter }           from "next/navigation";
import { useAuthStore }        from "@/lib/store";
import { govAPI, governanceWeb3, createAuthClient } from "@/lib/api";
import RoleGate                from "@/components/RoleGate";

// GovernmentRegistry.ProposalAction enum
const ACTION_LABELS = {
  0: "Register Entity",
  1: "Revoke Entity",
  2: "Reinstate Entity",
  3: "Add Regulator",
  4: "Remove Regulator",
};

// GovernmentRegistry.ProposalStatus enum
const STATUS_META = {
  0: { label: "Pending",   color: "var(--warning)", bg: "#78350f33" },
  1: { label: "Executed",  color: "var(--success)", bg: "#14532d33" },
  2: { label: "Expired",   color: "var(--muted)",   bg: "#33415533" },
  3: { label: "Cancelled", color: "var(--danger)",  bg: "#7f1d1d33" },
};

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
  const { siweMessage, siweSignature, entityRole, walletAddress } = useAuthStore();
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

  // Consortium proposals (on-chain governance)
  const [proposals,        setProposals]        = useState([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [votingId,         setVotingId]         = useState(null);

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    loadAll();
  }, []);

  // Refresh on-chain proposals whenever the Proposals tab is opened.
  useEffect(() => {
    if (tab === "proposals") loadProposals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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

  // ── Proposals (on-chain consortium governance) ─────────────────────────────
  async function loadProposals() {
    setProposalsLoading(true);
    try {
      const list = await governanceWeb3.listProposals();
      setProposals(list);
    } catch (err) {
      console.error("Failed to load proposals:", err);
      setActionError(err.message || "Failed to load proposals.");
    } finally {
      setProposalsLoading(false);
    }
  }

  async function handleVote(proposalId, choice) {
    setActionMsg("");
    setActionError("");
    setVotingId(proposalId);
    try {
      const receipt = await governanceWeb3.vote(proposalId, choice);
      setActionMsg(
        `✅ Vote (${choice ? "YES" : "NO"}) cast on proposal #${proposalId}. Tx: ${receipt.hash.slice(0, 10)}…`
      );
      await loadProposals();
      loadAll();
    } catch (err) {
      setActionError(parseTxError(err));
    } finally {
      setVotingId(null);
    }
  }

  // ── Actions (now create consortium proposals via MetaMask) ─────────────────
  async function handleRevoke(wallet, name) {
    const reason = prompt(`Reason for revoking ${name}:`);
    if (!reason) return;
    setActionMsg("");
    setActionError("");
    try {
      const receipt = await governanceWeb3.proposeRevoke({ wallet, reason });
      setActionMsg(
        `✅ Revocation proposal created for ${name} (you auto-voted YES). Other regulators must vote to reach the threshold. Tx: ${receipt.hash.slice(0, 10)}…`
      );
      loadProposals();
    } catch (err) {
      setActionError(parseTxError(err));
    }
  }

  async function handleReinstate(wallet, name) {
    setActionMsg("");
    setActionError("");
    try {
      const receipt = await governanceWeb3.proposeReinstate({ wallet });
      setActionMsg(
        `✅ Reinstatement proposal created for ${name} (you auto-voted YES). Other regulators must vote to reach the threshold. Tx: ${receipt.hash.slice(0, 10)}…`
      );
      loadProposals();
    } catch (err) {
      setActionError(parseTxError(err));
    }
  }

  async function handleRegister() {
    if (!regWallet || !regName || !regLicense) return;
    setRegLoading(true);
    setActionMsg("");
    setActionError("");
    try {
      const receipt = await governanceWeb3.proposeRegister({
        wallet:        regWallet,
        name:          regName,
        licenseNumber: regLicense,
        role:          parseInt(regRole),
      });
      setActionMsg(
        `✅ Registration proposal created for ${regName} (you auto-voted YES). Other regulators must vote to reach the threshold. Tx: ${receipt.hash.slice(0, 10)}…`
      );
      setRegWallet(""); setRegName(""); setRegLicense("");
      setTab("proposals");
      loadProposals();
    } catch (err) {
      setActionError(parseTxError(err));
    } finally {
      setRegLoading(false);
    }
  }

  // MetaMask / ethers errors are verbose — surface the useful bit.
  function parseTxError(err) {
    if (err?.code === "ACTION_REJECTED") return "Transaction rejected in MetaMask.";
    return err?.shortMessage || err?.reason || err?.message || "Transaction failed.";
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
            { id: "proposals", label: "🗳️ Proposals"   },
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

        {/* ── PROPOSALS TAB ── */}
        {tab === "proposals" && (
          <div>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: "1rem",
            }}>
              <div style={{ fontWeight: 600 }}>
                Consortium Proposals — {proposals.length} total
              </div>
              <button
                onClick={loadProposals}
                disabled={proposalsLoading}
                style={{
                  padding: ".4rem .85rem", borderRadius: "6px",
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--muted)", cursor: "pointer", fontSize: ".82rem",
                }}
              >
                {proposalsLoading ? "Refreshing…" : "↻ Refresh"}
              </button>
            </div>

            <p className="text-muted" style={{ fontSize: ".82rem", marginBottom: "1rem" }}>
              Each action (register, revoke, reinstate) is a proposal that needs
              approval from multiple regulators. Connect as a regulator and vote
              below — the proposal auto-executes once the threshold is reached.
            </p>

            {proposalsLoading && proposals.length === 0 && (
              <div style={{ textAlign: "center", padding: "2rem" }}>
                <div className="spinner" style={{ margin: "0 auto" }} />
              </div>
            )}

            {!proposalsLoading && proposals.length === 0 && (
              <div className="text-muted" style={{ padding: "2rem", textAlign: "center" }}>
                No proposals yet. Create one from the Register tab or by revoking an entity.
              </div>
            )}

            {proposals.map((p) => {
              const meta       = STATUS_META[p.status] || STATUS_META[0];
              const isPending  = p.status === 0;
              const alreadyVoted = walletAddress
                ? p.voters.map((v) => v.toLowerCase()).includes(walletAddress.toLowerCase())
                : false;
              return (
                <div key={p.id} style={{
                  background:   "var(--surface)",
                  border:       "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding:      "1rem 1.25rem",
                  marginBottom: "1rem",
                }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: ".75rem",
                    marginBottom: ".5rem", flexWrap: "wrap",
                  }}>
                    <span style={{ fontWeight: 600 }}>
                      #{p.id} · {ACTION_LABELS[p.action] || "Action"}
                    </span>
                    <span style={{
                      padding: ".15rem .55rem", borderRadius: "999px",
                      fontSize: ".75rem", fontWeight: 600,
                      background: meta.bg, color: meta.color,
                    }}>
                      {meta.label}
                    </span>
                    <span style={{
                      padding: ".15rem .55rem", borderRadius: "999px",
                      fontSize: ".75rem", fontWeight: 600,
                      background: "#1e3a5f55", color: "var(--primary)",
                    }}>
                      {p.approvalsCount}/{p.threshold} approvals
                    </span>
                  </div>

                  <div style={{ fontSize: ".8rem", color: "var(--muted)", marginBottom: ".5rem" }}>
                    Target:{" "}
                    <span style={{ fontFamily: "monospace" }}>{p.targetEntity}</span>
                    {p.proposalData ? <> · {p.proposalData}</> : null}
                  </div>
                  <div style={{ fontSize: ".75rem", color: "var(--muted)", marginBottom: ".75rem" }}>
                    Proposed by{" "}
                    <span style={{ fontFamily: "monospace" }}>
                      {p.proposer.slice(0, 6)}…{p.proposer.slice(-4)}
                    </span>
                  </div>

                  {isPending ? (
                    alreadyVoted ? (
                      <div className="text-muted" style={{ fontSize: ".82rem" }}>
                        ✓ You have already voted on this proposal.
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: ".5rem" }}>
                        <button
                          onClick={() => handleVote(p.id, true)}
                          disabled={votingId === p.id}
                          style={{
                            padding: ".4rem .85rem", borderRadius: "6px",
                            border: "1px solid var(--success)", background: "#14532d33",
                            color: "var(--success)", cursor: "pointer",
                            fontSize: ".82rem", fontWeight: 600,
                          }}
                        >
                          {votingId === p.id ? "Voting…" : "👍 Vote YES"}
                        </button>
                        <button
                          onClick={() => handleVote(p.id, false)}
                          disabled={votingId === p.id}
                          style={{
                            padding: ".4rem .85rem", borderRadius: "6px",
                            border: "1px solid var(--danger)", background: "#7f1d1d33",
                            color: "var(--danger)", cursor: "pointer",
                            fontSize: ".82rem", fontWeight: 600,
                          }}
                        >
                          👎 Vote NO
                        </button>
                      </div>
                    )
                  ) : (
                    <div className="text-muted" style={{ fontSize: ".82rem" }}>
                      Voting closed.
                    </div>
                  )}
                </div>
              );
            })}
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
              <div style={{ fontWeight: 600, marginBottom: ".5rem", fontSize: "1rem" }}>
                ➕ Register New Licensed Entity
              </div>
              <p className="text-muted" style={{ fontSize: ".8rem", marginBottom: "1.25rem" }}>
                This creates an on-chain consortium proposal. You (the connected
                regulator) auto-vote YES; other regulators must approve it in the
                Proposals tab before it executes. MetaMask will ask you to confirm.
              </p>

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
                  ? <><span className="spinner" /> Creating proposal...</>
                  : "Propose Registration"
                }
              </button>
            </div>
          </div>
        )}

      </div>
    </RoleGate>
  );
}
