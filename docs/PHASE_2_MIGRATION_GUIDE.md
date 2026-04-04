# Phase 2 Migration Guide

## Overview

This guide provides step-by-step instructions for upgrading GigGuard from Phase 1 to Phase 2. Phase 2 introduces H3 geospatial indexing, contextual bandit policy recommendations, RL premium engine (shadow mode), GNN fraud detection schema, and security hardening.

**Estimated downtime:** 5–10 minutes (database migrations during off-peak hours)

**Estimated total setup time:** 2–3 hours including testing

---

## 1. Pre-Migration Checklist

- [ ] **Backup production database:** `pg_dump production_db > backup_phase1.sql`
- [ ] **Notify stakeholders:** Let team know about planned maintenance window
- [ ] **Staging environment:** Test all migrations on staging first
- [ ] **Read full Phase 2 documentation:** Especially BANDIT_POLICY_RECOMMENDATION.md, RL_PREMIUM_ENGINE.md, SECURITY_HARDENING.md
- [ ] **Review breaking API changes:** See API_CHANGES_PHASE2.md
- [ ] **Prepare rollback plan:** Backup current code branch

---

## 2. Database Migrations

### 2.1 Apply PostgreSQL Migrations

**Location:** `backend/db/migrations/`

**Migrations to apply (in order):**

```bash
# 1. Add H3 columns and indexes
psql $DATABASE_URL -f backend/db/migrations/003_add_h3_columns.sql

# 2. Add H3 GIN indexes for performance
psql $DATABASE_URL -f backend/db/migrations/004_add_h3_gin_indexes.sql

# 3. Add device and UPI tracking tables (for GNN)
psql $DATABASE_URL -f backend/db/migrations/005_add_gnn_schema.sql

# 4. Add bandit state table
psql $DATABASE_URL -f backend/db/migrations/006_add_bandit_state.sql

# 5. Add payout deduplication constraints
psql $DATABASE_URL -f backend/db/migrations/007_add_payout_dedup.sql

# 6. Add audit logging table
psql $DATABASE_URL -f backend/db/migrations/008_add_audit_log.sql

# 7. Add RL shadow recommendations table
psql $DATABASE_URL -f backend/db/migrations/009_add_rl_shadow.sql
```

**Verify migrations:**

```bash
psql $DATABASE_URL -c "\dt"  # List all tables

# Should see new tables:
# - workers (modified: added hex columns)
# - policies (unchanged)
# - claims (unchanged)
# - disruption_events (modified: added affected_hex_ids array)
# - payouts (modified: added UNIQUE(claim_id))
# - worker_devices (NEW)
# - upi_addresses (NEW)
# - graph_edges (NEW)
# - bandit_state (NEW)
# - audit_log (NEW)
# - rl_shadow_recommendations (NEW)
```

### 2.2 Backfill H3 Hex IDs

**Purpose:** Convert existing worker zones to H3 hexagons

**Prerequisites:**
- Google Maps API key configured in `.env` as `GOOGLE_MAPS_API_KEY`
- Rate limit: 200 requests/minute (internal delay: 350ms)

**Run backfill:**

```bash
cd backend
npm run backfill:hex-ids
```

**Expected Output:**

```
Backfill: Converting zones to H3 hexagons
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Progress: [████████████████████] 100% (1234 / 1234)
Status: ✓ Completed
  ✓ Successfully geocoded: 1200
  ✗ Failed geocodes: 34 → Exported to failed_geocodes.csv
Duration: 3 min 45 sec
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Handle failures:**

```bash
# If failed_geocodes.csv exists, manually review
cat failed_geocodes.csv
# Output: zone | reason
# andheri_east_zone | Could not geocode: Ambiguous location
# kolkata_north_zone | Outside India bounds

# Manually geocode using Google Maps and update:
psql $DATABASE_URL -c "
  UPDATE workers 
  SET home_hex_id = $1, home_hex_id_fallback = true 
  WHERE zone = $2
" -- 89e8a8abc123def andheri_east_zone
```

**Verify backfill success:**

```bash
psql $DATABASE_URL -c "
  SELECT COUNT(*) as total_workers,
         COUNT(home_hex_id) as with_hex_id,
         COUNT(*) - COUNT(home_hex_id) as without_hex_id
  FROM workers
"
# Expected: with_hex_id ≈ total_workers (>99% success)
```

### 2.3 Make H3 ID Non-Nullable

Once backfilled, enforce the constraint:

```bash
psql $DATABASE_URL -c "
  ALTER TABLE workers 
  ALTER COLUMN home_hex_id SET NOT NULL;
