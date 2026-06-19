# Your Account Setup & Deployment Guide

## Account Structure

Your MetaMask accounts are configured as follows:

| Account | Role | Address | Purpose |
|---------|------|---------|---------|
| 1 | Gov Regulator | 0x... | Deployer + Voting Member |
| 2 | Gov Regulator | 0x... | Voting Member |
| 3 | Gov Regulator | 0x... | Voting Member |
| 4 | Manufacturer | 0x... | Can register batches |
| 5 | Distributor | 0x... | Can scan & track shipments |
| 6 | Retailer | 0x... | Can sell & verify |

### Governance Model: 2-of-3 Voting

- **Voting Members**: Accounts 1, 2, 3 (Government Regulators)
- **Threshold**: 2 (any 2 of 3 must approve)
- **Trigger**: Register/revoke/reinstate manufacturers, distributors, retailers
- **Example**: Account 1 proposes to register Manufacturer X → Account 2 votes YES → Proposal auto-executes ✓

---

## Step 1: Extract Your Account Addresses from MetaMask

Open MetaMask and get the address for each account:

1. Click on **Account 1** → Click the account icon to copy address
   ```
   Account 1 Address: 0x...
   ```

2. Repeat for **Account 2** through **Account 6**
   ```
   Account 2 Address: 0x...
   Account 3 Address: 0x...
   Account 4 Address: 0x...
   Account 5 Address: 0x...
   Account 6 Address: 0x...
   ```

---

## Step 2: Get Your Account 1 Private Key (Deployer)

**IMPORTANT: Use Account 1 ONLY. This is your deployer and Regulator 1.**

