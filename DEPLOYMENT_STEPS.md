# Deployment Steps (Step-by-Step)

## Pre-Deployment Checklist

- [ ] MetaMask installed with 6 accounts configured
- [ ] Account 1 is the deployer (Government Regulator)
- [ ] Accounts 2, 3 also created (Government Regulators)
- [ ] Accounts 4, 5, 6 created (Mfg, Distributor, Retailer)
- [ ] Read `YOUR_ACCOUNT_SETUP.md`

---

## Step 1: Extract Your Account Addresses

Open MetaMask and copy each account's address:

```
[ ] Account 1 (Gov Reg): 0x ____________________________________
[ ] Account 2 (Gov Reg): 0x ____________________________________
[ ] Account 3 (Gov Reg): 0x ____________________________________
[ ] Account 4 (Mfg):    0x ____________________________________
[ ] Account 5 (Dist):   0x ____________________________________
[ ] Account 6 (Retail): 0x ____________________________________
```

---

## Step 2: Fund Account 1 with Test ETH

- [ ] Go to https://faucet.quicknode.com/arbitrum/sepolia
- [ ] Paste Account 1 address
- [ ] Request test ETH
- [ ] Wait for confirmation (~2 minutes)
- [ ] Verify balance on Arbiscan

---

## Step 3: Export Account 1 Private Key

**CRITICAL: Use ONLY Account 1 for deployer key**

- [ ] Open MetaMask
- [ ] Select **Account 1** (make sure it's highlighted)
- [ ] Click **⋯** (three dots) in top-right
- [ ] Click **Account Details**
- [ ] Click **Export Private Key**
- [ ] Enter your MetaMask password
- [ ] Copy the key (starts with `0x`)

```
Account 1 Private Key: 0x ____________________________________
```

---

## Step 4: Create blockchain/.env

In `/vercel/share/v0-project/blockchain/.env`:

```bash
DEPLOYER_PRIVATE_KEY=0x<paste_your_account_1_key>
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
GOVERNANCE_REGULATORS='["0xAccount1Address","0xAccount2Address","0xAccount3Address"]'
GOVERNANCE_THRESHOLD=2
ARBISCAN_API_KEY=<optional_for_verification>
```

- [ ] Replace `0xAccount1Address`, `0xAccount2Address`, `0xAccount3Address` with your actual addresses
- [ ] Keep the square brackets and commas exactly as shown
- [ ] Save the file

---

## Step 5: Deploy Contracts to Arbitrum Sepolia

```bash
cd blockchain
npm install  # only needed first time
npm run deploy:arbitrum
```

- [ ] Wait for compilation
- [ ] Wait for deployment
- [ ] Copy the three contract addresses from output:

```
GovernmentRegistry:     0x ____________________________________
ManufacturerBatch:      0x ____________________________________
SupplyChainTracker:     0x ____________________________________
```

---

## Step 6: Create backend/.env

In `/vercel/share/v0-project/backend/.env`:

```bash
PORT=4000
NODE_ENV=development

ACTIVE_NETWORK=arbitrum
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
ARBITRUM_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

GOVERNMENT_REGISTRY_ADDRESS=0x<from_deploy_output>
MANUFACTURER_BATCH_ADDRESS=0x<from_deploy_output>
SUPPLY_CHAIN_TRACKER_ADDRESS=0x<from_deploy_output>

GOVERNMENT_PRIVATE_KEY=0x<account_1_private_key>
GOVERNMENT_REGULATOR_2=0x<account_2_address>
GOVERNMENT_REGULATOR_3=0x<account_3_address>

MANUFACTURER_ACCOUNT=0x<account_4_address>
DISTRIBUTOR_ACCOUNT=0x<account_5_address>
RETAILER_ACCOUNT=0x<account_6_address>

PINATA_GATEWAY=https://gateway.pinata.cloud/ipfs
FRONTEND_URL=http://localhost:3000
PWA_URL=http://localhost:3001
SIWE_DOMAIN=localhost
SIWE_STATEMENT=Sign in to Pharma Anti-Counterfeit System
```

- [ ] Paste all contract addresses from Step 5
- [ ] Paste your account addresses and private key
- [ ] Save the file

---

## Step 7: Test Governance (Optional but Recommended)

```bash
cd blockchain
npx hardhat run scripts/test-governance.js --network arbitrumSepolia
```

- [ ] Should complete without errors
- [ ] Should show proposal creation, voting, and execution
- [ ] Output confirms governance works

---

## Step 8: Start Backend Server

```bash
cd backend
npm install  # only needed first time
npm start
```

- [ ] Should print: `Server listening on port 4000`
- [ ] Leave this running in a terminal

---

## Step 9: Test Backend API

In a new terminal:

```bash
# Test governance status
curl -X POST http://localhost:4000/api/government/governance/status
```

- [ ] Should return JSON with regulator addresses and threshold
- [ ] Confirms backend can communicate with contracts

---

## Step 10: Verify Governance Works

```bash
# Propose registering Account 4 (Manufacturer)
curl -X POST http://localhost:4000/api/government/entities/propose/register \
  -H "Content-Type: application/json" \
  -d '{
    "wallet": "0x<account_4_address>",
    "name": "PharmaCorp Inc",
    "licenseNumber": "PHM-001",
    "role": "manufacturer"
  }'
```

- [ ] Should return a proposal ID
- [ ] Copy the proposal ID for next step

---

## Step 11: Vote on the Proposal

```bash
# Vote YES on the proposal (e.g., proposalId=1)
curl -X POST http://localhost:4000/api/government/governance/proposals/1/vote \
  -H "Content-Type: application/json" \
  -d '{
    "voterAddress": "0x<account_2_address>",
    "vote": true
  }'
```

- [ ] Should return proposal execution confirmation
- [ ] Check response for "executed: true"
- [ ] Governance voting works!

---

## 🎉 Deployment Complete!

You now have:

- [ ] Contracts deployed to Arbitrum Sepolia
- [ ] M-of-N governance initialized (2-of-3 voting)
- [ ] Backend running and connected
- [ ] Voting system tested and working

**Next Steps:**
1. Read `GOVERNANCE.md` to understand the voting flow
2. Read `API_REFERENCE.md` for all available endpoints
3. Integrate the PWA (patient consumer app) with the backend
4. Test real verification scenarios (Mfg batch → Distributor scan → Retailer scan → Consumer verify)

---

## Troubleshooting

### "Invalid private key"
- Ensure the key starts with `0x`
- Ensure it's 66 characters total (0x + 64 hex chars)
- Re-export from MetaMask Account 1 if unsure

### "Insufficient funds"
- Account 1 needs test ETH
- Request from Arbitrum Sepolia Faucet
- Wait ~2 minutes for confirmation

### "Cannot connect to contracts"
- Verify addresses in `backend/.env` are correct
- Verify `ACTIVE_NETWORK=arbitrum`
- Check RPC URL is Arbitrum Sepolia (not mainnet)

### "Governance not initialized"
- Check `blockchain/.env` has `GOVERNANCE_REGULATORS` and `GOVERNANCE_THRESHOLD`
- Re-run: `npm run deploy:arbitrum`

### "Vote not working"
- Ensure voter is one of the registered regulators (Accounts 1, 2, or 3)
- Ensure proposal hasn't expired (7 days max)
- Check proposal status with GET `/api/government/governance/proposals/:id`

---

**You're all set! 🚀**
