# 💊 PharmaChain — Blockchain-Based Pharmaceutical Anti-Counterfeiting System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue.svg)](https://soliditylang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2.5-black.svg)](https://nextjs.org/)
[![Ethereum](https://img.shields.io/badge/Network-Sepolia-purple.svg)](https://sepolia.etherscan.io/)

A government-backed, blockchain-powered pharmaceutical anti-counterfeiting system that ensures every medicine strip is authentic, traceable, and tamper-proof — from manufacturer to patient.

---

## 🎯 Overview

PharmaChain uses Ethereum smart contracts, Merkle trees, IPFS, and dual QR authentication to create an end-to-end verifiable pharmaceutical supply chain. The system enables:

- **Governments** to register and revoke licensed entities
- **Manufacturers** to register drug batches cryptographically
- **Distributors & Retailers** to record custody transfers on-chain
- **Consumers** to verify medicine authenticity via a zero-install PWA

---

## 🏗️ System Architecture
GOVERNMENT
↓ whitelists entities
MANUFACTURER → generates batch → uploads to IPFS → registers on blockchain
↓ physical packaging (Public QR + Hidden QR under scratch foil)
DISTRIBUTOR → scans Public QR → records on blockchain
↓
RETAILER → scans Public QR → records on blockchain
↓
CONSUMER → scratches foil → scans Hidden QR → verifies on blockchain
↓
RESULT: ✅ Authentic / ⚠️ Expired / 🚨 Fake / 🔁 Already Used
↓
GOVERNMENT DASHBOARD → monitors nationwide

### Five Layers:
| Layer | Component | Purpose |
|---|---|---|
| 1 | GovernmentRegistry.sol | Root of trust — entity whitelist |
| 2 | ManufacturerBatch.sol + crypto-service | Batch registration + Merkle tree |
| 3 | SupplyChainTracker.sol + supply-chain-portal | Supply chain state machine |
| 4 | Patient PWA | Consumer verification |
| 5 | Anomaly Detection + Gov Dashboard | Monitoring & analytics |

---

## 🔐 Smart Contracts (Sepolia Testnet)

| Contract | Address |
|---|---|
| GovernmentRegistry | `0x1bAcA1Db16Ae6B26FC34C33631B6cE111FC72532` |
| ManufacturerBatch | `0x9086C86C27Cb3D15834759DC0032A4Ca22DCe952` |
| SupplyChainTracker | `0xBA8157f9bE3339e955CCCf49590351476eBa14a5` |

> Verify on [Sepolia Etherscan](https://sepolia.etherscan.io/)

---

## 🛠️ Tech Stack

### Blockchain
- **Solidity 0.8.20** — Smart contracts
- **Hardhat 2.28.0** — Development & deployment
- **OpenZeppelin 5.0.2** — MerkleProof, Ownable
- **Ethers.js 6.13.4** — Blockchain interaction

### Backend
- **Node.js v22.14.0** — Runtime
- **Express 4.19.2** — REST API
- **SIWE 2.3.2** — Sign-In With Ethereum
- **merkletreejs 0.4.0** — Merkle proof generation
- **Pinata SDK 2.1.0** — IPFS storage

### Frontend
- **Next.js 14.2.5** — Supply chain portal + Patient PWA
- **Zustand 4.5.4** — State management
- **Ethers.js 6.13.4** — MetaMask integration
- **Axios 1.7.7** — API client

### Storage
- **IPFS via Pinata** — Merkle tree storage
- **JSON files** — Off-chain mock database

---

## 📁 Project Structure
pharma-anticounterfeit/
├── blockchain/                    # Smart contracts
│   ├── contracts/
│   │   ├── GovernmentRegistry.sol
│   │   ├── ManufacturerBatch.sol
│   │   └── SupplyChainTracker.sol
│   ├── scripts/deploy.js
│   └── test/contracts.test.js
│
├── crypto-service/                # Batch generation
│   └── src/
│       ├── generateBatch.js       # Master batch script
│       ├── merkle.js              # Merkle tree builder
│       ├── qrGenerator.js         # Dual QR generation
│       ├── ipfs.js                # Pinata integration
│       ├── utils.js               # Crypto helpers
│       └── setupRegistry.js       # Entity whitelisting
│
├── backend/                       # Express API
│   └── src/
│       ├── config/contracts.js    # ABI + contract instances
│       ├── db/                    # JSON mock databases
│       ├── middleware/            # SIWE auth + role guard
│       ├── routes/                # API routes
│       └── services/              # Business logic
│
├── supply-chain-portal/           # Next.js (port 3000)
│   └── app/
│       ├── dashboard/             # Role-based dashboard
│       ├── manufacture/           # Manufacturer portal
│       ├── distribute/            # Distributor portal
│       ├── retail/                # Retailer portal
│       ├── track/                 # Public drug tracker
│       └── government/            # Gov regulatory dashboard
│
└── patient-pwa/                   # Next.js PWA (port 3001)
└── app/
├── verify/                # Hidden QR verification
└── track/                 # Public QR tracking

---

## ⚙️ Prerequisites

- Node.js v22.14.0
- MetaMask browser extension
- Alchemy account (Sepolia RPC)
- Pinata account (IPFS)
- Git

---

## 🚀 Installation & Setup

### 1. Clone the repository

```bash
git clone https://github.com/Md-Ashikul/pharma-anticounterfeit.git
cd pharma-anticounterfeit
```

### 2. Install dependencies

```bash
# Blockchain
cd blockchain && npm install

# Crypto service
cd ../crypto-service && npm install

# Backend
cd ../backend && npm install

# Supply chain portal
cd ../supply-chain-portal && npm install

# Patient PWA
cd ../patient-pwa && npm install
```

### 3. Configure environment variables

Create `.env` files based on the examples below:

**`blockchain/.env`**
```bash
SEPOLIA_RPC_URL=your_alchemy_sepolia_url
DEPLOYER_PRIVATE_KEY=your_deployer_private_key
```

**`crypto-service/.env`**
```bash
PINATA_API_KEY=your_pinata_api_key
PINATA_API_SECRET=your_pinata_api_secret
GOVERNMENT_REGISTRY_ADDRESS=0x1bAcA1Db16Ae6B26FC34C33631B6cE111FC72532
MANUFACTURER_BATCH_ADDRESS=0x9086C86C27Cb3D15834759DC0032A4Ca22DCe952
SUPPLY_CHAIN_TRACKER_ADDRESS=0xBA8157f9bE3339e955CCCf49590351476eBa14a5
RPC_URL=your_alchemy_sepolia_url
GOVERNMENT_PRIVATE_KEY=your_government_wallet_private_key
MANUFACTURER_PRIVATE_KEY=your_manufacturer_wallet_private_key
APP_BASE_URL=http://localhost:3001
```

**`backend/.env`**
```bash
PORT=4000
NODE_ENV=development
RPC_URL=your_alchemy_sepolia_url
GOVERNMENT_REGISTRY_ADDRESS=0x1bAcA1Db16Ae6B26FC34C33631B6cE111FC72532
MANUFACTURER_BATCH_ADDRESS=0x9086C86C27Cb3D15834759DC0032A4Ca22DCe952
SUPPLY_CHAIN_TRACKER_ADDRESS=0xBA8157f9bE3339e955CCCf49590351476eBa14a5
GOVERNMENT_PRIVATE_KEY=your_government_wallet_private_key
MANUFACTURER_PRIVATE_KEY=your_manufacturer_wallet_private_key
DISTRIBUTOR_PRIVATE_KEY=your_distributor_wallet_private_key
RETAILER_PRIVATE_KEY=your_retailer_wallet_private_key
PINATA_GATEWAY=https://gateway.pinata.cloud/ipfs
FRONTEND_URL=http://localhost:3000
PWA_URL=http://localhost:3001
SIWE_DOMAIN=localhost
SIWE_STATEMENT=Sign in to the Pharma Anti-Counterfeit Supply Chain Portal
```

**`supply-chain-portal/.env.local`**
```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_HARDHAT_CHAIN_ID=11155111
```

**`patient-pwa/.env.local`**
```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_PORTAL_URL=http://localhost:3000
```

---

## 🏃 Running the System

### Option A — Sepolia Testnet (Recommended)

Contracts are already deployed. Just run the services:

```bash
# Terminal 1 — Backend API
cd backend
npm run dev

# Terminal 2 — Supply Chain Portal
cd supply-chain-portal
npm run dev

# Terminal 3 — Patient PWA
cd patient-pwa
npm run dev
```

### Option B — Local Hardhat Node

```bash
# Terminal 1 — Start local blockchain
cd blockchain
npx hardhat node

# Terminal 2 — Deploy contracts + setup
npx hardhat run scripts/deploy.js --network localhost
cd ../crypto-service
node src/setupRegistry.js
node src/generateBatch.js

# Terminal 3 — Backend
cd backend && npm run dev

# Terminal 4 — Supply Chain Portal
cd supply-chain-portal && npm run dev

# Terminal 5 — Patient PWA
cd patient-pwa && npm run dev
```

---

## 🌐 Service URLs

| Service | URL | Users |
|---|---|---|
| Backend API | http://localhost:4000 | All services |
| Supply Chain Portal | http://localhost:3000 | Manufacturer, Distributor, Retailer, Government |
| Patient PWA | http://localhost:3001 | Consumers |

---

## 👥 MetaMask Setup

### Add Sepolia Network
Sepolia is built into MetaMask — just enable **"Show test networks"** in settings.

### Wallet Roles
| Role | MetaMask Account |
|---|---|
| Government | Account 1 |
| Manufacturer | Account 2 |
| Distributor | Account 3 |
| Retailer | Account 4 |

---

## 📡 API Endpoints

### Government
GET  /api/government/entities          — List all entities
GET  /api/government/entities/:wallet  — Get entity by wallet
POST /api/government/entities/register — Register new entity
POST /api/government/entities/revoke   — Revoke entity license
POST /api/government/entities/reinstate — Reinstate entity
GET  /api/government/analytics         — National statistics
GET  /api/government/anomalies         — Anomaly logs

### Supply Chain
GET  /api/supply-chain/status/:drugId  — Get drug status + history
POST /api/supply-chain/manufacture     — Register drug (Manufacturer)
POST /api/supply-chain/distribute      — Record distribution
POST /api/supply-chain/retail          — Record retail handoff

### Consumer
POST /api/consumer/verify              — Verify + burn strip
GET  /api/consumer/track/:drugId       — Public tracking
GET  /api/consumer/batch/:batchId      — Batch information

---

## 🔄 Complete User Flow

### 1. Batch Generation (Manufacturer)
```bash
cd crypto-service
node src/generateBatch.js
```
Generates secrets → builds Merkle tree → uploads to IPFS → registers on-chain → creates QR codes

### 2. Supply Chain (Portal)
Manufacturer logs in → registers strip
Distributor logs in → records distribution
Retailer logs in → records retail handoff

### 3. Consumer Verification (PWA)
Scan Hidden QR → PWA opens → hash computed locally →
Merkle proof fetched → verified on-chain → result shown

### 4. Verification Outcomes
| Result | Meaning |
|---|---|
| ✅ Authentic | Valid proof, unused, not expired |
| ⚠️ Authentic Expired | Valid proof, unused, past expiry |
| 🚨 Already Used | Replay attack — possible counterfeit |
| ❌ Fake | Invalid Merkle proof |

---

## 📊 Performance Metrics (Sepolia Testnet)

### Verification Latency
| Operation | Latency |
|---|---|
| Local Hash Computation | ~0 ms |
| IPFS Retrieval | ~7,211 ms |
| Blockchain Verification | ~9,000 ms |
| **Total End-to-End** | **~16,536 ms** |

### Gas Costs
| Operation | Gas Used |
|---|---|
| registerBatch() — 10 strips | 281,534 |
| registerBatch() — 1,000 strips | 264,434 |
| registerDrug() | 188,885 |
| distributeDrug() | 154,549 |
| retailDrug() | 154,507 |
| consumeDrug() | 147,631 |
| verifyAndBurn() | 65,114 |

---

## 🔐 Security Features

| Threat | Protection |
|---|---|
| Counterfeit medicine | Merkle proof verification on-chain |
| QR cloning | One-time burn mechanism |
| Expired medicine | Expiry timestamp on-chain |
| Unauthorized entity | GovernmentRegistry whitelist |
| Out-of-order supply chain | State machine enum |
| Replay attacks | isConsumed mapping + anomaly logging |
| Privacy breach | keccak256(NID) computed locally |
| License fraud | Instant on-chain revocation |

---

## 🧪 Running Tests

```bash
cd blockchain
npx hardhat test
```

Expected: **14 passing**

---

## 📄 Research Paper

This system is the implementation of a research paper submitted to IEEE. Key contributions:

1. **Dual QR Authentication** — Public + Hidden QR for anti-duplication
2. **Merkle Tree Scalability** — Constant O(1) on-chain cost regardless of batch size
3. **Privacy-Preserving Monitoring** — keccak256(NID) computed locally
4. **State Machine Supply Chain** — Prevents out-of-order manipulation
5. **One-Time Burn Mechanism** — Cryptographic anti-replay protection
6. **Government Root of Trust** — Instant nationwide license revocation

---

## 🗺️ Roadmap

- [x] Smart contract development & testing
- [x] Cryptographic batch generation
- [x] IPFS integration via Pinata
- [x] Express.js backend API
- [x] SIWE authentication
- [x] Supply chain portal (Next.js)
- [x] Patient PWA (Next.js)
- [x] Government regulatory dashboard
- [x] Sepolia testnet deployment
- [ ] Vercel frontend deployment
- [ ] Railway backend deployment
- [ ] Layer-2 integration (Polygon/Arbitrum)
- [ ] DID integration
- [ ] AI-based anomaly detection
- [ ] Mobile QR scanner integration

---

## 🤝 Contributing

This is a research project. For questions or collaboration:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

## ⚠️ Disclaimer

This system is deployed on **Sepolia Testnet** for research purposes. The Sepolia ETH used has no real monetary value. Do not use real private keys or mainnet ETH.

---

## 📜 License

MIT License — see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgements

- [OpenZeppelin](https://openzeppelin.com/) — Smart contract libraries
- [Hardhat](https://hardhat.org/) — Ethereum development environment
- [Pinata](https://pinata.cloud/) — IPFS pinning service
- [Alchemy](https://alchemy.com/) — Blockchain infrastructure
- [Ethers.js](https://ethers.org/) — Ethereum JavaScript library