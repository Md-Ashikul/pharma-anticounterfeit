"use client";
import { useState } from "react";
import { hashNID }  from "@/lib/crypto";

/**
 * Optional NID input component.
 *
 * Privacy design:
 * - Raw NID is typed locally in the browser
 * - keccak256(NID) is computed in browser via hashNID()
 * - Only the hash is sent to the backend
 * - Raw NID never leaves the device
 *
 * @param {function} onHash - Called with hashedNID when user confirms
 */
export default function NIDInput({ onHash }) {
  const [enabled, setEnabled] = useState(false);
  const [nid,     setNid]     = useState("");
  const [hashed,  setHashed]  = useState(false);

  function handleHash() {
    if (!nid.trim()) return;
    const h = hashNID(nid.trim());
    onHash(h);
    setHashed(true);
    setNid(""); // Clear raw NID immediately
  }

  return (
    <div className="card">
      <div className="toggle-row">
        <div>
          <div style={{ fontWeight: 600, fontSize: ".9rem" }}>
            📋 Share NID for Analytics
          </div>
          <div className="text-muted" style={{ fontSize: ".78rem" }}>
            Optional. Your NID is never stored — only a private hash.
          </div>
        </div>
        <button
          className={`toggle ${enabled ? "on" : ""}`}
          onClick={() => { setEnabled(!enabled); setHashed(false); onHash(null); }}
        />
      </div>

      {enabled && !hashed && (
        <>
          <label>National ID (NID)</label>
          <input
            className="input"
            type="text"
            placeholder="Enter your NID number"
            value={nid}
            onChange={(e) => setNid(e.target.value)}
          />
          <button
            className="btn btn-outline"
            onClick={handleHash}
            disabled={!nid.trim()}
            style={{ fontSize: ".85rem", padding: ".5rem" }}
          >
            Hash & Submit Privately
          </button>
          <div className="text-muted mt-1" style={{ fontSize: ".75rem" }}>
            🔒 Your NID will be hashed locally before sending.
            We never see your raw NID.
          </div>
        </>
      )}

      {enabled && hashed && (
        <div style={{ fontSize: ".85rem", color: "#22c55e", marginTop: ".25rem" }}>
          ✅ NID hashed locally and attached to verification.
        </div>
      )}
    </div>
  );
}