# Phase 2 API Changes

## Summary

Phase 2 introduces new API endpoints and modifies existing endpoints to support the four major features: H3 geospatial indexing, contextual bandit recommendations, RL premium engine, and fraud detection. This document details breaking changes, new endpoints, and migration paths.

---

## 1. Modified Endpoints

### 1.1 GET `/policies/premium` – Enhanced Response

**Phase 1 Response:**

```json
{
  "worker": { "name": "...", "platform": "...", "zone": "..." },
  "premium": 44,
  "formula_breakdown": { "base": 35, "zone": 1.2, "weather": 1.0, "history": 1.0 },
  "coverage": {
    "0": { "coverage_amount": 500, "premium": 29 },
    "1": { "coverage_amount": 1000, "premium": 44 },
    "2": { "coverage_amount": 2000, "premium": 65 },
    "3": { "coverage_amount": 5000, "premium": 89 }
  },
  "has_active_policy": false,
  "week_start": "2026-04-07",
  "week_end": "2026-04-13"
}
```

**Phase 2 Response (NEW FIELDS):**

```json
{
  "worker": { "name": "...", "platform": "...", "zone": "..." },
  "premium": 44,
  "formula_breakdown": { "base": 35, "zone": 1.2, "weather": 1.0, "history": 1.0 },
  
  // NEW: RL shadow premium
  "rl_premium": 48,
  
  "coverage": {
    "0": { "coverage_amount": 500, "premium": 29 },
    "1": { "coverage_amount": 1000, "premium": 44 },
    "2": { "coverage_amount": 2000, "premium": 65 },
    "3": { "coverage_amount": 5000, "premium": 89 }
  },
  
  // NEW: Bandit recommendation
  "recommended_arm": 2,
  "recommended_premium": 65,
  "context_key": "swiggy_mumbai_established_monsoon_medium",
  
  "has_active_policy": false,
  "week_start": "2026-04-07",
  "week_end": "2026-04-13"
}
```

**Breaking Changes:** None (additive changes only)

**Migration Path:** 
- Old clients can ignore new fields: `recommended_arm`, `recommended_premium`, `context_key`, `rl_premium`
- New clients can use `recommended_arm` to highlight tier recommendation

---

### 1.2 POST `/policies/purchase-policy` – Enum Constructor Change

**Phase 1 Request:**

```json
{
  "razorpay_payment_id": "pay_...",
  "razorpay_order_id": "order_...",
  "razorpay_signature": "...",
  "premium_paid": 44,
  "coverage_amount": 1000
}
```

**Phase 2 Request:**

```json
{
  "razorpay_payment_id": "pay_...",
  "razorpay_order_id": "order_...",
  "razorpay_signature": "...",
  "premium_paid": 44,
  "coverage_amount": 1000,
  
  // NEW: Capture which arm the bandit recommended and which worker selected
  "recommended_arm": 1,
  "selected_arm": 2,          // User may select different arm than recommended
  "context_key": "swiggy_..."  // For bandit learning attribution
}
```

**Breaking Changes:** None (optional fields)

**If `recommended_arm` is not sent:**
- Assume user saw Phase 1 UI (no recommendation)
- Bandit doesn't get training signal for this transaction
- Still creates policy normally

---

## 2. New Endpoints

### 2.1 POST `/policies/bandit-update` – Bandit Posterior Update

**Authentication:** Required (JWT token in `Authorization` header)

**Purpose:** Log outcome of a policy recommendation for Thompson Sampling learning

**Request Body:**

```json
{
  "recommended_arm": 1,
  "selected_arm": 2,
  "context_key": "swiggy_mumbai_established_monsoon_medium",
  "outcome": "purchased" | "viewed" | "abandoned"
}
```

**Response on Success (200):**

```json
{
  "status": "success",
  "bandit_updated": true,
  "message": "Bandit posterior updated for context_key='swiggy_mumbai_established_monsoon_medium', arm=2"
}
```

**Response on Error (401):**

