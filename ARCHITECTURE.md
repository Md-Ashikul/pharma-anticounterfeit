# System Architecture — Pharma Anti-Counterfeit Platform

> Diagrams are written in **Mermaid**. They render automatically on GitHub, in VS Code
> (with a Mermaid extension), and at https://mermaid.live. Every node maps to real code
> in this repository (contracts, `crypto-service`, `backend`, `patient-pwa`).

---

## 1. High-Level System Architecture

```mermaid
flowchart TB
    subgraph Actors["Participants"]
        MFG["Manufacturer"]
        DIST["Distributor"]
        RETAIL["Retailer / Pharmacy"]
        CONSUMER["Consumer / Patient"]
        GOV["Government Regulators<br/>(Consortium)"]
    end

    subgraph Clients["Client Applications"]
        PORTAL["Supply-Chain Portal<br/>(Next.js web app)"]
        PWA["Patient PWA<br/>(QR scanner + local verify)"]
    end

    subgraph OffChain["Off-Chain Services"]
        BACKEND["Backend API + Relayer<br/>(Express)"]
        CRYPTO["Crypto Service<br/>(Merkle + QR generation)"]
        IPFS["IPFS / Pinata<br/>(Merkle tree storage)"]
    end

    subgraph Chains["Blockchain Layer (dual-chain EVM)"]
        direction LR
        subgraph L1["Ethereum Sepolia (L1)"]
            MB1["ManufacturerBatch"]
            SC1["SupplyChainTracker"]
            GR1["GovernmentRegistry"]
        end
        subgraph L2["Arbitrum Sepolia (L2)"]
            MB2["ManufacturerBatch"]
            SC2["SupplyChainTracker"]
            GR2["GovernmentRegistry"]
        end
    end

    MFG --> PORTAL
    DIST --> PORTAL
    RETAIL --> PORTAL
    GOV --> PORTAL
    CONSUMER --> PWA

    PORTAL --> BACKEND
    PWA --> BACKEND
    BACKEND --> CRYPTO
    CRYPTO --> IPFS
    BACKEND --> IPFS

    BACKEND -->|"ACTIVE_NETWORK<br/>selects chain"| L1
    BACKEND -.->|alternate| L2

    PWA -->|"read-only verify (eth_call)"| L1
```

---

## 2. Smart-Contract Layer

```mermaid
flowchart LR
    subgraph GR["GovernmentRegistry.sol"]
        ROLES["Role registry<br/>Manufacturer / Distributor / Retailer / Regulator"]
        CONSORTIUM["Consortium governance<br/>M-of-N (2-of-3) proposals + voting"]
    end

    subgraph MB["ManufacturerBatch.sol"]
        REG["registerBatch()<br/>stores Merkle root + IPFS CID"]
        VB["verifyAndBurn()<br/>one-time hidden-QR consume"]
        CONSUMED["isConsumed mapping<br/>(replay / clone protection)"]
    end

    subgraph SC["SupplyChainTracker.sol"]
        CHK["custody checkpoints<br/>register / distribute / retail / consume"]
        HIST["getDrugHistory()<br/>public timeline"]
    end

    GR -->|"authorizes roles for"| MB
    GR -->|"authorizes roles for"| SC
    MB -->|"batch identity links"| SC
```

---

## 3. Batch Creation & QR Generation (Manufacturer)

```mermaid
sequenceDiagram
    autonumber
    participant M as Manufacturer
    participant C as Crypto Service
    participant I as IPFS / Pinata
    participant BC as ManufacturerBatch (chain)

    M->>C: Create batch (N units)
    C->>C: Generate per-unit secrets
    C->>C: leaf = keccak256(secret)
    C->>C: Build Merkle tree → root
    C->>I: Upload full Merkle tree
    I-->>C: CID
    C->>BC: registerBatch(root, CID)
    BC-->>C: txHash + batchId
    C->>C: Generate Public QR (batch info)
    C->>C: Generate Hidden QR (secret + proof)
    C-->>M: Printable QR pairs per unit
```

---

## 4. Two QR Codes — Public vs Hidden

```mermaid
flowchart TB
    UNIT["Single Drug Unit"]

    UNIT --> PUB["PUBLIC QR<br/>(outside packaging)"]
    UNIT --> HID["HIDDEN QR<br/>(under scratch layer)"]

    PUB --> PUBDATA["batchId, drug name,<br/>manufacturer, expiry"]
    PUBDATA --> PUBSCAN["Anyone scans →<br/>read-only lookup (eth_call)<br/>0 gas, repeatable"]

    HID --> HIDDATA["unit secret + Merkle proof"]
    HIDDATA --> HIDSCAN["Consumer scans once →<br/>verifyAndBurn() (write)<br/>burns the unit forever"]

    PUBSCAN --> RESULT1["Confirms batch is GENUINE<br/>(but not single-use)"]
    HIDSCAN --> RESULT2["Confirms THIS unit is<br/>genuine AND unused"]
```

