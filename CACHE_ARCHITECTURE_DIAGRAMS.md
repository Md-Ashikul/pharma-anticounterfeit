# 🎨 Memory Cache — Visual Architecture Diagrams

## 1. Current Prototype Architecture (NOW)

```
┌──────────────────────────────────────────────────────────────────────┐
│                      PHARMACEUTICAL VERIFICATION                     │
│                        (Consumer Scans QR)                           │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Node.js Backend│
                    │  (Single Server)│
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
        ┌──────────────────┐   ┌──────────────┐
        │  In-Memory Cache │   │ Blockchain   │
        │  (NodeCache)     │   │ (Sepolia)    │
        │                  │   │              │
        │ Merkle Trees:    │   │ - Verify     │
        │ • CID1 → Tree    │   │ - Burn       │
        │ • CID2 → Tree    │   │ - Track      │
        │ • CID3 → Tree    │   └──────────────┘
        │                  │
        │ TTL: 24h         │
        │ Memory: ~1MB     │
        └────────┬─────────┘
                 │
         ┌───────┴───────┐
         │               │
         ▼               ▼
    ┌─────────┐     ┌──────────┐
    │ IPFS    │     │  Result  │
    │(Pinata) │     │ ✅ Auth. │
    │         │     │ ⚠️ Exp.  │
    │ (First) │     │ ❌ Fake  │
    └─────────┘     │ 🔁 Used  │
                    └──────────┘

Speed: 16.5s → 9s for cache hits (+44% improvement)
Data: Lost on restart (15-min cycles)
Instances: Single server only
Governance: Hardcoded TTL only
```

---

## 2. Production Architecture (PHASE 2)

```
┌──────────────────────────────────────────────────────────────────────┐
│                   DISTRIBUTED PHARMACEUTICAL                         │
│                      VERIFICATION SYSTEM                             │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
    ┌──────────┐      ┌──────────┐      ┌──────────┐
    │Instance-1│      │Instance-2│      │Instance-N│
    │(Server)  │      │(Server)  │      │(Server)  │
    └────┬─────┘      └────┬─────┘      └────┬─────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
              ┌────────────▼────────────┐
              │   Redis (Tier-1)        │
              │   ─────────────────     │
              │ • Hot cache (5-10 min)  │
              │ • Fast lookup (~1ms)    │
              │ • In-memory             │
              │ • Upstash/ElastiCache   │
              │                         │
              │ Stores active batches   │
              └────────────┬────────────┘
                           │ MISS ↓ HIT ↑
         ┌─────────────────┴────────────────┐
         │                                  │
         ▼                                  ▼
    ┌──────────────┐            ┌───────────────┐
    │ Database     │            │ Validation    │
    │ (Tier-2)     │            │               │
    │ ────────────│            │ • Proof check  │
    │ • Persistent│            │ • Expiry check │
    │ • 24h TTL   │            │ • Burn status  │
    │ • DynamoDB/ │            │ • Gas cost     │
    │   PostgreSQL│            │               │
    │             │            │ ✅ Pass/Fail  │
    │ Fallback:   │            └───────────────┘
    │ • Restore   │                     │
    │   on Redis  │                     ▼
    │   outage    │            ┌─────────────────┐
    └────────┬────┘            │ On-Chain Tx     │
             │ MISS ↓ HIT ↑    │ Blockchain      │
             │                 │ Sepolia         │
             └────────┬────────┘                 │
                      │                         │
                      └──────────────┬──────────┘
                                     │
                            ┌────────▼────────┐
                            │ IPFS Gateway    │
                            │ (Pinata)        │
                            │ ─────────────   │
                            │ • Source truth  │
                            │ • Merkle trees  │
                            │ • Last resort   │
                            │                 │
                            │ Cached in DB +  │
                            │ Redis           │
                            └─────────────────┘

Speed: 95%+ hit rate → ~9.1s avg (only miss = IPFS fetch)
Data: Persists across restarts via database
Instances: All instances share cache via Redis
Governance: API endpoint to invalidate cache
Cost: 80%+ reduction in IPFS calls
Reliability: 3-tier fallback (Redis → DB → IPFS)
```

