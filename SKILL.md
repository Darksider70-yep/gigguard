---
name: gigguard
description: >
  Complete build guide for GigGuard — the AI-powered parametric income insurance
  platform for food delivery gig workers (Zomato/Swiggy), built for the Guidewire
  DEVTrails 2026 University Hackathon. Use this skill whenever an agent needs to:
  scaffold the project, understand the folder structure, know what to build in each
  phase, implement any feature (onboarding, premium engine, parametric triggers,
  fraud detection, dashboards, payouts), write DB schema, train ML models, set up
  Docker, record deliverables, or plan the weekly DC economy strategy. This skill
  is the single source of truth for all GigGuard development decisions. Trigger it
  for ANY task related to building, planning, or extending GigGuard across all
  three hackathon phases.
---

# GigGuard — Agent Skill Document
## Guidewire DEVTrails 2026 · AI-Powered Insurance for India's Gig Economy


## 1. Project Context

**What we're building:** GigGuard is a parametric income insurance platform for
Zomato/Swiggy food delivery workers in Indian metro cities. When an external
disruption (heavy rain, severe AQI, flood, curfew) crosses a threshold, a claim
is automatically triggered and the worker's lost income is paid out — zero manual
filing required.

**Golden rules (never violate these):**
- Coverage = INCOME LOSS ONLY. No vehicle repair, no health, no accident claims.
- Premium model = WEEKLY pricing only (not monthly, not daily).
- Persona = Food delivery workers (Zomato / Swiggy). Do not scope-creep to other segments.
- Parametric = triggers are objective, data-driven, automatic. No subjective claims.

**Competition timeline:**
- Phase 1 (Seed): March 4–20 · Deadline March 20 EOD
- Phase 2 (Scale): March 21–April 4 · Deadline April 4 EOD
- Phase 3 (Soar): April 5–17 · Deadline April 17 EOD

---

## 2. Folder Structure

Every path below is relative to the repo root `gigguard/`.

