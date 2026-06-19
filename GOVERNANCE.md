# M-of-N Consortium Governance — Implementation Summary

## What Was Built

A complete decentralized regulatory authority system where **multiple regulatory bodies** (not just one government) vote on critical pharmaceutical supply chain actions using **M-of-N threshold voting**.

---

## Files Modified

### 1. **`blockchain/contracts/GovernmentRegistry.sol`** ✅
- **Changed**: Single `onlyOwner` authority → M-of-N voting system
- **Added**:
  - `Proposal` struct to track proposed actions, votes, and execution status
  - `regulators[]` array + `_threshold` for governance config
  - `proposeRegisterEntity`, `proposeRevokeEntity`, `proposeReinstateEntity` — any regulator can propose
  - `proposeAddRegulator`, `proposeRemoveRegulator` — governance self-amendment
  - `voteOnProposal` — vote on a proposal; auto-executes if threshold met
  - `executeProposalManually` — fallback manual execution (safety)
  - `initializeGovernance` — called once post-deploy to set up regulators + threshold
  - Full event trail: `ProposalCreated`, `ProposalVoted`, `ProposalExecuted`, `ProposalExpired`, etc.
- **Backward Compat**: Existing `isWhitelisted`, `hasRole`, `getEntity` views unchanged
- **Lines**: 621 (was ~150)

### 2. **`backend/src/routes/government.js`** ✅
- **Changed**: Old routes (`/entities/register`, `/entities/revoke`) → new proposal-based routes
- **Added**:
  - `GET /governance/status` — check current regulators + threshold
  - `POST /governance/initialize` — owner-only setup (once at deploy)
  - `POST /entities/propose/register` — propose a registration (auto-extracts proposalId from receipt)
  - `POST /entities/propose/revoke` — propose revocation
  - `POST /entities/propose/reinstate` — propose reinstatement
  - `POST /governance/proposals/:id/vote` — vote on proposal (detects auto-execution)
  - `GET /governance/proposals/:id` — get full proposal state + voter list
  - `POST /governance/propose/add-regulator` — propose adding a regulator
  - `POST /governance/propose/remove-regulator` — propose removing a regulator
- **Kept**: Analytics, anomalies, entity queries unchanged
- **Lines**: 485 (was ~200)

### 3. **`blockchain/scripts/deploy.js`** ✅
- **Changed**: Deploy → initialize governance in one call
- **Added**:
  - Reads `GOVERNANCE_REGULATORS` (JSON array) + `GOVERNANCE_THRESHOLD` env vars
  - Calls `initializeGovernance()` post-deploy automatically
  - Falls back to single-regulator mode (deployer only) if env vars omitted
  - Updated `.env.example` with governance vars
  - Network-aware address storage (Sepolia vs Arbitrum)
- **Lines**: 153 (was ~100)

### 4. **`blockchain/hardhat.config.js`** ✅
- **Added**: Arbitrum Sepolia RPC config, Arbiscan verification, fallback empty RPC URLs

### 5. **`blockchain/.env.example`** ✅
- **Added**: `GOVERNANCE_REGULATORS`, `GOVERNANCE_THRESHOLD`, Arbitrum RPC vars

### 6. **`blockchain/package.json`** ✅
- **Added**: Scripts `compile`, `deploy:sepolia`, `deploy:arbitrum`, `test`

### 7. **`blockchain/scripts/test-governance.js`** ✨ NEW
- Complete demo showing the M-of-N voting flow:
  - Initialize 3 regulators with 2-of-3 threshold
  - Regulator 1 proposes a registration (auto-votes YES)
  - Regulator 2 votes YES → threshold met → auto-executes
  - Verify entity is registered on-chain
  - Demo vote changes
- Run: `npx hardhat run scripts/test-governance.js --network arbitrumSepolia`

### 8. **`README.md`** ✅
- **Added**: New "M-of-N Consortium Governance" section (91 lines)
  - Explains the voting model, use cases, API endpoints
  - Shows example flow (2-of-3 scenario)
  - Documents deployment with governance env vars

### 9. **`GOVERNANCE.md`** ✨ NEW
- This file — complete summary of what was built

---

## Real-World Governance Scenario

**Before**: One government wallet unilaterally registers/revokes entities. Single point of failure; no checks & balances.

**After**: 
- **National Regulator** (FDA-equivalent)
- **State Pharmacy Board** (e.g., NY Health Dept)
- **Industry Council** (Pharma Association)

Any regulator can propose an action. The action executes **only when ≥2 of 3 vote YES**. If Regulator 2 changes their mind, the vote is recalculated. If 7 days pass with no approval, the proposal expires.

**Result**: Transparent, auditable, consensus-based governance — no backdoors, no single authority.

---

## How to Use

### 1. **Initialize Governance at Deploy**

Set environment variables before deploying:

```bash
cd blockchain
export GOVERNANCE_REGULATORS='["0x1111...","0x2222...","0x3333..."]'
export GOVERNANCE_THRESHOLD=2
npm run deploy:arbitrum
```

The deploy script will:
- Deploy the 3 contracts
- Call `initializeGovernance(regulators, 2)`
- Output the contract addresses + governance config