"
```

---

## 3. Environment Variables

### 3.1 Update `.env` File

**New variables for Phase 2:**

```bash
# .env

# ============ NEW FOR PHASE 2 ============

# Google Maps (for H3 geocoding)
GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# H3 Configuration
H3_RESOLUTION=8
H3_RING_SIZE=1  # k=1 for k-ring around event hex

# Bandit Configuration
BANDIT_EXPLORATION_ENABLED=true
BANDIT_MIN_SAMPLES_PER_ARM=10
BANDIT_UPDATE_BATCH_SIZE=50

# RL Configuration
RL_SHADOW_MODE=true  # Phase 2: shadow only
RL_MODEL_CHECKPOINT=v2_phase2_synthetic.pt

# Security
JWT_SECRET=your_long_random_secret_key_256_bits
PAYOUT_DEDUP_ENABLED=true

# GNN Configuration (for Phase 3 prep)
GNN_MODEL_PATH=models/gnn_fraud_detector_phase2.pt
GNN_FRAUD_THRESHOLD=0.7  # Will use in Phase 3

# Audit Logging
AUDIT_LOG_ENABLED=true
AUDIT_LOG_DETAIL_LEVEL=full  # Options: basic, standard, full

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000  # 1 minute
RATE_LIMIT_MAX_REQUESTS=100

# ============ EXISTING (NO CHANGE) ============
# ... keep all Phase 1 variables ...
```

### 3.2 Verify Environment Setup

```bash
npm run verify:env
# Output:
# ✓ DATABASE_URL set
# ✓ GOOGLE_MAPS_API_KEY valid (tested)
# ✓ JWT_SECRET length ≥ 256 bits
# ✓ RAZORPAY_KEY_ID set
# ✓ RAZORPAY_KEY_SECRET set (redacted)
# ...
```

---

## 4. Backend Code Deployment

### 4.1 Build and Test

```bash
cd backend

# Install dependencies (pulls new packages for H3, etc.)
npm install

# Build TypeScript
npm run build

# Run unit tests (fast, no DB)
npm run test:unit

# Run integration tests (requires local DB + ML Service)
npm run test:integration
```

### 4.2 Deploy New Version

```bash
# Tag release
git tag v2.0.0-phase2

# Build Docker image
docker build -t gigguard-backend:v2.0.0-phase2 .

# Push to registry (e.g., Docker Hub, ECR)
docker push gigguard-backend:v2.0.0-phase2

# Update docker-compose.yml
# Change: image: gigguard-backend:v1.0.0
# To:     image: gigguard-backend:v2.0.0-phase2

# Restart services
docker-compose up -d backend
```

### 4.3 Verify Backend Startup

```bash
# Check logs
docker logs -f gigguard-backend

# Expected in logs:
# [2026-04-07T10:30:00Z] Connected to PostgreSQL ✓
# [2026-04-07T10:30:00Z] H3 module loaded ✓
# [2026-04-07T10:30:01Z] Trigger monitor initialized ✓
# [2026-04-07T10:30:02Z] Server listening on port 4000 ✓
```

---

## 5. Frontend Code Deployment

### 5.1 Update API Expectations

**Key changes in frontend:**

1. **Bandit recommendation display:**

```typescript
// OLD (Phase 1)
const quote = await fetch(`/policies/premium`).then(r => r.json());
// Response: { premium, coverage }

// NEW (Phase 2)
const quote = await fetch(`/policies/premium`).then(r => r.json());
// Response: { premium, coverage, recommended_arm, recommended_premium, context_key }

// Show recommended tier
<PolicyTier arm={quote.recommended_arm} premium={quote.recommended_premium} badge="RECOMMENDED FOR YOU" />
```

2. **Bandit update with JWT:**

```typescript
// OLD (Phase 1)
await fetch(`/policies/bandit-update`, {
  method: 'POST',
  body: JSON.stringify({
    worker_id: worker.id,  // No longer needed
    outcome: 'purchased'
  })
});

// NEW (Phase 2)
await fetch(`/policies/bandit-update`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,  // REQUIRED
  },
  body: JSON.stringify({
    recommended_arm: quote.recommended_arm,
    selected_arm: selectedArm,
    context_key: quote.context_key,
    outcome: 'purchased'
  })
});
```

### 5.2 Build and Test

```bash
cd gigguard-frontend

# Install dependencies
npm install

# Build Next.js
npm run build

# Test locally
npm run dev  # http://localhost:3000

# Run tests
npm run test
```

### 5.3 Deploy New Frontend

```bash
# Build Docker image
docker build -t gigguard-frontend:v2.0.0-phase2 .

