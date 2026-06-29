# PharmaChain — Blockchain Anti-Counterfeit System Architecture

> A multi-layer pharmaceutical anti-counterfeiting platform combining a 3-contract
> on-chain trust hierarchy, off-chain cryptographic batch tooling, a relayer backend,
> a B2B supply-chain portal, and a consumer PWA. Deployed dual-network on
> **Ethereum Sepolia (L1)** and **Arbitrum Sepolia (L2)**.

This document is reverse-engineered directly from the source code (not the READMEs).

---

## 1. System at a Glance — The Five Modules

| Module | Path | Stack | Role |
|--------|------|-------|------|
| **Smart Contracts** | `blockchain/` | Hardhat, Solidity `^0.8.20`, OpenZeppelin `^5` | On-chain root of trust, batch registry, custody tracker |
| **Crypto Service** | `crypto-service/` | Node.js scripts, ethers v6, merkletreejs, Pinata SDK, qrcode | Off-line manufacturer tooling: secrets → Merkle tree → IPFS → on-chain batch → dual QR codes |
| **Backend (Relayer/API)** | `backend/` | Express 4, ethers v6, Mongoose/MongoDB, SIWE, node-cache | REST API, gasless relayer for consumers, SIWE auth, anomaly + consumption logging |
| **Supply Chain Portal** | `supply-chain-portal/` | Next.js (App Router), ethers v6, MetaMask, SIWE, Zustand | B2B dApp for Manufacturer / Distributor / Retailer / Government |
| **Patient PWA** | `patient-pwa/` | Next.js (App Router), ethers v6 (browser hashing only) | Consumer verification + tracking (no wallet) |

---

## 2. High-Level Architecture

```mermaid
graph TB
    subgraph Clients["CLIENT LAYER"]
        PWA["Patient PWA<br/>(Next.js, no wallet)<br/>verify / track"]
        PORTAL["Supply Chain Portal<br/>(Next.js + MetaMask + SIWE)<br/>manufacture / distribute / retail / government"]
    end

    subgraph Offline["OFFLINE MANUFACTURER TOOLING"]
        CRYPTO["crypto-service<br/>generateBatch.js · setupRegistry.js<br/>merkle · ipfs · qrGenerator · benchmark"]
    end

    subgraph Backend["BACKEND — Express Relayer/API (:4000)"]
        API["Routes<br/>/api/government · /api/supply-chain · /api/consumer"]
        MW["Middleware<br/>authSIWE · roleGuard · helmet · rate-limit · CORS"]
        SVC["Services<br/>verificationService · supplyChainService · anomalyService"]
        CACHE["node-cache<br/>(IPFS Merkle-tree memo, TTL 24h)"]
    end

    subgraph Data["DATA / TRUST LAYER"]
        MONGO[("MongoDB Atlas<br/>Entity · ConsumptionLog · AnomalyLog")]
        IPFS[["IPFS / Pinata<br/>Merkle tree JSON per batch"]]
        subgraph Chain["EVM — Sepolia (L1) & Arbitrum Sepolia (L2)"]
            GR["GovernmentRegistry.sol<br/>(Layer 1 — root of trust)"]
            MB["ManufacturerBatch.sol<br/>(Layer 2 — batch + verifyAndBurn)"]
            SCT["SupplyChainTracker.sol<br/>(Layer 3 — custody state machine)"]
        end
    end

    PWA -->|"REST (axios)"| API
    PORTAL -->|"REST (axios) + SIWE headers"| API
    PORTAL -.->|"writes signed directly via MetaMask"| Chain

    CRYPTO -->|"pin Merkle tree"| IPFS
    CRYPTO -->|"registerBatch()"| MB
    CRYPTO -->|"propose/vote register entities"| GR

    MW --> API
    API --> SVC
    SVC --> CACHE
    SVC -->|"relayer signer"| MB
    SVC -->|"relayer signer"| SCT
    SVC -->|"read whitelist/role"| GR
    SVC -->|"fetch tree"| IPFS
    SVC --> MONGO
    API --> MONGO

    GR -. "isWhitelisted / hasRole" .-> MB
    GR -. "isWhitelisted / hasRole / owner" .-> SCT
```

---

## 3. The On-Chain Trust Hierarchy (3 Contracts)

All three contracts are deployed per-network. Addresses live in
`blockchain/deployed-addresses.json` (keyed by `sepolia` / `arbitrumSepolia`).
`ManufacturerBatch` and `SupplyChainTracker` both hold an **immutable reference**
to `GovernmentRegistry` and delegate every authorization check to it.

