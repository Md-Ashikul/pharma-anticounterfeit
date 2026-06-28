# PharmaChain — Blockchain Anti-Counterfeit System
## Complete Project Methodology (Surface → Deep)

---

## 1. The Problem We Are Solving

Counterfeit medicines are a global public-health crisis. A patient cannot tell, by
looking at a strip of pills, whether it is genuine or fake. Existing barcodes/QR
codes can be **photocopied** — a counterfeiter simply duplicates the printed code
onto fake packaging.

**PharmaChain's goal:** give every individual medicine strip a cryptographic
identity that (a) cannot be forged, (b) cannot be reused after the patient
consumes it, and (c) can be traced through the entire supply chain — manufacturer
→ distributor → retailer → patient — on a tamper-proof public blockchain, while
keeping per-strip verification cheap and fast.

---

## 2. The System at a Glance (Surface View)

The project is a **multi-service application** with five cooperating parts:

| Component | Folder | Tech | Role |
|---|---|---|---|
| Smart Contracts | `blockchain/` | Solidity + Hardhat | On-chain source of truth |
| Crypto Service | `crypto-service/` | Node CLI | Batch generation, Merkle trees, QR codes, benchmarking (run locally) |
| Backend API | `backend/` | Node + Express + MongoDB | Orchestration, auth, caching, blockchain relay |
| Supply-Chain Portal | `supply-chain-portal/` | Next.js | Dashboards for manufacturer / distributor / retailer / government |
| Patient PWA | `patient-pwa/` | Next.js (PWA) | Consumer-facing QR scan & verification |

**Two blockchains are used in parallel** for comparison: Ethereum **Sepolia**
(L1 testnet) and **Arbitrum Sepolia** (L2 rollup testnet). A single environment
variable (`ACTIVE_NETWORK`) switches the live app between them, and a benchmark
tool measures cost & latency on both.

---

## 3. The Three Smart Contracts (Deep View)

### 3.1 GovernmentRegistry.sol — Consortium Governance
This is the trust anchor. It decides **who** is allowed to act as a Manufacturer,
Distributor, or Retailer. Crucially, no single authority can grant that power
alone — registration is governed by an **M-of-N consortium vote**.

- `initializeGovernance(regulators[], threshold)` — sets up N regulators and the
  threshold M (deployed as **2-of-3**).
- `proposeRegisterEntity(...)` — any regulator proposes adding an entity; the
  proposer's YES vote is cast automatically.
- `voteOnProposal(id, support)` — other regulators vote; the instant YES votes
  reach the threshold, the proposal **auto-executes** and the entity is whitelisted.
- Proposals expire after 7 days; votes can be changed while still pending; the
  contract reverts any vote once a proposal is no longer pending.

**Why this matters:** it models a real regulatory body where any 2 of 3 independent
regulators must agree — no central point of corruption. The deployer holds **no
extra voting power**; it only calls `initializeGovernance` once.

### 3.2 ManufacturerBatch.sol — Merkle-Anchored Authenticity
When a manufacturer produces a batch (e.g. 64 strips), each strip gets a unique
secret. Instead of writing 64 records on-chain (expensive), the system:

1. Hashes each strip's secret into a **leaf** (keccak256).
2. Builds a **Merkle tree** from all leaves.
3. Stores **only the single Merkle root** on-chain via `registerBatch`.

To verify a strip, the patient's app submits the strip's secret + a **Merkle proof**.
The contract recomputes the root and checks it matches. `verifyAndBurn` then
**marks that leaf as consumed** so the same strip can never be verified twice
(defeats copy-and-reuse attacks).

**Result:** thousands of strips are secured by one on-chain value, and each
verification is a cheap proof check rather than a storage write.

### 3.3 SupplyChainTracker.sol — Custody Trail
Tracks each drug's journey through states: Manufactured → Distributed → Retailed →
Consumed. Each hop is recorded on-chain, role-gated so only the authorized actor
for that stage can advance it.

---

## 4. The Cryptography Layer (`crypto-service/`)

This is a **local CLI tool** (not deployed online) used by the manufacturer/operator:

- `merkle.js` — builds the per-batch Merkle tree (flat tree: batch → root → leaves).
- `generateBatch.js` — creates secrets, builds the tree, uploads the full tree to
  **IPFS via Pinata**, calls `registerBatch` on-chain, and generates QR codes.
