# Governance API Reference

## Base URL
```
http://localhost:4000/api/government
```

---

## Governance Management

### Get Governance Status
Check current configuration (regulators, threshold, initialized state).

```http
GET /governance/status
```

**Response** (200 OK):
```json
{
  "success": true,
  "initialized": true,
  "regulators": ["0x111...", "0x222...", "0x333..."],
  "threshold": 2,
  "regulatorCount": 3
}
```

---

### Initialize Governance
**Owner/Deployer only**. Called once post-deployment to set up M-of-N voting.

```http
POST /governance/initialize
Content-Type: application/json

{
  "regulators": ["0x111...", "0x222...", "0x333..."],
  "threshold": 2
}
```

**Request Fields**:
- `regulators` (string[]): Array of regulator wallet addresses (M-of-N)
- `threshold` (number): Approval threshold (e.g., 2 for 2-of-3)

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Governance initialized: 3 regulators, 2-of-3 threshold",
  "regulators": ["0x111...", "0x222...", "0x333..."],
  "threshold": 2,
  "txHash": "0xabc123..."
}
```

**Errors**:
- `regulators` must be non-empty array
- `threshold` must be > 0 and ≤ regulator count

---

## Entity Proposals

### Propose Entity Registration
Any regulator can propose registering a new entity (Manufacturer, Distributor, or Retailer).

```http
POST /entities/propose/register
Content-Type: application/json

{
  "wallet": "0x123...",
  "name": "Pharma Corp A",
  "licenseNumber": "LIC-2025-001",
  "role": 1
}
```

**Request Fields**:
- `wallet` (string): Entity's Ethereum address
- `name` (string): Legal entity name
- `licenseNumber` (string): Government-issued license number
- `role` (number): 1=Manufacturer, 2=Distributor, 3=Retailer

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Registration proposal created (ID: 42). Proposer auto-voted YES.",
  "proposalId": "42",
  "wallet": "0x123...",
  "name": "Pharma Corp A",
  "txHash": "0xdef456..."
}
```

**Behavior**:
- Creates proposal #42
- Proposer automatically votes YES (1 approval)
- If threshold is 1, auto-executes immediately
- If threshold is > 1, waits for other regulators to vote

---

### Propose Entity Revocation
Any regulator can propose revoking an active entity.

```http
POST /entities/propose/revoke
Content-Type: application/json

{
  "wallet": "0x123...",
  "reason": "License fraud detected"
}
```

**Request Fields**:
- `wallet` (string): Entity's Ethereum address
- `reason` (string): Reason for revocation (audit trail)

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Revocation proposal created (ID: 43). Proposer auto-voted YES.",
  "proposalId": "43",
  "wallet": "0x123...",
  "reason": "License fraud detected",
  "txHash": "0xghi789..."
}
```

---

### Propose Entity Reinstatement
Any regulator can propose reinstating a previously revoked entity.

```http
POST /entities/propose/reinstate
Content-Type: application/json

{
  "wallet": "0x123..."
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Reinstatement proposal created (ID: 44). Proposer auto-voted YES.",
  "proposalId": "44",
  "wallet": "0x123...",
  "txHash": "0xjkl012..."
}
```

---

## Proposal Voting

### Vote on Proposal
Any regulator votes YES/NO on a pending proposal. Auto-executes if threshold reached.

```http
POST /governance/proposals/:id/vote
Content-Type: application/json

{
  "vote": true
}
```

**URL Parameters**:
- `:id` — Proposal ID (e.g., 42)

**Request Fields**:
- `vote` (boolean): true=YES, false=NO

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Vote cast. Proposal #42 auto-executed!",
  "proposalId": "42",
  "vote": true,
  "executed": true,
  "txHash": "0xmno345..."
}
```

**Behavior**:
- Regulator casts vote
- If regulator already voted, old vote is replaced (recounted)
- If new vote count ≥ threshold → proposal auto-executes immediately
- If proposal expired (7 days) → error
- `executed: true` means the on-chain action (register/revoke/reinstate) happened

---

### Get Proposal Details
Retrieve full proposal state including all votes.

```http
GET /governance/proposals/:id
```

**URL Parameters**:
- `:id` — Proposal ID

**Response** (200 OK):
```json
{
  "success": true,
  "proposal": {
    "id": 42,
    "action": 0,
    "targetEntity": "0x123...",
    "proposalData": "Pharma Corp A|LIC-2025-001|1",
    "status": 1,
    "proposer": "0x111...",
    "createdAt": 1700000000,
    "expiryAt": 1700604800,
    "executedAt": 1700001000,
    "approvalsCount": 2
  },
  "voters": ["0x111...", "0x222..."],
  "voteChoices": [true, true]
}
```

