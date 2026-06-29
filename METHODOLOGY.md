# PharmaChain — System Methodology

A complete, top-to-bottom description of the blockchain-based pharmaceutical
anti-counterfeiting system, derived directly from the implemented source code.

> **Scope note / correction:** This system does **not** use Hyperledger Fabric.
> It is built on **public EVM blockchains** — Ethereum **Sepolia** (Layer 1) and
> Arbitrum **Sepolia** (Layer 2). The "consortium" element that is often confused
> with Hyperledger is implemented here as an **M-of-N multi-signature governance
> model inside `GovernmentRegistry.sol`** (described in §3). Wherever this document
> says "consortium," it refers to that on-chain regulator voting model, not a
> permissioned Fabric network.

---

## 1. System Overview

PharmaChain establishes an end-to-end verifiable chain of custody for every
individual medicine strip, from manufacturer to patient. It combines four
cryptographic primitives:

1. **Smart contracts** (Solidity 0.8.20) — the source of truth and trust anchor.
2. **Merkle trees** — compress an entire batch of strips into a single on-chain
   root, giving O(1) on-chain storage cost regardless of batch size.
3. **IPFS (via Pinata)** — off-chain storage of the full Merkle tree so proofs
   can be reconstructed on demand.
4. **Dual QR authentication** — a Public QR (open, for tracking) and a Hidden QR
   under scratch foil (secret, for one-time authenticity proof).

### The Five Layers

| Layer | Component | Responsibility |
|------|-----------|----------------|
| 1 | `GovernmentRegistry.sol` | Root of trust. Consortium (M-of-N) voting to register/revoke/reinstate entities and manage regulators. |
| 2 | `ManufacturerBatch.sol` + `crypto-service` | Batch registration via Merkle root + IPFS CID; Merkle-proof verification; one-time **burn** mechanism. |
| 3 | `SupplyChainTracker.sol` + `supply-chain-portal` | State-machine custody tracking (Manufactured → Distributed → Retailed → Consumed). |
| 4 | `patient-pwa` | Zero-install consumer verification. Local hashing of secret + NID. |
| 5 | Anomaly service + Government dashboard | Classifies revert reasons into anomaly types; nationwide monitoring and analytics. |

### Actors and Their Trust Level

| Actor | Wallet? | Authority |
|-------|--------|-----------|
| Government / Regulators | Yes | Consortium members who vote on the whitelist. The `GovernmentRegistry` owner can recall batches. |
| Manufacturer | Yes (whitelisted) | Registers batches and registers strips into the supply chain. |
| Distributor | Yes (whitelisted) | Records custody handoff. |
| Retailer | Yes (whitelisted) | Records the final commercial handoff. |
| Consumer | **No wallet** | Scans the Hidden QR; verification tx is paid for by a backend **relayer**. |
| Relayer (backend) | Yes (government signer) | Submits `verifyAndBurn()` and `consumeDrug()` on the consumer's behalf so consumers need no crypto. |

---

## 2. Cryptographic Foundation: Merkle Trees + IPFS

This is the mechanism that makes the system both **scalable** and **tamper-proof**.

### 2.1 Per-strip secret generation
For each strip the `crypto-service` generates a 32-byte cryptographically random
secret (`crypto.randomBytes(32)` → `0x…` hex, in `utils.js → generateSecret()`).
The secret is **never stored in any database** — it is printed only on the
physical Hidden QR.

### 2.2 Leaf derivation
Each strip's Merkle **leaf** is `keccak256(secret)` (`merkle.js`,
`utils.js → keccak256()`). Because keccak256 is a one-way function, publishing the
leaf reveals nothing about the secret.

### 2.3 Tree construction
All leaves are assembled into a Merkle tree using `merkletreejs` with
`sortPairs: true` and `hashLeaves: false`. `sortPairs` is mandatory: it makes the
tree byte-compatible with OpenZeppelin's `MerkleProof.verify()` used on-chain.

### 2.4 On-chain vs off-chain split
- **On-chain (`ManufacturerBatch.sol`):** only the 32-byte **Merkle root** + the
  **IPFS CID** + metadata (expiry, drug name, manufacturer) are stored. This is
  why gas cost is *constant* — a 10-strip batch and a 1,000-strip batch both store
  a single root (≈281K gas to register; see §11).
- **Off-chain (IPFS via Pinata):** the full tree JSON (`merkleRoot`, all leaves,
  and layers) is pinned. The relayer later downloads this JSON to **reconstruct**
  the tree and generate a proof for a specific strip on demand.

### 2.5 Self-test before going live
`generateBatch.js` picks a random leaf, generates its proof, and verifies it
locally **before** broadcasting the on-chain registration transaction — preventing
a malformed tree from ever being committed.

