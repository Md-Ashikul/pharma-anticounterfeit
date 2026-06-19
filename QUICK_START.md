# ⚡ Quick Start — M-of-N Governance

## TL;DR

You now have **M-of-N blockchain voting** for regulatory approvals. Deploy to Arbitrum, set up regulators, and start voting.

---

## 📦 What's New (in 60 seconds)

| Component | Change |
|-----------|--------|
| **GovernmentRegistry.sol** | Voting system (was: single owner) |
| **Backend API** | 11 new governance endpoints |
| **Deploy script** | Auto-initializes M-of-N |
| **Docs** | 4 complete guides + 1 API reference |
| **Test script** | Full demo of voting flow |

---

## 🚀 Deploy to Arbitrum (5 minutes)

### Step 1: Fund wallet
```bash
# Your existing MetaMask Account 1
# Get test ETH: https://faucet.quicknode.com/arbitrum/sepolia
```

### Step 2: Set env vars
```bash
# blockchain/.env
DEPLOYER_PRIVATE_KEY=0x...  # from MetaMask
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# Optional: Set up M-of-N
GOVERNANCE_REGULATORS='["0x111...","0x222...","0x333..."]'
GOVERNANCE_THRESHOLD=2
```

### Step 3: Deploy
```bash
cd blockchain
npm run deploy:arbitrum
```

### Step 4: Update backend
```bash
# backend/.env
ACTIVE_NETWORK=arbitrum
ARBITRUM_GOVERNMENT_REGISTRY_ADDRESS=0x...  # from deploy output
ARBITRUM_MANUFACTURER_BATCH_ADDRESS=0x...
ARBITRUM_SUPPLY_CHAIN_TRACKER_ADDRESS=0x...
```

### Step 5: Done!
```bash
cd backend && npm run dev   # Backend auto-detects Arbitrum
curl http://localhost:4000/api/government/governance/status
```

---

## 🗳️ How Voting Works

### 1. Regulator proposes
```bash
curl -X POST http://localhost:4000/api/government/entities/propose/register \
  -d '{
    "wallet": "0x123...",
    "name": "Pharma Corp",
    "licenseNumber": "LIC-001",
    "role": 1
  }'

# Response: proposalId = 42, proposer votes YES (1/2)
```

### 2. Regulator votes
```bash
curl -X POST http://localhost:4000/api/government/governance/proposals/42/vote \
  -d '{"vote": true}'

# If threshold met → AUTO-EXECUTES ✓
```

### 3. Done
```bash
# Entity is now registered on-chain
curl http://localhost:4000/api/government/entities/0x123
```

---

## 📚 Documentation Map

| Need | Read |
|------|------|
| **How to deploy?** | `DEPLOY_CHECKLIST.md` |
| **How to use?** | `GOVERNANCE.md` + this file |
| **API details?** | `API_REFERENCE.md` |
| **Full picture?** | `IMPLEMENTATION_SUMMARY.md` |
| **What changed?** | `CHANGES.md` |
| **See it work?** | Run `npx hardhat run scripts/test-governance.js --network arbitrumSepolia` |

---

## 🎯 Real-World Example

### Setup: 3 Regulators, 2-of-3 Threshold

```
National Regulator (USA)
State Board (NY)
Industry Council
```

### Flow: Register a Manufacturer

```
Day 1, 9:00 AM — National proposes
  Proposal #99 created
  National votes YES (1/2)
  Status: PENDING

Day 1, 2:00 PM — State votes
  State votes YES (2/2)
  Threshold met → AUTO-EXECUTES
  Manufacturer registered ✓

Day 1, 4:00 PM — Industry votes
  Industry votes YES
  Proposal already executed
  Vote recorded for audit
```

---

## 🔧 Env Vars (Quick Reference)

### Blockchain Deploy
```bash
DEPLOYER_PRIVATE_KEY=0x...              # Your wallet key
ARBITRUM_SEPOLIA_RPC_URL=https://...    # RPC endpoint
GOVERNANCE_REGULATORS='["0x..."]'       # Optional: JSON array
GOVERNANCE_THRESHOLD=2                  # Optional: voting threshold
```