**Proposal Status Codes**:
- `0` = Pending (awaiting votes)
- `1` = Executed (approved and action taken)
- `2` = Expired (7 days passed without approval)
- `3` = Cancelled (manually cancelled)

**Action Codes**:
- `0` = Register
- `1` = Revoke
- `2` = Reinstate
- `3` = Add Regulator
- `4` = Remove Regulator

---

## Regulator Management (Advanced)

### Propose Adding a Regulator
Any regulator can propose adding a new regulator to the consortium.

```http
POST /governance/propose/add-regulator
Content-Type: application/json

{
  "newRegulator": "0x444..."
}
```

**Request Fields**:
- `newRegulator` (string): New regulator's Ethereum address

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Proposal to add regulator created (ID: 45). Proposer auto-voted YES.",
  "proposalId": "45",
  "newRegulator": "0x444...",
  "txHash": "0xpqr678..."
}
```

**Behavior**:
- Creates proposal requiring M-of-N approval
- Once approved, new regulator is added to the `regulators[]` array
- New regulator can immediately vote on future proposals

---

### Propose Removing a Regulator
Any regulator can propose removing a regulator from the consortium.

```http
POST /governance/propose/remove-regulator
Content-Type: application/json

{
  "regulatorToRemove": "0x444..."
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Proposal to remove regulator created (ID: 46). Proposer auto-voted YES.",
  "proposalId": "46",
  "regulatorToRemove": "0x444...",
  "txHash": "0xstu901..."
}
```

---

## Example Workflow

### Scenario: Register a Manufacturer with 2-of-3 Consensus

**Step 1**: Regulator 1 (National) proposes
```bash
curl -X POST http://localhost:4000/api/government/entities/propose/register \
  -H "Content-Type: application/json" \
  -d '{
    "wallet": "0xabc123...",
    "name": "Pharma Corp XYZ",
    "licenseNumber": "LIC-2025-042",
    "role": 1
  }'

# Response: proposalId = 99, Regulator 1 voted YES (1/2)
```

**Step 2**: Regulator 2 (State) votes
```bash
curl -X POST http://localhost:4000/api/government/governance/proposals/99/vote \
  -H "Content-Type: application/json" \
  -d '{"vote": true}'

# Response: Threshold met (2/2) → Proposal auto-executed
# Pharma Corp XYZ registered on-chain ✓
```

**Step 3**: Regulator 3 (Industry) checks status (proposal already done)
```bash
curl http://localhost:4000/api/government/governance/proposals/99

# Response: status = 1 (Executed), approvalsCount = 2
```

**Step 4**: On the blockchain, entity is now registered
```bash
curl http://localhost:4000/api/government/entities/0xabc123

# Response: status = 1 (Active), role = 1 (Manufacturer)
```

---

## Common Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "error": "Missing required fields"
}
```

### 500 Internal Server Error (Blockchain)
```json
{
  "success": false,
  "error": "ProposalExpired: Proposal #99 has expired"
}
```

### 500 Database Error
```json
{
  "success": false,
  "error": "NotInitialized: Governance not yet initialized"
}
```

---

## Best Practices

1. **Always check governance status first**
   ```bash
   curl http://localhost:4000/api/government/governance/status
   ```
   Ensures governance is initialized before proposing.

2. **Store proposal IDs**
   Save the `proposalId` from create responses so you can query/vote later.

3. **Listen to events**
   For a UI, listen to blockchain events:
   - `ProposalCreated` — new proposal
   - `ProposalVoted` — vote cast
   - `ProposalExecuted` — action taken
   - `ProposalExpired` — 7-day deadline passed

4. **Validate addresses**
   Ensure wallet addresses are valid Ethereum addresses (42 chars, start with `0x`).

5. **Check expiry before voting**
   Proposals expire 7 days after creation. Check `expiryAt` timestamp.

---

## Rate Limiting

No rate limits currently. In production, add rate limiting (e.g., 100 req/min per IP).

---

## CORS

All endpoints allow cross-origin requests from the configured `FRONTEND_URL` (typically `http://localhost:3000`).

---

## Transactions

All write operations (`POST`, `PATCH`) generate blockchain transactions and require:
- Valid signer (the calling regulator's wallet)
- Sufficient gas (typically < 500k gas per operation)
- Appropriate network (`arbitrumSepolia` or `sepolia` depending on config)

Responses include `txHash` for verification on a block explorer (Arbiscan, Etherscan).
