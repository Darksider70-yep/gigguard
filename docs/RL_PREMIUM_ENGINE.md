# RL Premium Engine (Shadow Mode) - Phase 2

## Overview

The **RL Premium Engine** is a **Soft Actor-Critic (SAC) reinforcement learning agent** that runs in parallel with GigGuard's existing parametric premium formula. During Phase 2, it operates in **shadow mode**: the formula prices all live policies while the RL agent logs its recommendations for later evaluation.

**Objective:** The RL agent learns to optimize premiums that maximize worker purchase intent and platform revenue while maintaining a sustainable loss ratio (< 75%).

**Expected Impact:** 15–30% improvement in premium efficiency by Phase 3 (when switched to live mode)

---

## 1. The Problem: Formula Optimization Hits a Ceiling

GigGuard's Phase 1 premium model uses a **deterministic formula:**

```
weekly_premium = ₹35 × zone_multiplier × weather_multiplier × history_multiplier
```

**Advantages:**
- Transparent, explainable
- Fast to compute
- Easy to adjust parameters manually

**Limitations:**
- Static parameters don't adapt to changing market conditions
- No consideration of worker behavior patterns or purchase intent
- No optimization of loss ratio in real-time
- Manual A/B tests take weeks; market moves in hours

**Example Problem:**
In Mumbai during monsoon, the formula outputs ₹65 for a high-risk worker. However:
- At ₹60, 45% of workers buy (revenue = ₹60 × 0.45 = ₹27/worker)
- At ₹65, 30% of workers buy (revenue = ₹65 × 0.30 = ₹19.50/worker)

The RL agent discovers this and suggests ₹60, but the formula can't adapt without manual intervention.

---

## 2. The Solution: Soft Actor-Critic (SAC) Reinforcement Learning

We deploy a **SAC agent** trained to discover the optimal premium multiplier for each worker segment:

### 2.1 Why SAC?

- **Off-Policy Learning:** SAC learns from a replay buffer of historical observations without requiring new data generation. This lets us run in shadow mode without affecting live pricing.
- **Sample Efficiency:** SAC converges faster than policy gradient methods, critical for real-world deployment.
- **Entropy Regularization:** Prevents the agent from converging to a narrow, brittle policy early on—encouraging exploration.
- **Continuous Action Space:** Premium is continuous (₹29.50 to ₹150); SAC handles this naturally.
- **Production-Ready:** Used by Uber for dynamic pricing and Amazon for inventory optimization.

### 2.2 High-Level Concept

```
State (s):        Zone risk, 7-day weather forecast, claim history, competitor prices
Action (a):       Premium multiplier μ (0.8 to 1.4) to apply to base formula
Reward (r):       Revenue from purchase - Expected loss ratio penalty
Policy π(a|s):    NN that maps state → distribution over actions
Value V(s):       Expected cumulative reward from state s forward
Entropy H(π):     Encourages exploration; prevents deterministic over-specialization
```

