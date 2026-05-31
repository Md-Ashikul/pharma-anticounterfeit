# 🔍 Memory Cache — Code Flow Deep Dive

## Exact Execution Path

### When Consumer Scans a Drug QR

```
┌─────────────────────────────────────────────────────────────────────┐
│ consumer/app/verify/page.js                                         │
│ ─ User scans Hidden QR with camera                                  │
│ ─ QR payload: { secret, batchId, leafIndex }                        │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ consumer/components/VerifyResult.js                                 │
│ ─ Extract: secret, batchId, leafIndex from decoded QR              │
│ ─ Call: verifyStrip({ secret, batchId, leafIndex, drugId })       │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ consumer/lib/api.js → verifyStrip()                                 │
│ ─ POST /api/consumer/verify                                         │
│ ─ Send: { secret, batchId, leafIndex, drugId, hashedNID }         │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼ [NETWORK REQUEST]
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ backend/src/routes/consumer.js                                      │
│ ─ POST /api/consumer/verify (line 26)                              │
│ ─ Extract body: { secret, batchId, leafIndex, drugId, hashedNID } │
│ ─ Call: verifyStrip({ secret, batchId, leafIndex, ... })          │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ backend/src/services/verificationService.js                         │
│ ─ verifyStrip() function (line 39)                                 │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
        ╔════════════════════════════════════╗
        ║  STEP 1: Compute Leaf Hash         ║
        ║  leafHash = keccak256(secret)      ║
        ║  (~0 ms)                           ║
        ╚════════════════════════════════════╝
                 │
                 ▼
        ╔════════════════════════════════════╗
        ║  STEP 2: Fetch Batch from Chain    ║
        ║  const batch = contract.getBatch() ║
        ║  (~1-2s, blockchain RPC)           ║
        ╚════════════════════════════════════╝
                 │
    ┌────────────┴────────────┐
    │                         │
    ▼                         ▼
 [BATCH FOUND]            [NOT FOUND]
    │                         │
    ▼                         ▼
    │                   Return: FAKE
    │                   (Batch not registered)
    │
    ▼
╔═══════════════════════════════════════════════════════════════════╗
║  STEP 3: CACHE LOOKUP (★ MEMORY CACHE LOGIC ★)                  ║
║  ───────────────────────────────────────────────────────────────  ║
║                                                                   ║
║  const ipfsCache = new NodeCache({                               ║
║    stdTTL: 86400,        // 24 hours                             ║
║    checkperiod: 1200     // Check every 20 min                   ║
║  });                                                              ║
║                                                                   ║
║  let merkleTree = ipfsCache.get(batch.ipfsCID);                  ║
║                                                                   ║
║  if (merkleTree) {                                                ║
║    console.log("✅ [CACHE HIT]");                                ║
║    cacheStatus = "HIT";                                           ║
║  } else {                                                         ║
║    console.log("⏳ [CACHE MISS]");                                ║
║    cacheStatus = "MISS";                                          ║
║  }                                                                ║
╚═══════════════════════════════════════════════════════════════════╝
    │
    ├──────────────────────────┬──────────────────────────┐
    │                          │                          │
    │ IF CACHE HIT             │ IF CACHE MISS            │
    │ (~15-50 ms)              │ (~7,000-10,000 ms)       │
    ▼                          ▼
    │                  ┌──────────────────────┐
    │                  │ Fetch from IPFS      │
    │                  │ Pinata Gateway       │
    │                  │ URL: $GATEWAY_URL/$  │
    │                  │      {ipfsCID}       │
    │                  └──────────────────────┘
    │                          │
    │                          ▼
    │                  ┌──────────────────────┐
    │                  │ Parse Merkle Tree    │
    │                  │ JSON (with leaves)   │
    │                  └──────────────────────┘
    │                          │
    │                          ▼
    │         ┌────────────────────────────────┐
    │         │ Store in Memory Cache           │
    │         │ ipfsCache.set(ipfsCID, tree)   │
    │         │ TTL: 24 hours                   │
    │         │ Auto-cleanup: 20 min intervals  │
    │         └────────────────────────────────┘
    │                          │
    └──────────────┬───────────┘
                   │
                   ▼
        ╔════════════════════════════════════╗
        ║  STEP 4: Extract Leaf Entry        ║
        ║  const leafEntry =                 ║
        ║    merkleTree.leaves[leafIndex]    ║
        ║                                    ║
        ║  If not found: Return FAKE         ║
        ║  (~0 ms)                           ║
        ╚════════════════════════════════════╝
                 │
                 ▼
        ╔════════════════════════════════════╗
        ║  STEP 5: Build Merkle Proof        ║
        ║  const tree = new MerkleTree(...)  ║
        ║  const proof = tree.getHexProof()  ║
        ║  (~10-50 ms)                       ║
        ╚════════════════════════════════════╝
                 │
                 ▼
        ╔════════════════════════════════════╗
        ║  STEP 6: On-Chain Verification     ║
        ║  contract.verifyAndBurn(           ║
        ║    batchId,                        ║
        ║    proof,                          ║
        ║    leafHash                        ║
        ║  )                                 ║
        ║  (~8,000-11,000 ms)                ║
        ║                                    ║
        ║  Checks:                           ║
        ║  - Merkle proof valid?             ║
        ║  - Strip not already consumed?     ║
        ║  - Batch is active?                ║
        ╚════════════════════════════════════╝
                 │
       ┌─────────┴─────────┐
       │                   │
       ▼                   ▼
    [SUCCESS]          [ERROR]
       │                   │
       ├─ Valid proof      ├─ Invalid proof
       ├─ Not consumed     ├─ Already used
       ├─ Batch active     └─ Custom error
       │
       ▼
  Mark as burned
  (isConsumed = true)
       │
       ▼
        ╔════════════════════════════════════╗
        ║  STEP 7: Log Consumption           ║
        ║  appendLog({                       ║
        ║    hashedNID,                      ║
        ║    drugPrefix,                     ║
        ║    batchId,                        ║
        ║    expired,                        ║
        ║    txHash                          ║
        ║  })                                ║
        ╚════════════════════════════════════╝
              │
              ▼
        ╔════════════════════════════════════╗
        ║  STEP 8: Return Result             ║
        ║  ✅ Authentic (not expired)        ║
        ║  ⚠️  Authentic but EXPIRED         ║
        ║  ❌ Fake (invalid proof)           ║
        ║  🔁 Already Used (counterfeit?)    ║
        ╚════════════════════════════════════╝
              │
              ▼
         [JSON Response]
         │
         └─→ Consumer Device
             Display result
```