# Push to registry
docker push gigguard-frontend:v2.0.0-phase2

# Update docker-compose.yml and restart
docker-compose up -d frontend
```

---

## 6. ML Service Updates

### 6.1 Install New Dependencies

```bash
cd ml-service

# Add new packages
pip install "h3==3.7.0" "torch==2.1.0" "torch-geometric==2.4.0"

# Update requirements.txt
pip freeze > requirements.txt

# Build Docker image
docker build -t gigguard-ml-service:v2.0.0-phase2 .
```

### 6.2 New ML Endpoints

The ML Service now exposes:

```
POST /recommend-tier           # Bandit recommendation
POST /rl-shadow-premium        # RL agent shadow pricing
POST /score-worker-gnn         # GNN fraud score (Phase 3 prep)
POST /bandit-update            # Bandit posterior update
```

### 6.3 Verify ML Service Health

```bash
# Check health
curl http://localhost:5001/health

# Expected response
{
  "status": "ok",
  "model_versions": {
    "bandit": "v2_phase2",
    "rl": "v2_phase2_shadow",
    "gnn": "v2_phase2_synthetic"
  },
  "uptime_seconds": 3600
}
```

---

## 7. Data Validation & Health Checks

### 7.1 Post-Migration SQL Validation

```bash
# Run health check script
backend/scripts/health-check-phase2.sql

# Key queries:
SELECT COUNT(*) FROM workers WHERE home_hex_id IS NULL;
-- Expected output: 0 (all workers have hex IDs)

SELECT COUNT(DISTINCT home_hex_id) FROM workers;
-- Expected output: Thousands of unique hexes across city

SELECT COUNT(*) FROM bandit_state;
-- Expected output: 0 (will be populated after first requests)

SELECT COUNT(*) FROM audit_log;
-- Expected output: 0 initially, grows with API traffic

SELECT COUNT(*) FROM rl_shadow_recommendations;
-- Expected output: 0 initially, grows after policies are quoted
```

### 7.2 Smoke Tests

```bash
# 1. Worker signup and policy purchase (existing flow)
curl -X POST http://localhost:4000/workers/register \
  -H 'Content-Type: application/json' \
  -d '{"phone_number": "919999999999", ...}'

# 2. Get quote with bandit recommendation
curl -X GET http://localhost:4000/policies/premium \
  -H 'Authorization: Bearer <jwt_token>'
# Expected: recommended_arm, recommended_premium in response

# 3. Trigger an event and verify H3 trigger
curl -X POST http://localhost:4000/triggers/test \
  -H 'Content-Type: application/json' \
  -d '{"lat": 19.1136, "lng": 72.8697, "trigger_type": "rain_heavy"}'
# Expected: affected_worker_ids returned, using H3 rings

# 4. Update bandit with JWT
curl -X POST http://localhost:4000/policies/bandit-update \
  -H 'Authorization: Bearer <jwt_token>' \
  -H 'Content-Type: application/json' \
  -d '{"recommended_arm": 2, "selected_arm": 2, "outcome": "purchased"}'
# Expected: 200 OK, bandit_updated: true
```

---

## 8. Gradual Rollout

### 8.1 Phased Deployment Strategy

**Week 1:**
- [ ] Deploy to staging environment
- [ ] Run full integration test suite
- [ ] Internal dogfooding (team tests as real users)

**Week 2:**
- [ ] Canary deployment: 5% of prod traffic
- [ ] Monitor error rates, latency, bandit learning
- [ ] Verify H3 trigger accuracy

**Week 3:**
- [ ] Roll out to 50% of prod traffic
- [ ] Monitor business metrics (conversion rate, payout accuracy)
- [ ] Adjust rate limits if needed

**Week 4:**
- [ ] Full production deployment (100%)
- [ ] Continue monitoring

---

## 9. Monitoring & Observability

### 9.1 Key Metrics to Track

**H3 Trigger Accuracy:**
```
- Affected workers per event (should be small, concentrated hexes)
- False positive payouts (zone mismatch drops to near 0%)
```

**Bandit Learning:**
```
- Conversion rate by recommended arm: Should show clear bandit learning
- Exploration vs exploitation: Should shift from 50/50 to 90% exploitation
```

**RL Shadow Mode:**
```
- Formula avg premium vs RL avg premium: Should differ by 3–8%
- Estimated lift if deployed: Log weekly
```

**Security:**
```
- Attempted duplicate payouts (should be 0 – caught by UNIQUE constraint)
- Failed JWT authentications on bandit-update: Should be low
- Rate limit rejections: Should be minimal for legitimate users
```

### 9.2 Set Up Monitoring Dashboards

```bash
# Create Grafana dashboard: Phase 2 Metrics
# Panels:
# 1. H3 Trigger Map: Hexagons with affected workers
# 2. Bandit Conversion Rates: By arm, by segment
# 3. RL Premium Deltas: Formula vs RL comparison
# 4. Security Alerts: Duplicate payout attempts, JWT failures
```

---

## 10. Rollback Plan

### 10.1 If Critical Issues Arise

**Immediate Rollback (< 1 minute):**

```bash
# Revert container to Phase 1 image
docker-compose down
docker-compose -f docker-compose.phase1.yml up -d