The agent learns through repeated interaction:
1. Observe worker segment state
2. Sample action (premium multiplier) from policy
3. Collect outcome (purchase y/n, potential claim)
4. Store (s, a, r, s') in replay buffer
5. Train on batch from replay buffer, improving policy and value estimates

---

## 3. Phase 2 Shadow Mode: How It Works

### 3.1 Data Flow

```
Worker requests /policies/premium
    ↓
Backend computes formula premium
    ├─ Output: ₹44 (base formula)
    └─ [LIVE: Return this to worker]
    ↓
Backend passes state to ML Service /rl-shadow-premium endpoint
    ├─ State: { zone_risk, weather_forecast, claim_history, competitor_prices }
    ↓
RL Agent (ML Service):
    ├─ Sample action (premium_multiplier) from policy
    ├─ Compute shadow_premium = base_premium × premium_multiplier
    ├─ Log recommendation: { formula_premium: 44, rl_premium: 52, multiplier: 1.18 }
    └─ Return shadow premium for logging only
    ↓
Backend stores shadow recommendation in database for later analysis
    ↓
[Worker purchases or doesn't based on FORMULA premium, not RL premium]
    ↓
After event (purchase + claim tracking):
    ├─ Outcome recorded: purchased?, claimed?
    ├─ Reward = { purchase_value - expected_loss - cost_of_capital }
    └─ Stored in replay buffer for RL training
    ↓
RL Model Training (Nightly Batch):
    ├─ Sample batch from replay buffer
    ├─ Update policy, Q-functions, value network
    └─ Evaluate on held-out test set
```

### 3.2 No Impact on Workers (Phase 2)

Crucially, **Phase 2 is shadow mode:** Workers always see and purchase based on the formula premium. The RL agent's recommendations are logged but not shown to users. This allows us to:
- Collect real-world feedback on RL accuracy
- Compare RL recommendations vs actual outcomes
- Detect and fix issues before going live
- Build stakeholder confidence through transparent evaluation

---

## 4. Technical Architecture

### 4.1 RL Agent Components

**Policy Network π(a|s):**

```python
class PolicyNetwork(nn.Module):
    def __init__(self, state_dim, action_dim, hidden_dim=256):
        self.fc1 = nn.Linear(state_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, hidden_dim)
        self.mean = nn.Linear(hidden_dim, action_dim)
        self.log_std = nn.Linear(hidden_dim, action_dim)
    
    def forward(self, state):
        x = relu(self.fc1(state))
        x = relu(self.fc2(x))
        mean = self.mean(x)
        log_std = self.log_std(x)
        std = exp(log_std).clamp(0.1, 2.0)  # Prevent collapse
        return Normal(mean, std)  # Return distribution
```

**Q-Functions Q₁, Q₂ (for stability):**

```python
class CriticNetwork(nn.Module):
    def __init__(self, state_dim, action_dim, hidden_dim=256):
        self.fc1 = nn.Linear(state_dim + action_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, hidden_dim)
        self.value = nn.Linear(hidden_dim, 1)
    
    def forward(self, state, action):
        x = relu(self.fc1(cat([state, action])))
        x = relu(self.fc2(x))
        return self.value(x)  # Q(s, a)
```

**Value Network V(s):**

```python
class ValueNetwork(nn.Module):
    def __init__(self, state_dim, hidden_dim=256):
        self.fc1 = nn.Linear(state_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, hidden_dim)
        self.value = nn.Linear(hidden_dim, 1)
    
    def forward(self, state):
        x = relu(self.fc1(state))
        x = relu(self.fc2(x))
        return self.value(x)  # V(s)
```

### 4.2 State Features (7 dimensions)

```typescript
interface RLState {
  zone_risk_level: number;           // 0.0–1.0 (from zone_multiplier)
  weather_forecast_score: number;    // 0.0–1.0 (rain/heat/aqi next 7 days)
  claim_frequency_this_month: number;  // Count
  loss_ratio_ytd: number;            // 0.0–1.0
  competitor_avg_premium: number;    // ₹ (normalized: /100)
  worker_segment_id: number;         // Categorical encoding (0–15)
  day_of_week: number;               // 0–6 (cyclical)
}
```

### 4.3 Action Space

**Premium Multiplier μ ∈ [0.85, 1.30]**

```python
# RL agent outputs μ
base_premium = 44.0  # Formula base
rl_premium = base_premium × μ

# Example:
# μ = 1.0   → rl_premium = 44 (formula match)
# μ = 0.85  → rl_premium = 37.4 (discount)
# μ = 1.2   → rl_premium = 52.8 (premium)
```

### 4.4 Reward Function

```python
def compute_reward(observation):
    """
    Reward = Revenue - Expected Loss - Regret vs Optimal
    """
    worker_purchased = observation['purchased']
    premium_paid = observation['premium_paid']
    claim_triggered = observation['claim_triggered']
    estimated_loss = observation['estimated_loss'] if claim_triggered else 0
    
    # Revenue if worker purchased, else cost of opportunity
    revenue = premium_paid if worker_purchased else -5.0  # Regret penalty
    
    # Loss if claim occurred
    loss = estimated_loss if claim_triggered else 0
    
    # Sustainability penalty: if running loss ratio > 75%, penalize
    platform_loss_ratio = observation['platform_loss_ratio']
    sustainability_penalty = 0
    if platform_loss_ratio > 0.75:
        sustainability_penalty = -10 * (platform_loss_ratio - 0.75)
    
    reward = revenue - loss + sustainability_penalty
    return reward
```

**Reward Signal Intuition:**
- Positive reward: Worker purchases at high premium, no claim
- Low reward: Worker purchases, claim occurs (loss > premium)
- Large negative: Platform loss ratio unsustainable
- Penalty: Worker doesn't purchase (opportunity cost)

---

## 5. API Reference

### 5.1 GET `/insurer/shadow-comparison` (NEW in Phase 2)

**Purpose:** Review RL agent performance vs formula during Phase 2

**Response:**

```json
{
  "summary": {
    "period": "2026-04-01 to 2026-04-07",
    "total_policies": 12450,
    "formula_avg_premium": 48.5,
    "rl_avg_premium": 49.2,
    "rl_recommendation_adoption": "N/A (shadow mode)",
    "formula_conversion_rate": 0.32,
    "rl_estimated_conversion_rate": 0.35,
    "lift_if_deployed": "9.4%"
  },
  "by_segment": [
    {
      "segment_id": "swiggy_mumbai_monsoon",
      "policies": 450,
      "formula_avg_premium": 62.0,
      "rl_avg_premium": 58.5,
      "rl_delta": "-5.6%",
      "estimated_lift": "12%",
      "confidence": 0.87
    },
    {
      "segment_id": "zomato_delhi_summer",
      "policies": 380,
      "formula_avg_premium": 38.0,
      "rl_avg_premium": 41.2,
      "rl_delta": "+8.4%",
      "estimated_lift": "-2%",
      "confidence": 0.72
    }
  ],
  "top_opportunities": [
    {
      "segment": "blinkit_bangalore_growing_monsoon",
      "current_formula_premium": 45,
      "rl_recommendation": 42,
      "estimated_purchase_lift": "18%",
      "reason": "Weather forecast unusually favorable; RL reduces premium"
    }
  ]
}
```

### 5.2 POST `/policies/ml-update-shadow` (INTERNAL - ML Service Only)

**Purpose:** Log outcome of a shadow premium recommendation for RL training

**Called By:** Backend after purchase outcome is confirmed

**Request Body:**

```json
{
  "policy_id": "policy-456",
  "formula_premium": 44,
  "rl_premium": 52,
  "rl_multiplier": 1.18,
  "state": {
    "zone_risk_level": 0.65,
    "weather_forecast_score": 0.72,
    "claim_frequency_this_month": 2,
    "loss_ratio_ytd": 0.68,
    "competitor_avg_premium": 47,
    "worker_segment_id": 3,
    "day_of_week": 2
  },
  "outcome": {
    "purchased": true,
    "claimed": false,
    "estimated_loss_if_claimed": 0,
    "platform_loss_ratio_at_time": 0.71
  }
}
```

**Processing:**
1. Store in replay buffer
2. Trigger async training job (nightly batch update)

---

## 6. Training Pipeline

### 6.1 Nightly Training Job

**Schedule:** Daily at 02:00 UTC

**Process:**

```python
# pseudo-code
def train_rl_agent_batch():
    # 1. Sample batch of 512 transitions from replay buffer
    batch = replay_buffer.sample(batch_size=512)
    
    # 2. Update Q-functions (critics)
    for transition in batch:
        state, action, reward, next_state = transition
        # Compute TD target
        with torch.no_grad():
            next_action, log_prob_next = policy.sample(next_state)
            q_target_1 = q1_target(next_state, next_action)
            q_target_2 = q2_target(next_state, next_action)
            q_target = min(q_target_1, q_target_2) - alpha * log_prob_next
            td_target = reward + gamma * q_target
        
        # MSE loss
        q_loss = MSE(q1(state, action), td_target)
        optimizer_q.backward(q_loss)
    
    # 3. Update value network V
    value_loss = MSE(value(state), q1(state, action).detach() - alpha * log_prob)
    optimizer_v.backward(value_loss)
    
    # 4. Update policy π
    policy_loss = -log_prob * (q1(state, action).detach() - value(state).detach())
    optimizer_policy.backward(policy_loss)
    
    # 5. Update target networks (soft: τ = 0.005)
    q1_target = 0.995 * q1_target + 0.005 * q1
    q2_target = 0.995 * q2_target + 0.005 * q2
    
    # 6. Log metrics
    log_metrics({
        'q_loss': q_loss.item(),
        'policy_loss': policy_loss.item(),
        'avg_action_entropy': log_prob.mean().item(),
        'avg_reward': reward.mean().item()
    })
```

### 6.2 Evaluation and Monitoring

**Held-Out Test Set:**
- 20% of replay buffer sampled at random
- Never used in training

**Metrics (Daily):**

```python
# Compute expected return on test set
def evaluate():
    total_return = 0
    for state, action, reward, next_state in test_set:
        predicted_value = value_network(state)
        actual_return = reward + gamma * value_network(next_state)
        total_return += actual_return.item()
    
    avg_return = total_return / len(test_set)
    
    log({
        'timestamp': now(),
        'test_set_avg_return': avg_return,
        'policy_entropy': compute_entropy(policy),
        'q_function_variance': compute_variance([q1, q2]),
        'replay_buffer_size': len(replay_buffer)
    })
```

---

## 7. Phase 2 Evaluation Checklist

Before switching from shadow to live mode (Phase 3):

- [ ] **RL Convergence:** Policy entropy decreases over 4 weeks (exploration → exploitation)
- [ ] **Offline Evaluation:** On held-out test set, RL returns exceed formula baseline by ≥10%
- [ ] **Segment-Level Accuracy:** For each segment, RL premium ± 10% of optimal observed
- [ ] **Loss Ratio Sustainability:** Estimated loss ratio < 75% under RL pricing
- [ ] **Sensitivity Analysis:** Tested RL behavior under edge cases (extreme weather, market shock)
- [ ] **Stakeholder Alignment:** Product team, legal, and actuaries agree on rollout criteria
- [ ] **Monitoring Infrastructure:** Real-time dashboards in place for Phase 3 live mode

---

## 8. Database Schema

```sql
CREATE TABLE rl_shadow_recommendations (
  id BIGSERIAL PRIMARY KEY,
  policy_id VARCHAR(255) NOT NULL,
  formula_premium NUMERIC(8, 2) NOT NULL,
  rl_premium NUMERIC(8, 2) NOT NULL,
  rl_multiplier NUMERIC(4, 3) NOT NULL,
  state JSONB NOT NULL,
  outcome JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_rl_policy ON rl_shadow_recommendations(policy_id);
CREATE INDEX idx_rl_created ON rl_shadow_recommendations(created_at);

-- Replay buffer table (for ML Service training)
CREATE TABLE rl_replay_buffer (
  id BIGSERIAL PRIMARY KEY,
  state JSONB NOT NULL,
  action NUMERIC(4, 3) NOT NULL,
  reward NUMERIC(10, 4) NOT NULL,
  next_state JSONB NOT NULL,
  done BOOLEAN DEFAULT FALSE,
  inserted_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_replay_inserted ON rl_replay_buffer(inserted_at);
```

---

## 9. Configuration & Hyperparameters

```python
# RL hyperparameters (in ml-service/config.py)

SAC_CONFIG = {
    'learning_rate_policy': 3e-4,
    'learning_rate_q': 3e-4,
    'learning_rate_value': 3e-4,
    'replay_buffer_size': 1_000_000,
    'batch_size': 512,
    'gamma': 0.99,  # Discount factor
    'tau': 0.005,   # Target network update rate
    'alpha': 0.2,   # Entropy coefficient
    'action_min': 0.85,  # Min premium multiplier
    'action_max': 1.30,  # Max premium multiplier
    'training_frequency': 'daily',
    'training_hour_utc': 2,
}

# Action clipping (post-sample)
action = policy.sample(state)
action = clip(action, min=0.85, max=1.30)
```

---

## 10. Troubleshooting

### Q: RL agent only recommends extreme premiums (always 0.85 or 1.30)

**A:** Policy hasn't learned well yet. Common causes:
- Insufficient replay buffer samples (< 10,000)
- Learning rates too high (policy diverging)
- Reward function poorly scaled

**Fix:**
1. Check replay buffer size: `SELECT COUNT(*) FROM rl_replay_buffer;`
2. Reduce learning rates: `learning_rate_policy = 1e-4`
3. Verify reward compute: Check RL logs for reward statistics

### Q: RL estimated conversion vs actual formula conversion doesn't match

**A:** The extrapolation assumes workers are price-sensitive in the same way for new prices. In practice:
- Some workers are inelastic (always buy, never buy)
- Market context changes (seasonality)

**Resolution:**
- This is expected during Phase 2. Actual lift will be measured in Phase 3 when RL goes live.
- Use multiple estimation methods (regression, causal forests) for robustness

### Q: Loss ratio spike after nightly training

**A:** Training job may have converged on-policy too quickly, suggesting aggressive pricing. This is caught in shadow mode and fixed before live deployment.

**Fix:**
1. Increase entropy coefficient `alpha` to encourage exploration
2. Check for reward function errors (may be incentivizing unsustainable behavior)
3. Revert to previous policy checkpoint if spike is large (> 5%)

---

## 11. Comparison: Formula vs RL

| Aspect | Formula (Phase 1) | RL Agent (Phase 2 Shadow) | RL Agent (Phase 3 Live, planned) |
|---|---|---|---|
| **Pricing Logic** | Static multipliers | Learned from data | Real-time adaptive |
| **Adaptation Speed** | Manual (week+) | Nightly retraining | Continuous |
| **Risk Awareness** | Implicit (zone_multiplier) | Explicit (forecast, loss ratio) | Multi-signal with late-breaking data |
| **Transparency** | White-box rules | Black-box NN | Explainability layer added (Phase 3) |
| **Optimization Target** | Premium coverage | Revenue + sustainability | Purchase intent + loss ratio + lifetime value |
| **Deployment Status** | Live | Shadow (logging only) | Planned for Q2 2026 |

---

## 12. References

- **SAC Paper:** Haarnoja, Zhou, Abbeel, Levine. "Soft Actor-Critic: Off-Policy Deep RL with a Stochastic Actor" (ICML 2018)
- **Entropy Regularization:** Nachum & Dai. "Theoretically Principled Trade-off between Robustness and Performance" (ICML 2020)
- **Implementation:** [Backend: `backend/src/services/mlService.ts`] [ML Service: `ml-service/rl/sac_agent.py`]
