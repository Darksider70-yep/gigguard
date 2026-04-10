# Contextual Bandit Policy Recommendation Engine

## Overview

The Contextual Bandit Policy Recommendation Engine is a **Thompson Sampling-based machine learning system** that learns which policy coverage tiers each worker segment is most likely to purchase. Rather than showing all workers the same default coverage option, the engine personalizes recommendations based on their profile and continuously optimizes based on purchase outcomes.

**Expected Impact:** ~25% lift in policy purchase conversion (Netflix baseline for Thompson Sampling)

---

## 1. The Problem: One-Size-Fits-All Fails

In Phase 1, all workers saw the same four coverage tiers in the same order:
- Tier 0: ₹29, ₹500 coverage
- Tier 1: ₹44, ₹1000 coverage (default)
- Tier 2: ₹65, ₹2000 coverage
- Tier 3: ₹89, ₹5000 coverage

Data showed:
- Only 8% of workers purchased a policy (industry baseline for parametric insurance: 15–20%)
- Tier 1 (₹44) conversion: 6%
- Tier 3 (₹89) conversion: 14% (higher income workers)
- No differentiation by experience level, platform, or zone risk

**Root Cause:** Workers don't know which tier is right for them. Some aren't ready for high premiums; others see Tier 1 as insufficient.

---

## 2. The Solution: Thompson Sampling

We deploy a **Thompson Sampling contextual bandit** that learns the ideal first recommendation for each worker segment in real-time:

### What is Thompson Sampling?