```mermaid
graph TD
    subgraph L1["Layer 1 — GovernmentRegistry.sol"]
        direction TB
        GOV["M-of-N Consortium Governance<br/>regulators[] + threshold (e.g. 2-of-3)"]
        PROP["Proposals: Register / Revoke / Reinstate<br/>AddRegulator / RemoveRegulator"]
        VOTE["voteOnProposal() → auto-executes at threshold<br/>7-day expiry · vote-change supported"]
        ENT["Entity registry<br/>role ∈ {Manufacturer, Distributor, Retailer}<br/>status ∈ {NotRegistered, Active, Revoked}"]
        VIEWS["isWhitelisted(addr) · hasRole(addr,role)<br/>owner() · getRegulators() · getThreshold()"]
    end

    subgraph L2["Layer 2 — ManufacturerBatch.sol"]
        REG["registerBatch(batchId, merkleRoot, ipfsCID, expiry, drugName)<br/>onlyWhitelistedManufacturer"]
        VB["verifyAndBurn(batchId, proof, leafHash)<br/>MerkleProof.verify + one-time burn (isConsumed)"]
        RECALL["deactivate/reactivateBatch()<br/>only GovernmentRegistry.owner()"]
    end

    subgraph L3["Layer 3 — SupplyChainTracker.sol"]
        SM["State machine per drugId:<br/>NotRegistered → Manufactured → Distributed → Retailed → Consumed"]
        ACTS["registerDrug (Manufacturer)<br/>distributeDrug (Distributor)<br/>retailDrug (Retailer)<br/>consumeDrug (relayer)"]
        HIST["drugHistory[drugId] = Verification[]<br/>getDrugHistory() · getDrugStatus()"]
    end

    L2 -->|"governmentRegistry.hasRole / isWhitelisted / owner"| L1
    L3 -->|"governmentRegistry.hasRole / isWhitelisted"| L1
    VOTE --> ENT
    PROP --> VOTE
```

**Key security properties enforced on-chain:**
- **Single root of trust** — only `GovernmentRegistry`-active entities with the correct role can act.
- **Merkle authenticity** — `merkleRoot` is stored on-chain; the full tree lives on IPFS; proofs are verified with OpenZeppelin `MerkleProof` (sorted pairs).
- **Anti-replay (burn)** — `isConsumed[leafHash]` flips to `true` on first verify; reuse reverts with `StripAlreadyConsumed`.
- **Strict custody ordering** — out-of-order transitions revert with `OutOfOrderTransition`.
- **No unilateral power** — entity register/revoke and regulator changes require M-of-N votes.

---

## 4. Batch Generation Flow (crypto-service, run by a Manufacturer)

```mermaid
sequenceDiagram
    autonumber
    participant M as Manufacturer (CLI)
    participant U as utils.js<br/>(generateSecret/keccak256)
    participant MK as merkle.js
    participant P as Pinata / IPFS
    participant MB as ManufacturerBatch.sol
    participant QR as qrGenerator.js
    participant FS as output/<network>/<batchId>

    M->>U: generate N random 32-byte secrets
    U->>MK: leaf[i] = keccak256(secret[i])
    MK->>MK: build Merkle tree (sortPairs) → merkleRoot + treeJSON
    MK-->>M: self-test a random proof locally
    M->>P: pinJSONToIPFS(treeJSON) → ipfsCID
    M->>MB: registerBatch(batchId, merkleRoot, ipfsCID, expiry, drugName)
    Note over MB: reverts unless caller is a whitelisted Manufacturer
    loop each strip i
        M->>QR: generate Public QR (track URL) + Hidden QR (Base64 payload)
        Note right of QR: Hidden payload = base64({secret, batchId, leafIndex})
    end
    M->>FS: write batch-manifest.json (with secrets) + batch-summary.json (no secrets)
```

Each strip ends up with **two QR codes**:
- **Public QR** → `/{appBaseUrl}/track?drugId=...` — safe, on the outside of the pack.
- **Hidden QR** → `/{appBaseUrl}/verify?data=<base64(secret,batchId,leafIndex)>` — under a scratch panel.

---

## 5. Supply Chain Custody Flow (Portal + MetaMask + Backend)

The portal signs the actual state-changing transaction **directly through MetaMask**
(`registerDrug` / `distributeDrug` / `retailDrug`). The backend call afterwards is
for **auth verification, role gating, and metrics logging** — it does not re-sign.

```mermaid
sequenceDiagram
    autonumber
    participant U as Actor (Mfg/Dist/Retail)
    participant W as MetaMask
    participant PORTAL as Supply Chain Portal
    participant SCT as SupplyChainTracker.sol
    participant API as Backend /api/supply-chain
    participant GR as GovernmentRegistry.sol
    participant MGO as MongoDB

    U->>PORTAL: Connect wallet + SIWE sign-in
    PORTAL->>GR: isRegulator? / govAPI.getEntity(addr) → role
    U->>PORTAL: enter drugId + location, submit
    PORTAL->>W: contract.registerDrug(drugId, location)
    W->>SCT: signed tx
    SCT->>GR: hasRole(msg.sender, Manufacturer)?
    SCT-->>PORTAL: receipt (txHash)
    PORTAL->>API: POST /manufacture {drugId, txHash, startTime}<br/>(SIWE headers)
    API->>API: authSIWE → roleGuard("Manufacturer")
    API->>GR: isWhitelisted + hasRole (server-side recheck)
    API->>SCT: fetch receipt → log gas + latency metrics
    API-->>PORTAL: success
    Note over MGO: distribute/retail repeat with Distributor/Retailer roles
```