---

## 3. Layer 1 — Consortium Voting (GovernmentRegistry.sol)

This is the "consortium" governance model. No single regulator can unilaterally
admit or remove a company from the trusted whitelist; decisions require **M-of-N**
approval (the deployed configuration is **2-of-3**).

### 3.1 Data model
- `_regulators[]` — the N consortium members.
- `_threshold` — M, the votes required to execute (deployed value = 2).
- `proposals[id]` — every proposal, keyed by a sequential `id` starting at **1**
  (`_nextProposalId`).
- `hasVoted[id][regulator]` and `votes[id][regulator]` — vote bookkeeping.

### 3.2 Proposal lifecycle
1. **Propose.** Any regulator calls one of:
   `proposeRegisterEntity`, `proposeRevokeEntity`, `proposeReinstateEntity`,
   `proposeAddRegulator`, `proposeRemoveRegulator`.
   A `Proposal` is created with a 7-day expiry, and the **proposer auto-votes YES**
   (`_castVote(...true)`).
2. **Vote.** Other regulators call `voteOnProposal(id, choice)`. Votes can be
   *changed*; `_castVote` decrements the tally if a prior YES is flipped, so the
   approval count always reflects current state.
3. **Auto-execute.** After every vote, if `approvalsCount >= threshold`, the
   contract immediately calls `_executeProposal(id)` in the same transaction —
   there is no separate "execute" step.
4. **Execute action.** `_executeProposal` dispatches by action type:
   `_executeRegister` (parses `"name|license|role"`), `_executeRevoke`,
   `_executeReinstate`, `_executeAddRegulator`, `_executeRemoveRegulator`.
5. **Expiry.** If 7 days pass without reaching threshold, the next vote attempt
   marks it `Expired` and reverts.

### 3.3 Why this enforces decentralized trust
All downstream contracts (`ManufacturerBatch`, `SupplyChainTracker`) gate their
write functions on `governmentRegistry.isWhitelisted(msg.sender)` and
`hasRole(...)`. Therefore an entity can only manufacture, distribute, or retail
**after the consortium has voted it in**. Revocation is equally instant and
nationwide — once a revoke proposal executes, every future action by that wallet
reverts.

### 3.4 Reading proposals (the bug that was fixed)
Listing proposals in the dashboard originally used
`queryFilter(ProposalCreated, fromBlock=0, latest)`, i.e. an `eth_getLogs` scan
over the whole chain. Free-tier RPC providers cap `eth_getLogs` to a ~10-block
range and reject the call with error `-32600` once the chain advances — so created
proposals appeared to "vanish" and other regulators saw an empty list with no vote
buttons. **Fix (`supply-chain-portal/lib/api.js`):** because proposal IDs are
strictly sequential from 1, `listProposals()` now walks
`getProposal(1), getProposal(2), …` (plain `eth_call`, no block-range limit) and
stops at the first empty slot (`id === 0`). This is reliable on free-tier RPC and
requires no contract redeploy.

---

## 4. Layer 2 — Batch Registration (ManufacturerBatch.sol + crypto-service)

### 4.1 Registration (manufacturer side)
`generateBatch.js` performs the full pipeline:
1. Generate N secrets.
2. Build the Merkle tree → root.
3. Self-verify a random proof.
4. Pin the tree JSON to IPFS → CID.
5. Call `registerBatch(batchId, merkleRoot, ipfsCID, expiryDate, drugName)`.
6. Generate dual QR codes for every strip.
7. Write a **secure manifest** (contains secrets) and a **public summary** (no
   secrets).

On-chain, `registerBatch` enforces: caller is a whitelisted **Manufacturer**
(`onlyWhitelistedManufacturer`), expiry is in the future, and the batchId is
unique.

### 4.2 The Burn Mechanism (anti-replay / anti-clone)
The contract holds `mapping(bytes32 => bool) isConsumed`, keyed by the leaf hash.
`verifyAndBurn(batchId, proof, leafHash)` performs six checks in order:
1. Batch exists.
2. Batch is active (not recalled).
3. **Leaf not already consumed** — else `revert StripAlreadyConsumed`.
4. **Merkle proof valid** against the stored root — else `revert InvalidMerkleProof`.
5. **Burn:** set `isConsumed[leafHash] = true`.
6. Return whether the batch is past expiry.

Because step 5 is irreversible, **each genuine secret can be verified exactly
once.** See §6 for how this defeats counterfeiting.