---

## Cache Lifecycle — Detailed Timeline

### Example: Batch "BATCH-001" with IPFS CID "Qm12345..."

```
┌──────────────────────────────────────────────────────────────────┐
│ TIME: 00:00 — First Verification                                 │
│                                                                  │
│ Event: Consumer-1 scans QR from Batch-001                       │
│                                                                  │
│ ipfsCache state: {} (empty)                                     │
│                                                                  │
│ Flow:                                                            │
│ 1. Get batch from chain: batch.ipfsCID = "Qm12345..."          │
│ 2. ipfsCache.get("Qm12345...") → null (MISS)                   │
│ 3. Fetch from Pinata (~7.2s)                                   │
│ 4. ipfsCache.set("Qm12345...", merkleTree)                     │
│ 5. Verify on-chain (~9s)                                        │
│                                                                  │
│ Result: ✅ Authentic                                             │
│ Total latency: ~16.2s                                           │
│                                                                  │
│ ipfsCache state: {"Qm12345...": <merkleTree>}                  │
│ TTL expires: 00:00 + 86400s = Next day 00:00                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ TIME: 00:05 — Second Verification (Same Batch)                  │
│                                                                  │
│ Event: Consumer-2 scans different QR from Batch-001             │
│                                                                  │
│ ipfsCache state: {"Qm12345...": <merkleTree>}                  │
│ TTL remaining: 86395s                                            │
│                                                                  │
│ Flow:                                                            │
│ 1. Get batch from chain: batch.ipfsCID = "Qm12345..."          │
│ 2. ipfsCache.get("Qm12345...") → <merkleTree> (HIT!)          │
│ 3. Use cached tree (~0.01s instead of 7.2s)                   │
│ 4. Verify on-chain (~9s)                                        │
│                                                                  │
│ Result: ✅ Authentic                                             │
│ Total latency: ~9.01s  ← **7.2s FASTER!**                      │
│                                                                  │
│ Log output:                                                      │
│ ════════════════════════════════════════════                   │
│ ║ IPFS Retrieval [HIT]  : 15 ms                                 │
│ ════════════════════════════════════════════                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ TIME: 15:00 — Server Restart (Vercel Render)                    │
│                                                                  │
│ Event: Process restart (15-min cycle)                            │
│                                                                  │
│ ipfsCache state: {} (CLEARED!)                                  │
│ TTL: Irrelevant (all data lost in memory)                       │
│                                                                  │
│ Result: All cached entries LOST                                 │
│         Next verification = IPFS miss                           │
│                                                                  │
│ Problem: If Consumer-3 scans Batch-001 QR right now            │
│         → Full 16.2s latency again (should have been 9.01s)    │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ TIME: 15:05 — Third Verification (After Restart)                │
│                                                                  │
│ Event: Consumer-3 scans QR from Batch-001                       │
│                                                                  │
│ ipfsCache state: {} (empty after restart)                       │
│                                                                  │
│ Flow:                                                            │
│ 1. Get batch from chain: batch.ipfsCID = "Qm12345..."          │
│ 2. ipfsCache.get("Qm12345...") → null (MISS)                   │
│    ⚠️ Should have been cached! Lost in restart                  │
│ 3. Fetch from Pinata again (~7.2s)                             │
│ 4. ipfsCache.set("Qm12345...", merkleTree) [new cache]         │
│ 5. Verify on-chain (~9s)                                        │
│                                                                  │
│ Result: ✅ Authentic                                             │
│ Total latency: ~16.2s (back to slow)                            │
│                                                                  │
│ User experience: 🎯 Expected for prototype, NOT acceptable      │
│                  for production                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ TIME: 23:59 — Cache Entry Cleanup (TTL expiration)              │
│                                                                  │
│ NodeCache checkperiod: Every 1200s (20 min)                     │
│                                                                  │
│ At 20:00: ipfsCache checks TTL                                  │
│ → "Qm12345..." created at 00:00                                 │
│ → TTL: 86400s                                                    │
│ → 20 hours elapsed < 24 hours → KEEP                            │
│                                                                  │
│ At 00:00 (next day): Another 20-min check                       │
│ → "Qm12345..." created at 00:00 (yesterday)                    │
│ → TTL: 86400s (24 hours passed)                                 │
│ → DELETE (expired)                                              │
│                                                                  │
│ ipfsCache state: {} (one entry removed)                         │
│ User sees: Fresh data fetched from chain/IPFS                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Current Code Snapshot

### NodeCache Initialization
```javascript
// FILE: backend/src/services/verificationService.js, Line 10

