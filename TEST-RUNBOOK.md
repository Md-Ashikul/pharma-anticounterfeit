# End-to-End Test Runbook — Pharma Anti-Counterfeit System

Full verification of the deployed stack (Render backend + Vercel frontends + Pinata IPFS)
across **both** networks: **Ethereum Sepolia (L1)** and **Arbitrum Sepolia (L2)**.

This runbook is derived from the actual code. Follow it top to bottom. Each step lists
the **action**, the **command/URL**, and the **expected result** so you can mark pass/fail.

---

## 0. How network selection actually works (read this first)

The network is chosen **independently in each service**. They must all agree for a test pass.

| Service | How it picks the network | Where to set it |
| --- | --- | --- |
| `crypto-service` (`setupRegistry.js`, `generateBatch.js`) | CLI argument `sepolia` or `arbitrum` | Command line |
| `backend` (Render) | `ACTIVE_NETWORK` env (`sepolia` \| `arbitrum`) | Render env vars |
| `supply-chain-portal` (Vercel) | `NEXT_PUBLIC_ACTIVE_NETWORK` env + MetaMask chain | Vercel env vars + wallet |
| `patient-pwa` (Vercel) | none — just calls the backend; the backend's `ACTIVE_NETWORK` decides | n/a |

> **Critical:** the backend talks to only ONE chain at a time. To test both L1 and L2 you
> run the whole flow **twice** (Pass A = Sepolia, Pass B = Arbitrum), flipping
> `ACTIVE_NETWORK` (Render) and `NEXT_PUBLIC_ACTIVE_NETWORK` (Vercel portal) and the
> MetaMask network between passes.

### Deployed contract addresses (from `blockchain/deployed-addresses.json`)

| Contract | Sepolia (L1) | Arbitrum Sepolia (L2) |
| --- | --- | --- |
| GovernmentRegistry | `0xC5714bc15E5a45fB73d72aC4e0774364c5cd9954` | `0xD72A7A156515A5082d8Bc56B05C33Cd2EDaebD7d` |
| ManufacturerBatch | `0xb6216d0d6FCc97d7CC7Aae797262E1AA339013E2` | `0x457e47f431EBDa9EfB28F2f05a439CFd01B90Fb1` |
| SupplyChainTracker | `0x91614bFbeC6AD05e37b6c0Dd9d5abadc82e9c2aa` | `0xe805DaD6c993179E0D5605c2c8B90083Bcb390fD` |
| chainId | `11155111` | `421614` |

Governance on both: 2-of-3 regulators, already `initialized: true`.

---

## 1. Pre-flight checklist (do once, before either pass)

- [ ] **Backend health.** Open `https://<your-render-backend>/health`
      → expect `{ "success": true, "service": "Pharma Anti-Counterfeit Backend", ... }`.
- [ ] **CORS origins match.** On Render, `FRONTEND_URL` = your **portal** Vercel URL and
      `PWA_URL` = your **patient-pwa** Vercel URL (exact origin, `https://`, no trailing slash).
      The backend only allows these two origins — a mismatch makes every browser call fail.
- [ ] **Backend env present:** `RPC_URL`, `ARBITRUM_RPC_URL`, all six `*_ADDRESS` vars,
      `GOVERNMENT_PRIVATE_KEY`, `PINATA_GATEWAY`, `ACTIVE_NETWORK`.
- [ ] **Portal Vercel env:** `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_ACTIVE_NETWORK`,
      `NEXT_PUBLIC_SUPPLY_CHAIN_TRACKER_ADDRESS`, `NEXT_PUBLIC_ARBITRUM_SUPPLY_CHAIN_TRACKER_ADDRESS`.
- [ ] **PWA Vercel env:** `NEXT_PUBLIC_BACKEND_URL` = your Render backend URL.
- [ ] **crypto-service `.env` (local PC):** `PINATA_API_KEY`, `PINATA_API_SECRET`,
      `MANUFACTURER_PRIVATE_KEY`, `RPC_URL`, `ARBITRUM_RPC_URL`, the registry+batch addresses for
      both networks, `MANUFACTURER_ADDRESS`, `DISTRIBUTOR_ADDRESS`, `RETAILER_ADDRESS`,
      regulator keys (`REGULATOR_1/2/3_PRIVATE_KEY`), and **`APP_BASE_URL` = your deployed PWA URL**
      (so the QR `/verify` links point to production, not `localhost`).
- [ ] **Gas funded on BOTH chains** for:
      - the **gov signer** wallet (`GOVERNMENT_PRIVATE_KEY`) — it pays for `verifyAndBurn`,
      - the **manufacturer / distributor / retailer** wallets used in the portal,
      - the **regulator** wallets (only if you need to re-run registry setup).
      Get Sepolia ETH and Arbitrum Sepolia ETH from faucets and bridge as needed.

