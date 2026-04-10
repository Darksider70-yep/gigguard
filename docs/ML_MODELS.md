# GigGuard ML Models

> Documentation for all machine learning and AI models in the GigGuard platform.

---

## Table of Contents

- [Overview](#overview)
- [1. Premium Calculator (Formula)](#1-premium-calculator-formula)
- [2. Isolation Forest (Fraud Detection)](#2-isolation-forest-fraud-detection)
- [3. Thompson Sampling (Contextual Bandits)](#3-thompson-sampling-contextual-bandits)
- [4. SAC Reinforcement Learning (Premium Optimization)](#4-sac-reinforcement-learning-premium-optimization)
- [5. GraphSAGE GNN (Fraud Ring Detection)](#5-graphsage-gnn-fraud-ring-detection)
- [Model File Locations](#model-file-locations)

---

## Overview

GigGuard's ML service (`ml-service/`) houses five models at different maturity levels:

| Model | Purpose | Status | Endpoint |
|-------|---------|--------|----------|
| Premium Calculator | Deterministic premium formula | ✅ Production | `POST /predict-premium` |
| Isolation Forest | Individual fraud detection | ✅ Production | `POST /score-fraud` |
| Thompson Sampling | Policy tier recommendations | ✅ Production | `POST /recommend-tier` |
| SAC RL | Premium price optimization | 🔄 Shadow → A/B | `POST /rl-live-premium` |
| GraphSAGE GNN | Fraud ring detection | 🏗️ Groundwork | `GET /gnn/status` |

---

## 1. Premium Calculator (Formula)

**File:** `ml-service/premium/calculator.py`  
**Type:** Deterministic formula (no ML training required)

### Formula

```
weekly_premium = base_rate × zone_multiplier × weather_multiplier × history_multiplier
```

| Factor | Default | Source | Description |
|--------|---------|--------|-------------|
| `base_rate` | ₹35 | Fixed | Operational cost baseline |
| `zone_multiplier` | 1.0 | Worker profile | Historical risk of worker's geographic zone (0.5–2.0) |
| `weather_multiplier` | 1.0 | 7-day forecast | Forward-looking weather/AQI risk adjustment |
| `history_multiplier` | 1.0 | Claims history | Personal discount/surcharge based on claim frequency |

### Shadow Mode Integration

When the SAC RL model is loaded, the premium endpoint also:
1. Computes the RL-suggested premium
2. Logs both values to `rl_shadow_log` table for comparison
3. Always serves the formula premium (shadow mode only)

---

## 2. Isolation Forest (Fraud Detection)

**File:** `ml-service/fraud/isolation_forest.py`  
**Training:** `ml-service/fraud/train_isolation_forest.py`  
**Model File:** `ml-service/models/isolation_forest.pkl`

### How It Works

The Isolation Forest is an **unsupervised anomaly detection** algorithm. It works by randomly partitioning data — anomalies (fraudulent claims) require fewer partitions to isolate, producing higher anomaly scores.

### Input Features

| Feature | Type | Description |
|---------|------|-------------|
| `payout_amount` | float | Claim payout amount (₹) |
| `claim_freq_30d` | int | Worker's claims in last 30 days |
| `hours_since_trigger` | float | Time between disruption event and claim |
| `zone_multiplier` | float | Worker's zone risk factor |
| `account_age_days` | int | Days since worker registration |

### Output

```json
{
  "fraud_score": 0.12,        // 0.0 (clean) to 1.0 (fraud)
  "tier": 1,                  // BCS tier (1=auto-approve, 2=soft-flag, 3=manual-review)
  "flagged": false,            // true if fraud_score > threshold
  "scorer": "isolation_forest"
}
```

### Tiering (Behavioral Coherence Score)

| Tier | BCS Range | Action |
|------|-----------|--------|
| Tier 1 | ≥ 70 | Auto-approve, instant payout |
| Tier 2 | 40–69 | Provisional payout + async verification |
| Tier 3 | < 40 | Hold for manual review (4h target) |

### Fallback

If the model file is missing, the scorer returns `fraud_score: 0.0` with `scorer: "fallback_default"`.

---

## 3. Thompson Sampling (Contextual Bandits)

**File:** `ml-service/bandits/policy_bandit.py`  
**Persistence:** `ml-service/bandits/bandit_store.py`  
**Inspired By:** Netflix recommendation engine

### Purpose

Recommends the optimal policy tier (out of 4) to each worker, personalized by context, to maximize purchase conversion rates.

### Arms (Policy Tiers)

| Arm | Premium | Coverage | Target |
|-----|---------|----------|--------|
| 0 | ₹29/week | ₹290 | Budget-conscious |
| 1 | ₹44/week | ₹440 | Standard (fallback default) |
| 2 | ₹65/week | ₹640 | Mid-range |
| 3 | ₹89/week | ₹890 | Premium |

### Algorithm

```
Thompson Sampling Selection:
  For each arm i:
    θᵢ ~ Beta(αᵢ, βᵢ)
  return argmax_i(θᵢ)

Beta-Bernoulli Conjugate Update:
  On reward R ∈ {0, 1}:
    α_new = α + R
    β_new = β + (1 − R)
```

### Context Key

Context is derived server-side from the worker profile:

```
{platform}_{city}_{experience_tier}_{season}_{zone_risk}
Example: "zomato_mumbai_veteran_monsoon_high"
```

| Dimension | Values | Source |
|-----------|--------|--------|
| platform | zomato, swiggy | Worker profile |
| city | normalized lowercase | Worker profile |
| experience_tier | new (<3mo), mid (3–12mo), veteran (>12mo) | Registration date |
| season | monsoon (Jun–Sep), summer (Mar–May), winter (Nov–Feb), other | Current month |
| zone_risk | low (<1.0), medium (1.0–1.2), high (>1.2) | zone_multiplier |

### Persistence

Bandit state is stored in `bandit_state` table (single-row JSONB, atomic upsert). State loads on service startup and saves periodically + on shutdown.

### Reward Signals

| Event | Reward | Mechanism |
|-------|--------|-----------|
| Policy purchased | 1.0 | `POST /bandit-update` from backend |
| Session exit without purchase | 0.0 | `navigator.sendBeacon` from frontend |

### Performance

- Selection: < 1ms
- Full endpoint: 8–15ms (well under 50ms target)

---

## 4. SAC Reinforcement Learning (Premium Optimization)

**Files:**
- `ml-service/rl/gigguard_env.py` — Gymnasium environment
- `ml-service/rl/train_sac.py` — Training script
- `ml-service/rl/evaluate_sac.py` — Evaluation
- `ml-service/rl/validate_shadow.py` — Shadow validation
- **Model File:** `ml-service/models/sac_premium_v1.zip`

**Inspired By:** Uber/DeepMind pricing optimization

### Purpose

A self-tuning premium engine that learns the optimal price point to maximize purchase rates while maintaining a sustainable loss ratio.

### Architecture

**Algorithm:** Soft Actor-Critic (SAC) via stable-baselines3

**State Vector (8-dim):**

| Dimension | Description | Range |
|-----------|-------------|-------|
| zone_risk | Zone risk multiplier | 0.0–2.0 |
| rain_prob_7d | 7-day rain probability | 0.0–2.0 |
| aqi_avg_7d | Average AQI (normalized) | 0.0–2.0 |
| claim_rate_90d | 90-day claim rate | 0.0–2.0 |
| worker_hours | Worker activity hours | 0.0–2.0 |
| platform_enc | Platform (0=zomato, 1=swiggy) | 0.0–1.0 |
| season_enc | Season encoding | 0.0–1.0 |
| competitor_price | Competitor price (normalized) | 0.0–2.0 |

**Action:** Continuous premium multiplier (0.5–2.0 × base rate of ₹35)

### Deployment Phases

```
Phase 1: Shadow Mode (current)
  ├── Formula serves all requests
  ├── RL prediction computed in parallel
  ├── Both logged to rl_shadow_log table
  └── Requires 500+ rows for validation

Phase 2: A/B Testing
  ├── Workers hash-assigned to cohort A (formula) or B (RL)
  ├── Controlled by rl_rollout_config table
  ├── Kill switch for instant rollback
  └── Daily metrics tracked in rl_daily_metrics

Phase 3: Full Rollout
  ├── RL serves 100% of premium requests
  └── Formula maintained as real-time fallback
```

### A/B Testing Controls

The insurer dashboard controls rollout via `POST /insurer/rl-rollout`:

```json
{
  "rollout_percentage": 10,    // 0–100, % of workers in cohort B
  "kill_switch_engaged": false  // true = all workers use formula
}
```

### Shadow Validation

`GET /rl/validate-shadow` runs analysis on logged data and returns:

| Recommendation | Meaning |
|----------------|---------|
| `rl_ready` | RL loss ratio < 0.75 AND RL purchase rate > formula |
| `formula_wins` | Formula outperforms on both metrics |
| `needs_more_data` | < 500 shadow rows or ambiguous results |

---

## 5. GraphSAGE GNN (Fraud Ring Detection)

**Files:**
- `ml-service/gnn/build_graph.py` — Graph construction from DB
- `ml-service/gnn/feature_encoding.py` — Node feature encoding
- `ml-service/gnn/graphsage_model.py` — GraphSAGE model definition
- `ml-service/gnn/load_pyg_data.py` — PyTorch Geometric data loading
- `ml-service/gnn/synthetic_fraud.py` — Synthetic fraud ring generation
- `ml-service/gnn/analyze_graph.py` — Graph analysis utilities

**Inspired By:** Stripe Radar fraud detection

### Purpose

Detects **coordinated fraud rings** that are invisible to individual claim-level models. Models workers, claims, and devices as a graph, then uses Graph Neural Networks to identify unnatural cluster formations.

### Status: Phase 3 Groundwork

The GNN infrastructure is built but not yet integrated into the live scoring pipeline. Current status:
- ✅ Graph construction from database
- ✅ Feature encoding (node attributes)
- ✅ GraphSAGE model definition
- ✅ Synthetic fraud data generation for training
- 🔄 Training pipeline (in progress)
- ⬜ Live inference endpoint
- ⬜ Integration with `/score-fraud`

### Graph Structure

```
Nodes: Workers, Claims, Devices
Edges: 
  - Worker → Claim (filed_by)
  - Worker → Device (uses)
  - Worker → Worker (shared_IP / shared_UPI)
```

### Detection Signals

| Signal | What It Detects |
|--------|----------------|
| IP subnet clustering | Multiple claimants from same residential network |
| Synchronized claim timing | Burst of claims in tight time window |
| Policy activation recency | Accounts activated < 48h before claim |
| Shared device fingerprint | Multiple workers on same device |
| Social graph anomaly | Topologically unusual worker clusters |

---

## Model File Locations

| Model | Path | Format | Size |
|-------|------|--------|------|
| Isolation Forest | `ml-service/models/isolation_forest.pkl` | Pickle | ~100 KB |
| SAC RL | `ml-service/models/sac_premium_v1.zip` | SB3 ZIP | ~5 MB |
| GNN (future) | `ml-service/models/graphsage_fraud.pt` | PyTorch | TBD |
| Bandit State | PostgreSQL `bandit_state` table | JSONB | Dynamic |
| Shadow Log | PostgreSQL `rl_shadow_log` table | Rows | Dynamic |

All model paths are configured via environment variables:
- `IF_MODEL_PATH` — Isolation Forest
- `SAC_MODEL_PATH` — SAC RL model
- `GNN_MODEL_PATH` — GNN model (future)
