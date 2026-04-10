# Phase 2 Architecture Overview

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           GIGGUARD PHASE 2 ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────────┐                                                       │
│  │   Frontend (Web)      │   iOS/Android SDK Consent                           │
│  │   Next.js 14          │   • Passive Telemetry Collection                    │
│  │   ├─ Buy Policy       │   • GPS, Accelerometer, Battery, Network            │
│  │   │   (Bandit UI)     │   • Sent on-event to verify spoofing                │
│  │   ├─ Dashboard        │                                                     │
│  │   ├─ Claims Status    │                                                     │
│  │   └─ Profile          │                                                     │
│  └──────────────────────┘                                                       │
│           │                                                                     │
│           │ REST API (HTTPS + JWT)                                             │
│           ▼                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                    BACKEND SERVICE (Node.js/Express)                     │  │
│  │                                                                           │  │
│  │  ┌─ API Gateway                                                          │  │
│  │  │  ├─ Workers: signup, auth, profile                                   │  │
│  │  │  ├─ Policies:                                                         │  │
│  │  │  │  ├─ GET /policies/premium → Calls ML Service                      │  │
│  │  │  │  │                           ├─ Bandit recommendation             │  │
│  │  │  │  │                           ├─ RL premium (shadow)               │  │
│  │  │  │  │                           └─ Formula premium                   │  │
│  │  │  │  ├─ POST /policies/purchase-policy                                │  │
│  │  │  │  └─ POST /policies/bandit-update (JWT-required, Phase 2)         │  │
│  │  │  ├─ Claims & Payouts                                                 │  │
│  │  │  └─ Insurer Dashboard                                                │  │
│  │  │                                                                        │  │
│  │  ├─ Trigger Monitor (Cron: every 30 min)                                │  │
│  │  │  ├─ Poll weather APIs (OpenWeatherMap, AQICN)                        │  │
│  │  │  ├─ Detect disruption (rain > 15mm/hr, AQI > 300, etc.)              │  │
│  │  │  ├─ Convert coordinates to H3 hex (NEW Phase 2)                      │  │
│  │  │  ├─ Find affected workers (k=1 hex ring)                             │  │
│  │  │  ├─ Create claims & disruption_event                                 │  │
│  │  │  └─ Enqueue payouts                                                  │  │
│  │  │                                                                        │  │
│  │  ├─ Payout Service (Async Queue)                                        │  │
│  │  │  ├─ Check for duplicate (UNIQUE constraint, Phase 2)                │  │
│  │  │  ├─ Call Razorpay with idempotency key                               │  │
│  │  │  └─ Update payout status                                             │  │
│  │  │                                                                        │  │
│  │  └─ Anti-Spoofing Service                                               │  │
│  │     ├─ Verify cell tower vs H3 centroid                                 │  │
│  │     ├─ Query device telemetry (SDK data)                                │  │
│  │     ├─ Call GNN scorer (Phase 3)                                        │  │
│  │     ├─ Assign BCS (Behavioral Coherence Score)                          │  │
│  │     └─ Route to Tier 1/2/3 workflow                                     │  │
│  │                                                                           │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│           │                                                                     │
│           │ gRPC / HTTP (internal)                                            │
│           ▼                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                ML SERVICE (Python/Flask) + Models                        │  │
│  │                                                                           │  │
│  │  ┌─ Endpoints                                                            │  │
│  │  │  ├─ POST /predict-premium (Formula)                                  │  │
│  │  │  ├─ POST /recommend-tier (Bandit Thompson Sampling, NEW Phase 2)    │  │
│  │  │  │   └─ Loads bandit_state from DB, samples arms                    │  │
│  │  │  ├─ POST /rl-shadow-premium (RL Agent, NEW Phase 2)                 │  │
│  │  │  │   └─ SAC agent samples premium multiplier                        │  │
│  │  │  ├─ POST /score-worker-gnn (GNN, Phase 3 prep)                      │  │
│  │  │  ├─ POST /bandit-update (Log outcome for learning)                  │  │
│  │  │  └─ POST /ml-update-shadow (RL training data)                       │  │
│  │  │                                                                        │  │
│  │  ├─ Models                                                               │  │
│  │  │  ├─ Premium Formula (Phase 1) ──────────────────┐                   │  │
│  │  │  ├─ Thompson Bandit State (Phase 2, NEW)        ├─ Live Scoring │  │  │
│  │  │  ├─ Isolation Forest (Phase 1)                  │                   │  │
│  │  │  ├─ RL SAC Agent (Phase 2 Shadow)               │                   │  │
│  │  │  └─ GraphSAGE GNN (Phase 2 Trained)  ──────────┘ Phase 3            │  │
│  │  │                                                   Phase 3 Live     │  │  │
│  │  └─ Training Pipeline (Nightly)                                         │  │
│  │     ├─ Sample from replay buffer                                        │  │
│  │     ├─ Update policy, value, Q-functions (RL)                          │  │
│  │     └─ Log metrics to Grafana                                          │  │
│  │                                                                           │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│           │                                                                     │
│           │ SQL                                                                │
│           ▼                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                     POSTGRESQL DATABASE                                  │  │
│  │                                                                           │  │
│  │  Core Tables (Phase 1, unchanged)                                       │  │
│  │  ├─ workers (added: home_hex_id, hex_centroid_lat/lng)                 │  │
│  │  ├─ policies (unchanged)                                               │  │
│  │  ├─ claims (unchanged)                                                 │  │
│  │  ├─ disruption_events (added: affected_hex_ids, hex_centroid)         │  │
│  │  ├─ payouts (added: UNIQUE(claim_id), payout dedup)                   │  │
│  │  └─ zones (unchanged)                                                  │  │
│  │                                                                           │  │
│  │  Phase 2 New Tables (geospatial, ML, graph)                            │  │
│  │  ├─ worker_devices (IMEI hash → workers, GNN prep)                    │  │
│  │  ├─ upi_addresses (UPI → workers, GNN prep)                           │  │
│  │  ├─ graph_edges (workers/devices/upi edges, GNN input)                │  │
│  │  ├─ bandit_state (Thompson posterior, Bandit learning)                │  │
│  │  ├─ rl_shadow_recommendations (RL evaluations)                        │  │
│  │  ├─ rl_replay_buffer (RL training data)                               │  │
│  │  ├─ audit_log (JWT, bandit, payout history)                          │  │
│  │  └─ cell_tower_locations (reverse geocoding)                          │  │
│  │                                                                           │  │
│  │  Indexes (Performance)                                                  │  │
│  │  ├─ GIN idx_workers_home_hex_id (H3 lookup)                           │  │
│  │  ├─ GIN idx_disruption_events_affected_hex_ids (event matching)       │  │
│  │  ├─ BTREE idx_bandit_context (Bandit posterior lookup)                │  │
│  │  ├─ BTREE idx_graph_edges_source/target (GNN traversal)               │  │
│  │  └─ BTREE idx_audit_log_actor/resource (audit stream)                 │  │
│  │                                                                           │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  External Services (Third-Party APIs)                                        │
│  ├─ OpenWeatherMap (rainfall, temperature) → Trigger Monitor                │
│  ├─ AQICN (air quality) → Trigger Monitor                                   │
│  ├─ Google Maps (geocoding) → H3 Indexing Backfill                           │
│  ├─ Razorpay (payments) → Payout Service (with idempotency)                 │
│  └─ Gig Platform APIs (Swiggy, Zomato) → Anti-Spoofing Verification        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Architectural Changes: Phase 1 → Phase 2

