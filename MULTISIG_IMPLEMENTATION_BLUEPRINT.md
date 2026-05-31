# Multisig Implementation Blueprint
## From Single Authority to 3-Authority Governance

---

## Quick Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ CURRENT SYSTEM (Phase 1 - Now)                          │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  DGA Authority                                           │
│  (Single Private Key)                                    │
│       ↓                                                   │
│  governmentPrivateKey (in .env)                          │
│       ↓                                                   │
│  ✓ Can revoke batches                                    │
│  ✓ Can update cache policies                             │
│  ✓ Fast decision making                                  │
│  ✗ Single point of failure                               │
│  ✗ If key compromised → total system compromise         │
│                                                           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ MULTISIG SYSTEM (Phase 2 - Q3-Q4 2026)                  │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  Health Ministry    +    DGHS    +    DGA               │
│  (HM Private Key)   (DGHS PK)  (DGA PK)                 │
│        ↓                 ↓          ↓                    │
│  Vote Proposal ← Database → Vote Proposal                │
│        ↓                 ↓          ↓                    │
│  If 3/3 agree → Smart Contract Executes                 │
│                                                           │
│  ✓ Resilient (survives 1 compromise)                     │
│  ✓ Consensual (prevents abuse)                           │
│  ✓ Auditable (all votes recorded)                        │
│  ✗ Slower (needs 3 votes)                                │
│  ✗ More complex (database needed)                        │
│                                                           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ BLOCKCHAIN GOVERNANCE (Phase 3 - Q1+ 2027)              │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  MultiSigGovernance.sol Smart Contract                  │
│  └─ Stores 3 authorized signers on-chain                │
│  └─ Requires 3/3 signatures for critical actions        │
│  └─ Immutable audit trail (on blockchain)               │
│  └─ Public verification possible                        │
│                                                           │
│  ✓ Trustless (no central database)                       │
│  ✓ Transparent (on-chain history)                       │
│  ✓ Permanent (blockchain immutable)                     │
│  ✗ Gas costs (~$50-200 per action)                      │
│  ✗ Slower (blockchain confirmation time)               │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Steps for Phase 2

### Step 1: Database Schema