### 4.3 Government recall
`deactivateBatch` / `reactivateBatch` can only be called by
`governmentRegistry.owner()`. A deactivated (recalled) batch fails check #2, so
every strip in a recalled batch instantly reports as unverifiable.

---

## 5. The Dual-QR System

Every strip carries **two** QR codes, generated by `qrGenerator.js`.

### 5.1 Public QR — open, reusable, non-secret
- Encodes a **tracking URL**: `…/track?drugId=COMP-A-B1-S0001`.
- Printed openly on the package.
- Scanned by **distributors, retailers, and curious consumers** to view the
  custody timeline.
- Contains **no secret** — copying it leaks nothing and grants no authenticity.

### 5.2 Hidden QR — secret, one-time, under scratch foil
- Encodes a **verification URL**: `…/verify?data=<base64>`, where the base64
  payload is `{ secret, batchId, leafIndex }` (`utils.js → encodeHiddenPayload`).
- Printed **under a scratch panel** and rendered in a distinct purple tint so it
  is visually different from the Public QR.
- Revealed only by the end consumer at the point of purchase/consumption.
- This is the QR that proves authenticity and triggers the **burn**.

The separation is the heart of the anti-duplication design: tracking
(non-sensitive, repeatable) is decoupled from authentication (secret, one-time).

---

## 6. How Counterfeiting Is Defeated — "Only One Genuine Scan Can Ever Succeed"

This addresses the core property: *a legitimate strip can be verified once, and no
other copy of it can ever pass as authentic.* There are exactly three attacker
scenarios, and the system handles all three:

### Scenario A — Counterfeiter fabricates a fake secret/QR
The attacker prints a strip with an invented secret. When scanned,
`keccak256(secret)` produces a leaf that is **not in the Merkle tree**, so
`MerkleProof.verify` fails → `InvalidMerkleProof` → result **🚨 FAKE**, logged as
`POTENTIAL_CLONE_DETECTED`. The attacker cannot forge a valid leaf without knowing
a real secret, and cannot invert keccak256 from the public leaves.

### Scenario B — Counterfeiter photocopies a real Hidden QR (cloning)
Suppose an attacker copies a genuine Hidden QR onto 1,000 fake strips.
- The **first** scan of *any* of those copies (including the genuine one) succeeds,
  and the leaf is **burned** (`isConsumed = true`).
- **Every subsequent scan** of the same secret — on the genuine strip or any clone
  — reverts with `StripAlreadyConsumed` → result **❌ ALREADY USED**, logged as
  `REPLAY_ATTACK_DETECTED`.

This is precisely the "only one can be copied, but no other copy survives" property:
the cryptographic secret is a **single-use token**. At most **one** verification per
secret can ever succeed; the moment a duplicate is scanned the fraud surfaces, and
the anomaly is recorded for the government dashboard. (If the legitimate consumer
scans first, every clone is dead on arrival; if a clone is scanned first, the
genuine consumer is alerted that their strip was already used — a strong tampering
signal.)

### Scenario C — Out-of-order or unauthorized supply-chain injection
A counterfeiter who is not whitelisted cannot inject a strip into the chain — every
write reverts via `isWhitelisted`/`hasRole`. Even a whitelisted but misbehaving
actor cannot skip states (e.g., "retail" a drug that was never "distributed")
because the `SupplyChainTracker` state machine reverts with `OutOfOrderTransition`
(see §7).

### Privacy note
The optional National ID is hashed **in the browser** (`crypto.js → hashNID`,
`keccak256(NID)`); only the hash leaves the device. The raw secret is likewise
hashed locally — the server only ever receives `leafHash`, never the consumer's
plaintext identity in a reversible form.

---

## 7. Layer 3 — Supply-Chain State Machine (SupplyChainTracker.sol)

Custody is modeled as a strict, monotonic state machine:

```
NotRegistered(0) → Manufactured(1) → Distributed(2) → Retailed(3) → Consumed(4)
```

- `registerDrug` — only a **Manufacturer**; only from `NotRegistered`.
- `distributeDrug` — only a **Distributor**; only from `Manufactured`.
- `retailDrug` — only a **Retailer**; only from `Distributed`.
- `consumeDrug` — called by the **relayer** after a successful `verifyAndBurn`;
  only from `Retailed`.

Any attempt to transition out of order reverts with `OutOfOrderTransition`, and
every actor is re-checked against the `GovernmentRegistry` whitelist on each call.
Each step appends a `Verification{actor, role, status, timestamp, location}` to
`drugHistory[drugId]`, which powers the consumer-facing timeline.

---

## 8. Layer 4 — Consumer Verification (Patient PWA)

The PWA is a zero-install Next.js app. Flow when a consumer scans the Hidden QR:

1. `/verify?data=…` opens. `qrDecoder.js → decodeHiddenPayload` base64-decodes the
   payload locally → `{ secret, batchId, leafIndex }`.
2. The browser computes `leafHash = keccak256(secret)` locally (`crypto.js`); the
   raw secret never leaves the device in plaintext form beyond what's needed.
3. The PWA POSTs `{ secret, batchId, leafIndex, drugId, hashedNID }` to
   `POST /api/consumer/verify`.
4. The backend `verificationService.verifyStrip`:
   - fetches the batch from chain (`getBatch`);
   - downloads the Merkle tree from IPFS (with a 24-hour `node-cache` layer — a
     cache HIT eliminates the ~6–7 s IPFS fetch);
   - rebuilds the tree, generates the proof;
   - calls `verifyAndBurn` on-chain (relayer pays gas);
   - on success calls `consumeDrug` to advance the state machine;
   - logs consumption and prints latency/gas metrics.
5. The PWA renders one of the outcomes below.

### Verification Outcomes
| Result | Condition |
|--------|-----------|
| ✅ **AUTHENTIC** | Valid proof, not previously consumed, not expired. |
| ⚠️ **AUTHENTIC_EXPIRED** | Valid proof, burned successfully, but past expiry date. |
| ❌ **ALREADY_USED** | `StripAlreadyConsumed` — replay/clone; anomaly logged. |
| 🚨 **FAKE** | `InvalidMerkleProof` or batch not found; anomaly logged. |

---

## 9. Layer 5 — Anomaly Detection & Government Dashboard

`anomalyService.detectAndLogAnomaly` inspects every failed transaction (both via
string matching and by decoding the custom error from `err.data`) and classifies
it into a type:

| On-chain revert | Anomaly type |
|-----------------|--------------|
| `StripAlreadyConsumed` | `REPLAY_ATTACK_DETECTED` |
| `InvalidMerkleProof` | `POTENTIAL_CLONE_DETECTED` |
| `BatchInactive` | `RECALLED_BATCH_SCAN` |
| `BatchNotFound` | `UNREGISTERED_BATCH_SCAN` |
| `NotWhitelisted` | `UNAUTHORIZED_ACTOR` |
| `OutOfOrderTransition` | `OUT_OF_ORDER_SUPPLY_CHAIN` |

Anomalies are appended to `govt_anomaly_logs.json` and surfaced on the government
dashboard alongside national analytics — giving regulators a real-time map of where
cloning/replay is being attempted.

---

## 10. Dual-Network Architecture: Sepolia (L1) vs Arbitrum Sepolia (L2)

The system is deployed **identically on two networks** so the same application code
can target either chain. Network selection is parameterized end to end.

### 10.1 How the dual deployment works
- **Contracts** are deployed to both networks; addresses are recorded in
  `blockchain/deployed-addresses.json` under `sepolia` (chainId `11155111`) and
  `arbitrumSepolia` (chainId `421614`). Both use the same 2-of-3 regulator set.
- **Hardhat** (`hardhat.config.js`) defines both `sepolia` and `arbitrumSepolia`
  networks plus Etherscan/Arbiscan verification endpoints.
- **Batch generation** (`generateBatch.js`) accepts a network argument
  (`node src/generateBatch.js arbitrum`) and routes RPC URL + contract address
  accordingly (`RPC_URL`/`MANUFACTURER_BATCH_ADDRESS` vs
  `ARBITRUM_RPC_URL`/`ARBITRUM_MANUFACTURER_BATCH_ADDRESS`). Output is written to
  `output/<network>/…` so L1 and L2 artifacts stay separated.

### 10.2 Why two networks: the analysis
Arbitrum Sepolia is an **L2 optimistic rollup** that settles to Ethereum. The same
bytecode runs on both, so the *gas units consumed are essentially identical* — what
differs dramatically is **confirmation latency** and **price per gas**. This lets
the paper isolate the L2 benefit cleanly: same logic, same gas, different execution
environment.

---

## 11. Measured Performance (from `crypto-service/benchmark-results`)

Benchmark run `2026-06-28`, 64-strip batches, ETH = $1,579.83. Values below are the
real on-chain measurements recorded in the benchmark JSON.

### 11.1 `verifyAndBurn()` — the consumer's critical path
| Metric | Ethereum Sepolia (L1) | Arbitrum Sepolia (L2) |
|--------|----------------------|----------------------|
| Latency (avg) | **13,124 ms** | **2,541 ms** |
| Latency (min–max) | 9,028 – 17,229 ms | 2,338 – 2,649 ms |
| Gas used (avg) | 62,022 | 62,017 |
| Gas price | ~1.11 gwei | ~0.0201 gwei |