```
gigguard/
├── README.md                        ← Phase 1 deliverable (see Section 4)
├── docker-compose.yml               ← Phase 3: orchestrates all services
├── .gitignore
├── .env.example                     ← Template for all env vars
│
├── docs/                            ← PHASE 1: all submission documents
│   ├── README.md                    ← Copy of root README (GitHub landing)
│   ├── architecture.md              ← System design narrative
│   ├── premium-model.md             ← Weekly pricing formula explained
│   ├── trigger-definitions.md       ← All 5 parametric triggers defined
│   └── assets/
│       ├── architecture-diagram.png
│       ├── premium-formula.png
│       └── persona-flow.png
│
├── frontend/                        ← Next.js 14 React app (worker UI)
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── app/                     ← App Router pages
│       │   ├── layout.tsx
│       │   ├── page.tsx             ← Landing / login
│       │   ├── (onboarding)/        ← PHASE 2: worker registration wizard
│       │   │   ├── page.tsx
│       │   │   ├── step1/page.tsx   ← Name, city, phone
│       │   │   ├── step2/page.tsx   ← Platform (Zomato/Swiggy), avg hours/day
│       │   │   ├── step3/page.tsx   ← Zone selection, risk score shown
│       │   │   └── step4/page.tsx   ← Review + confirm onboarding
│       │   ├── (policy)/            ← PHASE 2: buy and manage policies
│       │   │   ├── page.tsx         ← Policy dashboard
│       │   │   ├── buy/page.tsx     ← Weekly premium shown dynamically
│       │   │   └── active/page.tsx  ← Active policy details + coverage
│       │   ├── (claims)/            ← PHASE 2: claim status tracking
│       │   │   ├── page.tsx         ← Claims history list
│       │   │   └── [claimId]/page.tsx ← Individual claim status + timeline
│       │   └── (dashboard)/         ← PHASE 3: dual dashboards
│       │       ├── worker/page.tsx  ← Earnings protected, coverage status
│       │       └── insurer/page.tsx ← Loss ratios, risk map, predictions
│       ├── components/
│       │   ├── PremiumCard.tsx      ← Shows weekly premium + breakdown
│       │   ├── ClaimStatus.tsx      ← Status pill: Triggered/Validating/Paid
│       │   ├── DisruptionAlert.tsx  ← Live banner when trigger fires
│       │   ├── PolicyBadge.tsx      ← Active/Inactive week indicator
│       │   ├── RiskScore.tsx        ← Visual risk score (zone-based)
│       │   └── WeatherTicker.tsx    ← Live weather + AQI for worker's city
│       └── lib/
│           ├── api.ts               ← All fetch() wrappers to backend
│           ├── types.ts             ← Worker, Policy, Claim, Trigger types
│           ├── constants.ts         ← Trigger thresholds (mirror of rules.ts)
│           └── utils.ts             ← formatCurrency, formatDate, etc.
│
├── backend/                         ← Node.js + Express REST API
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env
│   └── src/
│       ├── index.ts                 ← Boot Express, attach routers, start cron
│       ├── routes/
│       │   ├── workers.ts           ← POST /workers, GET /workers/:id
│       │   ├── policies.ts          ← POST /policies, GET /policies/:workerId
│       │   ├── claims.ts            ← GET /claims, GET /claims/:id
│       │   ├── triggers.ts          ← POST /triggers/simulate (demo endpoint)
│       │   └── payouts.ts           ← GET /payouts/:claimId
│       ├── controllers/
│       │   ├── workerController.ts
│       │   ├── policyController.ts
│       │   ├── claimController.ts   ← CRITICAL: trigger → validate → pay flow
│       │   ├── triggerController.ts
│       │   └── payoutController.ts
│       ├── services/
│       │   ├── weatherService.ts    ← OpenWeatherMap API wrapper
│       │   ├── aqiService.ts        ← AQICN API wrapper
│       │   ├── paymentService.ts    ← Razorpay sandbox SDK wrapper
│       │   ├── mlService.ts         ← HTTP client to Python ML microservice
│       │   └── notificationService.ts ← SMS/push mock for payout alerts
│       ├── triggers/                ← THE CORE — parametric monitor engine
│       │   ├── monitor.ts           ← node-cron job, runs every 30 min
│       │   ├── rules.ts             ← Threshold definitions (source of truth)
│       │   ├── weatherTrigger.ts    ← Checks rainfall > 15mm/hr
│       │   ├── aqiTrigger.ts        ← Checks AQI > 300
│       │   ├── heatTrigger.ts       ← Checks temperature > 44°C
│       │   ├── floodTrigger.ts      ← Checks flood/red alert status
│       │   └── curfewTrigger.ts     ← Checks mock curfew/strike events
│       └── models/                  ← DB query functions (raw SQL via pg)
│           ├── worker.ts
│           ├── policy.ts
│           ├── claim.ts
│           └── payout.ts
│   └── db/
│       ├── schema.sql               ← Canonical DB schema
│       ├── migrations/
│       │   ├── 001_init.sql
│       │   └── 002_add_fraud_score.sql  ← Phase 3 migration
│       └── seeds/
│           └── test-workers.sql     ← 10 test workers across 5 cities
│
├── ml-service/                      ← Python Flask + scikit-learn microservice
│   ├── app.py                       ← Flask app, registers blueprints
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── models/
│   │   ├── premium_model.pkl        ← Trained linear regression
│   │   ├── fraud_model.pkl          ← Trained isolation forest
│   │   ├── train_premium.py         ← Training script for premium model
│   │   └── train_fraud.py           ← Training script for fraud model
│   ├── data/
│   │   ├── zone_risk_data.csv       ← Synthetic zone risk features
│   │   ├── historical_claims.csv    ← Synthetic claim history
│   │   └── weather_history.csv      ← 30-day rolling weather per city
│   └── api/
│       ├── premium.py               ← POST /predict-premium endpoint
│       └── fraud.py                 ← POST /score-fraud endpoint
│
├── infra/                           ← PHASE 3: Docker orchestration
│   ├── docker-compose.yml           ← All 4 services + PostgreSQL
│   └── nginx.conf                   ← Reverse proxy config
│
└── tests/                           ← PHASE 3: E2E and integration tests
    ├── e2e/
    │   └── full-claim-flow.test.ts  ← Rainstorm → claim → payout assertion
    └── integration/
        ├── trigger-monitor.test.ts
        └── fraud-scorer.test.ts
```

---

## 3. Database Schema

**Suggested Improvement:** For better data integrity, we can normalize `city` and `zone`.