- `qrGenerator.js` — produces two QR types per strip:
  - **Public QR** → `/track` (supply-chain custody lookup).
  - **Hidden QR** (under the scratch area) → `/verify` (the burn-on-verify check).
- `setupRegistry.js` — drives the consortium vote to whitelist the manufacturer,
  distributor, and retailer wallets. Uses all three regulator keys dynamically;
  the contract decides once any 2-of-3 vote YES.
- `benchmark.js` — the research instrument. Seeds a batch, measures register gas,
  IPFS cold-vs-warm retrieval, local hashing, `verifyAndBurn` gas (estimate + real
  txs), live gas price, and ETH/USD → outputs cost-per-verification in USD, side by
  side for Sepolia vs Arbitrum (JSON + CSV).

---

## 5. The Backend API (`backend/`)

The orchestration brain. Key responsibilities:

### 5.1 Authentication — SIWE (Sign-In With Ethereum)
`middleware/authSIWE.js` verifies a wallet signature, proving the caller owns a
given address — no passwords, no stored credentials.

### 5.2 Authorization — Role Guard
`middleware/roleGuard.js` checks the authenticated wallet's role (Manufacturer,
Distributor, Retailer, Government) before allowing a supply-chain action. Combined
with the contract's own on-chain modifiers, this enforces *"only the manufacturer
can perform the manufacture step,"* etc.

### 5.3 Non-Custodial Signing (important design choice)
The backend does **not** hold manufacturer/distributor/retailer private keys.
Supply-chain state-change transactions are **signed in the browser by each actor's
own wallet (MetaMask)**; the backend only receives the resulting `txHash`. The
**only** transaction the backend signs itself is the consumer's `verifyAndBurn`,
relayed with the government key — because the patient has no wallet. This is why
`MANUFACTURER_ACCOUNT` / `DISTRIBUTOR_ACCOUNT` / `RETAILER_ACCOUNT` and
`GOVERNMENT_REGULATOR_2/3` are intentionally **not** read by the backend.

### 5.4 Latency-Lessening Memory Cache
`services/verificationService.js` uses an in-memory `NodeCache` keyed by the
batch's IPFS CID (24h TTL). The **first** scan of a batch fetches the Merkle tree
from Pinata (~6–7 seconds). **Every subsequent scan of any strip in the same
box/batch is served from RAM in ~0 ms.** Benchmark-confirmed: `MISS ≈ 6427 ms,
HIT = 0 ms`. (Caveat: the cache is per-process; horizontal scaling to multiple
instances would later warrant a shared store like Upstash Redis.)

### 5.5 Self-Contained ABIs
`config/contracts.js` loads contract ABIs from bundled JSON files in
`backend/src/abi/` (not from the git-ignored `blockchain/artifacts/`), so the
backend deploys anywhere without the blockchain folder. `npm run sync-abi`
regenerates them after any contract **interface** change.

---

## 6. The Frontends

- **Supply-Chain Portal** (`supply-chain-portal/`): role-based dashboards. Actors
  connect MetaMask, sign in via SIWE, and advance custody. Talks to the backend
  via `NEXT_PUBLIC_BACKEND_URL`.
- **Patient PWA** (`patient-pwa/`): the consumer app, installable on phones. Hosts
  the `/track` (public) and `/verify` (hidden-QR burn) routes the QR codes point
  to. The QR codes embed this app's URL (`APP_BASE_URL` in crypto-service).

---

## 7. End-to-End Flow (How Everything Connects)

1. **Onboarding:** Regulators initialize the consortium (2-of-3). `setupRegistry`
   proposes + votes to whitelist the manufacturer, distributor, retailer wallets.
2. **Production:** Manufacturer runs `generateBatch` → secrets → Merkle tree → tree
   uploaded to Pinata/IPFS → root written on-chain → QR codes printed on strips.
3. **Distribution → Retail:** Each actor scans the **public QR**, connects their
   wallet, and advances custody on `SupplyChainTracker` (browser-signed).
4. **Purchase & Verify:** Patient scratches the strip, scans the **hidden QR** →
   PWA calls backend → backend fetches the Merkle tree (cache MISS first time,
   HIT after) → submits proof to `verifyAndBurn` → strip marked consumed.
   A second scan of an already-consumed strip fails → counterfeit/used signal.

---

## 8. Network Strategy (Sepolia vs Arbitrum)