### 1. Geospatial Layer (H3 Hexagons)

**Phase 1:**
- Workers assigned to named zones ("Andheri West", "Colaba South")
- Trigger monitor finds all workers in zone, returns entire zone

**Phase 2:**
- Workers geocoded to H3 hexagon (resolution 8, ~0.74 km²)
- Trigger event at coordinate → H3 hex → k=1 ring (7 hexes, ~2 km)
- Only workers in those 7 hexes receive payout
- **Impact:** ~40% reduction in over-payout (basis risk eliminated)

**Database Schema Change:**

```sql
-- Phase 1
worker.zone = 'Andheri West'

-- Phase 2
worker.zone = 'Andheri West'  (kept for legacy queries)
worker.home_hex_id = 89e8a8 (NEW: H3 id for geospatial queries)
worker.hex_centroid_lat = 19.1136 (NEW: for reverse geocoding verification)
worker.hex_centroid_lng = 72.8697 (NEW: for reverse geocoding verification)
```

---

### 2. ML Service Expansion (Bandit + RL)

**Phase 1:**
- ML Service: Only premium prediction (formula-based)

**Phase 2:**
- Premium prediction (Phase 1, still live)
- Thompson Sampling Bandit recommendation (NEW)
- RL SAC agent shadow pricing (NEW)
- Fraud scoring hooks (GNN stub for Phase 3)
- Nightly training pipeline (NEW)