### 2. **Backend Initializes Governance (Alternative)**

If you deploy without env vars, then call:

```bash
curl -X POST http://localhost:4000/api/government/governance/initialize \
  -H "Content-Type: application/json" \
  -d '{
    "regulators": ["0x111...", "0x222...", "0x333..."],
    "threshold": 2
  }'
```

### 3. **Propose an Action (Any Regulator)**

```bash
# Propose registering a manufacturer
curl -X POST http://localhost:4000/api/government/entities/propose/register \
  -H "Content-Type: application/json" \
  -d '{
    "wallet": "0xMfg...",
    "name": "Pharma Corp A",
    "licenseNumber": "LIC-2025-001",
    "role": 1
  }'

# Response includes proposalId
# Proposer auto-voted YES (1/2)
```

### 4. **Vote on Proposal (Other Regulators)**

```bash
curl -X POST http://localhost:4000/api/government/governance/proposals/42/vote \
  -H "Content-Type: application/json" \
  -d '{"vote": true}'

# If threshold met, proposal auto-executes
# Response shows: "Proposal #42 auto-executed!"
```

### 5. **Check Governance Status**

```bash
curl http://localhost:4000/api/government/governance/status
```

Response:
```json
{
  "success": true,
  "initialized": true,
  "regulators": ["0x111...", "0x222...", "0x333..."],
  "threshold": 2,
  "regulatorCount": 3
}
```

### 6. **Get Proposal Details**

```bash
curl http://localhost:4000/api/government/governance/proposals/42
```

Response includes:
- Proposal status (Pending, Executed, Expired, Cancelled)
- List of voters + their votes
- Approval count
- Timestamps

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Auto-vote proposer YES** | Proposer is invested; no overhead to always include their vote. Speeds up approval. |
| **Auto-execute at threshold** | No manual execution step needed; faster governance. Fallback `executeProposalManually()` if race condition. |
| **Vote changes allowed** | Realistic — regulators should be able to reconsider. Vote is recalculated on each change. |
| **7-day proposal expiry** | Prevents stale/orphaned proposals from hanging forever. Allows proposal archival. |
| **M-of-N, not 2FA** | More flexible — supports various consortium sizes (2-of-3, 3-of-5, etc.). Single regulator (1-of-1) still works. |
| **Events, not off-chain state** | Blockchain is source of truth; auditable via event logs. No reliance on backend database. |
| **Backward compat with single owner** | If no regulators initialized, falls back to 1-of-1 (deployer only). Smooth upgrade path. |

---

## Testing

Run the demo script to see the full voting flow:

```bash
cd blockchain
npm run deploy:arbitrum   # or deploy:sepolia

# In a separate terminal
npx hardhat run scripts/test-governance.js --network arbitrumSepolia
```

Output:
```
╔════════════════════════════════════════════════════════════╗
║         M-of-N Governance Voting Flow Demo                 ║
╚════════════════════════════════════════════════════════════╝

✓ GovernmentRegistry: 0x...
✓ Governance initialized: 2-of-3
✓ Proposal #1 created by Regulator 1
✓ Regulator 2 voted YES → THRESHOLD MET → AUTO-EXECUTED
✓ Manufacturer registered on-chain
```

---

## Next Steps: Deploy to Arbitrum

1. **Fund your deployer wallet** with test ETH from [Arbitrum Sepolia Faucet](https://faucet.quicknode.com/arbitrum/sepolia)
2. **Set environment variables** (see "Initialize Governance at Deploy" above)
3. **Run**: `npm run deploy:arbitrum`
4. **Paste the output into `backend/.env`** (contract addresses + `ACTIVE_NETWORK=arbitrum`)
5. **Test the governance flow** with the test script
6. **Ready for production** — re-deploy to mainnet with your real regulators

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│ Governance Initialization (Deploy Time)             │
│  • Deployer calls initializeGovernance()            │
│  • Registers N regulators + M threshold             │
│  • e.g., 3 regulators, 2-of-3 approval              │
└──────────────────────────────┬──────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────┐
│ Proposal Flow (Runtime)                             │
│                                                     │
│  Regulator 1: proposeRegisterEntity()               │
│  ├─ Auto-votes YES (1/2)                            │
│  └─ Proposal #42 created → PENDING                  │
│                                                     │
│  Regulator 2: voteOnProposal(42, true)              │
│  ├─ Votes YES (2/2)                                 │
│  └─ Threshold met → Auto-execute                    │
│      ├─ Entity registered on-chain                  │
│      └─ ProposalExecuted event emitted              │
│                                                     │
│  Regulator 3: voteOnProposal(42, true)  [too late]  │
│  └─ Proposal already executed; vote recorded       │
└─────────────────────────────────────────────────────┘
```

---

## Summary

**Consortium governance is now live.** The PharmaChain system can be deployed with:
- ✅ M-of-N voting (any threshold)
- ✅ Auto-execution at threshold
- ✅ Transparent audit trail (blockchain events)
- ✅ Backward compatibility (single regulator mode)
- ✅ Arbitrum deployment ready

**Next: Deploy to Arbitrum L2 for 10x cheaper gas + sub-second finality.**