State machine guard: a strip must be `Manufactured` before `distributeDrug`,
`Distributed` before `retailDrug`, etc. — enforced on-chain.

---

## 6. Consumer Verification Flow (PWA — gasless relayer)

The consumer has **no wallet**. The secret is hashed in the browser, and the
backend acts as a **relayer** (signs `verifyAndBurn` with the government key) so
verification is free for the patient.

```mermaid
sequenceDiagram
    autonumber
    participant C as Consumer (PWA)
    participant QD as qrDecoder + crypto (browser)
    participant API as Backend /api/consumer/verify
    participant VS as verificationService
    participant Cache as node-cache
    participant IPFS as Pinata Gateway
    participant MB as ManufacturerBatch.sol
    participant SCT as SupplyChainTracker.sol
    participant DB as MongoDB

    C->>QD: scan Hidden QR → decode base64 payload {secret, batchId, leafIndex}
    QD->>QD: leafHash = keccak256(secret) (local) ; optional hashNID
    C->>API: POST /verify {secret, batchId, leafIndex, drugId, hashedNID}
    API->>VS: verifyStrip(...)
    VS->>MB: getBatch(batchId) → merkleRoot, ipfsCID, expiry, drugName
    VS->>Cache: lookup tree by ipfsCID
    alt cache miss
        VS->>IPFS: fetch Merkle tree JSON
        VS->>Cache: store tree (TTL 24h)
    end
    VS->>VS: rebuild tree → generate Merkle proof for leafIndex
    VS->>MB: verifyAndBurn(batchId, proof, leafHash)
    alt valid & unused
        MB-->>VS: expired? flag + StripVerified event (leaf burned)
        VS->>SCT: consumeDrug(drugId) (relayer signer)
        VS->>DB: appendLog(consumption)
        VS-->>C: AUTHENTIC ✅ (or AUTHENTIC_EXPIRED ⚠️)
    else already burned / bad proof
        MB-->>VS: revert StripAlreadyConsumed / InvalidMerkleProof
        VS->>DB: detectAndLogAnomaly(...) → AnomalyLog
        VS-->>C: ALREADY_USED / FAKE ❌
    end
```

**Result statuses returned to the PWA:** `AUTHENTIC`, `AUTHENTIC_EXPIRED`,
`ALREADY_USED`, `FAKE`.

---

## 7. Governance / Consortium Flow (Government tab)

```mermaid
sequenceDiagram
    autonumber
    participant R1 as Regulator 1 (proposer)
    participant R2 as Regulator 2..N
    participant W as MetaMask
    participant GR as GovernmentRegistry.sol
    participant PORTAL as Government Dashboard

    R1->>PORTAL: Register / Revoke / Reinstate entity (or add/remove regulator)
    PORTAL->>W: proposeX(...) signed via MetaMask
    W->>GR: createProposal → proposer auto-votes YES (1 approval)
    Note over GR: proposal expires in 7 days if threshold not met
    R2->>PORTAL: open Proposals tab → listProposals() (sequential getProposal)
    R2->>W: voteOnProposal(id, true)
    W->>GR: _castVote → if approvalsCount >= threshold → auto-execute
    GR-->>PORTAL: EntityRegistered / Revoked / Reinstated event
```

> The portal reads proposals by **walking proposal IDs sequentially** via
> `getProposal()` rather than `eth_getLogs`, to stay within free-tier RPC
> block-range limits.

---

## 8. Backend Internal Structure

```mermaid
graph LR
    subgraph app["app.js (Express :4000)"]
        H["helmet · CORS · rate-limit<br/>(verify: 20/15min, default: 100/15min)"]
    end

    subgraph routes["routes/"]
        GOVR["government.js<br/>governance, entities, analytics, anomalies"]
        SCR["supplyChain.js<br/>manufacture/distribute/retail + status"]
        CONR["consumer.js<br/>verify · track · batch"]
    end

    subgraph mw["middleware/"]
        SIWE["authSIWE<br/>(x-siwe-message / x-siwe-signature)"]
        RG["roleGuard(role)<br/>contract isWhitelisted + hasRole"]
    end

    subgraph svc["services/"]
        VS["verificationService<br/>(IPFS fetch + proof + verifyAndBurn relayer)"]
        SCS["supplyChainService<br/>(history/status + consumeDrug relayer)"]
        AS["anomalyService<br/>(classify revert → anomaly type)"]
    end

    subgraph db["db/ (Mongoose)"]
        GDB["govRegistry"]
        CDB["consumptionLog"]
        ADB["anomalyLog"]
        MModels["models.js + mongoose.js"]
    end

    subgraph cfg["config/contracts.js"]
        PROV["L1/L2 provider switch<br/>(ACTIVE_NETWORK)"]
        SIGN["govSigner (relayer key)<br/>+ contract factories"]
        ABI["abi/*.json (bundled)"]
    end

    H --> GOVR & SCR & CONR
    SCR --> SIWE --> RG
    GOVR --> VS
    CONR --> VS
    VS --> SCS --> AS
    VS & SCS --> cfg
    RG --> cfg
    VS & SCS & AS --> db
```