**New Endpoints:**

```
ML Service Phase 2:
├─ POST /predict-premium (existing, unchanged)
├─ POST /recommend-tier (NEW: Thompson Sampling)
├─ POST /rl-shadow-premium (NEW: RL agent)
├─ POST /score-worker-gnn (NEW: stub, returns null)
├─ POST /bandit-update (NEW: log outcome for Thompson learning)
└─ POST /ml-update-shadow (NEW: log outcome for RL training)
```

---

### 3. Bandit Learning Loop

**NEW in Phase 2:**

```
Worker requests /policies/premium
    ↓
ML Service recommends arm (Thompson sampling from bandit_state)
    ↓
Frontend shows "Recommended for you: Tier X"
    ↓
Worker purchases (or doesn't)
    ↓
Backend calls /policies/bandit-update with JWT auth
    ↓
ML Service updates bandit_state (Thompson posterior)
    ↓
Next worker segment sees updated recommendation (20 minutes later after retraining)
```

**Storage:**

```sql
bandit_state:
┌─────────────────────────────────────────────────────────────┐
│ context_key (PK)  │ arm │ alpha │ beta │ updated_at         │
├─────────────────────────────────────────────────────────────┤
│ swiggy_mumbai...  │ 0   │ 2     │ 5    │ 2026-04-07 10:00   │
│ swiggy_mumbai...  │ 1   │ 5     │ 8    │ 2026-04-07 10:00   │
│ swiggy_mumbai...  │ 2   │ 20    │ 3    │ 2026-04-07 10:05   │ ← High performer
│ swiggy_mumbai...  │ 3   │ 2     │ 15   │ 2026-04-07 10:00   │
└─────────────────────────────────────────────────────────────┘
```

---

### 4. Security Hardening

**Phase 1:**
- Basic JWT auth for worker API
- No payout deduplication
- Worker ID accepted from request body

**Phase 2:**
- JWT **required** for `/policies/bandit-update` (Phase 1: optional)
- Payout deduplication: UNIQUE(claim_id) at DB level + app-level guard
- Razorpay idempotency keys
- H3 centroid verification vs cell tower
- Rate limiting (100 req/min per worker)
- Comprehensive audit logging
- Pre-commit hook for API key patterns

---

### 5. Anti-Spoofing & Fraud Detection

**Phase 1:**
- Isolation Forest anomaly scoring
- Basic device telemetry (GPS, accelerometer)

**Phase 2:**
- All Phase 1 signals (kept)
- Cell tower verification against H3 centroid
- Device sharing detection (worker_devices table)
- UPI sharing detection (upi_addresses table)
- **Planned Phase 3:** GNN fraud ring detection

**Behavioral Coherence Score (BCS): NEW**

```
Tier 1 (Auto-Approve, BCS ≥ 70): Zero friction
  └─ Multiple independent signals agree

Tier 2 (Provisional Payout, BCS 40–69): Pay first, verify second
  └─ One or two signals missing/ambiguous
  └─ Issue payout immediately
  └─ Async verification in background

Tier 3 (Manual Review, BCS < 40): Hold & escalate
  └─ Multiple strong contradictions
  └─ Human review within 4 hours
  └─ Worker notified transparently
```

---

## Data Flow Examples

### Example 1: Heavy Rain Trigger (H3-Based)