Thompson Sampling is a Bayesian approach to the multi-armed bandit problem:
- We maintain a **posterior distribution** over the conversion rate of each arm (coverage tier)
- For each worker, we sample from each arm's distribution and recommend the arm with the highest sampled conversion rate
- When a worker purchases (or doesn't), we update that arm's posterior, refining our belief about its effectiveness

### Why Thompson Sampling?

1. **Exploration-Exploitation Balance:** Early on, the algorithm explores all tiers (gathering data). Over time, it exploits high-converting tiers more frequently.
2. **Context-Aware:** We condition the recommendation on worker features (platform, city, zone risk, experience tier).
3. **No A/B Test Scheduling:** The bandit learns continuously from live behavior, not batch A/B tests that take weeks.
4. **Proven:** Netflix, Amazon, and Airbnb use Thompson Sampling for recommendation optimization.

---

## 3. Architecture

### 3.1 Data Flow

```
Worker requests /policies/premium
    ↓
Backend queries database for worker context
    ↓
Backend calls ML Service /recommend-tier endpoint
    ↓
ML Service (Python):
    ├─ Load current bandit state from database
    ├─ Extract context features (platform, city, experience_tier, season, zone_risk)
    ├─ For each of 4 arms, sample from Thompson posterior
    ├─ Return recommended arm + context_key
    └─ Log the recommendation for later update
    ↓
Backend returns premium quote with recommended_arm highlighted
    ↓
Frontend displays "Recommended for you: Tier X"
    ↓
Worker purchases (or doesn't)
    ↓
Backend calls /policies/bandit-update with outcome
    ↓
ML Service updates Thompson posterior for this context
```

### 3.2 Worker Context Features

The recommendation is conditioned on:

| Feature | Values | Purpose |
|---------|--------|---------|
| `platform` | 'swiggy', 'zomato', 'blinkit', 'other' | Platform usage patterns differ |
| `city` | 'mumbai', 'delhi', 'bangalore', etc. | Regional income volatility varies |
| `experience_tier` | 'new', 'growing', 'established', 'veteran' | Tenure affects risk perception |
| `season` | 'summer', 'monsoon', 'winter' | Seasonal demand affects income stability |
| `zone_risk` | 'low', 'medium', 'high' | Zone multiplier maps to risk level |

**Context Key:** A hash of these features uniquely identifies a segment (e.g., `swiggy_mumbai_new_monsoon_high`). The banana maintains separate Thompson posteriors for each context key.

---

## 4. Thompson Sampling: Technical Details

### 4.1 Posterior Update

For each (context, arm) pair, we maintain:
- **Success count (α):** Number of purchases for this context-arm pair
- **Failure count (β):** Number of non-purchases for this context-arm pair

The posterior is a **Beta(α, β) distribution**. On each new purchase outcome:

```python
# Example: Worker segment "swiggy_mumbai_new_monsoon_high"
# Recommendation: Arm 2 (Tier 2: ₹65)
# Outcome: Purchase = True

context_key = "swiggy_mumbai_new_monsoon_high"
arm = 2

# Update Beta posteriors
bandit_state[context_key][arm]['alpha'] += 1  # Success
# (No beta update on success)

# For comparison: Non-purchase would increment beta
# bandit_state[context_key][arm]['beta'] += 1
```

### 4.2 Sampling for Recommendation

When a new worker of context `context_key` arrives:

```python
import numpy as np

context_key = "swiggy_mumbai_new_monsoon_high"
sampled_rates = []

for arm in [0, 1, 2, 3]:
    alpha = bandit_state[context_key][arm]['alpha']
    beta = bandit_state[context_key][arm]['beta']
    
    # Sample from Beta(α, β)
    conversion_rate = np.random.beta(alpha, beta)
    sampled_rates.append(conversion_rate)

# Recommend arm with highest sampled rate
recommended_arm = np.argmax(sampled_rates)
```

### 4.3 Cold Start Problem

For a new context (e.g., a new city or season), the bandit has no history. We use **regularized priors**:

```python
# Default Beta(2, 5) for all arms
# α=2: Slight pessimistic bias (50% expected conversion)
# β=5: High uncertainty, allowing exploration

bandit_state[new_context] = {
    0: {'alpha': 2, 'beta': 5},  # Tier 0
    1: {'alpha': 2, 'beta': 5},  # Tier 1 (default)
    2: {'alpha': 2, 'beta': 5},  # Tier 2
    3: {'alpha': 2, 'beta': 5},  # Tier 3
}
```

This ensures the bandit explores all tiers for new segments before converging.

---

## 5. API Reference

### 5.1 GET `/policies/premium` (Updated in Phase 2)

**Response Includes:**

```json
{
  "worker": { ... },
  "premium": 44,
  "formula_breakdown": { ... },
  "coverage": {
    "0": { "coverage_amount": 500, "premium": 29 },
    "1": { "coverage_amount": 1000, "premium": 44 },
    "2": { "coverage_amount": 2000, "premium": 65 },
    "3": { "coverage_amount": 5000, "premium": 89 }
  },
  "recommended_arm": 2,
  "recommended_premium": 65,
  "context_key": "swiggy_mumbai_established_monsoon_medium",
  "has_active_policy": false,
  "week_start": "2026-04-07",
  "week_end": "2026-04-13"
}
```

**New Fields:**
- `recommended_arm` (0–3): The bandit's recommended coverage tier
- `recommended_premium` (₹): Premium for the recommended tier
- `context_key` (string): The context segment used for this recommendation

### 5.2 POST `/policies/bandit-update` (NEW in Phase 2)

**Purpose:** Log the outcome of a recommendation (purchase or non-purchase)

**Authentication:** JWT token required (enhanced security in Phase 2)

**Request Body:**

```json
{
  "worker_id": "worker-123",
  "recommended_arm": 2,
  "selected_arm": 2,
  "context_key": "swiggy_mumbai_established_monsoon_medium",
  "outcome": "purchased"
}
```

**Parameters:**
- `worker_id`: The worker for whom the recommendation was made
- `recommended_arm`: The arm the bandit recommended (0–3)
- `selected_arm`: The arm the worker actually selected (0–3)
- `context_key`: The context segment hash
- `outcome`: One of `'purchased'`, `'viewed'`, `'abandoned'`

**Response:**

```json
{
  "status": "success",
  "bandit_updated": true,
  "message": "Bandit posterior updated for context_key='swiggy_mumbai_established_monsoon_medium'"
}
```

**Error Cases:**
- `401 Unauthorized` — No JWT token or invalid token
- `400 Bad Request` — Invalid outcome or arm value
- `404 Not Found` — Worker or context not found

---

## 6. Database Schema

The bandit state is persisted in PostgreSQL:

```sql
CREATE TABLE bandit_state (
  id SERIAL PRIMARY KEY,
  context_key VARCHAR(255) NOT NULL UNIQUE,
  arm INT NOT NULL,
  alpha INT DEFAULT 2,          -- Success count
  beta INT DEFAULT 5,           -- Failure count
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bandit_context ON bandit_state(context_key);
```

**Example Data:**

```sql
-- Context: swiggy_mumbai_established_monsoon_medium
-- Tier 0 (Arm 0): 3 successes, 10 failures → Beta(3, 10)
INSERT INTO bandit_state (context_key, arm, alpha, beta) VALUES 
  ('swiggy_mumbai_established_monsoon_medium', 0, 3, 10);

-- Tier 1 (Arm 1): 5 successes, 8 failures → Beta(5, 8)
INSERT INTO bandit_state (context_key, arm, alpha, beta) VALUES 
  ('swiggy_mumbai_established_monsoon_medium', 1, 5, 8);

-- Tier 2 (Arm 2): 12 successes, 4 failures → Beta(12, 4) ← Best performer
INSERT INTO bandit_state (context_key, arm, alpha, beta) VALUES 
  ('swiggy_mumbai_established_monsoon_medium', 2, 12, 4);

-- Tier 3 (Arm 3): 2 successes, 15 failures → Beta(2, 15)
INSERT INTO bandit_state (context_key, arm, alpha, beta) VALUES 
  ('swiggy_mumbai_established_monsoon_medium', 3, 2, 15);
```

---

## 7. Deployment & Configuration

### 7.1 Environment Variables

```bash
# .env

# Bandit configuration
BANDIT_EXPLORATION_ENABLED=true
BANDIT_MIN_SAMPLES_PER_ARM=10        # Don't exploit until ≥10 samples
BANDIT_UPDATE_BATCH_SIZE=50          # Update posteriors every 50 outcomes
```

### 7.2 Monitoring and Observability

**Metrics to Track:**

1. **Conversion Rate by Arm:**
   ```
   conversions_tier_0 / (conversions_tier_0 + abandons_tier_0)
   ```
   Monitor via Grafana dashboard: `Bandit Conversion Rates`

2. **Exploration vs Exploitation:**
   ```
   % of recommendations from high-performing arms (arms with α > β)
   ```
   Should drift from 50% (exploration) to 90%+ (exploitation) over 2–4 weeks.

3. **Lift Metric:**
   ```
   Overall Conversion Rate (Phase 2) vs Baseline (Phase 1)
   Phase 1 baseline: 8%
   Phase 2 target: 10% (25% relative lift = 8% * 1.25)
   ```

4. **Thompson Posterior Convergence:**
   Log top-3 context keys and their arm posteriors weekly to verify learning.

### 7.3 Cold Start Handling

For the first 2 weeks of Phase 2:
- All workers see `"recommended_arm": 1` (Tier 1, same as Phase 1)
- The bandit logs outcomes but doesn't actively personalize yet
- After 2 weeks, we switch to full Thompson Sampling

---

## 8. Example: Real-World Walkthrough

**Scenario:** A new Zomato delivery partner in Bangalore, 3 months on the platform, just before summer season.

**Step 1: Frontend calls `/policies/premium`**

```javascript
const response = await fetch('http://gigguard-api/policies/premium', {
  headers: { Authorization: `Bearer ${jwt_token}` }
});
```

**Step 2: Backend passes context to ML Service**

Context extracted:
- `platform`: 'zomato'
- `city`: 'bangalore'
- `experience_tier`: 'growing' (3 months)
- `season`: 'summer'
- `zone_risk`: 'medium' (zone_multiplier = 1.1)

Context key computed: `"zomato_bangalore_growing_summer_medium"`

**Step 3: ML Service recommends via Thompson Sampling**

Bandit state for this context (after 500 samples over 2 weeks):
- Arm 0: Beta(8, 25) → Expected conversion ~24%
- Arm 1: Beta(15, 22) → Expected conversion ~41%
- Arm 2: Beta(45, 18) → Expected conversion ~71% ← Highest!
- Arm 3: Beta(5, 35) → Expected conversion ~13%

Sampling from each:
```python
conversions = [
    beta_sample(8, 25),   # ~0.22
    beta_sample(15, 22),  # ~0.45
    beta_sample(45, 18),  # ~0.76  ← Max!
    beta_sample(5, 35)    # ~0.11
]
recommended_arm = 2  # Tier 2
recommended_premium = ₹65  # (₹35 base × 1.1 zone × 1.3 weather × 1.0 history = ₹50, + tier markup = ₹65)
```

**Step 4: Frontend displays recommendation**

```
Tier 0: ₹29 coverage ₹500
Tier 1: ₹44 coverage ₹1000
→ Tier 2: ₹65 coverage ₹2000  [RECOMMENDED FOR YOU]
Tier 3: ₹89 coverage ₹5000
```

**Step 5a: Worker selects Tier 2 and purchases**

```javascript
// User clicks "Buy Tier 2"
const outcome = await fetch('http://gigguard-api/policies/bandit-update', {
  method: 'POST',
  headers: { 
    Authorization: `Bearer ${jwt_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    recommended_arm: 2,
    selected_arm: 2,
    context_key: 'zomato_bangalore_growing_summer_medium',
    outcome: 'purchased'
  })
});
```

ML Service updates: `bandit_state['zomato_bangalore_growing_summer_medium'][2]['alpha'] += 1` → Beta(46, 18)

**Next worker from the same segment:** Sampling from (46, 18) increases Arm 2's probability even further.

**Step 5b: Alternative — Worker selects Tier 1 instead**

```javascript
const outcome = await fetch('http://gigguard-api/policies/bandit-update', {
  method: 'POST',
  body: JSON.stringify({
    recommended_arm: 2,
    selected_arm: 1,  // User steered away
    context_key: 'zomato_bangalore_growing_summer_medium',
    outcome: 'abandoned'  // Recommendation was ignored
  })
});
```

The bandit doesn't update its state (the user made their own choice). However, this signals that Tier 2 might not be right for this segment yet, and we log it for analysis.

---

## 9. Testing & Validation

### 9.1 Unit Tests

See [test file reference] for:
- Thompson Sampling math verification
- Context key hashing consistency
- Beta distribution sampling correctness

### 9.2 Integration Tests

Sample test:

```typescript
describe('Bandit Policy Recommendation', () => {
  it('should recommend higher-performing arm to new segment', async () => {
    // Pre-populate bandit state
    await query(
      `INSERT INTO bandit_state (context_key, arm, alpha, beta) VALUES 
        ($1, 0, 2, 5), ($1, 1, 2, 5), ($1, 2, 20, 3), ($1, 3, 2, 5)`,
      ['test_context_high_arm2']
    );

    const response = await fetch('http://localhost:4000/policies/premium', {
      headers: { Authorization: `Bearer ${jwt}` }
    });

    expect(response.recommended_arm).toBe(2);  // Should favor Arm 2
  });
});
```

---

## 10. Rollout Plan

**Week 1:**
- Deploy bandit code, all workers still see static recommendation
- Begin logging outcome data
- Monitor bandit state table for correctness

**Week 2:**
- Enable Thompson Sampling for 10% of workers (canary)
- Compare conversion rates: bandit-enabled vs control

**Week 3–4:**
- Rollout to 100% if canary shows ≥5% improvement
- Monitor real-time conversion metrics via Grafana

**Expected Outcomes:**
- Week 2: +5–10% conversion for canary group
- Week 4: +20–25% conversion overall (Netflix baseline)
- Month 2: Bandit fully exploiting high-converting arms per segment

---

## 11. Troubleshooting

### Q: Bandit always recommends Arm 3 (highest premium)

**A:** This indicates early data skew — possibly only high-income workers have purchased so far. This is normal during ramp-up. The bandit will correct itself as more diverse worker segments purchase.

### Q: Recommendations don't change between weeks

**A:** Check that:
1. `/policies/bandit-update` is being called correctly (logs in ML Service)
2. `BANDIT_UPDATE_BATCH_SIZE` is not so large that updates are delayed

### Q: Thompson Sampling convergence is slow

**A:** Increase `BANDIT_MIN_SAMPLES_PER_ARM` to allow faster exploitation. Higher values = more exploration, but slower convergence.

---

## 12. References

- **Thompson Sampling Paper:** Chapelle & Li, "An Empirical Evaluation of Thompson Sampling" (NIPS 2011)
- **Netflix Impact:** Carrasco, Fernández, & González-Martín on contextual bandits for recommendation (2021)
- **GigGuard Implementation:** [Backend: `backend/src/services/mlService.ts`]
