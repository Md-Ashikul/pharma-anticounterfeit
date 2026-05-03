"use client";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  return (
    <div className="page">

      {/* Hero */}
      <div style={{ textAlign: "center", padding: "2rem 0 1.5rem" }}>
        <div style={{ fontSize: "4rem", marginBottom: ".75rem" }}>🔍</div>
        <h2 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: ".5rem" }}>
          Verify Your Medicine
        </h2>
        <p className="text-muted" style={{ fontSize: ".9rem", lineHeight: 1.6 }}>
          Scan the QR code on your medicine strip to instantly verify
          its authenticity using blockchain technology.
        </p>
      </div>

      {/* How it works */}
      <div className="card">
        <div className="card-title">How It Works</div>
        {[
          { step: "1", icon: "📦", text: "Scan the Public QR on the medicine box to see its journey" },
          { step: "2", icon: "🔐", text: "Scratch and scan the Hidden QR to verify authenticity" },
          { step: "3", icon: "✅", text: "Get instant blockchain-verified result" },
        ].map((s) => (
          <div key={s.step} style={{ display: "flex", gap: ".75rem",
                                     alignItems: "flex-start", marginBottom: ".85rem" }}>
            <div style={{ background: "var(--primary)", color: "#fff",
                          width: 26, height: 26, borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: ".8rem", fontWeight: 700, flexShrink: 0 }}>
              {s.step}
            </div>
            <div style={{ fontSize: ".88rem", paddingTop: ".2rem" }}>
              {s.icon} {s.text}
            </div>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <button
        className="btn btn-primary"
        style={{ marginBottom: ".75rem" }}
        onClick={() => router.push("/track")}
      >
        📦 Scan Public QR — Track Journey
      </button>

      <button
        className="btn btn-success"
        onClick={() => router.push("/verify")}
      >
        🔐 Scan Hidden QR — Verify Authenticity
      </button>

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <div style={{ fontSize: ".8rem", color: "var(--muted)", lineHeight: 1.7 }}>
          <div>🏛️ Powered by Government of Bangladesh</div>
          <div>⛓️ Secured by Ethereum Blockchain</div>
          <div>🔒 Your privacy is protected</div>
          <div>📱 No app installation required</div>
        </div>
      </div>
    </div>
  );
}