In MetaMask:
1. Click on **Account 1** (to make sure it's selected)
2. Click the three dots (**⋯**) → **Account Details**
3. Click **Export Private Key**
4. Enter your MetaMask password
5. Copy the private key (starts with `0x`)

**Security**: Never share this key. It will deploy your contracts.

---

## Step 3: Fund Account 1 with Test ETH

Your deployer needs Arbitrum Sepolia test ETH.

1. Go to [Arbitrum Sepolia Faucet](https://faucet.quicknode.com/arbitrum/sepolia)
2. Paste your **Account 1 Address**
3. Request test ETH (~0.5 ETH is plenty)
4. Wait for confirmation

---

## Step 4: Configure blockchain/.env

Create `blockchain/.env` with your values:

```bash
# Deployer (Account 1)
DEPLOYER_PRIVATE_KEY=0xyour_account_1_private_key

# RPC URLs
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your-infura-key
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# Governance (2-of-3 Voting)
GOVERNANCE_REGULATORS='["0xAccount1Address","0xAccount2Address","0xAccount3Address"]'
GOVERNANCE_THRESHOLD=2

# Block explorers (optional, for verify)
ETHERSCAN_API_KEY=your_etherscan_key
ARBISCAN_API_KEY=your_arbiscan_key
```

**Paste your actual addresses** for Accounts 1, 2, and 3.

---

## Step 5: Deploy to Arbitrum Sepolia

```bash
cd blockchain
npm install  # if not already done
npm run deploy:arbitrum
```

This will:
1. Compile contracts
2. Deploy GovernmentRegistry, ManufacturerBatch, SupplyChainTracker
3. Initialize governance with Accounts 1, 2, 3 as regulators (2-of-3)
4. Print the three contract addresses
5. Print the backend `.env` block you need to copy

**Example output:**
```
✓ Contracts compiled
✓ Deploying to arbitrumSepolia...
✓ GovernmentRegistry: 0xABC123...
✓ ManufacturerBatch: 0xDEF456...
✓ SupplyChainTracker: 0xGHI789...

🎯 Add these to backend/.env:
GOVERNMENT_REGISTRY_ADDRESS=0xABC123...
MANUFACTURER_BATCH_ADDRESS=0xDEF456...
SUPPLY_CHAIN_TRACKER_ADDRESS=0xGHI789...
ACTIVE_NETWORK=arbitrum
```

---

## Step 6: Configure backend/.env

Create `backend/.env` with the addresses from deploy output:

```bash
# Network
ACTIVE_NETWORK=arbitrum
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
ARBITRUM_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# Contract addresses (from deploy output)
GOVERNMENT_REGISTRY_ADDRESS=0xABC123...
MANUFACTURER_BATCH_ADDRESS=0xDEF456...
SUPPLY_CHAIN_TRACKER_ADDRESS=0xGHI789...

# Government Accounts
GOVERNMENT_PRIVATE_KEY=0xyour_account_1_private_key
GOVERNMENT_REGULATOR_2=0xAccount2Address
GOVERNMENT_REGULATOR_3=0xAccount3Address

# Actor Accounts
MANUFACTURER_ACCOUNT=0xAccount4Address
DISTRIBUTOR_ACCOUNT=0xAccount5Address
RETAILER_ACCOUNT=0xAccount6Address

# Other config
PINATA_GATEWAY=https://gateway.pinata.cloud/ipfs
FRONTEND_URL=http://localhost:3000
PWA_URL=http://localhost:3001
SIWE_DOMAIN=localhost
SIWE_STATEMENT=Sign in to Pharma Anti-Counterfeit System
```

---

## Step 7: Test the Governance System

```bash
cd blockchain
npx hardhat run scripts/test-governance.js --network arbitrumSepolia
```

This demonstrates:
1. Account 1 (Regulator 1) proposes to register a manufacturer
2. Account 1 auto-votes YES (1/2)
3. Account 2 (Regulator 2) votes YES
4. Threshold reached (2/2) → Proposal auto-executes
5. Manufacturer is now registered on-chain ✓

---

## Step 8: Test the Backend API

Start the backend server:

```bash
cd backend
npm install
npm start
```

Test governance endpoints:

```bash
# Get current governance status
curl -X POST http://localhost:4000/api/government/governance/status

# Propose registering a manufacturer
curl -X POST http://localhost:4000/api/government/entities/propose/register \
  -H "Content-Type: application/json" \
  -d '{
    "wallet": "0xAccount4Address",
    "name": "PharmaCorp Inc",
    "licenseNumber": "PHM-2024-001",
    "role": "manufacturer"
  }'

# Vote on a proposal (proposalId from the response above)
curl -X POST http://localhost:4000/api/government/governance/proposals/1/vote \
  -H "Content-Type: application/json" \
  -d '{"voterAddress": "0xAccount2Address", "vote": true}'
```

---

## Account Usage in Flow

### Scenario: Register a New Manufacturer

1. **Account 1** (Gov Regulator) uses the UI to propose:
   - Wallet: 0xAccount4Address (Manufacturer)
   - Name: "PharmaCorp Inc"
   - License: "PHM-2024-001"
   - Role: "manufacturer"

2. **Voting happens** (2-of-3 threshold):
   - Account 1 votes YES (auto-voted when proposing)
   - Account 2 votes YES → **Threshold met!**
   - Account 3 votes NO (too late; already executed)

3. **Result**: Manufacturer is registered on-chain. Account 4 can now register batches.

### Scenario: Distributor Tracks a Shipment

1. Account 4 (Manufacturer) registers a batch
2. Account 5 (Distributor) scans public QR → updates supply chain
3. Account 6 (Retailer) scans public QR → updates supply chain
4. Consumer scans hidden QR → verifies authenticity

---

## What Each Account Can Do

| Account | Can Propose | Can Vote | Can Register Batches | Can Scan QR | Can Verify |
|---------|-------------|----------|----------------------|-------------|-----------|
| 1 (Gov) | ✓ | ✓ | ✗ | ✗ | ✓ (verify only) |
| 2 (Gov) | ✓ | ✓ | ✗ | ✗ | ✓ (verify only) |
| 3 (Gov) | ✓ | ✓ | ✗ | ✗ | ✓ (verify only) |
| 4 (Mfg) | ✗ | ✗ | ✓ | ✓ | ✓ |
| 5 (Dist) | ✗ | ✗ | ✗ | ✓ | ✓ |
| 6 (Retail) | ✗ | ✗ | ✗ | ✓ | ✓ |

---

## Troubleshooting

### Deploy fails with "insufficient funds"
- Fund Account 1 with more test ETH
- Use the Arbitrum Sepolia Faucet

### Governance not initialized
- Check that `GOVERNANCE_REGULATORS` and `GOVERNANCE_THRESHOLD` are set in `blockchain/.env`
- Re-run deploy: `npm run deploy:arbitrum`

### Voting not working
- Ensure the voter address is one of the registered regulators (Accounts 1, 2, or 3)
- Check that proposal hasn't expired (7 days max)

### Backend can't connect to contracts
- Verify contract addresses in `backend/.env` match deploy output
- Check RPC URL is correct for Arbitrum Sepolia
- Ensure `ACTIVE_NETWORK=arbitrum`

---

## Quick Reference

| Task | Command |
|------|---------|
| Deploy | `cd blockchain && npm run deploy:arbitrum` |
| Test governance | `npx hardhat run scripts/test-governance.js --network arbitrumSepolia` |
| Start backend | `cd backend && npm start` |
| Check status | `curl -X POST http://localhost:4000/api/government/governance/status` |

---

## Next Steps After Deployment

1. ✅ Deploy to Arbitrum Sepolia
2. ✅ Test governance voting
3. ➡️ **Set up Redis caching** (for 7s → 2s latency improvement)
4. ➡️ **Implement optimistic verification** (further latency improvement)
5. ➡️ **Deploy to Arbitrum mainnet** (when ready for production)

Good luck! 🚀
