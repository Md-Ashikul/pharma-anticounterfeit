"use client";
import Link from "next/link";
import { useAuthStore } from "@/lib/store";

export default function Navbar() {
    const { isAuthenticated, entityRole, entityName, walletAddress, logout } =
        useAuthStore();

    const short = walletAddress
        ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
        : null;

    const roleColor = {
        Manufacturer: "badge-blue",
        Distributor: "badge-yellow",
        Retailer: "badge-green",
        Government: "badge-red",
    };

    return (
        <nav style={{
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
            padding: ".85rem 1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            zIndex: 100,
        }}>
            <Link href="/" style={{ textDecoration: "none" }}>
                <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text)" }}>
                    💊 PharmaChain
                </span>
            </Link>

            {/* Center: Nav links */}
            <div style={{ display: "flex", gap: "1.5rem" }}>
                <Link href="/track" style={{ color: "var(--muted)", textDecoration: "none", fontSize: ".9rem" }}>
                    Track
                </Link>
                {isAuthenticated && (
                    <>
                        <Link href="/dashboard" style={{ color: "var(--muted)", textDecoration: "none", fontSize: ".9rem" }}>
                            Dashboard
                        </Link>
                        {entityRole === "Government" && (
                            <Link href="/government" style={{ color: "var(--muted)", textDecoration: "none", fontSize: ".9rem" }}>
                                Gov Dashboard
                            </Link>
                        )}
                        {entityRole === "Manufacturer" && (
                            <Link href="/manufacture" style={{ color: "var(--muted)", textDecoration: "none", fontSize: ".9rem" }}>
                                Manufacture
                            </Link>
                        )}
                        {entityRole === "Distributor" && (
                            <Link href="/distribute" style={{ color: "var(--muted)", textDecoration: "none", fontSize: ".9rem" }}>
                                Distribute
                            </Link>
                        )}
                        {entityRole === "Retailer" && (
                            <Link href="/retail" style={{ color: "var(--muted)", textDecoration: "none", fontSize: ".9rem" }}>
                                Retail
                            </Link>
                        )}
                    </>
                )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
                {isAuthenticated ? (
                    <>
                        {entityRole && (
                            <span className={`badge ${roleColor[entityRole] || "badge-blue"}`}>
                                {entityRole}
                            </span>
                        )}
                        {entityName && (
                            <span style={{ fontSize: ".85rem", color: "var(--muted)" }}>
                                {entityName}
                            </span>
                        )}
                        <span className="mono" style={{ fontSize: ".8rem" }}>{short}</span>
                        <button
                            className="btn btn-outline"
                            style={{ padding: ".4rem .8rem", fontSize: ".82rem" }}
                            onClick={logout}
                        >
                            Sign Out
                        </button>
                    </>
                ) : (
                    <span style={{ fontSize: ".85rem", color: "var(--muted)" }}>Not signed in</span>
                )}
            </div>
        </nav>
    );
}