const NodeCache = require("node-cache");

const ipfsCache = new NodeCache({ 
  stdTTL: 86400,    // Time-to-live: 24 hours (86400 seconds)
  checkperiod: 1200 // Periodic cleanup: every 20 minutes
});

// What this means:
// - Each entry lives 24 hours from when it's set
// - Every 20 minutes, expired entries are deleted
// - If entry isn't accessed in 24h, it's removed
```

### Cache Get (Check)
```javascript
// FILE: backend/src/services/verificationService.js, Line 85-98

let merkleTree = ipfsCache.get(batch.ipfsCID);
let cacheStatus = "MISS";

if (merkleTree) {
  // Entry exists in cache!
  console.log(`[CACHE HIT] Merkle tree retrieved from memory for CID: ${batch.ipfsCID}`);
  cacheStatus = "HIT";
  // Use cached merkleTree directly
} else {
  // Entry doesn't exist — must fetch from IPFS
  console.log(`[CACHE MISS] Fetching Merkle tree from IPFS Gateway...`);
  const ipfsUrl  = `${process.env.PINATA_GATEWAY}/${batch.ipfsCID}`;
  try {
    // HTTP request to Pinata (~7.2 seconds)
    merkleTree = await fetchJSON(ipfsUrl);
    
    // Store for next time
    ipfsCache.set(batch.ipfsCID, merkleTree);
  } catch (err) {
    throw new Error(`Failed to fetch Merkle tree from IPFS: ${err.message}`);
  }
}
```

### Cache Set (Store)
```javascript
// FILE: backend/src/services/verificationService.js, Line 97

