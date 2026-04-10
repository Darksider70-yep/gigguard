# GigGuard API Reference

> Complete endpoint reference for the Backend (Node.js/Express) and ML Service (Python/Flask).

---

## Table of Contents

- [Authentication](#authentication)
- [Backend API (Port 4000)](#backend-api-port-4000)
  - [Health](#health)
  - [Workers](#workers)
  - [Policies](#policies)
  - [Claims](#claims)
  - [Insurer Dashboard](#insurer-dashboard)
  - [Triggers](#triggers)
  - [Payouts (Webhook)](#payouts-webhook)
  - [Razorpay](#razorpay)
- [ML Service API (Port 5001)](#ml-service-api-port-5001)
  - [Health](#ml-health)
  - [Premium](#premium)
  - [Fraud Detection](#fraud-detection)
  - [Contextual Bandits](#contextual-bandits)
  - [Reinforcement Learning](#reinforcement-learning)
  - [GNN](#gnn)

---

## Authentication

### Worker Auth
All worker-facing endpoints require a JWT Bearer token obtained from `/workers/login` or `/workers/register`.

```
Authorization: Bearer <jwt_token>
```

The token payload contains `{ id: string, role: "worker" }`.

### Insurer Auth
Insurer-facing endpoints (`/insurer/*`) require a JWT with `role: "insurer"`, obtained from `/workers/login` with `role: "insurer"` and the correct `INSURER_LOGIN_SECRET`.

---

## Backend API (Port 4000)

### Health

#### `GET /health`
**Auth:** None  
**Description:** System health check — verifies database, ML service, and Redis connectivity.

**Response `200`:**
```json
{
  "status": "ok",
  "db": "connected",
  "ml_service": "connected",
  "redis": "connected",
  "uptime_seconds": 3600,
  "timestamp": "2026-04-10T18:00:00.000Z"
}
```

**Response `503`** (degraded — DB down):
```json
{
  "status": "degraded",
  "db": "error",
  "ml_service": "connected",
  "redis": "connected"
}
```

---

### Workers

#### `POST /workers/register`
**Auth:** None  
**Description:** Register a new gig worker account.

**Request Body:**
```json
{
  "name": "Sameer Khan",
  "phone_number": "9876543210",
  "platform": "zomato",
  "city": "Mumbai",
  "zone": "Andheri West",
  "avg_daily_earning": 900,
  "zone_multiplier": 1.1,
  "history_multiplier": 1.0,
  "upi_vpa": "sameer@upi",
  "experience_tier": "mid"
}
```

**Required fields:** `name`, `phone_number`, `platform` (zomato|swiggy), `city`

**Response `201`:**
```json
{
  "token": "eyJhbGciOi...",
  "worker": {
    "id": "uuid",
    "name": "Sameer Khan",
    "platform": "zomato",
    "city": "Mumbai",
    "zone": "Andheri West",
    "avg_daily_earning": 900,
    "created_at": "2026-04-10T18:00:00.000Z"
  }
}
```

---

#### `POST /workers/login`
**Auth:** None  
**Description:** Login as worker (by phone) or insurer (by secret).

**Worker Login:**
```json
{
  "role": "worker",
  "phone_number": "9876543210"
}
```

**Insurer Login:**
```json
{
  "role": "insurer",
  "secret": "<INSURER_LOGIN_SECRET>"
}
```

**Response `200` (worker):**
```json
{
  "token": "eyJhbGciOi...",
  "role": "worker",
  "worker": { "id": "uuid", "name": "...", "platform": "zomato", ... }
}
```

**Response `200` (insurer):**
```json
{
  "token": "eyJhbGciOi...",
  "role": "insurer",
  "insurer": { "id": "insurer-admin", "name": "Daksh Gehlot", ... }
}
```

---

#### `GET /workers/me`
**Auth:** Worker JWT  
**Description:** Get authenticated worker's profile.

**Response `200`:**
```json
{
  "id": "uuid",
  "name": "Sameer Khan",
  "platform": "zomato",
  "city": "Mumbai",
  "zone": "Andheri West",
  "home_hex_id": "8635651932160000000",
  "avg_daily_earning": 900,
  "zone_multiplier": 1.1,
  "history_multiplier": 1.0,
  "experience_tier": "mid",
  "upi_vpa": "sameer@upi",
  "created_at": "2026-04-10T18:00:00.000Z"
}
```

---

### Policies

#### `GET /policies/premium`
**Auth:** Worker JWT  
**Description:** Get premium quote for the current week, including bandit recommendation and A/B cohort assignment.

**Response `200`:**
```json
{
  "ab_cohort": "A",
  "pricing_source": "formula",
  "worker": {
    "name": "Sameer Khan",
    "platform": "zomato",
    "zone": "Andheri West",
    "city": "Mumbai",
    "avg_daily_earning": 900
  },
  "premium": 42,
  "formula_breakdown": {
    "base_rate": 35,
    "zone_multiplier": 1.1,
    "weather_multiplier": 1.05,
    "history_multiplier": 1.0,
    "raw_premium": 40.425
  },
  "rl_premium": null,
  "coverage": { ... },
  "recommended_arm": 1,
  "recommended_premium": 44,
  "context_key": "zomato_mumbai_mid_summer_medium",
  "has_active_policy": false,
  "week_start": "2026-04-07",
  "week_end": "2026-04-13"
}
```

---

#### `POST /policies/`
**Auth:** Worker JWT  
**Description:** Purchase a policy for the current week after Razorpay payment.

**Request Body:**
```json
{
  "razorpay_payment_id": "pay_xxx",
  "razorpay_order_id": "order_xxx",
  "razorpay_signature": "sha256_signature",
  "premium_paid": 42,
  "coverage_amount": 440,
  "recommended_arm": 1,
  "context_key": "zomato_mumbai_mid_summer_medium",
  "arm_accepted": true
}
```

**Response `201`:**
```json
{
  "policy_id": "GG-SAMEER-xxxx",
  "policy": {
    "id": "uuid",
    "week_start": "2026-04-07",
    "week_end": "2026-04-13",
    "premium_paid": 42,
    "coverage_amount": 440,
    "status": "active",
    "razorpay_payment_id": "pay_xxx"
  },
  "message": "Policy active. We'll monitor your zone 24/7."
}
```

**Error `409`:** `POLICY_EXISTS` — active policy already exists for this week.  
**Error `400`:** `INVALID_PAYMENT_SIGNATURE` — Razorpay signature verification failed.

---

#### `GET /policies/active`
**Auth:** Worker JWT  
**Description:** Get the worker's active policy for the current week (if any), including active claim.

**Response `200`:**
```json
{
  "has_active_policy": true,
  "policy": {
    "id": "uuid",
    "week_start": "2026-04-07",
    "week_end": "2026-04-13",
    "premium_paid": 42,
    "coverage_amount": 440,
    "zone": "Andheri West",
    "city": "Mumbai",
    "status": "active"
  },
  "active_claim": null
}
```

---

#### `GET /policies/history`
**Auth:** Worker JWT  
**Description:** Paginated policy history for the worker.

**Query Params:** `?page=1`

**Response `200`:**
```json
{
  "policies": [ ... ],
  "total": 12,
  "page": 1
}
```

---

### Claims

#### `GET /claims/`
**Auth:** Worker JWT  
**Description:** List all claims for the worker, with stats and enriched review info.

**Response `200`:**
```json
{
  "stats": {
    "total_paid_out": 1200,
    "claims_this_month": 2,
    "paid_streak": 5
  },
  "claims": [
    {
      "id": "uuid",
      "trigger_type": "heavy_rainfall",
      "payout_amount": 320,
      "disruption_hours": 4,
      "fraud_score": 0.12,
      "status": "paid",
      "city": "Mumbai",
      "zone": "Andheri West",
      "razorpay_ref": "pout_xxx",
      "created_at": "2026-04-08T14:00:00.000Z",
      "paid_at": "2026-04-08T14:05:00.000Z",
      "under_review_reason": null
    }
  ]
}
```

---

#### `GET /claims/:id`
**Auth:** Worker JWT  
**Description:** Get full details for a specific claim.

---

### Insurer Dashboard

All insurer routes require `authenticateInsurer` middleware.

#### `GET /insurer/dashboard`
**Description:** Main dashboard — aggregate stats, recent events, zone risk matrix.

#### `GET /insurer/disruption-events`
**Description:** List disruption events. Optionally filter by `?status=active`.

#### `GET /insurer/anti-spoofing-alerts`
**Description:** List claims currently under review with BCS scores and graph flags.

#### `POST /insurer/claims/:id/approve`
**Description:** Approve an under-review claim and queue payout (with optional goodwill bonus).

#### `POST /insurer/claims/:id/deny`
**Description:** Deny a claim with a reason.
```json
{ "reason": "Confirmed fraud ring member" }
```

#### `GET /insurer/zone-risk-matrix`
**Description:** Full zone risk breakdown.

#### `GET /insurer/shadow-comparison`
**Description:** RL vs formula premium comparison metrics (proxied from ML service).

#### `POST /insurer/rl-rollout`
**Description:** Adjust RL A/B test rollout percentage and kill switch.
```json
{
  "rollout_percentage": 10,
  "kill_switch_engaged": false
}
```

---

### Triggers

#### `POST /triggers/simulate`
**Auth:** Insurer JWT  
**Description:** Simulate a disruption event for testing/demo purposes.

**Request Body:**
```json
{
  "city": "mumbai",
  "trigger_type": "heavy_rainfall",
  "trigger_value": 25,
  "disruption_hours": 4,
  "lat": 19.1136,
  "lng": 72.8697,
  "zone": "Andheri West"
}
```

---

### Payouts (Webhook)

#### `POST /payouts/webhook`
**Auth:** Razorpay HMAC signature (`X-Razorpay-Signature` header)  
**Description:** Razorpay webhook callback for payout status updates. Handles `payout.processed` and `payout.failed` events.

> **Note:** This route is mounted BEFORE `express.json()` middleware, using `express.raw()` to preserve the raw body for signature verification.

---

### Razorpay

#### `POST /razorpay/create-order`
**Auth:** Worker JWT  
**Description:** Create a Razorpay order for premium payment.

```json
{ "amount": 4200 }
```
Amount is in paise (₹42 = 4200 paise).

---

## ML Service API (Port 5001)

### ML Health

#### `GET /health`
**Description:** ML service health check.

**Response `200`:**
```json
{
  "status": "ok",
  "isolation_forest": "loaded",
  "sac_model": "loaded",
  "db": "connected"
}
```

---

### Premium

#### `POST /predict-premium`
**Description:** Calculate premium using the formula engine, with optional RL shadow logging.

**Request Body:**
```json
{
  "worker_id": "uuid",
  "zone_multiplier": 1.1,
  "weather_multiplier": 1.05,
  "history_multiplier": 1.0
}
```

**Response `200`:**
```json
{
  "premium": 40.43,
  "formula_breakdown": {
    "base_rate": 35,
    "zone_multiplier": 1.1,
    "weather_multiplier": 1.05,
    "history_multiplier": 1.0,
    "raw_premium": 40.425
  },
  "rl_premium": 38.5,
  "shadow_logged": true
}
```

---

### Fraud Detection

#### `POST /score-fraud`
**Description:** Score a claim for fraud using the Isolation Forest model.

**Request Body:**
```json
{
  "claim_id": "uuid",
  "worker_id": "uuid",
  "payout_amount": 320,
  "claim_freq_30d": 2,
  "hours_since_trigger": 0.5,
  "zone_multiplier": 1.1,
  "platform": "zomato",
  "account_age_days": 180
}
```

**Response `200`:**
```json
{
  "fraud_score": 0.12,
  "gnn_fraud_score": null,
  "graph_flags": [],
  "tier": 1,
  "flagged": false,
  "scorer": "isolation_forest"
}
```

---

### Contextual Bandits

#### `POST /recommend-tier`
**Description:** Get Thompson Sampling recommendation for policy tier.

**Request:**
```json
{
  "worker_id": "uuid",
  "context": {
    "platform": "zomato",
    "city": "mumbai",
    "experience_tier": "veteran",
    "season": "monsoon",
    "zone_risk": "high"
  }
}
```

**Response `200`:**
```json
{
  "recommended_arm": 2,
  "recommended_premium": 65,
  "recommended_coverage": 640,
  "context_key": "zomato_mumbai_veteran_monsoon_high",
  "exploration": false
}
```

#### `POST /bandit-update`
**Description:** Update bandit arm parameters with reward signal.

```json
{
  "context_key": "zomato_mumbai_veteran_monsoon_high",
  "arm": 2,
  "reward": 1.0
}
```

#### `GET /bandit-stats`
**Description:** View bandit arm statistics. Optional `?context_key=...` filter.

---

### Reinforcement Learning

#### `GET /rl/shadow-status`
**Description:** Check if the SAC model is loaded.

#### `GET /rl/validate-shadow`
**Description:** Run shadow validation — compares formula vs RL pricing using logged data. Requires 500+ rows to produce a recommendation.

#### `POST /rl-live-premium`
**Description:** Get a live RL premium prediction (used for A/B cohort B workers).

```json
{
  "zone_multiplier": 1.1,
  "weather_multiplier": 1.05,
  "history_multiplier": 1.0,
  "account_age_days": 180,
  "platform": "zomato"
}
```

**Response `200`:**
```json
{
  "rl_premium": 38.5,
  "pricing_source": "rl",
  "state_vector": [1.1, 1.05, 1.0, 0.49, 0.0]
}
```

**Response `503`:** SAC model not loaded.

#### `GET /shadow-comparison`
**Description:** Aggregated formula-vs-RL premium comparison metrics.

```json
{
  "total_rows": 1500,
  "avg_formula_premium": 42.3,
  "avg_rl_premium": 39.8,
  "avg_abs_diff": 3.2,
  "formula_wins": 800,
  "rl_wins": 700
}
```

---

### GNN

#### `GET /gnn/status`
**Description:** GNN module status (Phase 3 groundwork).

```json
{
  "phase": "groundwork",
  "status": "ready"
}
```