---

## 3. DAO-Governed Architecture (PHASE 3)

```
┌──────────────────────────────────────────────────────────────────────┐
│            MULTISIG DAO-CONTROLLED VERIFICATION CACHE               │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
   ┌─────────┐         ┌──────────┐        ┌──────────┐
   │ Govt    │         │ Mfg      │        │ Retail   │
   │ Wallet  │         │ Wallet   │        │ Wallet   │
   │         │         │          │        │          │
   │ Multisig│         │ Multisig │        │ Multisig │
   │ Council │         │ Members  │        │ Members  │
   └────┬────┘         └────┬─────┘        └────┬─────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────┐
        │  Smart Contract Layer             │
        │  CacheGovernance.sol              │
        │  ────────────────────────────     │
        │ • invalidateBatch()               │
        │ • setCacheTTL()                   │
        │ • emergencyClear()                │
        │ • blockCID()                      │
        │ • proposalVote()                  │
        │                                   │
        │ Requires: 3-of-5 multisig         │
        └────────┬────────────────────────┘
                 │
      ┌──────────┼──────────┐
      │          │          │
      ▼          ▼          ▼
   ┌──────────────────────────────────────┐
   │   Event Listeners (Off-Chain)        │
   │ ─────────────────────────────────    │
   │  • InvalidateBatch event             │
   │  • CacheTTLChanged event             │
   │  • EmergencyClear event              │
   └──────────┬───────────────────────────┘
              │
    ┌─────────┴──────────────────┐
    │                            │
    ▼                            ▼
┌──────────────────────┐  ┌─────────────────┐
│ Redis Layer (L1)     │  │ Clear Command   │
│ ────────────────     │  │ ─────────────   │
│ • Active batches     │  │ • Delete keys   │
│ • Invalidated on     │  │ • Broadcast all │
│   DAO vote           │  │   instances     │
└──────────────────────┘  └─────────────────┘
    │
    ▼
┌──────────────────────────────────────┐
│ Database Layer (L2)                  │
│ ────────────────────────────────     │
│ • Persistent storage                 │
│ • Governance audit trail             │
│ • TTL policy changes stored          │
│ • Revocation history logged          │
└──────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────┐
│ Verification Requests                │
│ ────────────────────────────────     │
│ 1. Check DAO approved batch?          │
│ 2. Check cache invalidation?          │
│ 3. Proceed with verification         │
└──────────────────────────────────────┘

Speed: Same as Phase 2 (~9.1s avg)
Data: Persists + auditable on-chain
Instances: Distributed cache + governance
Governance: DAO votes control cache policy
Security: Multisig prevents solo authority abuse
Transparency: All decisions on blockchain
Audit Trail: Complete history of changes
```

---

## 4. Cache Hit vs Miss Latency Comparison

