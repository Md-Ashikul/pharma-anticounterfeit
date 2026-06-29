# Consortium Governance Migration — Methodology

This document records how the system was migrated from a **single hardcoded
government wallet** to a **dynamic M-of-N regulator consortium** with on-chain,
MetaMask-signed voting, and the steps to verify it end-to-end on both Sepolia
and Arbitrum.

---

## 1. Problem Statement

After deploying the new consortium contracts and reshuffling MetaMask accounts:

- **Account roles changed:** accounts 2 & 3 = regulators; account 4 = manufacturer,
  account 5 = distributor, account 6 = retailer.
- **Symptom A:** Connecting account 4 welcomed as "retailer" (stale role).
- **Symptom B:** Connecting account 5 welcomed as "unknown entity".
- **Symptom C:** Connecting regulator accounts 2 & 3 welcomed as "unknown entity".
- **Symptom D:** The government dashboard "Register on Blockchain" button did nothing.

### Root Causes

1. **Two independent registries were out of sync.**
   - **Off-chain (MongoDB, seeded by `backend/src/db/seed.js`)** drives the
     "Welcome <role>" label and portal page access (RoleGate). It still held the
     old account→role mapping.
   - **On-chain (`GovernmentRegistry` contract, written by
     `crypto-service/src/setupRegistry.js`)** controls whether supply-chain
     transactions actually succeed.

2. **Single hardcoded government wallet.** `WalletConnect.js` recognized exactly
   one address (`0x60A05e…`) as "Government". New regulators were not that
   address, so they fell through to the entity lookup and showed "unknown".

3. **Frontend/backend route mismatch.** The dashboard called the legacy
   `POST /api/government/entities/register` route, which the consortium refactor
   had replaced with `propose/register` + `governance/proposals/:id/vote`. The
   button hit a dead (404) route.

---

## 2. Design Decisions

- **Regulators identified dynamically from on-chain state** via
  `GovernmentRegistry.getRegulators()` — no hardcoded addresses; correct even when
  regulators are added/removed.
- **Voting happens in the browser through MetaMask.** Each regulator connects
  their own wallet and signs propose/vote transactions directly. The backend holds
  **no** regulator private keys for these actions.
- **Off-chain Mongo registry remains the source of the welcome label** for
  supply-chain entities (manufacturer/distributor/retailer) and will be re-seeded
  separately (see §6).

---

## 3. Code Changes

### 3.1 `supply-chain-portal/components/WalletConnect.js`
- Removed the hardcoded `GOV_WALLET` equality check.
- On connect, calls `governanceWeb3.isRegulator(address)` which reads
  `getRegulators()` on-chain. If the address is a current regulator → `setGovernment()`.
- Otherwise falls back to the off-chain entity lookup (`govAPI.getEntity`).

### 3.2 `supply-chain-portal/lib/api.js`
- Added GovernmentRegistry ABI + read/write provider helpers (read via dedicated
  RPC when configured, write via the injected MetaMask signer).
- Added the `governanceWeb3` module:
  - `getRegulators()`, `isRegulator(address)`, `getThreshold()`, `hasVoted()`
  - `proposeRegister()`, `proposeRevoke()`, `proposeReinstate()` (MetaMask write)
  - `vote(proposalId, choice)` (MetaMask write)
  - `listProposals()` — scans `ProposalCreated` logs + `getProposal()`
- Removed the dead `govAPI.registerEntity / revokeEntity / reinstateEntity`
  methods that pointed at deleted backend routes.

### 3.3 `supply-chain-portal/app/government/page.js`
- Register / Revoke / Reinstate now create **on-chain proposals via MetaMask**
  (proposer auto-votes YES).
- Added a **🗳️ Proposals tab** listing proposals with action, target, proposer,
  status, approval count (e.g. `1/2`), and **Vote YES / Vote NO** buttons.
- Detects whether the connected wallet has already voted; closes voting on
  non-pending proposals.
- Register button relabeled to "Propose Registration" with an explanatory note.

### 3.4 `supply-chain-portal/.env.local.example`
- Documented new client vars:
  - `NEXT_PUBLIC_GOVERNMENT_REGISTRY_ADDRESS` (+ `…_ARBITRUM_…`) — **required**
  - `NEXT_PUBLIC_SEPOLIA_RPC_URL` / `NEXT_PUBLIC_ARBITRUM_RPC_URL` — optional read RPC
  - `NEXT_PUBLIC_GOV_REGISTRY_DEPLOY_BLOCK` — optional log-scan start block

