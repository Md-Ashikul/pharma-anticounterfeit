"use client";

const STEP_CONFIG = {
  Manufacturer: { color: "tl-dot-blue", label: "🏭 Manufactured", badge: "badge-blue" },
  Distributor: { color: "tl-dot-yellow", label: "🚚 Distributed", badge: "badge-yellow" },
  Retailer: { color: "tl-dot-green", label: "🏪 Retailed", badge: "badge-green" },
  Consumer: { color: "tl-dot-green", label: "👤 Consumed", badge: "badge-green" },
};

export default function DrugTimeline({ history, currentStatus, drugId }) {
  const statusLabels = ["Not Registered", "Manufactured", "Distributed", "Retailed", "Consumed"];

  if (!history || history.length === 0) {
    return (
      <div className="card">
        <p className="text-muted text-center">
          No supply chain history found for <span className="mono">{drugId}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <span className="card-title" style={{ margin: 0 }}>Supply Chain Timeline</span>
        <span className={`badge ${currentStatus >= 4 ? "badge-green" : currentStatus >= 3 ? "badge-green" : "badge-yellow"}`}>
          {statusLabels[currentStatus] || "Unknown"}
        </span>
      </div>
      <div className="timeline">
        {history.map((step, i) => {
          const cfg = STEP_CONFIG[step.role] || { color: "tl-dot-blue", label: step.role, badge: "badge-blue" };
          return (
            <div className="tl-item" key={i}>
              <div className={`tl-dot ${cfg.color}`} />
              <div className="tl-role">
                {cfg.label}
                <span className={`badge ${cfg.badge}`} style={{ marginLeft: ".5rem" }}>
                  Verified ✓
                </span>
              </div>
              <div className="tl-meta">
                {new Date(step.timestamp).toLocaleString()}
                {step.location && ` · 📍 ${step.location}`}
              </div>
              <div className="mono mt-1">{step.actor}</div>
            </div>
          );
        })}
      </div>
      <hr className="divider" />
      <div style={{ display: "flex", gap: ".5rem" }}>
        {["Manufactured", "Distributed", "Retailed", "Consumed"].map((s, i) => (
          <div key={s} style={{
            flex: 1, height: 6, borderRadius: 999,
            background: currentStatus > i ? "var(--success)" : "var(--border)",
            transition: "background .3s",
          }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: ".4rem" }}>
        {["Manufactured", "Distributed", "Retailed", "Consumed"].map((s) => (
          <span key={s} style={{ fontSize: ".72rem", color: "var(--muted)" }}>{s}</span>
        ))}
      </div>
    </div>
  );
}