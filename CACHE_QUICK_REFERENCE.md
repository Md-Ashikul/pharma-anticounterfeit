# 🎯 Quick Reference — Memory Cache System

## One-Page Summary

### What's Happening NOW (Prototype)
```
Consumer scans QR
    ↓
Backend checks: Is Merkle tree in RAM?
    ├─ YES → Return in ~9s (CACHE HIT) ✅ FAST
    └─ NO  → Fetch from IPFS in ~16s (CACHE MISS) ⏳ SLOW
```

### The Problem
| Issue | Effect | Fix |
|-------|--------|-----|
| Cache lost every 15 min | Slower verification | Use database |
| No sharing between servers | Redundant IPFS calls | Use Redis |
| Can't invalidate instantly | Stale data risk | Add DAO signal |

### What You're Building Toward

**Phase 1 ✅** — Memory cache (DONE)
- Latency: 16.5s → 9s for cached verifications
- Cost: 80% IPFS savings for repeated batches

**Phase 2 🔜** — Redis + Database
- Survives server restarts
- Scales to millions of verifications
- Cross-instance cache sharing

**Phase 3 🔐** — Multisig DAO Control
- Cache revocation requires governance vote
- Democratic control over verification infrastructure
- Prevents single authority manipulation

---

## How Cache Currently Works

### File: `backend/src/services/verificationService.js`

```javascript
// Line 10: Create in-memory cache
const ipfsCache = new NodeCache({ 
  stdTTL: 86400,      // 24-hour expiration
  checkperiod: 1200   // Clean up every 20 min
}); 

// Line 85: Check cache first
let merkleTree = ipfsCache.get(batch.ipfsCID);

if (merkleTree) {
  // Found in cache! Use it (fast path: ~9s)
  cacheStatus = "HIT";
} else {
  // Not in cache, fetch from IPFS
  const ipfsUrl = `${process.env.PINATA_GATEWAY}/${batch.ipfsCID}`;
  merkleTree = await fetchJSON(ipfsUrl);
  
  // Store for next time
  ipfsCache.set(batch.ipfsCID, merkleTree);
  cacheStatus = "MISS";
}

// Line 120: Log performance
console.log(`IPFS Retrieval [${cacheStatus}]: ${metrics.ipfsRetrieval_ms} ms`);
```

### What Gets Cached
```javascript
// Key: IPFS content ID (e.g., "QmXxYyZz...")
// Value: Merkle tree JSON
{
  leaves: [
    { leaf: "0x8e8f...", index: 0 },    ← Leaf hash
    { leaf: "0x9f9g...", index: 1 },    ← Next leaf
    // ... thousands of leaves
  ]
}

// TTL: 86,400 seconds (24 hours)
// Then: Automatically deleted
```

---

## Performance Impact

### Verification Latency Breakdown

#### ❌ Cache MISS (First time seeing batch)
```
Local hash computation   :    0-2 ms
IPFS fetch             : 7,000-10,000 ms  ← BOTTLENECK
Blockchain verify      : 8,000-11,000 ms
────────────────────────────────────────
TOTAL                  : ~15,000-21,000 ms (16.5s avg)
```

#### ✅ Cache HIT (Batch already fetched)
```
Local hash computation   :    0-2 ms
IPFS cache lookup      :    1-50 ms        ← Much faster!
Blockchain verify      : 8,000-11,000 ms
────────────────────────────────────────
TOTAL                  : ~9,100-11,100 ms (9.5s avg)
```

**Benefit: 7+ seconds saved per verification!**

---

## Current Limitations (Why You Need Phase 2+)

### Problem #1: Lost on Restart
```
Time: 14:59
Server running 24 hours
├─ Caches: Batch-A, Batch-B, Batch-C
└─ Hit rate: 80%

Time: 15:00
Vercel restarts (15-min cycle)
├─ new NodeCache() → Empty!
├─ All cached trees lost
└─ Next verification: Cache MISS
```

### Problem #2: Single Server Only
```
Deployment: 5 instances running
├─ Instance-1: Caches Batch-X
├─ Instance-2: Request for Batch-X
│  └─ Local cache is empty!
│  └─ Fetches from IPFS (redundant)
└─ Same for Instances 3,4,5
   
Result: 5 parallel IPFS calls for same batch ❌
Desired: 1 call, shared across all instances ✅
```

### Problem #3: Stale Data Risk
```
Scenario: Batch revoked by government
├─ Blockchain: isActive = false
├─ Your cache: Still has old Merkle tree
├─ TTL hasn't expired yet
└─ Verification might pass for revoked batch ⚠️

Solution: DAO votes → Cache immediately cleared
```

---

## What "Fixed" Looks Like

