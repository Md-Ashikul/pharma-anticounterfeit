# PharmaChain — Project Status & Progress Report

_A complete walkthrough from the root of the system to exactly how far we have come._

---

## 1. What This Project Is

**PharmaChain** is a blockchain-based pharmaceutical anti-counterfeiting platform. Every medicine strip carries two QR codes:

- **Public QR** — scanned along the supply chain (manufacturer → distributor → retailer → consumer) for traceability.
- **Hidden QR** — under scratch foil, scanned once by the end consumer to "burn" (consume) the strip and prove authenticity.

Authenticity is proven with **Merkle proofs**: each batch has a Merkle tree of strip secrets, and the root + an IPFS CID are stored on-chain. A strip is genuine if its secret hashes to a leaf that verifies against the on-chain root, and it has not already been burned.

---

## 2. System Architecture (the 5 modules)

```
pharma-anticounterfeit/
├── blockchain/        Smart contracts (Solidity + Hardhat)
├── backend/           REST API (Express.js + ethers v6)
├── crypto-service/    Merkle tree + batch QR generation
├── patient-pwa/       Consumer-facing scan/verify app (Next.js PWA)
└── (frontend dashboards for gov / manufacturer / supply chain)
```

### Smart Contracts
- **GovernmentRegistry.sol** — registers supply-chain entities (manufacturer/distributor/retailer) and now governs them via M-of-N consortium voting.
- **ManufacturerBatch.sol** — stores batch Merkle roots + IPFS CIDs; handles `verifyAndBurn` for strip authentication.
- **SupplyChainTracker.sol** — records the chain-of-custody transitions for each drug.

---

## 3. The Three Big Goals We Set Out To Address

1. **Performance / caching** — verification latency was ~16.5s, too slow for national scale. (Planned for a later phase.)
2. **Consortium governance** — replace the single-government-wallet authority with a multi-regulator M-of-N voting body. **(DONE — current focus.)**
3. **Arbitrum migration** — move from Ethereum Sepolia (L1) to Arbitrum Sepolia (L2) for cheaper, faster transactions. **(DONE — deployed.)**

We chose this order: **build consortium governance first, then deploy to Arbitrum once**, so only a single redeploy was needed.

---

## 4. Account Structure (your MetaMask accounts)

| Account | Role |
|---------|------|
| **Account 1** | Government Regulator (also the contract **deployer**) |
| **Account 2** | Government Regulator |
| **Account 3** | Government Regulator |
| **Account 4** | Manufacturer |
| **Account 5** | Distributor |
| **Account 6** | Retailer |

**Governance rule: 2-of-3.** Any 2 of the 3 government regulators must approve an action before it executes.

---

## 5. What "Consortium Governance" Means Here

Instead of one wallet having absolute power, critical actions follow a **propose → vote → auto-execute** flow:

```
A regulator PROPOSES an action (e.g. "register Manufacturer X")
        │  (proposer auto-votes YES → 1 approval)
        ▼
Another regulator VOTES YES → 2 approvals
        ▼
Threshold (2) reached → proposal AUTO-EXECUTES on-chain
        ▼
Action takes effect (entity registered) + event logged for audit
```

Key properties built into `GovernmentRegistry.sol`:
- Proposer auto-votes YES on creation.
- Votes can be changed; approvals recalculate.
- Auto-executes the instant approvals ≥ threshold.
- Proposals expire after 7 days.
- Every proposal/vote/execution emits an event (full audit trail).

Supported proposal types: register entity, revoke entity, reinstate entity, add regulator, remove regulator.

---

## 6. How Far We Have Come — Checklist

