"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import WalletConnect from "@/components/WalletConnect";

export default function HomePage() {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) router.push("/dashboard");
  }, [isAuthenticated]);

  return (
    <div className="page" style={{ minHeight: "80vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
        <div style={{ fontSize: "3rem", marginBottom: ".75rem" }}>💊</div>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: ".5rem" }}>
          PharmaChain
        </h1>
        <p className="text-muted" style={{ maxWidth: 480, margin: "0 auto" }}>
          Government-backed pharmaceutical supply chain tracking.
          Connect your licensed wallet to register, distribute, or retail medicine strips.
        </p>
      </div>

      <WalletConnect />

      <div style={{ marginTop: "1rem" }}>
        <a href="/track" style={{ color: "var(--primary)", fontSize: ".9rem" }}>
          🔍 Track a drug strip without signing in →
        </a>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginTop: "2.5rem", maxWidth: 700 }}>
        {[
          { icon: "🏭", title: "Manufacturer", desc: "Register drug batches on-chain" },
          { icon: "🚚", title: "Distributor", desc: "Record custody transfers" },
          { icon: "🏪", title: "Retailer", desc: "Accept and track deliveries" },
        ].map((f) => (
          <div className="card" key={f.title} style={{ textAlign: "center", padding: "1rem" }}>
            <div style={{ fontSize: "1.75rem", marginBottom: ".4rem" }}>{f.icon}</div>
            <div style={{ fontWeight: 600, marginBottom: ".25rem" }}>{f.title}</div>
            <div className="text-muted" style={{ fontSize: ".82rem" }}>{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}