ipfsCache.set(batch.ipfsCID, merkleTree);

// What this does:
// 1. Stores merkleTree under key: batch.ipfsCID
// 2. Sets TTL: 86,400 seconds (24 hours) from now
// 3. Auto-cleanup: Will be deleted at 24h mark
```

### Performance Logging
```javascript
// FILE: backend/src/services/verificationService.js, Line 160-175

console.log("\n╔══════════════════════════════════════════════════════╗");
console.log("║         VERIFICATION LATENCY METRICS                 ║");
console.log("╠══════════════════════════════════════════════════════╣");
console.log(`║  QR Decode & Local Hash Computation : ${String(metrics.localHashComputation_ms + " ms").padEnd(14)}║`);
console.log(`║  IPFS Retrieval [${metrics.cacheStatus.padEnd(4)}]              : ${String(metrics.ipfsRetrieval_ms + " ms").padEnd(14)}║`);
//                            ↑ This shows HIT or MISS
console.log(`║  Blockchain Verification + Burn     : ${String(metrics.blockchainVerification_ms + " ms").padEnd(14)}║`);
console.log(`║  Total End-to-End Latency           : ${String(metrics.totalVerification_ms + " ms").padEnd(14)}║`);
console.log("╚══════════════════════════════════════════════════════╝\n");
```

---

## What's NOT Cached

### Things you might think are cached but AREN'T:

1. **Blockchain RPC calls**
   ```javascript
   // This is NOT cached:
   batch = await contract.getBatch(batchId);  // Fresh RPC call every time
   ```

2. **User authentication**
   ```javascript
   // SIWE session NOT cached (localStorage only):
   // See: supply-chain-portal/lib/store.js
   ```

3. **Consumption log**
   ```javascript
   // Logged to disk, not cached:
   appendLog({ hashedNID, batchId, txHash });  // Writes to JSON file
   ```

4. **Anomaly detection**
   ```javascript
   // Logged but not cached for retrieval:
   detectAndLogAnomaly(err, { drugId, batchId, ipAddress });
   ```

### Only cached:
```
✅ Merkle tree JSON from IPFS
✅ Full tree structure with all leaves
✅ One cache per IPFS CID
✅ 24-hour TTL per entry
```

---

## Expected Cache Hit Ratio

### In real production:

| Scenario | Hit Ratio | Notes |
|----------|-----------|-------|
| Single batch many times | 90-95% | Popular batch, many verifications |
| Multiple batches | 50-70% | New batches not yet cached |
| First hour after deploy | 10-20% | Empty cache at start |
| After 24-hour TTL reset | 0% | All entries expired |

**Average (steady state):** ~60-75% hit rate

---

## Memory Usage

### Storage size:

```
Per Merkle tree:
├─ 100 strips:    ~4 KB
├─ 1,000 strips:  ~40 KB
├─ 10,000 strips: ~400 KB
└─ 100,000 strips: ~4 MB

At scale (realistic):
├─ Active batches: ~10-20
├─ Average size: ~1,000 strips each
├─ Per batch: ~40 KB
├─ Total memory: ~400-800 KB

Node.js process:
├─ Base memory: ~50-100 MB
├─ With cache: ~50-101 MB (negligible)
└─ Not a concern for scaling
```

---

## Summary: Cache Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│ CREATION                                                │
│ • ipfsCache.set(key, value)                             │
│ • TTL: now + 86400 seconds                              │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ ACTIVE (0-24 hours)                                     │
│ • ipfsCache.get(key) returns value                      │
│ • Used for 1000+ verifications                          │
│ • Every 20 min: checkperiod validates TTL               │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼ (24 hours pass)
┌─────────────────────────────────────────────────────────┐
│ EXPIRED                                                 │
│ • checkperiod cleanup runs                              │
│ • Entry removed from cache                              │
│ • Memory freed                                          │
│ • Next call = IPFS miss                                 │
└─────────────────────────────────────────────────────────┘
```

**Prototype Status:** ✅ Working perfectly  
**Production Ready:** ⏳ Needs persistence layer  
**Next Phase:** Redis + Database backup