### Backend Runtime
```bash
ACTIVE_NETWORK=arbitrum                 # Tells backend to use Arbitrum
ARBITRUM_GOVERNMENT_REGISTRY_ADDRESS=0x...
ARBITRUM_MANUFACTURER_BATCH_ADDRESS=0x...
ARBITRUM_SUPPLY_CHAIN_TRACKER_ADDRESS=0x...
ARBITRUM_RPC_URL=https://...            # Backend's RPC
```

---

## ✅ Verification Checklist

After deploying, verify:

```bash
# 1. Contracts deployed
curl -s http://localhost:4000/api/government/governance/status | jq .initialized

# 2. Regulators initialized
curl -s http://localhost:4000/api/government/governance/status | jq .regulators

# 3. Make a test proposal
curl -X POST http://localhost:4000/api/government/entities/propose/register \
  -d '{...}'

# 4. Vote on it
curl -X POST http://localhost:4000/api/government/governance/proposals/1/vote \
  -d '{"vote": true}'

# 5. Check execution
curl http://localhost:4000/api/government/governance/proposals/1
# → status should be 1 (Executed)
```

---

## 🚨 Common Issues

| Problem | Solution |
|---------|----------|
| "0 ETH" error | Fund wallet from [faucet](https://faucet.quicknode.com/arbitrum/sepolia) |
| Deploy fails | Check `ARBITRUM_SEPOLIA_RPC_URL` is set |
| Backend uses Sepolia | Verify `ACTIVE_NETWORK=arbitrum` in backend/.env |
| Vote doesn't execute | Check threshold (may need more votes) |
| API returns 404 | Restart backend after env changes |

---

## 🎓 Learn More

1. **Understand governance model**: Read `GOVERNANCE.md`
2. **See it in action**: Run test script
3. **Deploy to production**: Follow `DEPLOY_CHECKLIST.md`
4. **Build custom UI**: Use `API_REFERENCE.md`

---

## 📞 Commands Cheat Sheet

```bash
# Compile contracts
cd blockchain && npm run compile

# Deploy to Arbitrum Sepolia
npm run deploy:arbitrum

# Deploy to Ethereum Sepolia
npm run deploy:sepolia

# Run full governance demo
npx hardhat run scripts/test-governance.js --network arbitrumSepolia

# Check backend status
curl http://localhost:4000/api/government/governance/status

# Propose entity registration
curl -X POST http://localhost:4000/api/government/entities/propose/register \
  -H "Content-Type: application/json" \
  -d '{"wallet":"0x...","name":"Corp","licenseNumber":"LIC-001","role":1}'

# Vote on proposal
curl -X POST http://localhost:4000/api/government/governance/proposals/42/vote \
  -H "Content-Type: application/json" \
  -d '{"vote":true}'

# Get proposal details
curl http://localhost:4000/api/government/governance/proposals/42
```

---

## ⏱️ Timeline

| Step | Time |
|------|------|
| Setup env vars | 2 min |
| Deploy contracts | 3 min |
| Update backend | 2 min |
| Test API | 2 min |
| Verify on block explorer | 5 min |
| **Total** | **~15 minutes** |

---

## 🎯 What's Next?

After deployment:

1. **Test voting** with the demo script
2. **Create UI** to show proposals & votes
3. **Integrate with indexing** (The Graph, Covalent) for real-time events
4. **Move to mainnet** (same steps, different RPC + real regulators)

---

## 💡 Key Takeaway

✅ **Decentralized governance is live.**  
Your pharmaceutical regulatory authority can now:
- 🗳️ Vote on critical decisions
- 📊 Maintain audit trail on-chain
- 🔄 Change votes (regulators can reconsider)
- ⚡ Auto-execute at threshold (no delays)

**Ready to deploy? Start with Step 1 above!** 🚀