---

## 2. Per-pass setup

Do everything in this section once for **Pass A (Sepolia)**, then repeat for **Pass B (Arbitrum)**.
Replace `<NET>` with `sepolia` or `arbitrum`.

### 2.1 Point the deployment at `<NET>`
- [ ] Render: set `ACTIVE_NETWORK=<NET>` → **redeploy / restart** the backend.
- [ ] Vercel portal: set `NEXT_PUBLIC_ACTIVE_NETWORK=<NET>` → **redeploy**.
- [ ] Confirm restart: backend logs show
      `Connecting to Ethereum Sepolia (L1)` or `Connecting to Arbitrum Sepolia (L2)`.

### 2.2 Confirm entities are whitelisted (idempotent)
```bash
cd crypto-service
node src/setupRegistry.js <NET>
```
- [ ] Expect each entity to print either `Already active — Verified Role: [...]` or
      `Registered & executed automatically! Role: ...`.
- [ ] If Distributor/Retailer show `Skipped — address is a placeholder`, set
      `DISTRIBUTOR_ADDRESS` / `RETAILER_ADDRESS` in `.env` and re-run.

### 2.3 Generate a FRESH batch
> `generateBatch.js` currently **hardcodes** `batchId: "COMP-ARB-B2"` (and reuses that string in
> `outputDir`). The contract reverts with `BatchAlreadyExists` if that ID is already registered on
> the target chain. **Use a new, unique ID for each pass.**

- [ ] Edit `crypto-service/src/generateBatch.js` → in `CONFIG`, change **both** occurrences:
      - `batchId:` → e.g. `"COMP-SEP-T1"` for Sepolia / `"COMP-ARB-T1"` for Arbitrum
      - `outputDir:` last path segment → match the new `batchId`
      (Optional: keep `stripCount: 10`, `expiryDate: "2027-12-31"`.)
- [ ] Run:
```bash
node src/generateBatch.js <NET>
```
- [ ] Expect the 7-step log to finish with **BATCH GENERATION COMPLETE**, printing:
      Merkle Root, IPFS CID, Tx Hash, Block number, and an output dir containing
      `batch-manifest.json`, `batch-summary.json`, and `qrcodes/`.
- [ ] Sanity-check on-chain: open the Tx Hash on the chain's explorer
      (Sepolia Etherscan / Arbiscan Sepolia) → status **Success**.
- [ ] Note for later: the **batchId** and any **strip drugId** (`<batchId>-S0001`, etc.),
      and open `batch-manifest.json` to grab strip #1's **Hidden QR `payload`** (Base64).

---

## 3. Backend read endpoints (no wallet needed)

Using the batchId you just generated, with the backend on the matching `<NET>`:

- [ ] `GET https://<backend>/api/consumer/batch/<batchId>`
      → `success: true`, correct `drugName` ("Paracetamol 500mg"), `expiryDate`, `isActive: true`,
      `manufacturer` = your manufacturer wallet, and an `ipfsCID`.
- [ ] `GET https://<backend>/api/consumer/track/<batchId>-S0001`
      → `success: true`. Before any supply-chain step, `currentStatus: 0` ("Not Registered").

---

## 4. Supply-chain flow (supply-chain-portal + MetaMask)

Set MetaMask to the **matching chain** for this pass (Sepolia or Arbitrum Sepolia).
Each role step is **signed directly in MetaMask** (the wallet must hold gas and be whitelisted
with that exact role on `<NET>`).

Pick a strip to walk through, e.g. `drugId = <batchId>-S0001`.

- [ ] **Connect + SIWE login** as the **Manufacturer** wallet in the portal. You should land on
      the dashboard with role "Manufacturer".
- [ ] **Manufacture:** go to Manufacture page, enter `drugId`, submit. MetaMask prompts
      `registerDrug` → confirm. Expect success card with a tx hash, and the timeline shows
      **Manufactured**.
- [ ] `GET /api/supply-chain/status/<drugId>` → `currentStatus: 1` ("Manufactured").
- [ ] **Distribute:** switch MetaMask to the **Distributor** wallet, re-login (SIWE), open
      Distribute, enter same `drugId`, submit → confirm `distributeDrug`. Status → **2**.
- [ ] **Retail:** switch to the **Retailer** wallet, re-login, open Retail, submit → confirm
      `retailDrug`. Status → **3** ("Retailed").
- [ ] **Wrong-role guard (negative test):** while logged in as Distributor, try the Manufacture
      action → backend `roleGuard` should reject with a 403-style error. Good = it refuses.

