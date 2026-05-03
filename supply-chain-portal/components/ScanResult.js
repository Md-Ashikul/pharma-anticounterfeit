"use client";

const CONFIG = {
  AUTHENTIC:         { icon: "✅", cls: "alert-success", title: "Authentic Medicine" },
  AUTHENTIC_EXPIRED: { icon: "⚠️", cls: "alert-warning", title: "Authentic but EXPIRED" },
  ALREADY_USED:      { icon: "🚨", cls: "alert-danger",  title: "QR Already Used — Possible Counterfeit" },
  FAKE:              { icon: "❌", cls: "alert-danger",  title: "Counterfeit Detected" },
};

export default function ScanResult({ result }) {
  if (!result) return null;
  const cfg = CONFIG[result.status] || CONFIG.FAKE;

  return (
    <div className={`alert ${cfg.cls}`} style={{ padding: "1.25rem" }}>
      <div style={{ fontSize: "1.5rem", marginBottom: ".4rem" }}>{cfg.icon}</div>
      <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: ".5rem" }}>
        {cfg.title}
      </div>
      <div style={{ fontSize: ".875rem", marginBottom: ".75rem" }}>{result.message}</div>
      {result.drugName && (
        <div style={{ fontSize: ".82rem", opacity: .85 }}>
          <strong>Drug:</strong> {result.drugName}
        </div>
      )}
      {result.expiryDate && (
        <div style={{ fontSize: ".82rem", opacity: .85 }}>
          <strong>Expiry:</strong> {result.expiryDate}
        </div>
      )}
      {result.txHash && (
        <div style={{ fontSize: ".75rem", marginTop: ".5rem", opacity: .7 }}>
          <strong>Tx:</strong>{" "}
          <span className="mono">{result.txHash}</span>
        </div>
      )}
    </div>
  );
}