```sql
-- Add these to your existing database

CREATE TABLE authorities (
  id VARCHAR(36) PRIMARY KEY,
  entity_name VARCHAR(100) NOT NULL UNIQUE,
  -- Values: "Health Ministry", "DGHS", "DGA"
  
  wallet_address VARCHAR(42) NOT NULL UNIQUE,
  -- Example: 0x742d35Cc6634C0532925a3b844Bc9e7595f42e19
  
  public_key VARCHAR(132) NOT NULL,
  -- Used to verify signatures without the private key
  
  status VARCHAR(20) DEFAULT 'ACTIVE',
  -- ACTIVE, SUSPENDED, REMOVED
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by_wallet VARCHAR(42)
);

CREATE TABLE multisig_proposals (
  id VARCHAR(36) PRIMARY KEY,
  
  -- What type of action
  action_type VARCHAR(50) NOT NULL,
  -- BATCH_REVOCATION, CACHE_POLICY_UPDATE, AUTHORITY_REMOVAL, etc.
  
  -- What is being changed
  target_id VARCHAR(255),
  -- batch_id if BATCH_REVOCATION
  -- or policy_id if CACHE_POLICY_UPDATE
  
  -- Details
  description TEXT NOT NULL,
  -- "Batch ABC-123 found to be 95% silica powder"
  
  proposed_data JSON,
  -- New values to apply if approved
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'PENDING',
  -- PENDING, APPROVED, REJECTED, EXECUTED, EXPIRED
  
  votes_required INT DEFAULT 3,
  votes_received INT DEFAULT 0,
  
  -- Timing
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by_authority_id VARCHAR(36) REFERENCES authorities(id),
  
  expires_at TIMESTAMP,
  -- Proposal dies after 48 hours
  
  executed_at TIMESTAMP,
  executed_tx_hash VARCHAR(66),
  
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  INDEX idx_action_type (action_type)
);

CREATE TABLE multisig_signatures (
  id VARCHAR(36) PRIMARY KEY,
  
  proposal_id VARCHAR(36) NOT NULL REFERENCES multisig_proposals(id),
  authority_id VARCHAR(36) NOT NULL REFERENCES authorities(id),
  
  -- The actual signature
  signature VARCHAR(132) NOT NULL,
  -- ECDSA signature: 0x...
  
  message_hash VARCHAR(66) NOT NULL,
  -- Hash of: proposal_id + action_type + target_id + timestamp
  
  signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_signature (proposal_id, authority_id),
  -- Can't vote twice on same proposal
  
  INDEX idx_proposal (proposal_id)
);

CREATE TABLE cache_invalidation_log (
  id VARCHAR(36) PRIMARY KEY,
  
  batch_id VARCHAR(255) NOT NULL,
  reason VARCHAR(100),
  -- "BATCH_REVOKED", "POLICY_CHANGE", etc.
  
  triggered_by_proposal_id VARCHAR(36) REFERENCES multisig_proposals(id),
  invalidated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_batch_id (batch_id),
  INDEX idx_reason (reason)
);

CREATE TABLE governance_audit_log (
  id VARCHAR(36) PRIMARY KEY,
  
  proposal_id VARCHAR(36) REFERENCES multisig_proposals(id),
  action_executed VARCHAR(100) NOT NULL,
  
  result JSON,
  -- Result of the action (e.g., how many cache entries cleared)
  
  executed_by_authorities JSON,
  -- Array of authority IDs that approved
  
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tx_hash VARCHAR(66),
  
  INDEX idx_action (action_executed),
  INDEX idx_executed_at (executed_at)
);
```

### Step 2: Environment Variables (Phase 2)

```bash
# .env file

# Authority Keys (one per organization)
HM_PRIVATE_KEY=0x...          # Health Ministry's private key
DGHS_PRIVATE_KEY=0x...        # DGHS's private key
DGA_PRIVATE_KEY=0x...         # DGA's private key

# Authority Wallet Addresses (derived from keys)
HM_WALLET=0x...               # Address of Health Ministry
DGHS_WALLET=0x...             # Address of DGHS
DGA_WALLET=0x...              # Address of DGA

# Multisig Configuration
MULTISIG_REQUIRED_VOTES=3     # 3-of-3 required (can change to 2 later)
MULTISIG_PROPOSAL_TTL=172800  # 48 hours in seconds

# For Phase 3 (Smart Contract)
MULTISIG_CONTRACT_ADDRESS=0x...  # Address of MultiSigGovernance.sol
```

### Step 3: Signature Verification Service

Create `/backend/src/services/multisigService.js`:

```javascript
const { ethers } = require("ethers");

class MultisigService {
  /**
   * Create a proposal hash
   * Ensures all authorities are hashing the same data
   */
  static createMessageHash(proposalData) {
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "string", "string", "uint256"],
      [
        proposalData.action_type,
        proposalData.target_id || "",
        proposalData.description,
        Math.floor(Date.now() / 1000) // Current timestamp
      ]
    );
    return ethers.keccak256(encoded);
  }

  /**
   * Sign a proposal (authority signs it)
   * Each authority does this with their private key
   */
  static signProposal(proposalData, privateKey) {
    const messageHash = this.createMessageHash(proposalData);
    
    const signer = new ethers.Wallet(privateKey);
    const signature = signer.signingKey.sign(messageHash);
    
    return {
      messageHash,
      signature: signature.serialized, // 0x...
      authority: signer.address
    };
  }

  /**
   * Verify a signature came from a specific authority
   * Used when checking votes
   */
  static verifySignature(messageHash, signature, authorityAddress) {
    try {
      const recoveredAddress = ethers.recoverAddress(messageHash, signature);
      return recoveredAddress.toLowerCase() === authorityAddress.toLowerCase();
    } catch (err) {
      return false;
    }
  }

  /**
   * Check if proposal has reached voting threshold
   */
  static hasThreshold(votes, required) {
    return votes.length >= required;
  }
}

module.exports = MultisigService;
```

