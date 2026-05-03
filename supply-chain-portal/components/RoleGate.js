"use client";
import { useAuthStore } from "@/lib/store";
import WalletConnect    from "@/components/WalletConnect";

export default function RoleGate({ children, roles = [] }) {
  const { isAuthenticated, entityRole } = useAuthStore();

  if (!isAuthenticated) {
    return (
      <div className="page flex-center" style={{ minHeight: "70vh" }}>
        <WalletConnect />
      </div>
    );
  }

  if (roles.length > 0 && !roles.includes(entityRole)) {
    return (
      <div className="page flex-center" style={{ minHeight: "70vh" }}>
        <div className="card" style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: "2rem", marginBottom: ".75rem" }}>🚫</div>
          <h2 style={{ marginBottom: ".5rem" }}>Access Denied</h2>
          <p className="text-muted">
            This page requires the{" "}
            <strong>{roles.join(" or ")}</strong> role.
            Your current role is{" "}
            <strong>{entityRole || "None (unregistered wallet)"}</strong>.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}