> Note: if a role action reverts in MetaMask, the wallet isn't whitelisted for that role on this
> chain — fix via `setupRegistry.js <NET>` (step 2.2) or the Government page.

---

## 5. Consumer verification (patient-pwa) — the core test

Backend must be on the matching `<NET>`. Use strip #1's Hidden QR from the manifest.

- [ ] **Authentic path:** open `https://<pwa>/verify?data=<HIDDEN_PAYLOAD>` (or scan the
      `*_HIDDEN.png`). Step through Confirm → "Verify on Blockchain".
      → Result **AUTHENTIC** ("✅ Authentic medicine. Safe to consume."), with a `txHash`.
- [ ] Backend logs print the **VERIFICATION LATENCY METRICS** + **GAS COST** block, and a
      `[CACHE MISS]` then (on a second different strip) `[CACHE HIT]` for IPFS.
- [ ] **Double-spend (most important):** open the **same** Hidden QR again and verify.
      → Result **ALREADY_USED** ("❌ This QR code has already been used..."). No second burn tx.
- [ ] **Counterfeit / tampered:** take a valid payload, change a character in the Base64 (or use a
      made-up `secret`), submit.
      → Result **FAKE** ("❌ Invalid proof..."). This must NOT verify.
- [ ] **Unknown batch:** verify with a `batchId` that was never registered
      → **FAKE** ("Batch not found on blockchain").
- [ ] **Second authentic strip:** verify `S0002` (fresh) → **AUTHENTIC**, confirming each strip
      burns independently.

---

## 6. Government dashboard + anomalies

With the backend on `<NET>`:

- [ ] Open the portal **Government** page. The earlier ALREADY_USED and FAKE attempts should have
      been logged as anomalies (the backend calls `detectAndLogAnomaly` on those paths).
- [ ] `GET /api/government/analytics` → returns counts that reflect your test activity.
- [ ] `GET /api/government/anomalies` → lists the suspicious verifications you triggered in step 5.
- [ ] (Optional) Review/resolve an anomaly from the dashboard and confirm it updates.

---

## 7. Switch networks and repeat

- [ ] Re-run **sections 2–6** for the other network (do Pass A = Sepolia, then Pass B = Arbitrum,
      or vice-versa), remembering to flip `ACTIVE_NETWORK` (Render),
      `NEXT_PUBLIC_ACTIVE_NETWORK` (Vercel portal), MetaMask chain, and to use a **new batchId**.

---

## 8. Pass/Fail summary sheet

| Check | Sepolia | Arbitrum |
| --- | --- | --- |
| Backend `/health` + correct network in logs | ☐ | ☐ |
| `setupRegistry` shows all 3 entities active | ☐ | ☐ |
| `generateBatch` completes + tx Success on explorer | ☐ | ☐ |
| `GET /consumer/batch/:id` returns correct batch | ☐ | ☐ |
| Manufacture → status 1 | ☐ | ☐ |
| Distribute → status 2 | ☐ | ☐ |
| Retail → status 3 | ☐ | ☐ |
| Wrong-role rejected (403) | ☐ | ☐ |
| Consumer verify → AUTHENTIC | ☐ | ☐ |
| Re-scan same QR → ALREADY_USED | ☐ | ☐ |
| Tampered payload → FAKE | ☐ | ☐ |
| Unknown batch → FAKE (not found) | ☐ | ☐ |
| Anomalies appear on Government dashboard | ☐ | ☐ |
| Latency + gas metrics printed in backend logs | ☐ | ☐ |

---

## 9. Common failure modes (and the fix)

- **Every browser call fails / CORS error:** Render `FRONTEND_URL` / `PWA_URL` don't exactly match
  the Vercel origins. Fix and redeploy backend.
- **`BatchAlreadyExists` on generate:** you reused a batchId already on that chain — pick a new one
  (section 2.3).
- **Verify returns 500 "missing revert data" / nonce / insufficient funds:** gov signer
  (`GOVERNMENT_PRIVATE_KEY`) has no gas on the active chain. Fund it.
- **Role action reverts in MetaMask:** that wallet isn't whitelisted for that role on this chain —
  run `setupRegistry.js <NET>`.
- **QR opens `localhost`:** `APP_BASE_URL` in crypto-service `.env` was localhost when you
  generated. Regenerate with the production PWA URL.
- **Verify hangs on "Fetching Merkle proof from IPFS":** Pinata gateway/`PINATA_GATEWAY` issue or
  the CID didn't pin — re-check the IPFS URL printed during generation.
- **Backend shows wrong chain:** `ACTIVE_NETWORK` not updated or service not restarted after the
  env change.