### Step 4: Governance API Endpoints

Create `/backend/src/routes/governance.js`:

```javascript
const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const MultisigService = require("../services/multisigService");
const { getGovSigner } = require("../config/contracts");

// POST /api/governance/propose
router.post("/propose", async (req, res) => {
  try {
    const {
      action_type,
      target_id,
      description,
      proposed_data,
      authority_wallet
    } = req.body;

    // Verify authority exists
    const authority = await db.query(
      "SELECT * FROM authorities WHERE wallet_address = ?",
      [authority_wallet]
    );
    
    if (!authority.length) {
      return res.status(400).json({ error: "Unknown authority" });
    }

    // Create proposal
    const proposalId = uuidv4();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await db.query(
      `INSERT INTO multisig_proposals 
       (id, action_type, target_id, description, proposed_data, 
        created_by_authority_id, expires_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        proposalId,
        action_type,
        target_id,
        description,
        JSON.stringify(proposed_data),
        authority[0].id,
        expiresAt
      ]
    );

    res.json({
      proposal_id: proposalId,
      status: "PENDING",
      votes_required: 3,
      votes_received: 0,
      expires_at: expiresAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/governance/vote
router.post("/vote", async (req, res) => {
  try {
    const {
      proposal_id,
      authority_wallet,
      signature,
      message_hash
    } = req.body;

    // Get authority
    const authority = await db.query(
      "SELECT * FROM authorities WHERE wallet_address = ?",
      [authority_wallet]
    );

    if (!authority.length) {
      return res.status(400).json({ error: "Unknown authority" });
    }

    // Get proposal
    const proposal = await db.query(
      "SELECT * FROM multisig_proposals WHERE id = ?",
      [proposal_id]
    );

    if (!proposal.length) {
      return res.status(404).json({ error: "Proposal not found" });
    }

    // Check not already voted
    const existing = await db.query(
      "SELECT * FROM multisig_signatures WHERE proposal_id = ? AND authority_id = ?",
      [proposal_id, authority[0].id]
    );

    if (existing.length) {
      return res.status(400).json({ error: "Already voted on this proposal" });
    }

    // Verify signature
    const isValid = MultisigService.verifySignature(
      message_hash,
      signature,
      authority_wallet
    );

    if (!isValid) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    // Record vote
    const signatureId = uuidv4();
    await db.query(
      `INSERT INTO multisig_signatures 
       (id, proposal_id, authority_id, signature, message_hash) 
       VALUES (?, ?, ?, ?, ?)`,
      [signatureId, proposal_id, authority[0].id, signature, message_hash]
    );

    // Update proposal vote count
    const votes = await db.query(
      "SELECT COUNT(*) as count FROM multisig_signatures WHERE proposal_id = ?",
      [proposal_id]
    );

    const voteCount = votes[0].count;
    const votesRequired = proposal[0].votes_required;

    await db.query(
      "UPDATE multisig_proposals SET votes_received = ? WHERE id = ?",
      [voteCount, proposal_id]
    );

    // If threshold reached, execute
    if (voteCount >= votesRequired) {
      await executeProposal(proposal_id);
    }

    res.json({
      vote_recorded: true,
      votes_received: voteCount,
      votes_required: votesRequired,
      status: voteCount >= votesRequired ? "APPROVED" : "PENDING"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/governance/proposals/:id
router.get("/proposals/:id", async (req, res) => {
  try {
    const proposal = await db.query(
      "SELECT * FROM multisig_proposals WHERE id = ?",
      [req.params.id]
    );

    if (!proposal.length) {
      return res.status(404).json({ error: "Proposal not found" });
    }

    const votes = await db.query(
      `SELECT s.*, a.entity_name 
       FROM multisig_signatures s
       JOIN authorities a ON s.authority_id = a.id
       WHERE s.proposal_id = ?`,
      [req.params.id]
    );

    res.json({
      proposal_id: proposal[0].id,
      action_type: proposal[0].action_type,
      description: proposal[0].description,
      status: proposal[0].status,
      votes_required: proposal[0].votes_required,
      votes_received: proposal[0].votes_received,
      created_at: proposal[0].created_at,
      expires_at: proposal[0].expires_at,
      votes: votes.map(v => ({
        authority: v.entity_name,
        signed_at: v.signed_at
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function executeProposal(proposalId) {
  const proposal = await db.query(
    "SELECT * FROM multisig_proposals WHERE id = ?",
    [proposalId]
  );

  if (!proposal.length) return;

  const p = proposal[0];

  if (p.action_type === "BATCH_REVOCATION") {
    // Update batch status to revoked
    await db.query(
      "UPDATE batches SET status = 'REVOKED' WHERE id = ?",
      [p.target_id]
    );

    // Invalidate cache
    await db.query(
      "INSERT INTO cache_invalidation_log (id, batch_id, reason, triggered_by_proposal_id) VALUES (?, ?, ?, ?)",
      [uuidv4(), p.target_id, "BATCH_REVOKED", proposalId]
    );

    console.log(`[Governance] Batch ${p.target_id} revoked by multisig`);
  }

  // Mark proposal as executed
  await db.query(
    "UPDATE multisig_proposals SET status = 'EXECUTED', executed_at = NOW() WHERE id = ?",
    [proposalId]
  );
}

module.exports = router;
```

### Step 5: Add Routes to App

Update `/backend/src/app.js`:

```javascript
const governanceRouter = require("./routes/governance");

// ... existing routes ...

app.use("/api/governance", governanceRouter);
```

---

## Phase 2 Testing Checklist

- [ ] All 3 authority wallets created and added to .env
- [ ] Database schema migrated (authorities, proposals, signatures tables)
- [ ] Signature verification working locally
- [ ] Governance API endpoints tested:
  - [ ] POST /api/governance/propose (create proposal)
  - [ ] POST /api/governance/vote (cast vote)
  - [ ] GET /api/governance/proposals/:id (check status)
- [ ] 3-of-3 voting works (all must sign)
- [ ] Cache invalidation triggered after approval
- [ ] Audit log records all decisions
- [ ] Each authority can sign independently
- [ ] Invalid signatures rejected

---

## User Flow: Health Ministry Worker Using Multisig

### Scenario: Revoking Counterfeit Batch

#### Step 1: DGHS Proposes Revocation
```
DGHS Worker:
  1. Opens "Report Counterfeit" form
  2. Enters batch ID: ABC-123
  3. Uploads evidence photo
  4. Clicks "Create Revocation Proposal"
  5. System generates proposal ID: prop-xyz123
  6. System notifies HM and DGA: "DGHS proposes revocation"
```

#### Step 2: Health Ministry Reviews
```
HM Administrator:
  1. Receives notification: "New proposal: Revoke batch ABC-123"
  2. Opens proposal details
  3. Sees DGHS evidence + timestamp
  4. Clicks "APPROVE"
  5. System prompts: "Sign with your authority key"
  6. HM signs using their private key
  7. System records vote (2/3)
  8. HM sees: "Waiting for DGA approval"
```

#### Step 3: DGA Reviews
```
DGA Pharmacist:
  1. Receives notification: "Batch ABC-123 revocation waiting for your vote"
  2. Reviews chemical analysis (already in system)
  3. Verifies it's counterfeit
  4. Clicks "APPROVE"
  5. System prompts: "Sign to confirm"
  6. DGA signs using their private key
  7. System records vote (3/3) ← THRESHOLD MET!
  8. Automatic execution triggered
```

#### Step 4: System Executes
```
Backend system automatically:
  1. Marks batch ABC-123 as REVOKED on blockchain
  2. Clears batch from all cache servers
  3. Notifies all consumers with that batch: "Re-verify your medicine"
  4. Logs action in audit trail
  5. Sends confirmation to all 3 authorities
```

#### Step 5: Audit Trail
```
Governance Audit Log shows:
  Proposal ID: prop-xyz123
  Action: BATCH_REVOCATION
  Target: Batch ABC-123
  Approved By: Health Ministry, DGHS, DGA
  Executed At: 2024-06-01 11:45:32 UTC
  Result: 10 cache entries invalidated
  TX Hash: 0xabcd1234...
```

---

## Transition Timeline

### Week 1: Setup
- [ ] Generate 3 authority wallets
- [ ] Add keys to .env
- [ ] Create database schema
- [ ] Deploy migrations

### Week 2: Backend
- [ ] Implement MultisigService
- [ ] Create governance API endpoints
- [ ] Add signature verification
- [ ] Implement automatic execution

### Week 3: Integration
- [ ] Connect cache invalidation to multisig
- [ ] Add audit logging
- [ ] Test all voting scenarios
- [ ] Document for authorities

### Week 4: Testing
- [ ] Test with real authority keys
- [ ] Verify all edge cases
- [ ] Load testing (parallel proposals)
- [ ] Security audit

### Week 5: Launch
- [ ] Deploy to staging
- [ ] Train authority users
- [ ] Create first proposals
- [ ] Monitor for issues

---

## Key Files to Create/Modify

```
backend/
├── src/
│  ├── services/
│  │  └── multisigService.js (NEW)
│  ├── routes/
│  │  └── governance.js (NEW)
│  ├── db/
│  │  └── migrations/
│  │     └── 001_multisig_tables.sql (NEW)
│  ├── app.js (MODIFY - add governance routes)
│  └── config/
│     └── .env (MODIFY - add authority keys)
└── tests/
   └── multisig.test.js (NEW)
```

---

## Single Authority → Multisig Code Change Example

### Before (Phase 1):
```javascript
// Single signer - all decisions made by this key
const signer = getGovSigner(); // Single GOVERNMENT_PRIVATE_KEY

const tx = await contract.verifyAndBurn(batchId, proof, leafHash);
// No voting, just execute
```

### After (Phase 2):
```javascript
// Multiple signers - needs consensus
const proposal = await createProposal({
  action_type: "BATCH_REVOCATION",
  target_id: batchId
});

// Wait for all 3 to vote
while (proposal.votes_received < 3) {
  await sleep(5000); // Check every 5 seconds
}

// Once 3 votes received, execute automatically
const tx = await contract.verifyAndBurn(batchId, proof, leafHash);
```

---

## Security Considerations

### Key Management
- Each authority must **never share** their private key
- Keys stored in separate .env files, never in code
- Rotate keys quarterly
- Implement key backup procedures

### Signature Verification
- Always verify signatures before executing actions
- Use ethers.js built-in verification (battle-tested)
- Never trust unsigned proposals

### Timing Attacks
- Proposals expire after 48 hours
- Prevents indefinite "waiting for approval" scenarios
- Prevents replay attacks

### Audit Trail
- Every decision logged immutably
- Each vote includes timestamp & signer
- Actions recorded before execution
- Enables forensic analysis if compromised

---

## Next Steps

1. **Clarify voting threshold:** Is 3-of-3 required, or can we do 2-of-3?
2. **Identify real wallet addresses:** Get official addresses from each authority
3. **Choose database:** PostgreSQL (recommended) or MySQL?
4. **Set proposal TTL:** Is 48 hours good, or different?
5. **Plan Phase 3:** When ready to move to blockchain governance

---
