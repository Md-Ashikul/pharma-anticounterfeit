"use client";

const CONFIGS = {
  AUTHENTIC: {
    cls:   "result-authentic",
    icon:  "✅",
    title: "Authentic Medicine",
    color: "#22c55e",
  },
  AUTHENTIC_EXPIRED: {
    cls:   "result-expired",
    icon:  "⚠️",
    title: "Authentic but EXPIRED",
    color: "#f59e0b",
  },
  ALREADY_USED: {
    cls:   "result-used",
    icon:  "🚨",
    title: "Already Used — Possible Counterfeit",
    color: "#ef4444",
  },
  FAKE: {
    cls:   "result-fake",
    icon:  "❌",
    title: "Counterfeit Detected",
    color: "#ef4444",
  },
};

export default function VerifyResult({ result }) {
  if (!result) return null;

  const cfg = CONFIGS[result.status] || CONFIGS.FAKE;

  return (
    <div className={cfg.cls}>
      <div className="result-icon">{cfg.icon}</div>
      <div className="result-title" style={{ color: cfg.color }}>
        {cfg.title}
      </div>
      <div className="result-msg">{result.message}</div>

      <div className="result-meta">
        {result.drugName && (
          <div><strong>Drug:</strong> {result.drugName}</div>
        )}
        {result.batchId && (
          <div><strong>Batch:</strong> {result.batchId}</div>
        )}
        {result.expiryDate && (
          <div><strong>Expiry:</strong> {result.expiryDate}</div>
        )}
        {result.txHash && (
          <div style={{ marginTop: ".5rem" }}>
            <strong>Blockchain Tx:</strong>
            <div className="mono">{result.txHash}</div>
          </div>
        )}
      </div>

      {result.status === "AUTHENTIC" && (
        <div style={{ marginTop: "1rem", fontSize: ".8rem", color: "#22c55e", opacity: .8 }}>
          🔒 Verified by Government-Licensed Entities
        </div>
      )}

      {(result.status === "ALREADY_USED" || result.status === "FAKE") && (
        <div style={{ marginTop: "1rem", fontSize: ".8rem", color: "#ef4444" }}>
          ⚠️ Do not consume. Report to authorities immediately.
        </div>
      )}
    </div>
  );
}