```json
{
  "error": "Invalid JWT token"
}
```

**Response on Error (400):**

```json
{
  "error": "Invalid recommended_arm (must be 0-3)"
}
```

**Idempotency:** This endpoint is idempotent. Calling it multiple times with identical payload will have the same effect (Thompson posterior updated once per outcome).

**Rate Limiting:** 100 requests per minute per worker (5000 per hour)

---

### 2.2 GET `/policies/shadow-premium` – RL Agent Recommendation

**Authentication:** Required (JWT token)

**Purpose:** Retrieve the RL agent's shadow premium recommendation for a worker (debug/analysis endpoint)

**Query Parameters:**

```
GET /policies/shadow-premium?worker_id=worker-123&week=2026-04-07
```

**Response (200):**

```json
{
  "worker_id": "worker-123",
  "week": "2026-04-07",
  "formula_premium": 44,
  "rl_premium": 48,
  "rl_multiplier": 1.09,
  "confidence": 0.82,
  "rl_reasoning": {
    "zone_risk": "medium",
    "weather_forecast": "favorable",
    "competitor_avg": 46,
    "action_taken": "increase_premium_to_capture_value"
  }
}
```

**Note:** This endpoint is for analysis and debugging. Workers don't see the shadow premium; the formula premium is what they purchase at.

---

### 2.3 GET `/insurer/shadow-comparison` – Phase 2 RL Evaluation

**Authentication:** Required (JWT token - insurer/admin only)

**Purpose:** Aggregate view of formula vs RL premiums and estimated lift

**Query Parameters:**

```
GET /insurer/shadow-comparison?start_date=2026-04-01&end_date=2026-04-07
```

**Response (200):**

```json
{
  "summary": {
    "period": "2026-04-01 to 2026-04-07",
    "total_policies": 12450,
    "formula_avg_premium": 48.5,
    "rl_avg_premium": 49.2,
    "formula_conversion_rate": 0.32,
    "rl_estimated_conversion_rate": 0.35,
    "estimated_lift_if_deployed": "9.4%",
    "estimated_revenue_uplift_inr": 45000
  },
  "by_segment": [
    {
      "segment_id": "swiggy_mumbai_monsoon",
      "policies": 450,
      "formula_avg_premium": 62.0,
      "rl_avg_premium": 58.5,
      "rl_delta_pct": "-5.6%",
      "estimated_lift": "12%",
      "confidence": 0.87
    }
  ],
  "top_opportunities": [
    {
      "segment": "blinkit_bangalore_growing_monsoon",
      "current_formula_premium": 45,
      "rl_recommendation": 42,
      "potential_purchase_lift": "18%"
    }
  ]
}
```

---

### 2.4 POST `/triggers/h3-event` – H3-Based Trigger Event

**Authentication:** Internal (backend system only, X-API-Key or mTLS)

**Purpose:** Register a disruption event with H3 hex coordinates

**Request Body:**

```json
{
  "trigger_type": "rain_heavy" | "aqi" | "heat" | "flood" | "curfew",
  "lat": 19.1136,
  "lng": 72.8697,
  "city": "Mumbai",
  "trigger_value": 16.5,
  "trigger_threshold": 15,
  "metadata": {
    "source": "openweathermap",
    "confidence": 0.95,
    "affected_area_description": "Heavy rain in Andheri West"
  }
}
```

**Response on Success (201):**

```json
{
  "disruption_event_id": "event_12345",
  "hex_id": "89e8a8",
  "affected_hexes": ["89e8a8", "89e8a9", "89e8aa", "89e8ab", "89e8ac", "89e8ad", "89e8ae"],
  "affected_workers_count": 34,
  "estimated_payout_amount": 17000,
  "status": "processing"
}
```

**Note:** This is the internal endpoint used by the trigger monitor. External parties don't call this directly.

---

### 2.5 GET `/workers/{worker_id}/gnn-score` – GNN Fraud Score (Phase 3 Prep)

**Authentication:** Admin/Insurer only