```
┌─────────────────────────────────────────────────────────────────┐
│         VERIFICATION LATENCY — HIT vs MISS TIMELINE             │
└─────────────────────────────────────────────────────────────────┘

CACHE HIT SCENARIO (~9.1 seconds total)
═════════════════════════════════════════════════════════════════

0ms    │
       ├─ Consumer scans QR                                       │
1ms    │                                                          │
       │                                                          │
2ms    ├─ Compute hash (keccak256)                               │ 0-2ms
       │                                                          │
10ms   │ Backend receives request                                 │
       ├─ Query blockchain for batch info                        │ 1-2s
1100ms │                                                          │
       ├─ Check cache: ipfsCache.get(CID)                        │
1115ms │ ✅ HIT! Tree found in memory (~15ms lookup)             │ 15ms
       │                                                          │
1115ms ├─ Build Merkle proof from cached tree                    │ 10-50ms
1125ms │                                                          │
       ├─ Call verifyAndBurn() on blockchain                    │ 8-11s
       │  • Send transaction                                     │
       │  • Wait for block confirmation                         │
       │  • Execute smart contract                              │
9125ms │                                                          │
       └─ Return result (✅ Authentic)                           │
9125ms


CACHE MISS SCENARIO (~16.2 seconds total)
═════════════════════════════════════════════════════════════════

0ms    │
       ├─ Consumer scans QR                                       │
1ms    │                                                          │
       │                                                          │
2ms    ├─ Compute hash (keccak256)                               │ 0-2ms
       │                                                          │
10ms   │ Backend receives request                                 │
       ├─ Query blockchain for batch info                        │ 1-2s
1100ms │                                                          │
       ├─ Check cache: ipfsCache.get(CID)                        │
1115ms │ ❌ MISS! Tree not in memory (~15ms lookup)              │ 15ms
       │                                                          │
1115ms ├─ Fetch from Pinata IPFS Gateway                         │ 7-10s
       │  • HTTP request                                         │
       │  • Parse JSON response                                  │
       │  • Decompress if needed                                 │
8200ms │                                                          │
       ├─ Store in cache: ipfsCache.set(CID, tree)               │ <1ms
8201ms │ (Future lookups will be HIT)                            │
       │                                                          │
8201ms ├─ Build Merkle proof from cached tree                    │ 10-50ms
8210ms │                                                          │
       ├─ Call verifyAndBurn() on blockchain                    │ 8-11s
       │  • Send transaction                                     │
       │  • Wait for block confirmation                         │
       │  • Execute smart contract                              │
16210ms│                                                          │
       └─ Return result (✅ Authentic)                           │
16210ms


COMPARISON
═════════════════════════════════════════════════════════════════

  16.2s (MISS) ─────────────────────────────────────────
              │
              │
  9.1s (HIT)  ───────────────────
              │
              └── 7.1 seconds saved (44% improvement) ✅
```

---

## 5. Memory Usage Over Time

```
┌─────────────────────────────────────────────────────────────────┐
│        CACHE MEMORY GROWTH — STEADY STATE                       │
└─────────────────────────────────────────────────────────────────┘

Memory (MB)
    │
 60 │  ┌────────────────────────────────────────────┐
    │  │                                            │
 55 │  │ Stable: ~50-52 MB (process baseline)      │
    │  │                                            │
 50 │  ├────────────────────────────────────────────┤
    │  │                                            │
 45 │  │ Cache overhead: ~1-2 MB                   │
    │  │ • Merkle trees: ~20-30 active batches     │
    │  │ • ~50 KB each = ~1.5 MB total            │
    │  │ • Negligible vs baseline                  │
    │  │                                            │
 40 │  │                                            │
    │  │                                            │
 35 │  │                                            │
    │  │                                            │
 30 │  │                                            │
    │  └────────────────────────────────────────────┘
    │
    └──────────────────────────────────────────────────────── Time (hours)
    0      6     12      18      24      30      36      42


TTL Cleanup Events
═════════════════════════════════════════════════════════════════

Time 00:00 ─ Cache initialized (empty)
Time 00:05 ─ Batch-001 added (40 KB)         [Total: 40 KB]
Time 00:10 ─ Batch-002 added (35 KB)         [Total: 75 KB]
Time 00:15 ─ Batch-003 added (45 KB)         [Total: 120 KB]
         ─ Cleanup check (no TTL expired)
Time 00:20 ─ Batch-004 added (42 KB)         [Total: 162 KB]
         ─ Cleanup check (no TTL expired)
...
Time 12:00 ─ 12 more batches added           [Total: ~1.2 MB]
         ─ Memory stable (steady state)
...
Time 24:00 ─ Cleanup check runs              [Total: ~1.2 MB]
         ─ Batch-001 TTL expired (24h old)
         ─ Deleted from cache (40 KB freed)
         ─ Memory: ~1.16 MB
Time 24:05 ─ New Batch-025 added             [Total: ~1.20 MB]
         ─ Cycle repeats...


Memory Trend
═════════════════════════════════════════════════════════════════

 2.0 MB │
        │                          ┌──────────────────────
 1.5 MB │                    ┌─────┴────────
        │              ┌─────┴────────
 1.0 MB │        ┌─────┴────────
        │  ┌─────┴────────
 0.5 MB │  │     (ramps up to steady state)
        │  │
 0.0 MB └──┴─────────────────────────────────────────
        0     6    12     18     24     30     36    Hours

Conclusion: Memory usage stabilizes quickly and stays constant
           No memory leak or unbounded growth
           Cache overhead negligible vs total process size
```

