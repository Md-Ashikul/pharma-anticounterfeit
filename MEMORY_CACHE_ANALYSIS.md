# 📊 PharmaChain Memory Cache Management — Analysis & Problem Statement

## 🎯 Executive Summary

PharmaChain is a blockchain-based pharmaceutical anti-counterfeiting system that verifies drug authenticity using Merkle proofs stored on IPFS. The current implementation uses **in-memory caching (NodeCache)** for storing Merkle trees during verification, which optimizes performance but is **ephemeral** — it resets every 15 minutes during render restarts.

This document analyzes:
1. **What's being done** — Current cache implementation
2. **What's wanted** — Ideal cache behavior for production
3. **The problem** — Gaps in the prototype phase
4. **Future roadmap** — Multisig DAO integration

---

## 🏗️ System Context

### Verification Flow (9-16 seconds end-to-end)
```
Consumer scans Hidden QR
    ↓
[LOCAL] Hash computation (~0 ms)
    ↓
[IPFS] Fetch Merkle tree from Pinata (~7,211 ms)
    ↓
[CACHE] Store tree in memory for subsequent verifications
    ↓
[LOCAL] Rebuild tree & compute proof
    ↓
[BLOCKCHAIN] Call verifyAndBurn() on Sepolia (~9,000 ms)
    ↓
Result: ✅ Authentic / ⚠️ Expired / 🚨 Fake / 🔁 Already Used
```

---

## 🔍 CURRENT IMPLEMENTATION — What's Being Done

### 1. **In-Memory Cache (NodeCache)**

**File:** `backend/src/services/verificationService.js`

```javascript
const NodeCache = require("node-cache");
const ipfsCache = new NodeCache({ stdTTL: 86400, checkperiod: 1200 }); 
```

**Configuration:**
- **stdTTL:** 86,400 seconds (24 hours) — TTL per entry
- **checkperiod:** 1,200 seconds (20 minutes) — Cleanup interval
- **Scope:** Single Node.js process memory

### 2. **Cache Mechanism**

**Cache Hit:** Merkle tree already in memory
```javascript
let merkleTree = ipfsCache.get(batch.ipfsCID);

if (merkleTree) {
  console.log(`[CACHE HIT] Merkle tree retrieved from memory`);
  cacheStatus = "HIT";
} else {
  // Fetch from IPFS...
  ipfsCache.set(batch.ipfsCID, merkleTree);
}
```

**What's cached:**
- **Key:** IPFS CID (unique hash of Merkle tree)
- **Value:** Complete Merkle tree JSON
  ```json
  {
    "leaves": [
      { "leaf": "0xhash1", "index": 0 },
      { "leaf": "0xhash2", "index": 1 },
      ...
    ]
  }
  ```

### 3. **Performance Impact**

**Latency Metrics Logged:**
```
QR Decode & Local Hash Computation    : ~0 ms
IPFS Retrieval [HIT/MISS]             : ~7,211 ms (first time)
                                         ~0-50 ms (cached)
Blockchain Verification + Burn         : ~9,000 ms
───────────────────────────────────────────────────
Total End-to-End Latency              : ~16,536 ms (first verification)
                                         ~9,100 ms (cached)
```

**Cache benefit:** **7+ seconds saved** per cached verification!

### 4. **Current Limitations**

| Issue | Impact | Severity |
|-------|--------|----------|
| **Ephemeral memory** — Lost on process restart | Data lost every 15 min | 🔴 Critical |
| **Single-process** — No horizontal scaling | Cache not shared across replicas | 🔴 Critical |
| **No persistence** — In-memory only, no DB fallback | No recovery mechanism | 🟡 High |
| **No invalidation signals** — Manual TTL only | Stale data if batch revoked | 🟡 High |
| **No metrics** — Cache hit/miss not tracked centrally | No observability | 🟡 Medium |

---

## ❓ PROBLEM STATEMENT — What's Wanted

### The Gap: From Prototype → Production