```
Time: 2026-04-07 14:30 UTC

1. Trigger Monitor fires (cron every 30 min)
   └─ Polls OpenWeatherMap API
   └─ Zone: Mumbai, Coordinate: 19.1136°N, 72.8697°E
   └─ Rainfall: 20 mm/hr (threshold: 15 mm/hr)
   └─ MATCH: Create disruption_event

2. Convert to H3 (NEW Phase 2)
   └─ latLngToCell(19.1136, 72.8697, 8) = 89e8a8
   └─ gridDisk(89e8a8, 1) = [89e8a8, 89e8a9, 89e8aa, 89e8ab, 89e8ac, 89e8ad, 89e8ae]
   └─ Store in disruption_event.affected_hex_ids

3. Find affected workers
   └─ SELECT worker_id FROM workers WHERE home_hex_id = ANY([89e8a8, ..., 89e8ae])
   └─ Result: 34 workers

4. For each worker, assess spoofing risk (NEW Phase 2)
   └─ Get phone telemetry from SDK
   └─ Query cell tower location from carrier DB
   └─ Get active orders from Swiggy API
   └─ Compute BCS (Behavioral Coherence Score)
   └─ If BCS ≥ 70: Auto-approve claim, pay immediately
   └─ If BCS 40–69: Pay provisionally, verify async
   └─ If BCS < 40: Hold for manual review

5. Create payouts (with dedup guard)
   └─ Check: SELECT COUNT(*) FROM payouts WHERE claim_id = $1
   └─ If none, INSERT INTO payouts (claim_id, worker_id, amount, status='pending')
   └─ Call Razorpay transfer API with idempotency_key = payout_id
   └─ On success, UPDATE payouts SET status='paid'
   └─ Audit log: INSERT INTO audit_log (action='payout_created', ...)

6. Results
   └─ 34 workers affected
   └─ 32 payouts approved (BCS ≥ 70)
   └─ 2 payouts provisional (BCS 40–69, async verify)
   └─ Total payout: ₹16,000 (avg ₹500/worker × 32 approved)
   └─ Timestamp: 2026-04-07 14:32 UTC (2 min after trigger)
```

---

### Example 2: Policy Purchase with Bandit Recommendation

```
Time: 2026-04-07 15:00 UTC

1. Worker (Zomato, 3 months experience, Bangalore, monsoon season) visits app
   └─ Platform: 'zomato'
   └─ Experience: 'growing' (3 months)
   └─ City: 'bangalore'
   └─ Season: 'monsoon'
   └─ Zone risk: 'medium'
   └─ Context key computed: "zomato_bangalore_growing_monsoon_medium"

2. Frontend calls GET /policies/premium
   └─ Backend extracts worker context
   └─ Calls ML Service /recommend-tier with context

3. ML Service Bandit Sampling (NEW Phase 2)
   └─ Query bandit_state WHERE context_key = "zomato_bangalore_growing_monsoon_medium"
   └─ Found [arm=0: Beta(3,12), arm=1: Beta(8,10), arm=2: Beta(25,5), arm=3: Beta(4,20)]
   └─ Sample from each: [0.20, 0.42, 0.83, 0.15]
   └─ Recommendation: arm=2 (highest sampled value)
   └─ Compute premium for arm 2: ₹65

4. Backend returns polcy premium response
   ├─ formula_premium: ₹44 (formula: 35 × 1.1 zone × 1.0 weather × 1.0 history)
   ├─ rl_premium: ₹48 (RL shadow: 44 × 1.09 SAC multiplier, not used)
   ├─ recommended_arm: 2
   ├─ recommended_premium: ₹65
   └─ context_key: "zomato_bangalore_growing_monsoon_medium"

5. Frontend displays (NEW bandit UI)
   ┌─────────────────────────────────────────┐
   │ Choose your coverage plan               │
   ├─────────────────────────────────────────┤
   │ ○ Basic (Tier 0): ₹29 / 500 coverage   │
   │ ○ Standard (Tier 1): ₹44 / 1000 coverage
   │ ◉ Recommended (Tier 2): ₹65 / 2000 ← HIGHLIGHTED
   │ ○ Premium (Tier 3): ₹89 / 5000          │
   └─────────────────────────────────────────┘

6. Worker clicks "Recommended for you" (Tier 2) → Purchases
   └─ Razorpay payment: ₹65 + GST = ₹76.70
   └─ Policy created: worker_id, coverage=2000, premium_paid=65, status='active'

7. Frontend calls POST /policies/bandit-update (NEW Phase 2, JWT required)
   └─ Headers: Authorization: Bearer <jwt_token>
   └─ Body: { recommended_arm: 2, selected_arm: 2, context_key: "...", outcome: "purchased" }
   └─ Backend validates JWT (worker_id extracted)
   └─ Calls ML Service /bandit-update
   └─ ML Service updates: bandit_state[context][arm=2].alpha += 1 → Beta(26, 5)
   └─ Audit log: INSERT INTO audit_log (action='bandit_update', ...)

8. Bandit Impact (Nightly Retraining)
   └─ Next day, new Zomato worker in same segment sees same bandit state
   └─ Arm 2 has even higher posterior (26/31 ≈ 84% conversion expectation)
   └─ More likely to be recommended again
   └─ Over weeks: Convergence to best arms per segment
   └─ Estimated impact: 25% lift in conversion rate (Netflix baseline)
```