### Production Cache Architecture
```
                    Redis (L1)
              (5-10 min, fast)
                     │
                     ├─ Hit? → Return (fast)
                     │
                     └─ Miss? → Query L2
                          │
                   Database (L2)
              (24 hours, persistent)
                     │
                     ├─ Hit? → Cache in Redis + return
                     │
                     └─ Miss? → Fetch from IPFS
                          │
                   Pinata IPFS
              (source of truth)
                     │
                     └─ Cache in DB + Redis
```

**Benefits:**
- ✅ Survives server restarts (Redis persists)
- ✅ Shared across instances (Redis is central)
- ✅ Can be invalidated by DAO (clear signal)
- ✅ Fallback if Redis down (use DB)
- ✅ Metrics visible (Redis has stats)

---

## Metrics Currently Logged

Every verification prints:
```
╔══════════════════════════════════════════════════════╗
║         VERIFICATION LATENCY METRICS                 ║
╠══════════════════════════════════════════════════════╣
║  QR Decode & Local Hash Computation : 2 ms       ║
║  IPFS Retrieval [HIT]               : 15 ms      ║  ← CACHE STATUS
║  Blockchain Verification + Burn     : 9200 ms    ║
║  Total End-to-End Latency           : 9217 ms    ║
╠══════════════════════════════════════════════════════╣
║         GAS COST METRICS                             ║
╠══════════════════════════════════════════════════════╣
║  verifyAndBurn() Gas Used           : 147631     ║
╚══════════════════════════════════════════════════════╝
```

**Key line:** `IPFS Retrieval [HIT/MISS]` tells you if cache worked.

---

## Roadmap: From Prototype → Production → DAO

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: PROTOTYPE (NOW ✅)                                      │
├─────────────────────────────────────────────────────────────────┤
│ Implementation: NodeCache (in-memory)                            │
│ Persistence: None (expected, OK for prototype)                   │
│ Scaling: Single process only                                    │
│ Governance: Hardcoded 24-hour TTL                               │
│                                                                  │
│ ✅ Proves cache concept works                                     │
│ ✅ Latency improvement: 16.5s → 9s for hits                     │
│ ✅ Research paper data collected                                 │
│                                                                  │
│ ⏳ Ready to move to Phase 2                                       │
└─────────────────────────────────────────────────────────────────┘

        ↓ (After prototype validation)

┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2: PRODUCTION READY (PLANNED 🚀)                          │
├─────────────────────────────────────────────────────────────────┤
│ Implementation: Redis (L1) + Database (L2)                      │
│ Persistence: Database TTL (survives restarts)                   │
│ Scaling: Horizontal (all instances share cache)                 │
│ Governance: API endpoint to invalidate cache                    │
│                                                                  │
│ ✅ Survives 99.99% of infrastructure events                      │
│ ✅ No data loss on deployment                                    │
│ ✅ Cross-instance cache sharing                                  │
│ ✅ Operational metrics dashboard                                 │
│                                                                  │
│ 🔄 Ready for millions of daily verifications                     │
└─────────────────────────────────────────────────────────────────┘

        ↓ (After 6 months production)

┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3: MULTISIG DAO GOVERNANCE (FUTURE 🔐)                   │
├─────────────────────────────────────────────────────────────────┤
│ Implementation: Redis + Database + Smart Contracts              │
│ Persistence: Same as Phase 2                                    │
│ Scaling: Same as Phase 2                                        │
│ Governance: DAO votes on cache policy                           │
│                                                                  │
│ ✅ Cache is democratic resource (not single authority)           │
│ ✅ Batch revocation by multisig                                  │
│ ✅ TTL changes require vote                                      │
│ ✅ Emergency clear by emergency council                          │
│ ✅ Audit trail: all decisions on-chain                           │
│                                                                  │
│ 🔐 Prevents centralized manipulation of verification speed      │
│ 🔐 Transparent governance over critical infrastructure          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Files to Know

| File | Purpose | Lines |
|------|---------|-------|
| `backend/src/services/verificationService.js` | Cache implementation | 1-15, 85-120 |
| `backend/src/config/contracts.js` | Blockchain contract setup | - |
| `backend/src/routes/consumer.js` | Verification API endpoint | - |
| `supply-chain-portal/lib/store.js` | Frontend state (localStorage only) | - |

---

## Next Steps (When Ready)

1. **Evaluate Redis provider** (Upstash vs AWS ElastiCache)
2. **Design database schema** for L2 cache
3. **Implement cache invalidation** API
4. **Add metrics collection** (hit rate, latency percentiles)
5. **Plan multisig DAO** contract for governance

---

**Status:** Prototype phase complete. Cache working. Ready for Phase 2 planning.