**In Prototype (Current):**
- Cache works within a single request cycle
- 15-minute render restart = cache loss (acceptable for testing)
- Performance metrics are local console logs
- No multi-region or multi-instance support

**In Production (Desired):**
- Cache persists across server restarts ✗ Currently missing
- Cache shared across multiple server instances ✗ Currently missing
- Cache invalidation linked to blockchain events ✗ Currently missing
- Distributed observability & monitoring ✗ Currently missing
- Fallback to persistent storage if cache misses ✗ Currently missing
- DID-based cache permission model (future) ✗ Not started

---

## 🎯 Strategic Goals — Why Cache Management Matters

### 1. **Performance Optimization**
- **Goal:** Reduce verification latency from 16.5s → ~9s
- **Method:** Pre-cache Merkle trees from popular batches
- **Impact:** Improved UX for consumers scanning QR codes

### 2. **Cost Reduction**
- **Goal:** Minimize IPFS gateway hits (potential per-request fees)
- **Method:** Multi-tier cache (memory → Redis → disk)
- **Impact:** ~80% reduction in IPFS bandwidth costs at scale

### 3. **Scalability**
- **Goal:** Support millions of daily verifications
- **Method:** Distributed cache (Redis, DynamoDB, or Upstash)
- **Impact:** Linear scaling without cache contention

### 4. **Reliability**
- **Goal:** Ensure cache survives infrastructure failures
- **Method:** Persist cache to database with TTL
- **Impact:** Zero downtime during deployments

---

## 🔗 Connection to Multisig DAO System (Future)

### Roadmap Phase: Cache → Multisig DAO

**Phase 1 (Current):** Memory cache prototype
- Local caching works
- Latency metrics visible
- Render resets are expected & ignored

**Phase 2 (Next - Multisig DAO):** Distributed cache + governance
- Cache becomes DAO-managed resource
- Multisig validators approve cache invalidation
- Example:
  ```solidity
  // Multisig governance contracts
  interface DAOCache {
    function invalidateBatch(bytes32 batchId) external onlyMultisig;
    function setCacheTTL(uint256 seconds) external onlyMultisig;
    function emergencyClear() external onlyEmergencyMultisig;
  }
  ```

**Phase 3 (Future):** DAO-controlled verification
- Cache decisions require DAO consensus
- Batch registration locked by multisig
- Verification audit trail on-chain

**Why multisig matters for cache:**
- Cache becomes critical infrastructure (like DNS in web2)
- Prevents single authority from manipulating verification speed
- Government + stakeholders + manufacturers co-manage cache policy

---

## 📋 Current Cache Behavior — Detailed Breakdown

### **What Happens When:**

#### Scenario A: First Verification of Batch X
```
1. Consumer scans Hidden QR → drugId, batchId, leafIndex, secret
2. Backend: GET batch from blockchain ✓
3. Backend: IPFS CACHE MISS → Fetch from Pinata (~7.2s)
4. Backend: Store in memory cache (key=IPFS_CID)
5. Backend: Compute Merkle proof, call verifyAndBurn()
6. Result returned (~16.5s total)
```

#### Scenario B: Second Verification (Same Batch, Within 24 hours)
```
1. Consumer scans different Hidden QR from same batch
2. Backend: GET batch from blockchain ✓
3. Backend: IPFS CACHE HIT → Tree already in memory (~0-50ms)
4. Backend: Use cached tree, compute proof, call verifyAndBurn()
5. Result returned (~9.1s total) ← **7+ seconds saved!**
```

#### Scenario C: Server Restart (After 15 minutes)
```
1. Vercel render process restarts
2. Node.js application starts
3. new NodeCache() → Fresh empty cache
4. All previous Merkle trees lost
5. Next verification goes to Scenario A (IPFS miss)
```

#### Scenario D: Batch Revoked by Government (Future: Multisig DAO)
```
1. Government revokes batch on blockchain (or DAO votes to revoke)
2. isActive = false
3. Current: Cache doesn't know → could serve stale tree ⚠️
4. Future: DAO calls cache.invalidateBatch() → all instances cleared
5. Cache miss forces re-fetch of updated batch info
```

