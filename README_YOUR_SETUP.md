# Quick Reference: Your Deployment Setup

## Account Structure (Your Setup)

```
Account 1 ━━ Government Regulator (DEPLOYER & Voting Member)
Account 2 ━━ Government Regulator (Voting Member)
Account 3 ━━ Government Regulator (Voting Member)
           ┗━ 2-of-3 Voting: Any 2 can approve actions

Account 4 ━━ Manufacturer (Can register batches)
Account 5 ━━ Distributor (Can track shipments)
Account 6 ━━ Retailer (Can verify at POS)
```

---

## Commands You'll Run

### 1️⃣ Compile Contracts
```bash
cd blockchain && npx hardhat compile
```

### 2️⃣ Deploy to Arbitrum Sepolia
```bash
cd blockchain && npm run deploy:arbitrum
```
Outputs 3 contract addresses → copy to backend/.env

### 3️⃣ Test Governance Voting
```bash
cd blockchain && npx hardhat run scripts/test-governance.js --network arbitrumSepolia
```

### 4️⃣ Start Backend
```bash
cd backend && npm start
```
Runs on `http://localhost:4000`

### 5️⃣ Test Voting via API
```bash
curl -X POST http://localhost:4000/api/government/governance/status
```

---

## Environment Files

### blockchain/.env
```
DEPLOYER_PRIVATE_KEY=0x...          ← Account 1 private key
ARBITRUM_SEPOLIA_RPC_URL=...        ← Arbitrum RPC
GOVERNANCE_REGULATORS=['0x...']     ← Accounts 1, 2, 3 addresses
GOVERNANCE_THRESHOLD=2              ← 2-of-3 voting
```

### backend/.env
```
ACTIVE_NETWORK=arbitrum
GOVERNMENT_REGISTRY_ADDRESS=0x...   ← From deploy output
MANUFACTURER_BATCH_ADDRESS=0x...    ← From deploy output
SUPPLY_CHAIN_TRACKER_ADDRESS=0x...  ← From deploy output

GOVERNMENT_PRIVATE_KEY=0x...        ← Account 1 key
GOVERNMENT_REGULATOR_2=0x...        ← Account 2 address
GOVERNMENT_REGULATOR_3=0x...        ← Account 3 address
MANUFACTURER_ACCOUNT=0x...          ← Account 4 address
DISTRIBUTOR_ACCOUNT=0x...           ← Account 5 address
RETAILER_ACCOUNT=0x...              ← Account 6 address
```

---

## Voting Flow (Example)

```
Account 1 proposes: "Register PharmaCorp as Manufacturer"
    ↓
Account 1 auto-votes YES (1/2 votes)
    ↓
Account 2 votes YES
    ↓
Threshold reached (2/2) → Proposal AUTO-EXECUTES ✓
    ↓
PharmaCorp is now registered on-chain
    ↓
Account 4 (Manufacturer) can now register batches
```

---

## API Endpoints (Governance)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/governance/status` | POST | Get current regulators & threshold |
| `/entities/propose/register` | POST | Propose entity registration |
| `/entities/propose/revoke` | POST | Propose entity revocation |
| `/governance/proposals/:id/vote` | POST | Vote on a proposal |
| `/governance/proposals/:id` | GET | Get proposal details |
| `/governance/proposals` | GET | List all proposals |

See **API_REFERENCE.md** for full documentation.

---

## Funding Account 1 (Deployer)

1. Get Account 1 address from MetaMask
2. Go to https://faucet.quicknode.com/arbitrum/sepolia
3. Paste address, request test ETH
4. Wait ~2 minutes
5. Verify on https://sepolia.arbiscan.io/

---

## Files to Read

| File | Purpose |
|------|---------|
| `YOUR_ACCOUNT_SETUP.md` | Detailed setup with your accounts |
| `DEPLOYMENT_STEPS.md` | Step-by-step deployment checklist |
| `QUICK_START.md` | 5-minute quick start |
| `GOVERNANCE.md` | Full governance documentation |
| `API_REFERENCE.md` | Complete API documentation |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Deploy fails | Fund Account 1 with test ETH |
| No governance | Check `GOVERNANCE_REGULATORS` in blockchain/.env |
| Voting fails | Ensure voter is Account 1, 2, or 3 |
| Backend can't connect | Check contract addresses in backend/.env |

---

## One-Minute Summary

1. Fund Account 1 with test ETH
2. Create `blockchain/.env` with your account addresses and key
3. Run `npm run deploy:arbitrum` in the blockchain folder
4. Copy contract addresses to `backend/.env`
5. Run `npm start` in backend folder
6. Test with `curl http://localhost:4000/api/government/governance/status`

**That's it!** Your 2-of-3 voting system is live on Arbitrum Sepolia. 🚀

---

## What Happens Next

After deployment:
- **Phase 1** (current): Test governance voting ← You are here
- **Phase 2**: Implement Redis caching (7s → 2s latency)
- **Phase 3**: Optimistic verification (2s → sub-1s)
- **Phase 4**: Production deployment to mainnet