# Nginx redirects to backup API
# Workers don't lose data (database is unchanged)
```

**Database Rollback (if needed):**

```bash
# Restore from backup
pg_restore -d production_db -v backup_phase1.sql

# WARNING: This will lose any new data since migration
# Use only in emergency
```

### 10.2 Known Rollback Limitations

- **H3 data:** Once backfilled, workers table has home_hex_id. Phase 1 code ignores this column safely.
- **Bandit logic:** Phase 1 doesn't call bandit endpoints, so bandit data is just unused tables.
- **New tables:** Phase 1 doesn't access graph_edges, audit_log, etc., so they don't affect Phase 1 functionality.

**Conclusion:** Rollback is safe; data is preserved.

---

## 11. Testing Checklist

- [ ] Unit tests pass: `npm run test:unit`
- [ ] Integration tests pass: `npm run test:integration`
- [ ] E2E tests pass on staging
- [ ] API contract tests (schema validation)
- [ ] Database migration script idempotent (runs twice without error)
- [ ] Phase 1 rollback scenario tested
- [ ] Load test: 1000 simultaneous requests to `/policies/premium`
- [ ] Security audit: JWT validation, bandit endpoint auth, rate limiting

---

## 12. Documentation Updates

- [ ] Update API docs with new endpoints
- [ ] Update deployment guide
- [ ] Update troubleshooting guide
- [ ] Add Phase 2 feature explainers to worker onboarding

---

## 13. Post-Migration Checklist

**Day 1 (Deployment):**
- [ ] All services up and running
- [ ] Smoke tests passing
- [ ] Error rates normal
- [ ] Database connection stable

**Week 1:**
- [ ] Bandit learning confirmed (recommendations changing)
- [ ] RL shadow mode logging recommendations
- [ ] GNN schema validated
- [ ] No duplicate payouts
- [ ] Audit logs growing normally

**Week 2–4:**
- [ ] Conversion rate trending upward (bandit effect)
- [ ] H3 trigger precision reduces over-payout
- [ ] Team comfortable with new systems

---

## 14. Troubleshooting

### Q: H3 backfill failed, hundreds of workers without hex IDs

**A:** Geocoding API rate limit or quota exceeded.

**Fix:**
1. Increase delay or reduce batch size: `BACKFILL_DELAY_MS=500`
2. Check API quota: Google Cloud Console
3. Retry: `npm run backfill:hex-ids` (idempotent, resumes from NULL)

### Q: Bandit endpoint returns 401 "Invalid JWT"

**A:** JWT validation is enforcing Phase 2 auth.

**Fix:**
1. Frontend: Include `Authorization: Bearer <token>` header
2. Check JWT expiry: Tokens expire after 24 hours
3. Verify JWT_SECRET matches across backend and ML service

### Q: Duplicate payout attempt rejected with UNIQUE constraint

**A:** This is expected behavior! UNIQUE constraint is working.

**Action:** Log the attempt and retry with exponential backoff. Application-level guard should catch this before it reaches DB.

### Q: RL shadow recommendations don't appear in database

**A:** RL shadow mode might be disabled or endpoint not called.

**Check:**
1. Verify `RL_SHADOW_MODE=true` in .env
2. Confirm `/policies/premium` calls `/rl-shadow-premium` in ML service
3. Check ML service logs: `docker logs gigguard-ml-service | grep rl`

---

## 15. References

- H3 Implementation: [docs/H3_IMPLEMENTATION_GUIDE.md](H3_IMPLEMENTATION_GUIDE.md)
- Bandit Docs: [docs/BANDIT_POLICY_RECOMMENDATION.md](BANDIT_POLICY_RECOMMENDATION.md)
- RL Engine: [docs/RL_PREMIUM_ENGINE.md](RL_PREMIUM_ENGINE.md)
- Security: [docs/SECURITY_HARDENING.md](SECURITY_HARDENING.md)
- GNN Background: [docs/GNN_FRAUD_DETECTION.md](GNN_FRAUD_DETECTION.md)