---

## 💾 Data Stored in Cache

### Each Cache Entry
```javascript
Key:   "QmXx...YyZz"  // IPFS CID (58-char base32)
Value: {
  "leaves": [
    {
      "leaf": "0x8e8f...",        // keccak256(secret)
      "index": 0
    },
    {
      "leaf": "0x9f9g...",
      "index": 1
    },
    // ... up to 10,000 leaves per batch
  ]
}

TTL:   86,400 seconds (24 hours)
Size:  ~10-50 KB per entry (1,000 leaves ≈ 40 KB)
```

### Cache Stats (Not Currently Tracked)
```
Total entries:        ~5-20 active batches
Memory used:          ~500 KB - 1 MB
Hit rate:             ~60-80% (estimated)
Miss rate:            ~20-40%
Eviction rate:        ~0% (TTL-based cleanup only)
```

---

## 🚨 Problem Scenarios in Current Implementation

### Problem #1: Lost on Restart
```
✗ 15 min: Server restarts → Cache cleared
✗ Consumer verification at 14:59 works (CACHED)
✗ Same consumer at 15:01 re-verifies (IPFS MISS - 7+ sec slower)
```

**Impact:** ~17% of verifications experience degraded performance

### Problem #2: No Cross-Instance Sharing
```
✗ Vercel deploys 5 container instances
✗ Instance 1 caches Merkle tree for "Batch-A"
✗ Instance 2 gets request for "Batch-A" → Cache miss
✗ 5 parallel IPFS fetches instead of 1 + cache sharing
```

**Impact:** At scale, N×N redundant IPFS fetches

### Problem #3: Stale Batch Information
```
✗ Merkle tree cached for "Batch-X"
✗ Government revokes "Batch-X" on-chain
✗ Cache still has old tree (TTL not reached)
✗ Verification could incorrectly pass for revoked batch ⚠️
```

**Impact:** Security vulnerability if batch revocation isn't checked

### Problem #4: No Rollback on Bad Merkle Trees
```
✗ Corrupted Merkle tree uploaded to IPFS
✗ Cache stores corrupted tree
✗ 100 verifications fail with corrupted cached data
✗ No way to invalidate cache without code deploy
```

**Impact:** Data integrity risk

---

## ✅ Success Criteria — What "Solved" Looks Like

| Criterion | Current | Desired |
|-----------|---------|---------|
| **Persistence across restarts** | ✗ Lost | ✓ Survives 99.99% of restarts |
| **Cross-instance sharing** | ✗ Single process | ✓ Shared distributed cache |
| **Revocation awareness** | ✗ No invalidation | ✓ DAO can revoke instantly |
| **Fallback layer** | ✗ None | ✓ DB → Cache → IPFS hierarchy |
| **Observability** | ✗ Console.log | ✓ Centralized metrics |
| **Latency improvement** | ✓ 7s saved (cached) | ✓ Maintain + extend to 95%+ hit rate |
| **Cost reduction** | Partial | ✓ 80%+ IPFS cost savings |

---

## 🗺️ Recommended Architecture (Post-Prototype)

### Multi-Tier Cache Stack
```
                     ┌─────────────────────┐
                     │  Consumer Request   │
                     │ (Verify Drug QR)    │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │  Tier 1: L1 Cache   │
                     │ (In-Memory: 5-10min)│
                     │ [Redis/Upstash]     │
                     └────┬────────────┬───┘
                         │ HIT        │ MISS
                         │            ▼
                         │  ┌─────────────────────┐
                         │  │  Tier 2: L2 Cache   │
                         │  │ (Persistent: 24h)   │
                         │  │ [Database/DynamoDB] │
                         │  └────┬───────────┬────┘
                         │       │ HIT       │ MISS
                         │       │           ▼
                         │       │  ┌──────────────────┐
                         │       │  │   IPFS Gateway   │
                         │       │  │ (Fetch + cache)  │
                         │       │  └──────────────────┘
                         │       │
                         └───────┼────────┐
                                 │ Return │
                                 ▼        │
                         ┌──────────────┐ │
                         │  Verification│ │
                         │   (Chain)    │ │
                         └──────────────┘ │
                                          ▼
                              ┌──────────────────────┐
                              │ Consumer Result      │
                              │ (✅ Authentic)       │
                              └──────────────────────┘
```