| Stage | Status |
|-------|--------|
| Wrote M-of-N voting logic into `GovernmentRegistry.sol` | ✅ Done |
| Updated backend routes (`government.js`) for propose/vote/status | ✅ Done |
| Made deploy script network-aware + auto-initialize governance | ✅ Done |
| Added Arbitrum Sepolia network + Arbiscan config to Hardhat | ✅ Done |
| Migrated `deployed-addresses.json` to per-network format | ✅ Done |
| **Deployed all 3 contracts to Arbitrum Sepolia** | ✅ Done |
| **Initialized 2-of-3 governance on-chain (3 regulators)** | ✅ Done |
| Pointed backend ABIs at compiled artifacts (no more stale ABI) | ✅ Done |
| Fixed BigInt serialization (ethers v6 `uint256` → JSON) | ✅ Done |
| Fixed role-validation bug (role `0` wrongly rejected) | ✅ Done |
| Verified `/governance/status` returns 3 regulators, threshold 2 | ✅ Done |
| **Created proposal #1 (register TestPharm) — proposer auto-voted** | ✅ Done |
| Cast a second regulator vote to reach threshold + execute | ⏳ In progress |
| Verify executed entity is whitelisted on-chain | ⬜ Next |
| Performance / caching phase (16.5s → ~2-3s) | ⬜ Future |

---

## 7. Deployed Contract Addresses (Arbitrum Sepolia)

| Contract | Address |
|----------|---------|
| GovernmentRegistry | `0x1d9dA3c125910eFDE30C546e92Ce9F83Cc3ebb23` |
| ManufacturerBatch | `0xE4FC75AA2543421691305B47824bC0F2A4F3DFB9` |
| SupplyChainTracker | `0xcB1E0abfE58E61e178776A294A16Ae3d3528bAD0` |

Active regulators on-chain:
- `0x60A05eb194b85eED4233f879af3F98d2d064f9a8`
- `0xF4A4b36D818804720b3443438eBdA1aB01AfF22e`
- `0xAcb9bf874Cc3eA2a67cb94a60575192CEfeF831b`

Network switching is controlled by `ACTIVE_NETWORK` in `backend/.env` (`arbitrum` or `sepolia`).

---

## 8. Bugs We Hit and Fixed (so far)

1. **"Route not found"** — was calling `/governance/status` as POST; it is a GET.
2. **"isInitialized is not a function" / "getRegulators is not a function"** — backend used a stale hand-written ABI. Fixed by loading ABIs directly from `blockchain/artifacts/.../*.json`.
3. **"Do not know how to serialize a BigInt"** — ethers v6 returns `uint256` as JS `BigInt`. Fixed with a global `BigInt.prototype.toJSON` patch + `Number(threshold)`.
4. **"Cannot convert manufacturer to a BigInt"** — `role` must be the numeric enum (`1=Manufacturer, 2=Distributor, 3=Retailer`), not a string.
5. **"Missing required fields" when role=0** — `if (!role)` treated `0` as missing; fixed with explicit undefined/null/empty check.
6. **Vote couldn't reach threshold** — vote route always signed as Account 1. Added optional `regulatorKey` so Account 2/3 can cast the deciding vote.

---

## 9. The Immediate Next Step

Proposal #1 currently has **1 approval** (Account 1, the proposer). To execute it, **a different regulator (Account 2 or Account 3)** must vote YES — voting again as Account 1 will not increase the count.

1. Check current state:
   ```
   GET /api/government/governance/proposals/1
   ```
2. Vote as Account 2 (different key):
   ```
   POST /api/government/governance/proposals/1/vote
   body: { "vote": true, "regulatorKey": "0x<ACCOUNT_2_KEY>" }
   ```
   Expected: `"executed": true` → `"Proposal #1 auto-executed!"`
3. Verify the entity is now whitelisted:
   ```
   GET /api/government/entities?wallet=0x1234...7890
   ```

Note: Account 2 needs a little Arbitrum Sepolia ETH for gas.

---

## 10. After Governance Is Fully Verified

The remaining roadmap item is the **performance phase**:
- Replace in-process `NodeCache` with shared **Upstash Redis**, caching per-leaf Merkle proofs.
- **Optimistic verification** — return the authenticity result from fast read calls, submit the on-chain burn asynchronously.
- Leverage Arbitrum's sub-second finality + batched burns to break the single-wallet throughput ceiling.

Target: bring consumer verification from ~16.5s down to ~2-3s and support national-scale throughput.