### 11.2 `registerBatch()` — manufacturer's one-time cost
| Metric | L1 Sepolia | L2 Arbitrum |
|--------|-----------|------------|
| Gas used | 281,852 | 281,864 |
| Latency | 21,538 ms | 2,488 ms |

### 11.3 IPFS retrieval
- Cache MISS: ~6.4 s (L1 run) / ~7.5 s (L2 run) — dominated by the gateway, not the
  chain.
- Cache HIT: ~0 ms (served from the in-memory `node-cache`).

### 11.4 Interpretation
- **Latency:** L2 is roughly **5× faster** to confirm a verification (~2.5 s vs
  ~13 s) and ~9× faster for batch registration (~2.5 s vs ~21.5 s).
- **Cost:** gas *units* are effectively equal, but L2's gas *price* is ~55× lower,
  so the monetary cost per verification on L2 is a small fraction of L1's.
- **Conclusion for the paper:** the cryptographic design is chain-agnostic; moving
  the same contracts to an L2 rollup yields large UX (latency) and cost wins with
  no change to the security model. IPFS retrieval, not the chain, becomes the main
  latency contributor once L2 is used — which is why the in-memory cache matters.

---

## 12. End-to-End Walkthrough (Top to Bottom)

1. **Onboarding (consortium).** A regulator proposes registering Manufacturer X;
   a second regulator votes YES; threshold (2) is met → proposal auto-executes → X
   is whitelisted with role `Manufacturer`.
2. **Batch creation.** X runs `generateBatch.js`: secrets → Merkle tree → IPFS pin
   → `registerBatch` on-chain → dual QR codes printed (Public open, Hidden under
   scratch foil).
3. **Manufacture.** X calls `registerDrug(drugId)` → state = `Manufactured`.
4. **Distribution.** Whitelisted Distributor scans Public QR, calls
   `distributeDrug` → state = `Distributed`.
5. **Retail.** Whitelisted Retailer scans Public QR, calls `retailDrug` → state =
   `Retailed`.
6. **Consumer verification.** Buyer scratches foil, scans Hidden QR → PWA decodes
   payload, hashes secret locally → backend rebuilds proof → `verifyAndBurn`
   succeeds, **leaf burned** → `consumeDrug` → state = `Consumed` → ✅ AUTHENTIC.
7. **Attempted fraud.** Any clone of that Hidden QR now returns ❌ ALREADY_USED; any
   fabricated QR returns 🚨 FAKE. Both events are classified and pushed to the
   government dashboard.
8. **Recall (if needed).** Government owner calls `deactivateBatch` → all strips in
   that batch immediately fail verification nationwide.

---

## 13. Threat Model Summary

| Threat | Defense | Mechanism in code |
|--------|---------|-------------------|
| Counterfeit (fabricated) medicine | On-chain Merkle proof | `InvalidMerkleProof` in `verifyAndBurn` |
| QR cloning / photocopy | One-time burn | `isConsumed` mapping → `StripAlreadyConsumed` |
| Replay attack | Same as above + anomaly log | `REPLAY_ATTACK_DETECTED` |
| Expired medicine | On-chain expiry timestamp | `expiryDate` check |
| Unauthorized entity | Consortium whitelist | `isWhitelisted` / `hasRole` |
| Out-of-order supply chain | State machine | `OutOfOrderTransition` |
| Recalled batch | Government deactivation | `BatchInactive` |
| Centralized regulator abuse | M-of-N consortium voting | `GovernmentRegistry` threshold |
| Privacy breach | Local hashing | `keccak256(NID)` / `keccak256(secret)` in browser |
| RPC log-range limits | Sequential proposal reads | `listProposals()` via `getProposal(id)` |

---

## 14. Deployed Addresses (for reference)

**Ethereum Sepolia (chainId 11155111)**
- GovernmentRegistry: `0xC5714bc15E5a45fB73d72aC4e0774364c5cd9954`
- ManufacturerBatch: `0xb6216d0d6FCc97d7CC7Aae797262E1AA339013E2`
- SupplyChainTracker: `0x91614bFbeC6AD05e37b6c0Dd9d5abadc82e9c2aa`

**Arbitrum Sepolia (chainId 421614)**
- GovernmentRegistry: `0xD72A7A156515A5082d8Bc56B05C33Cd2EDaebD7d`
- ManufacturerBatch: `0x457e47f431EBDa9EfB28F2f05a439CFd01B90Fb1`
- SupplyChainTracker: `0xe805DaD6c993179E0D5605c2c8B90083Bcb390fD`

Both networks share the same 2-of-3 regulator consortium.