```sql
-- Add these tables
CREATE TABLE cities (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE zones (
  id SERIAL PRIMARY KEY,
  city_id INTEGER REFERENCES cities(id) NOT NULL,
  name VARCHAR(50) NOT NULL,
  lat DECIMAL(9,6),
  lon DECIMAL(9,6),
  UNIQUE(city_id, name)
);
```

Write this to `backend/db/schema.sql` exactly:

```sql
-- Workers table
CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(15) UNIQUE NOT NULL,
  city_id INTEGER REFERENCES cities(id) NOT NULL,
  zone_id INTEGER REFERENCES zones(id) NOT NULL,
  platform VARCHAR(20) NOT NULL,        -- 'zomato' | 'swiggy'
  avg_daily_hours DECIMAL(4,2) NOT NULL,
  avg_daily_earning DECIMAL(10,2) NOT NULL,
  risk_score DECIMAL(5,4),              -- 0.0 to 1.0, computed by ML model
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Policies table
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES workers(id) NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  weekly_premium DECIMAL(10,2) NOT NULL,
  coverage_amount DECIMAL(10,2) NOT NULL, -- max payout for the week
  status VARCHAR(20) DEFAULT 'active',    -- 'active' | 'expired' | 'claimed'
  base_rate DECIMAL(10,2) NOT NULL,
  zone_multiplier DECIMAL(5,4) NOT NULL,
  weather_multiplier DECIMAL(5,4) NOT NULL,
  history_multiplier DECIMAL(5,4) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Claims table
CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES policies(id) NOT NULL,
  worker_id UUID REFERENCES workers(id) NOT NULL,
  trigger_type VARCHAR(50) NOT NULL,     -- 'heavy_rain' | 'severe_aqi' | 'extreme_heat' | 'flood' | 'curfew'
  trigger_value DECIMAL(10,4) NOT NULL,  -- actual measured value (e.g. 18.5 for mm/hr)
  trigger_threshold DECIMAL(10,4) NOT NULL, -- threshold that was breached
  disruption_hours DECIMAL(4,2) NOT NULL,   -- estimated hours worker couldn't work
  payout_amount DECIMAL(10,2) NOT NULL,
  fraud_score DECIMAL(5,4),             -- 0.0 = clean, 1.0 = suspicious
  is_flagged BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'triggered', -- 'triggered' | 'validating' | 'approved' | 'paid' | 'rejected'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

-- Payouts table
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID REFERENCES claims(id) NOT NULL,
  worker_id UUID REFERENCES workers(id) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(20) DEFAULT 'upi', -- 'upi' | 'bank_transfer'
  razorpay_payout_id VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending' | 'processing' | 'paid' | 'failed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Disruption events log (for analytics dashboard)
CREATE TABLE disruption_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city VARCHAR(50) NOT NULL,
  zone VARCHAR(50),
  trigger_type VARCHAR(50) NOT NULL,
  trigger_value DECIMAL(10,4) NOT NULL,
  severity VARCHAR(20) NOT NULL,         -- 'moderate' | 'severe' | 'extreme'
  affected_workers_count INTEGER,
  total_claims_triggered INTEGER DEFAULT 0,
  total_payout_amount DECIMAL(12,2) DEFAULT 0,
  event_start TIMESTAMPTZ NOT NULL,
  event_end TIMESTAMPTZ
);
```

---

## 4. Parametric Trigger Rules

Write this to `backend/src/triggers/rules.ts` — this is the single source of truth:

```typescript
export interface TriggerRule {
  type: string;
  label: string;
  threshold: number;
  unit: string;
  disruptionHoursFormula: (value: number) => number;
  severity: (value: number) => 'moderate' | 'severe' | 'extreme';
}

export const TRIGGER_RULES: TriggerRule[] = [
  {
    type: 'heavy_rain',
    label: 'Heavy rainfall',
    threshold: 15,            // mm/hr
    unit: 'mm/hr',
    disruptionHoursFormula: (val) => Math.min(8, Math.floor(val / 15) * 2),
    severity: (val) => val > 35 ? 'extreme' : val > 25 ? 'severe' : 'moderate',
  },
  {
    type: 'severe_aqi',
    label: 'Severe air pollution',
    threshold: 300,           // AQI index
    unit: 'AQI',
    disruptionHoursFormula: (val) => val > 400 ? 6 : 4,
    severity: (val) => val > 400 ? 'extreme' : val > 350 ? 'severe' : 'moderate',
  },
  {
    type: 'extreme_heat',
    label: 'Extreme heat',
    threshold: 44,            // °C
    unit: '°C',
    disruptionHoursFormula: (val) => Math.min(6, (val - 44) * 2 + 3),
    severity: (val) => val > 47 ? 'extreme' : val > 45 ? 'severe' : 'moderate',
  },
  {
    type: 'flood_alert',
    label: 'Flood / red alert',
    threshold: 1,             // binary: 1 = alert active
    unit: 'alert',
    disruptionHoursFormula: (_val) => 8,
    severity: (_val) => 'extreme',
  },
  {
    type: 'curfew_strike',
    label: 'Curfew or local strike',
    threshold: 1,             // binary: 1 = active
    unit: 'event',
    disruptionHoursFormula: (_val) => 8,
    severity: (_val) => 'severe',
  },
];
```

---

## 5. Weekly Premium Model

**Formula:**

```
weekly_premium = base_rate × zone_multiplier × weather_multiplier × history_multiplier
```