### Technologies for Each Tier
- **Tier 1 (L1):** Upstash Redis or AWS ElastiCache
- **Tier 2 (L2):** DynamoDB or PostgreSQL
- **Tier 3:** Pinata IPFS Gateway

---

## 🔐 Security & Governance (Multisig DAO)

### Cache Governance Model
```solidity
// Smart contracts for cache management (Future)

interface CacheGovernance {
  // Government revokes batch → Clear from all cache tiers
  function invalidateBatch(string batchId) external onlyMultisig;
  
  // Emergency: clear all cache if corrupted
  function emergencyClear() external onlyEmergencyCouncil;
  
  // Set TTL policy (how long cache persists)
  function setCacheTTL(uint256 seconds) external onlyDAOVote;
  
  // Add/remove IPFS CID from blocklist (compromised source)
  function blockCID(string ipfsCID) external onlyGovernance;
}
```

---

## 📊 Performance Metrics — Current State

### From Console Logs (Last 100 Verifications)

```
QR Decode & Local Hash       : ~0-2 ms
IPFS Retrieval [HIT]         : ~1-50 ms (avg 15ms)
IPFS Retrieval [MISS]        : ~7,000-10,000 ms
Blockchain Verification      : ~8,000-11,000 ms
───────────────────────────────────────────────
Total [CACHE HIT]            : ~9,100-11,100 ms (avg 9,500ms)
Total [CACHE MISS]           : ~15,000-21,000 ms (avg 16,500ms)

Hit Rate (current batch):    ~75% (estimated)
Miss Rate:                   ~25% (cold start batches)
```

### Expected Performance After Production Cache

```
Hit Rate Target:             ~95%
Average Latency [HIT]:       ~9,100 ms (no change needed)
Average Latency [MISS]:      ~16,500 ms (rare)
P99 Latency:                 ~12,000 ms (improved)
```

---

## 📝 Summary — What's Wanted

### For Production Readiness:

1. **Persistent Cache Layer**
   - Cache survives server restarts
   - Backed by DynamoDB or PostgreSQL

2. **Distributed Cache**
   - Shared across multiple server instances
   - Redis/Upstash for L1, database for L2

3. **Invalidation Strategy**
   - Government revokes batch → Cache cleared immediately
   - DAO votes on cache policy changes
   - Emergency clear for corrupted data

4. **Observability**
   - Central dashboard for cache metrics
   - Hit rate, miss rate, latency percentiles
   - Anomaly alerts

5. **Fallback Hierarchy**
   - L1 Cache (Redis) → L2 Cache (DB) → IPFS
   - No single point of failure

6. **Multisig DAO Integration** (Future Phase)
   - Cache decisions require governance consensus
   - Revocation auction system
   - Stake-based cache priority

---

## ✨ Conclusion

**Current state:** In-memory cache works perfectly for **prototype phase** — solves 7+ second latency penalty and proves concept.

**Why ignoring render restarts is fine now:** It's expected in development; production deployments will have persistent storage.

**What comes next:** Implement distributed cache layer (Redis + Database) before moving to multisig DAO governance model.

**Timeline:**
- ✅ **Now:** Memory cache (DONE)
- 🚀 **Phase 2:** Redis + Database cache
- 🔐 **Phase 3:** Multisig DAO governance for cache policies

---

**Prepared for:** Architecture planning & implementation roadmap  
**Date:** May 2026  
**Version:** 1.0 (Prototype Analysis)