---

## Performance Characteristics

### Query Latencies

| Query | Phase 1 | Phase 2 | Index |
|---|---|---|---|
| Find workers in zone | ~200ms (full table scan) | ~5ms (H3 GIN) | idx_workers_home_hex_id |
| Bandit recommendation | N/A | ~10ms | idx_bandit_context |
| RL premium | N/A | ~20ms | (model inference) |
| Payout duplicate check | N/A | <1ms | idx_payouts_claim_id (unique) |
| Fraud ring detection (GNN) | N/A | ~100-500ms (Phase 3) | Graph traversal |

### Database Sizes (Estimated at 10K workers, 1K zones)

| Table | Phase 1 | Phase 2 | Growth |
|---|---|---|---|
| workers | ~10MB | ~15MB | +50% (new H3 columns) |
| policies | ~50MB | ~50MB | No change |
| disruption_events | ~5MB | ~10MB | +100% (new hex_ids array) |
| NEW: bandit_state | 0 | ~0.5MB | 40 entries per context × ~100 contexts × 4 arms |
| NEW: graph_edges | 0 | ~20MB | ~100K edges (devices, UPIs, temporal) |
| NEW: rl_replay_buffer | 0 | ~50MB | Grows indefinitely (prune weekly) |

---

## Deployment & Operations

### Container Orchestration

```yaml
# docker-compose.yml (Phase 2)

version: '3.9'

services:
  
  backend:
    image: gigguard-backend:v2.0.0-phase2
    environment:
      H3_RESOLUTION: 8
      FEATURE_H3_ENABLED: 'true'
      FEATURE_BANDIT_JWT: 'true'
      FEATURE_RL_SHADOW_MODE: 'true'
    ports:
      - "4000:4000"
    depends_on:
      - postgres
      - ml-service
  
  ml-service:
    image: gigguard-ml-service:v2.0.0-phase2
    environment:
      RL_SHADOW_MODE: 'true'
      GNN_MODEL_PATH: 'models/gnn_phase2_synthetic.pt'
    ports:
      - "5001:5001"
    volumes:
      - ./ml-service/models:/app/models
    depends_on:
      - postgres
  
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: gigguard
      POSTGRES_PASSWORD: $DB_PASSWORD
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/db/migrations:/docker-entrypoint-initdb.d
  
  frontend:
    image: gigguard-frontend:v2.0.0-phase2
    environment:
      NEXT_PUBLIC_API_URL: 'http://localhost:4000'
    ports:
      - "3000:3000"

volumes:
  postgres_data:
```

---

## Monitoring & Observability

### Key Dashboards (Grafana)

1. **H3 Trigger Accuracy:** Hexagons affected, worker distribution
2. **Bandit Learning:** Conversion rates by arm, exploration vs exploitation
3. **RL Shadow Recommendations:** Formula vs RL premium deltas
4. **Security Metrics:** Duplicate payouts (should be 0), JWT failures, rate limits
5. **System Health:** DB connections, API latency, error rates

### Alerting Rules

```
- H3 query latency > 100ms → Page on-call
- Duplicate payout attempts > 5/day → Page security team
- Bandit convergence stalled (no updates in 48h) → Investigate
- RL model divergence (rewards declining) → Rollback to Phase 1
```

---

## Phase 3 Roadmap (Q2 2026)

Planned enhancements building on Phase 2 foundation:

1. **Live GNN Fraud Detection:** Replace Isolation Forest with GraphSAGE
2. **RL Live Pricing:** Deploy RL agent to replace formula
3. **Explainability:** Add attention mechanism to explain GNN decisions
4. **Smart Contracts:** Encode policy terms on Polygon blockchain
5. **Causal Inference:** Determine if worker would be offline without disruption

---

## References

- **H3 Index:** https://h3geo.org/
- **Thompson Sampling:** Chapelle & Li, NIPS 2011
- **Soft Actor-Critic:** Haarnoja et al., ICML 2018
- **GraphSAGE:** Hamilton, Ying & Leskovec, NIPS 2017