**Where:**
- `base_rate` = ₹35 (fixed baseline for all workers)
- `zone_multiplier` = 0.8–1.4 (from ML model, based on zone's historical disruption frequency)
- `weather_multiplier` = 0.9–1.3 (from OpenWeatherMap 7-day forecast for worker's city)
- `history_multiplier` = 0.85–1.25 (penalises frequent claimers, rewards clean history)

**Coverage amount formula:**
```
coverage_amount = avg_daily_earning × disruption_hours_estimate × 0.8
```
(80% income replacement, capped at ₹800/week)

**Example calculation for a Delhi Swiggy worker:**
- base_rate = ₹35
- zone_multiplier = 1.2 (Lajpat Nagar — historically flood-prone)
- weather_multiplier = 1.1 (rainy forecast this week)
- history_multiplier = 0.95 (1 claim in past 3 months)
- **weekly_premium = ₹35 × 1.2 × 1.1 × 0.95 = ₹43.89 → rounded to ₹44**

---

## 6. ML Service Implementation

### 6a. Premium prediction model (`ml-service/models/train_premium.py`)

```python
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler
import pickle, numpy as np

# Feature columns: zone_disruption_freq, forecast_rain_prob,
#                  forecast_aqi_avg, claim_count_90d, avg_hours_worked
# Target: premium_multiplier (total_multiplier = zone × weather × history)

df = pd.read_csv('../data/zone_risk_data.csv')
X = df[['zone_disruption_freq','forecast_rain_prob','forecast_aqi_avg',
        'claim_count_90d','avg_hours_worked']]
y = df['premium_multiplier']

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

model = LinearRegression()
model.fit(X_scaled, y)

with open('premium_model.pkl','wb') as f:
    pickle.dump({'model': model, 'scaler': scaler}, f)
print("Premium model trained. R²:", model.score(X_scaled, y))
```

### 6b. Fraud detection model (`ml-service/models/train_fraud.py`)

```python
import pandas as pd
from sklearn.ensemble import IsolationForest
import pickle

df = pd.read_csv('../data/historical_claims.csv')

# Features for anomaly detection:
# claim_frequency_30d    — how many claims in last 30 days
# location_match_ratio   — % of claims where GPS matches disruption zone
# avg_hours_on_claim_days — hours worked on days they claimed (should be low)
# platform_activity_score — platform's own activity data (mock)
# duplicate_event_flag   — same event, multiple claims

X = df[['claim_frequency_30d','location_match_ratio',
        'avg_hours_on_claim_days','platform_activity_score',
        'duplicate_event_flag']]

model = IsolationForest(contamination=0.05, random_state=42)
model.fit(X)

with open('fraud_model.pkl','wb') as f:
    pickle.dump(model, f)
print("Fraud model trained.")
```

### 6c. Flask endpoints (`ml-service/api/premium.py`)

```python
from flask import Blueprint, request, jsonify
import pickle, numpy as np

bp = Blueprint('premium', __name__)

with open('models/premium_model.pkl','rb') as f:
    artifacts = pickle.load(f)
model = artifacts['model']
scaler = artifacts['scaler']

@bp.route('/predict-premium', methods=['POST'])
def predict():
    data = request.json
    features = np.array([[
        data['zone_disruption_freq'],
        data['forecast_rain_prob'],
        data['forecast_aqi_avg'],
        data['claim_count_90d'],
        data['avg_hours_worked'],
    ]])
    scaled = scaler.transform(features)
    multiplier = float(model.predict(scaled)[0])
    multiplier = max(0.8, min(1.6, multiplier))   # clamp to sane range
    base_rate = 35.0
    weekly_premium = round(base_rate * multiplier, 2)
    return jsonify({
        'base_rate': base_rate,
        'multiplier': round(multiplier, 4),
        'weekly_premium': weekly_premium,
    })
```

### 6d. Fraud scoring endpoint (`ml-service/api/fraud.py`)

```python
from flask import Blueprint, request, jsonify
import pickle, numpy as np

bp = Blueprint('fraud', __name__)

with open('models/fraud_model.pkl','rb') as f:
    model = pickle.load(f)

@bp.route('/score-fraud', methods=['POST'])
def score():
    data = request.json
    features = np.array([[
        data['claim_frequency_30d'],
        data['location_match_ratio'],
        data['avg_hours_on_claim_days'],
        data['platform_activity_score'],
        data['duplicate_event_flag'],
    ]])
    # IsolationForest: -1 = anomaly, 1 = normal
    prediction = model.predict(features)[0]
    score_raw = model.decision_function(features)[0]
    # Normalise to 0–1 fraud score (1 = high fraud risk)
    fraud_score = round(max(0, min(1, (0.5 - score_raw))), 4)
    is_suspicious = fraud_score > 0.65

    reasons = []
    if data['claim_frequency_30d'] > 4:
        reasons.append('High claim frequency')
    if data['location_match_ratio'] < 0.6:
        reasons.append('GPS location mismatch')
    if data['duplicate_event_flag'] == 1:
        reasons.append('Duplicate event claim')
    if data['avg_hours_on_claim_days'] > 4:
        reasons.append('High activity on claim day')

    return jsonify({
        'fraud_score': fraud_score,
        'is_suspicious': is_suspicious,
        'reasons': reasons,
    })
```

---

## 7. Claim Processing Flow

This is the critical path. Implement `claimController.ts` to follow this exact sequence:

```
Trigger fires (monitor.ts detects threshold breach)
    ↓
Find all active policies in affected city/zone
    ↓
For each worker with active policy:
    1. Create claim record (status: 'triggered')
    2. Compute disruption_hours from rules.ts formula
    3. Compute payout_amount = avg_daily_earning/8 × disruption_hours × 0.8
    ↓
    4. Call ML fraud scorer → get fraud_score
    5. If fraud_score > 0.65: flag claim, set status 'validating' (manual review)
    6. If fraud_score ≤ 0.65: auto-approve, set status 'approved'
    ↓
    7. For approved claims: call paymentService → Razorpay sandbox payout
    8. Update claim status → 'paid', record paid_at timestamp
    9. Send notification to worker (mock SMS)
    ↓
    10. Log disruption_event record for analytics
```

---

## 8. Phase-by-Phase Build Plan

### Phase 1 — Seed (March 4–20) · Deadline: March 20 EOD

**Goal:** Ideation, documentation, and foundational scaffolding only.
**Deliverables:** README.md, GitHub repo, 2-min video.

**Week 1 tasks (Mar 4–10):**
- [ ] Initialise GitHub repo with folder structure from Section 2
- [ ] Write `docs/trigger-definitions.md` — define all 5 triggers with thresholds
- [ ] Write `docs/premium-model.md` — document the formula from Section 5
- [ ] Design Figma wireframes: onboarding flow (4 screens), policy screen, claim status
- [ ] Scaffold `frontend/` with `create-next-app --typescript --tailwind`
- [ ] Scaffold `backend/` with `express`, `pg`, `node-cron`, `typescript`
- [ ] Buy Sabotage Shield (DC 3,000) immediately
- [ ] Do weekly quiz (DC 400 × 20 answers = DC 8,000 max)

**Week 2 tasks (Mar 11–20):**
- [ ] Write `README.md` covering all 5 required sections (see below)
- [ ] Build static HTML prototype of onboarding + premium screen (no backend needed)
- [ ] Record 2-min video narrating the Figma wireframes + prototype
- [ ] Post 1 social media post tagging Guidewire (DC 2,000)
- [ ] Write dev blog on insurance design decisions (DC 2,500)
- [ ] Submit by Mar 20 EOD

**README.md required sections:**
1. Persona: Zomato/Swiggy food delivery workers in 5 metro cities, earning ₹600–900/day
2. Weekly premium model: formula, example calculation, why weekly pricing fits gig workers
3. Parametric triggers: all 5 triggers with thresholds and income-loss rationale
4. AI/ML integration plan: premium ML model + fraud detection architecture
5. Tech stack: Next.js + Node.js + PostgreSQL + Python/Flask + OpenWeatherMap API

---

### Phase 2 — Scale (March 21–April 4) · Deadline: April 4 EOD

**Goal:** Working application with all 4 core features demonstrable.
**Deliverables:** Executable source code + 2-min demo video.

**Week 3 tasks (Mar 21–28) — Backend:**
- [ ] Write `backend/db/schema.sql` from Section 3 and run migrations
- [ ] Seed database with `test-workers.sql` (10 workers, 5 cities)
- [ ] Implement all routes and controllers (workers, policies, claims, payouts)
- [ ] Integrate OpenWeatherMap API in `weatherService.ts`
- [ ] Integrate AQICN API in `aqiService.ts`
- [ ] Write `backend/src/triggers/rules.ts` from Section 4
- [ ] Build `monitor.ts` cron job — polls all 5 triggers every 30 min
- [ ] Train ML models from Section 6 with synthetic data
- [ ] Stand up Flask ML service on port 5001
- [ ] Wire `mlService.ts` to call Flask `/predict-premium` and `/score-fraud`
- [ ] Add `POST /triggers/simulate` endpoint for demo (accepts trigger type + value)

**Week 4 tasks (Mar 29–Apr 4) — Frontend:**
- [ ] Build onboarding 4-step wizard in `(onboarding)/`
- [ ] Build policy screen — weekly premium updates live via `GET /premium?workerId=`
- [ ] Build `(claims)/[claimId]/page.tsx` — real-time status polling (1s interval)
- [ ] Add "Simulate disruption" button on policy screen — calls `POST /triggers/simulate`
- [ ] Integrate Razorpay sandbox SDK in `paymentService.ts`
- [ ] Build mock payout screen showing UPI transfer confirmation
- [ ] Record 2-min demo video: onboarding → policy purchase → trigger simulation → payout
- [ ] Submit by Apr 4 EOD

**AI integration to demonstrate:**
- Premium calculator dynamically changes price based on city/zone inputs
- Show the multiplier breakdown on the policy purchase screen (zone: 1.2×, weather: 1.1×, history: 0.95×)
- Fraud score shown in claim detail view (for transparency)

---

### Phase 3 — Soar (April 5–17) · Deadline: April 17 EOD

**Goal:** Production-polish with fraud detection, dual dashboards, instant payouts, and final submission package.
**Deliverables:** 5-min video + pitch deck PDF + complete codebase.

**Week 5 tasks (Apr 5–11) — Fraud + Dashboards:**
- [ ] Run `002_add_fraud_score.sql` migration (adds `fraud_score` column to claims)
- [ ] Wire fraud scorer into claim processing flow (Section 7, steps 4–6)
- [ ] Build GPS spoofing check: compare `worker.zone` to `disruption_event.zone`
- [ ] Build duplicate claim guard: reject if same `worker_id` + `trigger_type` within 6hr window
- [ ] Build worker dashboard (`dashboard/worker/page.tsx`):
  - Active policy status + days remaining
  - Total earnings protected this month
  - Claim history with status pills
  - Weather ticker for worker's city
- [ ] Build insurer dashboard (`dashboard/insurer/page.tsx`):
  - Loss ratio: total_payouts / total_premiums_collected
  - Live disruption events map (city-level, use simple table if no map library)
  - Predictive panel: "X% probability of disruption next week" per city
  - Top flagged claims (fraud_score > 0.65) list

**Week 6 tasks (Apr 12–17) — Polish + Submit:**
```yaml
# infra/docker-compose.yml
version: '3.8'
services:
  db:
    image: postgres:14
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: gigguard
    ports:
      - "5432:5432"
    volumes:
      - ./backend/db/init:/docker-entrypoint-initdb.d # Auto-runs .sql scripts
      - pgdata:/var/lib/postgresql/data
  # ... other services (backend, frontend, ml-service)
volumes:
  pgdata:
```

**Fraud detection to implement (Phase 3 only):**
1. GPS zone mismatch check (sync, fast — runs before ML scorer)
2. Duplicate event window check (SQL query — same worker + trigger_type within 6h)
3. ML anomaly scorer (IsolationForest — async, result stored on claim record)
4. High-frequency flagger (>4 claims in 30 days → auto-flag for review)

---

## 9. DC Economy Strategy

**Starting capital:** DC 1,00,000
**Total burn:** DC 75,000 (unavoidable)
**Break-even:** 3★ every phase = DC 82,000 earned

**Mandatory actions every week (never skip):**
- Weekly quiz: DC 8,000 max (20 questions × DC 400)
- 1 social media post per phase max: DC 2,000 each
- 1 dev blog per phase max: DC 2,500 each
- Peer help in #help channel (confirmed): DC 2,500

**One-time actions:**
- Buy Sabotage Shield in Week 1: DC 3,000 (protects against DC 8,000 compliance fine)
- CTF challenges: attend both events, target Hard + Boss flags (DC 6,000–10,000 each)
- Streak Master achievement: 3 consecutive 4★+ ratings = DC 10,000 bonus
- Zero Debt achievement: no late penalties ever = DC 8,000 bonus

**Late penalty avoidance rule:** Submit broken code on time. Never miss a deadline.
- 1 day late in Soar phase = DC 40,000 penalty (more than the entire Soar burn)

**Soar phase cash buffer requirement:**
- Soar burns DC 36,000 but only earns DC 32,000 at 3★ → net -DC 4,000
- Must enter Soar with ≥ DC 40,000 banked or must score 4★+ to survive

---

## 10. Environment Variables

Create `.env.example` at repo root:

```env
# Backend
DATABASE_URL=postgresql://postgres:password@localhost:5432/gigguard
PORT=4000
ML_SERVICE_URL=http://localhost:5001

# Weather APIs
OPENWEATHER_API_KEY=your_key_here
AQI_API_KEY=your_key_here

# Payments (Razorpay sandbox)
RAZORPAY_KEY_ID=rzp_test_xxxx
RAZORPAY_KEY_SECRET=your_secret_here

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_RAZORPAY_KEY=rzp_test_xxxx
```

---

## 11. Quick-Start Commands

```pseudocode
// Manual Setup (for individual service development)

1. Clone the repository.
2. For each service (backend, frontend, ml-service):
   a. Navigate into the service directory.
   b. Install dependencies (e.g., `npm install` or `pip install`).
3. Create a `.env` file from the example and add your API keys.
4. Manually run the database schema and seed scripts.
5. Start each service in a separate terminal.

// Recommended Setup (using Docker)

1. Clone the repository.
2. Create a `.env` file from the example and add your API keys.
3. Run `docker-compose up --build` from the root directory.
   // This single command builds and starts all services
   // and automatically initializes the database on the first run.
```

---

## 12. Pitch Deck Slide Outline (Phase 3 PDF)

1. **Title:** GigGuard — Income Shield for India's Delivery Workers
2. **The problem:** 20–30% monthly income lost to weather disruptions, zero safety net
3. **Persona:** Zomato/Swiggy food delivery worker, ₹600–900/day, week-to-week income
4. **Solution:** Parametric insurance — no claims to file, automatic payout when it rains
5. **How it works:** 5 triggers → auto-detect → fraud check → instant UPI payout
6. **AI architecture:** Premium ML model + Isolation Forest fraud scorer (diagram)
7. **Weekly pricing model:** Base ₹35 × zone × weather × history — worked example
8. **Fraud detection:** GPS check + duplicate guard + anomaly scorer — 3-layer defence
9. **Demo screenshots:** Onboarding, policy screen, disruption alert, payout confirmation
10. **Business viability:** Loss ratio target 65%, premium pool math at 10,000 workers
11. **Roadmap:** Scale to grocery delivery, e-commerce, expand triggers

---

*End of GigGuard SKILL.md — version 1.0 · DEVTrails 2026*