**Network routing:** `config/contracts.js` selects L1 vs L2 via `ACTIVE_NETWORK`
(`sepolia` default or `arbitrum`), choosing the matching RPC URL and contract
addresses. ABIs are bundled in `backend/src/abi/*.json` and refreshed with
`npm run sync-abi`.

---

## 9. Data Stores & Where Each Piece of Truth Lives

```mermaid
graph TB
    subgraph OnChain["ON-CHAIN (authoritative)"]
        A1["Entity licenses & roles → GovernmentRegistry"]
        A2["Batch merkleRoot + ipfsCID + expiry → ManufacturerBatch"]
        A3["Leaf burn state (isConsumed) → ManufacturerBatch"]
        A4["Custody history & status → SupplyChainTracker"]
    end
    subgraph IPFSstore["IPFS / PINATA (authenticity data)"]
        B1["Full Merkle tree JSON (leaves + layers) per batch"]
    end
    subgraph Mongo["MONGODB (off-chain mirror / analytics)"]
        C1["Entity (mirror of registry, for UI lists)"]
        C2["ConsumptionLog (hashedNID, batchId, expired, txHash)"]
        C3["AnomalyLog (type, drugId, ip, severity, reviewed)"]
    end
    subgraph Secret["PHYSICAL ONLY (never stored server-side)"]
        D1["Strip secret → printed under scratch panel<br/>+ kept in manufacturer's batch-manifest.json"]
    end
```

Privacy notes from the code:
- The raw **secret** never leaves the consumer device — only `keccak256(secret)` is sent.
- The **NID** is hashed in-browser (`hashNID`) before transmission; only the hash is logged.

---

## 10. Authentication & Authorization Model

| Surface | Mechanism |
|---------|-----------|
| **Portal write actions** | MetaMask signature → on-chain role check in the contract itself |
| **Backend protected routes** | `authSIWE` verifies SIWE message/signature → `roleGuard` re-checks `isWhitelisted` + `hasRole` on `GovernmentRegistry` |
| **Government role** | Derived dynamically from on-chain `getRegulators()` (no hardcoded admin address) |
| **Consumer verify/track** | Public, no auth (gasless relayer); protected only by IP rate-limiting |
| **Batch recall** | Restricted to `GovernmentRegistry.owner()` |

Session state on the client is held in a persisted **Zustand** store (`pharma-auth`
localStorage key) containing wallet address, SIWE message/signature, and resolved role.

---

## 11. Dual-Network Deployment

```mermaid
graph LR
    subgraph Toggle["ACTIVE_NETWORK switch"]
        ENV["backend: ACTIVE_NETWORK<br/>frontend: NEXT_PUBLIC_ACTIVE_NETWORK"]
    end
    ENV -->|"sepolia"| L1["Ethereum Sepolia<br/>chainId 11155111"]
    ENV -->|"arbitrum"| L2["Arbitrum Sepolia<br/>chainId 421614"]
    L1 --> ADDR1["3 contracts (deployed-addresses.json → sepolia)"]
    L2 --> ADDR2["3 contracts (deployed-addresses.json → arbitrumSepolia)"]
```

The same contract set is deployed to both networks, enabling an **L1 vs L2
gas/latency comparison** (the backend prints gas + latency metrics on every
verify/custody action, and `crypto-service/benchmark.js` records CSV/JSON results).

---

## 12. End-to-End Lifecycle Summary

```mermaid
graph LR
    G["Government<br/>registers entities<br/>(M-of-N vote)"] --> MM["Manufacturer<br/>generateBatch →<br/>IPFS + on-chain root<br/>+ dual QR"]
    MM --> D["Distributor<br/>distributeDrug<br/>(scan Public QR)"]
    D --> RR["Retailer<br/>retailDrug<br/>(scan Public QR)"]
    RR --> CC["Consumer<br/>scan Hidden QR →<br/>verifyAndBurn (relayer)"]
    CC --> AN["Anomalies → AnomalyLog<br/>Consumption → ConsumptionLog"]
    AN --> G
```