---

## 6. Request Flow Diagram

```
                    ┌──────────────────────────────────┐
                    │    CONSUMER PWA (Browser)        │
                    │   Scan Hidden QR Code             │
                    └────────────┬─────────────────────┘
                                 │
                        Decoded: {secret, batchId, leafIndex}
                                 │
                                 ▼
                    ┌──────────────────────────────────┐
                    │  PWA Component: VerifyResult     │
                    │  Extract parameters              │
                    └────────────┬─────────────────────┘
                                 │
                 POST /api/consumer/verify
              {secret, batchId, leafIndex, drugId}
                                 │
                                 ▼
                    ┌──────────────────────────────────┐
                    │  Backend Route: consumer.js       │
                    │  Route handler                    │
                    └────────────┬─────────────────────┘
                                 │
                   Call: verifyStrip({ ... })
                                 │
                                 ▼
                    ┌──────────────────────────────────┐
                    │  Service: verificationService    │
                    │  Main verification logic         │
                    └────────────┬─────────────────────┘
                                 │
                    ┌────────────────────────────┐
                    │ 1. Compute leaf hash       │
                    │ 2. Query blockchain batch  │
                    │ 3. CACHE LOOKUP ★          │ ← Here!
                    │ 4. Build proof             │
                    │ 5. On-chain verification   │
                    │ 6. Log result              │
                    └────────────┬───────────────┘
                                 │
                    ┌────────────────────────────┐
                    │  CACHE LOOKUP DETAIL:      │
                    │                            │
                    │  let tree = ipfsCache      │
                    │  .get(batch.ipfsCID)       │
                    │                            │
                    │  if (tree exists)          │
                    │    ✅ HIT (~15ms)          │
                    │  else                      │
                    │    ❌ MISS (~7.2s)         │
                    │    • Fetch from Pinata     │
                    │    • Cache for next time   │
                    └────────────┬───────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────────────┐
                    │  Return to Route Handler         │
                    │  JSON response                   │
                    └────────────┬─────────────────────┘
                                 │
                    HTTP 200: {authentic, expired, status, txHash}
                                 │
                                 ▼
                    ┌──────────────────────────────────┐
                    │  Consumer Browser                │
                    │  Display Result                  │
                    │  ✅ Authentic / ⚠️ Expired      │
                    │  ❌ Fake / 🔁 Already Used      │
                    └──────────────────────────────────┘
```

---

## 7. Roadmap Timeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                       PROJECT TIMELINE                              │
└─────────────────────────────────────────────────────────────────────┘

CURRENT: May 2026
═════════════════

✅ Phase 1: Prototype (COMPLETE)
   ├─ In-memory cache
   ├─ Latency: 16.5s → 9s
   ├─ Research metrics collected
   └─ Ready to validate at scale


NEXT: Q3-Q4 2026
════════════════

🚀 Phase 2: Production Ready (PLANNED)
   ├─ Redis integration (L1 cache)
   ├─ Database persistence (L2 cache)
   ├─ Cross-instance cache sharing
   ├─ Invalidation API
   ├─ Metrics dashboard
   └─ Expected: 95%+ hit rate


LATER: Q1 2027+
════════════════

🔐 Phase 3: DAO Governance (PLANNED)
   ├─ Smart contract layer
   ├─ Multisig approval for policies
   ├─ Blockchain event handlers
   ├─ Transparent audit trail
   └─ Democratic cache control


CRITICAL PATH
═════════════════════════════════════════════════════════════════

Phase 1 ──(validate)──→ Phase 2 ──(stabilize)──→ Phase 3
 May          Q2          Q4          Q1+          Q2+
2026       2026-27      2026-27      2027          2027
```

---

**All diagrams represent current system architecture and planned evolution.**