> `patient-pwa` was **not** changed — it only handles consumer verification.

---

## 4. Environment Configuration

### 4.1 `supply-chain-portal/.env.local` (and Vercel project env)
```
NEXT_PUBLIC_GOVERNMENT_REGISTRY_ADDRESS=<sepolia gov registry>
NEXT_PUBLIC_ARBITRUM_GOVERNMENT_REGISTRY_ADDRESS=<arbitrum gov registry>
NEXT_PUBLIC_SEPOLIA_RPC_URL=<optional read rpc>
NEXT_PUBLIC_ARBITRUM_RPC_URL=<optional read rpc>
NEXT_PUBLIC_GOV_REGISTRY_DEPLOY_BLOCK=<deploy block of the active network>
```
- `NEXT_PUBLIC_*` are build-time inlined → **redeploy the portal on Vercel** after changes.

### 4.2 `crypto-service/.env` (on-chain whitelist via setupRegistry)
```
REGULATOR_1_PRIVATE_KEY=<acct 1 key>   # falls back to GOVERNMENT_PRIVATE_KEY
REGULATOR_2_PRIVATE_KEY=<acct 2 key>
REGULATOR_3_PRIVATE_KEY=<acct 3 key>
MANUFACTURER_ADDRESS=<acct 4>
DISTRIBUTOR_ADDRESS=<acct 5>
RETAILER_ADDRESS=<acct 6>
```
- `setupRegistry.js` uses `process.env.X || fallback`, so `.env` fully overrides
  the hardcoded defaults. Set **all three** supply-chain addresses (the
  distributor/retailer fallbacks are placeholders and would be skipped).

### 4.3 `backend/.env` (Render)
```
ACTIVE_NETWORK=sepolia      # flip to arbitrum for the second pass
```
- Backend serves one chain at a time; the gov signer wallet pays gas for verify/burn.

---

## 5. Deployment / Restart Matrix

| Change | Redeploy needed |
|---|---|
| Portal code or `NEXT_PUBLIC_*` env | **Yes — supply-chain-portal (Vercel)** |
| `ACTIVE_NETWORK` / backend code | **Yes — backend (Render)** |
| Mongo re-seed (`seed.js`) | **Yes — restart backend** so it serves new data |
| Voting / proposing | No — runs client-side via MetaMask |
| patient-pwa | No (unchanged) |

Always clear the portal's cached role (`localStorage` key `pharma-auth`) /
disconnect after data changes, or a stale label persists.

---

## 6. Re-seeding (To Be Managed Later)

The off-chain Mongo registry still drives the welcome label for supply-chain
entities. To finalize:

1. Edit the three `walletAddress` values in `backend/src/db/seed.js`:
   - ENT-001 (Manufacturer) → account 4
   - ENT-002 (Distributor)  → account 5
   - ENT-003 (Retailer)     → account 6
2. Run `node src/db/seed.js` from `backend/` (it `deleteMany({})` first, full replace).
3. Restart the Render backend.
4. Disconnect / clear `pharma-auth` in the browser and reconnect.

> **Optional improvement (deferred):** make the welcome label read on-chain
> (`getEntityRoleString`) so a freshly approved entity is recognized immediately
> without re-seeding Mongo.

---

## 7. End-to-End Verification (per network: Sepolia, then Arbitrum)

1. **Whitelist on-chain:** `cd crypto-service && node src/setupRegistry.js <network>`
   → expect 3× "Registered & executed automatically".
2. **Generate a fresh batch:** change the hardcoded `batchId` in
   `generateBatch.js`, then `node src/generateBatch.js <network>`.
3. **Set `ACTIVE_NETWORK`** on Render and redeploy.
4. **Regulator recognition:** connect accounts 1/2/3 → each welcomes as Government.
5. **Propose:** account 1 → Register tab → submit account 4 → MetaMask confirm →
   Proposals tab shows `1/<threshold>`.
6. **Vote:** account 2 (and 3 if needed) → Proposals tab → Vote YES → auto-executes
   at threshold.
7. **Supply chain:** account 4 verifies batch (Manufacturer) → account 5
   (Distributor) → account 6 (Retailer), each confirming in MetaMask.
8. **Consumer (patient-pwa):** scan/enter a strip QR → valid trail. Then test a
   double-scan/burn and an unknown batch for the counterfeit/unknown paths.
9. **Repeat 1–8 for Arbitrum** (new batchId, switch MetaMask network, flip
   `ACTIVE_NETWORK=arbitrum`, redeploy).