---

## 5. Consumer Verification & Burn (Anti-Clone Core)

```mermaid
sequenceDiagram
    autonumber
    participant U as Consumer (PWA)
    participant B as Backend / Relayer
    participant BC as ManufacturerBatch (chain)

    U->>U: Scan Hidden QR → secret + proof
    U->>U: localHash = keccak256(secret)
    U->>B: Submit { batchId, leaf, proof }
    B->>BC: verifyAndBurn(batchId, leaf, proof)

    alt Merkle proof invalid
        BC-->>B: revert → FAKE
        B-->>U: COUNTERFEIT (not in batch)
    else Already consumed
        BC-->>B: revert → ALREADY_USED
        B-->>U: CLONE / REPLAY DETECTED
    else Valid & unused
        BC->>BC: set isConsumed = true
        BC-->>B: success + txHash
        B-->>U: GENUINE ✅ (now burned)
    end
```

---

## 6. Why Only One Copy Can Ever Pass

```mermaid
flowchart TB
    START["Hidden QR scanned"]
    START --> Q1{"Leaf in Merkle tree?<br/>(proof verifies vs root)"}

    Q1 -->|No| FAKE["FAKE<br/>fabricated / not from manufacturer"]
    Q1 -->|Yes| Q2{"isConsumed == false?"}

    Q2 -->|"No (already burned)"| CLONE["CLONE / REPLAY<br/>a real code was copied,<br/>but original already redeemed"]
    Q2 -->|"Yes (first time)"| GENUINE["GENUINE<br/>burn now → isConsumed = true"]

    GENUINE --> AFTER["Any future scan of the<br/>same code → CLONE branch"]
```

---

## 7. Consortium Governance (M-of-N Voting)

```mermaid
sequenceDiagram
    autonumber
    participant R1 as Regulator A (proposer)
    participant R2 as Regulator B
    participant GR as GovernmentRegistry (chain)

    R1->>GR: createProposal(action, target, data)
    GR-->>R1: proposalId (sequential, from _nextProposalId)
    Note over GR: status = Pending, approvals = 1

    R2->>GR: vote(proposalId, true)
    GR->>GR: approvals++
    alt approvals >= threshold (2-of-3)
        GR->>GR: execute action (e.g. register/revoke entity)
        GR-->>R2: status = Executed
    else below threshold
        GR-->>R2: status = Pending
    end
```

---

## 8. Dual-Chain Deployment (Sepolia L1 vs Arbitrum L2)

```mermaid
flowchart LR
    subgraph DEPLOY["Same bytecode, two networks"]
        direction TB
        SRC["Solidity contracts<br/>(Hardhat)"]
    end

    SRC --> S["Ethereum Sepolia (L1)<br/>baseline security<br/>higher gas price, slower finality"]
    SRC --> A["Arbitrum Sepolia (L2)<br/>rollup, inherits L1 security<br/>~55x cheaper gas price, faster confirm"]

    S --> CMP["Comparative Analysis<br/>(benchmark.js + benchmark-operations.js)"]
    A --> CMP

    CMP --> M1["gas units (deterministic)"]
    CMP --> M2["USD cost (live gas price x ETH/USD)"]
    CMP --> M3["confirmation latency"]
```

---

## 9. End-to-End Lifecycle (Top to Bottom)

```mermaid
flowchart TB
    A["1. Manufacturer creates batch<br/>Merkle root → chain, tree → IPFS"]
    A --> B["2. Public + Hidden QR pair<br/>printed per unit"]
    B --> C["3. Distributor scans Public QR<br/>→ distribute checkpoint (SupplyChainTracker)"]
    C --> D["4. Retailer scans Public QR<br/>→ retail checkpoint"]
    D --> E["5. Consumer scans Public QR<br/>→ free genuineness lookup"]
    E --> F["6. Consumer scans Hidden QR<br/>→ verifyAndBurn (one-time)"]
    F --> G{"Result"}
    G --> H["GENUINE → unit burned"]
    G --> I["COUNTERFEIT → not in tree"]
    G --> J["CLONE → already consumed"]

    K["Regulators (consortium)<br/>govern roles/revocations in parallel"]
    K -.->|"M-of-N votes"| A
```

---

## Notes

- **No Hyperledger Fabric** is used. "Consortium" here refers to the on-chain **M-of-N
  governance** in `GovernmentRegistry.sol`, running on public EVM chains.
- The same three contracts are deployed to **both** Ethereum Sepolia and Arbitrum Sepolia;
  `ACTIVE_NETWORK` selects which chain the backend writes to at runtime.
- Anti-clone protection is the combination of **(a)** Merkle-proof membership (blocks fakes)
  and **(b)** the one-time `isConsumed` burn (blocks copies of real codes).