**Purpose:** Get GNN fraud score for a worker (Phase 3 endpoint, currently returns placeholder)

**Response (200, Phase 2):**

```json
{
  "worker_id": "worker-123",
  "gnn_fraud_score": null,
  "status": "model_not_live",
  "message": "GNN fraud detection coming in Phase 3"
}
```

**Response (200, Phase 3 onward):**

```json
{
  "worker_id": "worker-123",
  "gnn_fraud_score": 0.15,
  "fraud_ring_membership": null,
  "flagged_nodes": [],
  "recommendation": "approve",
  "trust_score": 0.95
}
```

---

## 3. Deprecated Endpoints

**Phase 1 → Phase 2:**

Some internal endpoints have been renamed for clarity, but they still work (with deprecation warnings).

| Phase 1 Endpoint | Phase 2 Replacement | Status |
|---|---|---|
| `POST /triggers/test` | `POST /triggers/h3-event` | Deprecated but works |
| `GET /insurer/comparison` | `GET /insurer/shadow-comparison` | Renamed |

---

## 4. Breaking Changes Summary

**None for external API consumers.** All changes are additive or optional.

However, **internal clients (frontend, ML service) must update:**

1. **Frontend → Backend Bandit Update:**
   - **Old:** `POST /policies/bandit-update` with `worker_id` in body
   - **New:** `POST /policies/bandit-update` with JWT in header, no `worker_id` in body
   - **Action:** Frontend must retrieve JWT token and include in `Authorization: Bearer <token>` header

2. **Backend → Trigger System:**
   - **Old:** Zone-based trigger matching
   - **New:** H3 hex-based trigger matching
   - **Action:** Trigger monitor refactored to use H3 (done on backend, no external change needed)

---

## 5. Error Handling Changes

### 5.1 New Error Codes

| Status | Code | Message | Cause |
|---|---|---|---|
| 400 | `INVALID_ARM` | `"Recommended arm must be 0-3"` | Non-integer arm in bandit-update |
| 401 | `JWT_MISSING` | `"Missing or invalid Authorization header"` | No Bearer token in bandit-update |
| 401 | `JWT_EXPIRED` | `"Invalid JWT token"` | Token expired or signature invalid |
| 429 | `RATE_LIMIT_EXCEEDED` | `"Too many requests. Retry after 60 seconds."` | Rate limit hit (100 req/min) |
| 409 | `DUPLICATE_PAYOUT` | `"Payout already processed for this claim"` | Duplicate payout attempt caught |

### 5.2 Payout Deduplication Error Response

**If duplicate payout attempt detected:**

```json
{
  "error": "DUPLICATE_PAYOUT",
  "message": "Payout already processed for claim_id=claim_123",
  "existing_payout_id": "payout_456",
  "status": 409
}
```

**Client Action:** Retry is safe (idempotent, return existing payout).

---

## 6. Backwards Compatibility

### 6.1 Forward Compatibility

Phase 1 clients can still use Phase 2 backend:

- Old `/policies/premium` calls work (return new fields, client ignores them)
- Old `/policies/purchase-policy` calls work (recommended_arm optional)
- Old `/policies/bandit-update` calls **fail** (now requires JWT)

### 6.2 Handling JWT Requirement on Bandit Update

**Phase 1 clients that call `/policies/bandit-update` without JWT:**

```
POST /policies/bandit-update
Content-Type: application/json

{ "worker_id": "worker-123", "outcome": "purchased" }

Response (401):
{ "error": "Invalid JWT token" }
```

**To fix:** Must update to Phase 2 format.

---

## 7. API Versioning Strategy

**Current approach:** URL-based versioning deprecated in favor of feature flags.

**Phase 2 strategy:** No `/v2/` prefix. Instead, use feature flags in code:

```typescript
// backend/src/config.ts

const FEATURES = {
  H3_GEOSPATIAL: process.env.FEATURE_H3_ENABLED === 'true',
  BANDIT_JWT_REQUIRED: process.env.FEATURE_BANDIT_JWT === 'true',
  RL_SHADOW_MODE: process.env.FEATURE_RL_SHADOW === 'true',
};

// Route handler
router.post('/policies/bandit-update', (req, res, next) => {
  if (FEATURES.BANDIT_JWT_REQUIRED) {
    // Enforce JWT
    authenticateWorker(req, res, next);
  } else {
    // Fallback to Phase 1 (accept worker_id in body)
    next();
  }
});
```

This allows gradual rollout and easy rollback without deploying new code versions.

---

## 8. SDK / Client Library Updates

If you've published SDKs for the GigGuard API, update them:

### 8.1 Python SDK

```python
# gigguard-sdk/0.1.0 (Phase 1)
client.update_bandit(worker_id='w1', outcome='purchased')

# gigguard-sdk/0.2.0 (Phase 2)
client.update_bandit(
    access_token=jwt_token,  # NEW: JWT auth
    recommended_arm=1,
    selected_arm=2,
    context_key='...',
    outcome='purchased'
)
```

### 8.2 JavaScript SDK

```typescript
// @gigguard/sdk@0.1.0 (Phase 1)
client.updateBandit({ workerId: 'w1', outcome: 'purchased' });

// @gigguard/sdk@0.2.0 (Phase 2)
client.updateBandit({
  accessToken: jwtToken,  // NEW
  recommendedArm: 1,
  selectedArm: 2,
  contextKey: '...',
  outcome: 'purchased'
});
```

---

## 9. Migration Timeline

| Date | Milestone |
|---|---|
| 2026-04-07 | Phase 2 released, Phase 1 API still supported (feature flags off) |
| 2026-04-14 | Gradual feature flag rollout begins (10% of traffic) |
| 2026-04-21 | 50% traffic on Phase 2 features |
| 2026-04-28 | 100% traffic on Phase 2 features |
| 2026-05-13 | Phase 1 API fully deprecated. Clients **must** update. |

---

## 10. Rollback Strategy

If critical API issues arise:

```bash
# Disable Phase 2 features via feature flags
FEATURE_H3_ENABLED=false
FEATURE_BANDIT_JWT=false
FEATURE_RL_SHADOW=false

# Restart backend
docker-compose restart backend

# Clients automatically fallback to Phase 1 behavior
```

No code redeploy needed.

---

## 11. Testing Your Integration

### 11.1 Test with JWT Auth

```bash
# Get JWT token
curl -X POST http://localhost:4000/workers/auth \
  -H 'Content-Type: application/json' \
  -d '{"phone_number": "919999999901", "password": "..."}' \
  | jq '.jwt_token'

# Call bandit-update with JWT
curl -X POST http://localhost:4000/policies/bandit-update \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "recommended_arm": 1,
    "selected_arm": 2,
    "context_key": "test_context",
    "outcome": "purchased"
  }'
```

### 11.2 Verify RL Shadow Recommendations

```bash
# Get premium with RL shadow
curl -X GET http://localhost:4000/policies/premium \
  -H "Authorization: Bearer $JWT_TOKEN" \
  | jq '.rl_premium'
# Should see rl_premium field if RL_SHADOW_MODE=true
```

### 11.3 Test H3 Trigger

```bash
# Trigger a rain event at specific coordinates
curl -X POST http://localhost:4000/triggers/h3-event \
  -H 'X-API-Key: internal_system_key' \
  -H 'Content-Type: application/json' \
  -d '{
    "trigger_type": "rain_heavy",
    "lat": 19.1136,
    "lng": 72.8697,
    "city": "mumbai",
    "trigger_value": 20,
    "trigger_threshold": 15
  }' \
  | jq '.affected_workers_count'
# Should see small number (H3 ring), not entire city
```

---

## 12. Questions & Support

For API migration questions:
- **Email:** api-support@gigguard.app
- **Slack:** #api-changes in GigGuard Workspace
- **Documentation:** https://docs.gigguard.app/phase2-api
