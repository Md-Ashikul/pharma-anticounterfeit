"use client";

const STEP_CONFIG = {
  Manufacturer: { color: "tl-dot-blue",   icon: "🏭", label: "Manufactured" },
  Distributor:  { color: "tl-dot-yellow", icon: "🚚", label: "Distributed"  },
  Retailer:     { color: "tl-dot-green",  icon: "🏪", label: "Retailed"     },
  Consumer:     { color: "tl-dot-green",  icon: "👤", label: "Consumed"     },
};

export default function DrugTimeline({ data }) {
  if (!data) return null;

  const { drugId, currentStatusLabel, history, verifiedByGovt } = data;

  return (
    <div className="card">
      <div className="card-title">
        Supply Chain History
        {verifiedByGovt && (
          <span style={{ marginLeft: ".5rem", fontSize: ".75rem",
                         color: "#22c55e", fontWeight: 400 }}>
            ✓ Govt Verified
          </span>
        )}
      </div>

      <div style={{ fontSize: ".82rem", color: "var(--muted)",
                    marginBottom: "1rem" }}>
        Status: <strong style={{ color: "var(--text)" }}>{currentStatusLabel}</strong>
      </div>

      {history && history.length > 0 ? (
        <div className="timeline">
          {history.map((step, i) => {
            const cfg = STEP_CONFIG[step.role] || { color: "tl-dot-blue", icon: "📦", label: step.role };
            return (
              <div className="tl-item" key={i}>
                <div className={`tl-dot ${cfg.color}`} />
                <div className="tl-role">
                  {cfg.icon} {cfg.label}
                  <span style={{ marginLeft: ".4rem", fontSize: ".75rem",
                                 color: "#22c55e" }}>✓</span>
                </div>
                <div className="tl-meta">
                  {new Date(step.timestamp).toLocaleString()}
                  {step.location && ` · 📍 ${step.location}`}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-muted" style={{ fontSize: ".85rem" }}>
          No supply chain history found.
        </p>
      )}
    </div>
  );
}