The system runs identically on both chains. `benchmark.js` quantifies the
trade-off; results consistently show **Arbitrum (L2)** is dramatically cheaper and
faster to confirm than **Sepolia (L1)**, making `ACTIVE_NETWORK=arbitrum` the
recommended live default while keeping Sepolia available for L1 comparison data.

---

## 9. Online Deployment Architecture

| Service | Host | URL variable |
|---|---|---|
| Backend API (always-on Express) | **Render** (free web service) | — |
| Supply-Chain Portal | **Vercel** | portal URL → `FRONTEND_URL` |
| Patient PWA | **Vercel** | pwa URL → `PWA_URL`, `APP_BASE_URL` |
| Merkle tree storage | **Pinata (IPFS)** | `PINATA_GATEWAY` |
| Database | **MongoDB Atlas** | `MONGODB_URI` |

**URL wiring:**
- Both frontends call the backend via `NEXT_PUBLIC_BACKEND_URL` = the Render URL.
- Backend CORS allow-list = `FRONTEND_URL` (portal) + `PWA_URL` (PWA), exact
  origins, no trailing slash.
- QR codes resolve to the PWA via `APP_BASE_URL`.

**Why Render for the backend (not Vercel):** the backend is a stateful, always-on
server with an in-process cache. Vercel's serverless model would cold-start and
wipe the cache; Render's always-on service preserves the 0 ms cache HITs. Upstash
is intentionally deferred until/unless the backend scales to multiple instances.

**Free-tier note:** Render free services sleep after ~15 min idle (~30–60 s cold
start, which also resets the cache). Hit `/health` to wake before a demo.

---

## 10. Deployment & Test Procedure

1. Deploy backend to Render (root `backend/`, build `npm install`, start
   `npm start`, env vars from `backend.env` minus `PORT`). Allow `0.0.0.0/0` in
   MongoDB Atlas Network Access.
2. Deploy both frontends to Vercel (each with its own root directory + env vars).
3. Set `FRONTEND_URL` / `PWA_URL` on Render to the Vercel URLs; set `APP_BASE_URL`
   in local crypto-service to the PWA URL.
4. Run `setupRegistry` then `generateBatch` against `arbitrum` from your PC.
5. Test: `/health` → 200; portal manufacture step via MetaMask; consumer verify
   (first scan slow = IPFS MISS, second scan instant = cache HIT); confirm no CORS
   errors in DevTools.

---

## 11. Current Blocker — Redeployment

**Symptom:** Production deployments on the `main` branch show **Blocked** (red) in
Vercel, while Preview deployments on the `blockchain-ledger-system` branch are
**Ready** (green).

**Exact message:**
> "The deployment was blocked because the commit author did not have contributing
> access to the project on Vercel. The Hobby Plan does not support collaboration
> for private repositories. Please upgrade to Pro to add team members."

**Root cause:** This is a **Vercel plan/authorship gate**, not a code or commit-id
problem. On the **Hobby (free) plan**, production deploys of a **private** repo are
only allowed when the commit author is recognized as the project owner. The `main`
commits are authored by an identity Vercel does not treat as a contributor, so they
are blocked. (Preview builds on the v0 branch succeed because they deploy through a
different path.)

**Resolution options (free first):**
1. **Make the GitHub repository public** *(recommended, $0, instant).* Hobby allows
   unrestricted production deploys for public repos. Secrets are safe because they
   live in Vercel/Render **environment variables**, not in the repo — provided no
   real `.env` was ever committed.
2. **Re-author commits with the Vercel-linked email**
   (`git config user.email "<vercel-account-email>"`, then commit & push to `main`).
3. **Deploy manually as the owner** via Vercel CLI (`vercel --prod`).
4. **Upgrade to Pro** (unnecessary for a thesis-scale project).

**Chosen path:** Option 1 — make the repository public — then merge
`blockchain-ledger-system` into `main` so the latest code (bundled ABIs, updated
env wiring, dynamic 3-regulator consortium voting) builds in Production.

---

## 12. Status Summary

- Consortium governance: **complete** (2-of-3, deployed both networks, dynamic
  3-regulator voting in `setupRegistry`).
- Merkle authenticity + burn-on-verify: **complete**.
- Latency-lessening cache: **complete & benchmark-verified**.
- Self-contained backend ABIs: **complete** (Render-ready, crash fixed).
- Network switching + benchmark: **complete**.
- Online deployment: **ready**, gated only by the Vercel Hobby authorship block
  above — resolved by making the repo public.
