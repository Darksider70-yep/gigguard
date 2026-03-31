# GigGuard: Secure Your Hustle.

### AI-powered parametric income insurance for India's gig economy.

**GigGuard is a revolutionary InsurTech platform designed from the ground up to protect the backbone of the modern economy: the gig worker.** We provide a simple, automated, and transparent financial safety net, ensuring that disruptions like bad weather or city-wide shutdowns don't have to mean a lost day's income.

![Built for Guidewire DEVTrails 2026](https://img.shields.io/badge/Built%20for-Guidewire%20DEVTrails%202026-blue)
![Phase-2](https://img.shields.io/badge/Phase-2-blue)
![Tests](https://img.shields.io/badge/Tests-61%2F61-brightgreen)
![Build](https://img.shields.io/badge/Build-Passing-brightgreen)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

---

## 1. The Problem: A Safety Net for the Unseen Workforce

India's gig economy, projected to exceed 23 million workers by 2030, relies on individuals classified as "partners," lacking traditional employment safety nets. Food delivery drivers, for example, face significant income loss—estimated at 20-30% of their monthly earnings—due to external disruptions like extreme weather or hazardous air quality. Existing insurance products are misaligned with their daily financial realities, offering no practical solution for recovering a single day's lost income. GigGuard is built to fill this void.

## 2. Our Solution: Parametric Insurance, Reimagined

GigGuard provides an automated financial safety net by replacing the slow, manual claims process of traditional insurance with a modern, data-driven approach. At its core is a **parametric engine**. This means that instead of requiring a worker to file a claim and prove a loss, we use objective, verifiable data from public APIs to automatically trigger a payout.

The process is simple and designed to be **zero-touch**, removing friction for the worker:
1.  **Purchase:** A worker uses our Next.js app to buy a flexible, low-cost weekly policy. The price is determined in real-time by our AI model.
2.  **Monitor:** Our backend systems continuously monitor data from sources like **OpenWeatherMap** (for weather) and **AQICN** (for air quality) for every covered zone.
3.  **Trigger:** When a pre-defined threshold is met (e.g., rainfall in a specific zone exceeds 15 mm/hr), the system automatically creates a `disruption_event`.
4.  **Payout:** The system instantly identifies all policyholders in the affected zone, creates claims for them, and executes a payout for their estimated lost income via the Razorpay API.

This model shifts the burden of proof from the individual to the data, resulting in a claims experience that is fast, fair, and transparent.

---

## 3. Architecture Overview

GigGuard is built on a scalable **microservices architecture**, ensuring a clear separation of concerns that allows for independent development, scaling, and deployment. The system comprises four main services, containerized with Docker for consistency across all environments.

![System Flow](docs/assets/system_flow.png)

The services communicate via REST APIs to perform their functions:
1.  **Frontend (Next.js):** The user-facing web application where workers sign up, manage their policies, and view claim history. It is the primary interface for all user interactions.
2.  **Backend (Node.js/Express):** The central nervous system of the platform. It serves the main API, manages user and policy data, and runs the crucial **Trigger Monitor**—a cron job that polls external APIs to detect disruption events.
3.  **ML Service (Python/Flask):** This service houses our machine learning models. When the Backend needs to calculate a premium or assess risk, it sends a request to this service, which returns the result. This isolates complex AI logic from the core business application.
4.  **Database (PostgreSQL):** The single source of truth for all persistent data, including worker profiles, policy details, disruption events, and claim statuses.

> For a deeper technical dive, including the full database schema and API design, see the [**Architecture Document**](docs/System_architecture.docx) and the [**ER Model**](docs/GigGuard_ER_Model.docx).

---

## 3.5 Phase 2: What's New

Phase 2 ships five major upgrades over Phase 1:

### H3 Geospatial Precision
Replaced text-based zone matching ("Andheri West") with Uber's H3
hexagonal grid at resolution 8 (~0.74 km² per hex). The trigger
monitor now pays workers in a k=1 ring (7 hexes, ~2km radius) around
the exact event coordinate - not everyone in a named zone. This
eliminates basis risk: workers at the dry end of a large zone no
longer receive payouts for rain they never experienced.

Expected impact: ~40% reduction in over-payout from imprecise
zone matching.

### Contextual Bandit Policy Recommendation
A Thompson Sampling bandit learns which of four coverage tiers each
worker segment is most likely to purchase. The buy policy flow now
shows a personalised "Recommended for you" tier first. The bandit
updates in real-time from purchase outcomes, with no manual A/B
test scheduling required.

Expected impact: ~25% lift in policy purchase conversion
(Netflix baseline for Thompson Sampling).

### RL Premium Engine (Shadow Mode)
A SAC (Soft Actor-Critic) reinforcement learning agent runs in
parallel with the existing formula. It observes zone risk, 7-day
weather forecast, claim history, and competitor pricing to output
a premium multiplier that targets purchase rate maximisation while
holding loss ratio below 75%. Phase 2 runs the agent in shadow mode
- the formula still prices live policies, the RL agent logs its
recommendations and is evaluated against real outcomes.

Shadow comparison: GET /insurer/shadow-comparison shows the
running delta between formula and RL premiums.

### GNN Fraud Detection (Schema + Training Data)
The graph schema for Phase 3 GNN training is fully built:
graph_edges, upi_addresses, and worker_devices tables are live.
100 synthetic fraud rings (4 patterns: UPI ring, device ring,
registration burst, mixed) + 100 clean clusters are generated
as training data. The GraphSAGE model stub is ready. Isolation
Forest remains the live scorer throughout Phase 2.

### Security Hardening
- Bandit update endpoint: JWT-only auth, no worker_id body fallback
- Payout deduplication: UNIQUE constraint on payouts(claim_id) +
  app-level pre-insert guard + upgrade lock once payout processing
- H3 centroid tracking: hex_is_centroid_fallback flag + nightly
  backfill job for geocoding precision
- Test lanes: unit (fast, no deps) / integration (DB+ML) / e2e split
- Pre-commit hook: blocks commits containing live API key patterns

---

## 4. Core Features

Our platform is built on three pillars: automated triggers, fair pricing, and robust security.

### Parametric Triggers
This is the feature that enables automatic payouts. By defining clear, objective thresholds, we eliminate the ambiguity and paperwork of traditional claims. This is a game-changer for workers who cannot afford to wait for a manual review to be compensated for lost income.

| Trigger Type      | Data Source          | Threshold                 | Disruption Hours (Example) |
|-------------------|----------------------|---------------------------|----------------------------|
| Heavy Rainfall    | OpenWeatherMap API   | > 15 mm/hr                | 4 hours                    |
| Severe AQI        | AQICN API            | > 300 (PM2.5)             | 5 hours                    |
| Extreme Heat      | OpenWeatherMap API   | > 44°C (Feels Like)       | 4 hours                    |
| Flood / Red Alert | IMD Mock RSS         | Alert Active for Zone     | 8 hours (Full Day)         |
| Curfew / Strike   | Mock Webhook         | Event Active for Zone     | 8 hours (Full Day)         |

> For detailed justifications, fraud guard mechanisms, and API parsing logic, see the [**Trigger Definitions Document**](docs/trigger-definitions.md).

### AI-Powered Premium Model
To ensure pricing is both fair and sustainable, our weekly premium is not a fixed number. It is calculated dynamically by a machine learning model that assesses risk in real-time. This means workers in lower-risk areas pay less, and prices adjust to reflect current forecasts.

**Formula:** `weekly_premium = base_rate × zone_multiplier × weather_multiplier × history_multiplier`

-   **Base Rate (₹35):** The fixed cost to cover basic operations.
-   **Zone Multiplier (AI-driven):** Reflects the long-term, historical risk of the worker's specific geographic zone.
-   **Weather Multiplier:** A short-term, forward-looking adjustment based on the 7-day weather and air quality forecast.
-   **History Multiplier:** A personal discount or surcharge based on the worker's individual claims history, rewarding safe behavior.

> For a complete breakdown of the formula and business viability analysis, see the [**Premium Model Document**](docs/Premium_model.docx).

### AI-Powered Fraud Detection
To protect the platform and keep premiums low, we use an **Isolation Forest** model to analyze claim patterns in real-time. This is an anomaly detection algorithm that excels at finding unusual behavior. It assigns a fraud score to each claim based on features like a worker's claim frequency compared to their zone's average. High-risk claims are flagged for a quick manual review, while legitimate claims are processed instantly.

---

## 5. 🛡️ Adversarial Defense & Anti-Spoofing Strategy

> **Context:** A coordinated syndicate of 500 delivery workers has been found exploiting parametric insurance platforms using GPS-spoofing applications. Operating via Telegram groups, bad actors fake their location inside an active weather-alert zone while remaining safely at home, triggering mass false payouts. Simple GPS coordinate verification is no longer sufficient. This section details GigGuard's multi-layered, AI-driven defense architecture against this exact class of attack.

---

### 5.1 The Core Insight: GPS is a Claim, Not a Proof

The fundamental flaw in naive parametric systems is treating a GPS coordinate as ground truth. A GPS coordinate is a **self-reported claim** from a device. Our defense architecture is built on a single principle: **we never trust any single data signal in isolation.** Instead, we build a convergent evidence model — a claim is legitimate only when multiple independent, hard-to-fake signals agree.

A genuinely stranded delivery partner in a flood zone will produce a **coherent, physically consistent fingerprint** across every data layer. A bad actor spoofing their GPS from home will produce a **contradictory fingerprint** — their GPS says "flood zone," but their device's cellular tower, battery, accelerometer, and network behavior all say "couch."

---

### 5.2 Differentiation: Genuine Stranded Worker vs. GPS Spoofer

We differentiate using a **Behavioral Coherence Score (BCS)**, a composite ML-driven score (0–100) calculated at the moment a disruption event fires. A high BCS indicates a coherent, physically plausible signal. A low BCS triggers graduated review.

The BCS is computed from **four independent evidence layers**, each of which a spoofer must simultaneously defeat to appear legitimate:

#### Layer 1: Passive Telemetry Coherence (Device Signals)
The GigGuard mobile SDK passively collects lightweight telemetry throughout the workday — **not just at the moment of a claim event.** This creates a rich, continuous behavioral baseline that is impossible to retrospectively fake.

| Signal | What It Detects |
|---|---|
| **Accelerometer / Step Count** | A worker stranded in heavy rain shows near-zero movement. A spoofer sitting at home shows normal indoor movement (minor vibrations, occasional steps). Genuine stranding = stillness. |
| **Battery Drain Rate** | Using a GPS spoofing app in the foreground is computationally expensive. Devices running spoofers drain battery 30–50% faster than idle. A claimed "stranded" device with anomalously high battery drain is a red flag. |
| **Screen-On Time & App Usage** | A genuinely stranded worker in bad weather tends to have high screen-on time (checking maps, messaging family). A device passively spoofing in a pocket shows low screen activity. |
| **Network Cell Tower ID (CID)** | Every mobile carrier assigns a Cell ID to the tower a device is connected to. Cell tower locations are publicly mapped. If a device's GPS says it is in Dharavi (Zone 4) but its Cell ID resolves to a tower in Andheri (Zone 9), this is a **hard contradiction** that no GPS spoofer can mask without carrier-level access. |
| **Wi-Fi SSID & BSSID** | If a device is connected to a home Wi-Fi network (identifiable by BSSID hash), it is definitively not out in a severe weather event. A genuine stranded worker will be on mobile data or disconnected. |

> **Key architectural point:** The SDK is designed as a lightweight background service. It does not require constant active use. Workers consent to this telemetry during onboarding, and the data is stored locally on-device, with only the processed coherence signals (never raw data) sent to our servers on event trigger. This preserves privacy while enabling verification.

#### Layer 2: Geospatial Plausibility & Historical Trajectory
A real delivery worker has a **plausible physical journey** to be in a given location. Our backend maintains a rolling 48-hour GPS breadcrumb trail (hashed and anonymized for privacy).

-   **Pre-Event Trajectory Check:** When a disruption event fires, we verify that the worker's GPS coordinates over the preceding 2–4 hours show a coherent path *towards* or *within* the affected zone. A worker who teleports from their home pin to a flood zone 5 minutes before a trigger fires fails this check.
-   **Zone Dwell Time:** We require a minimum dwell time (e.g., 20+ minutes) within the affected zone before the trigger event, confirming the worker was already operating there, not just appearing at the moment of payout.
-   **Velocity Plausibility:** We flag any position delta that implies physically impossible speeds (e.g., jumping 15 km in 2 minutes), a classic telltale of GPS spoofing apps.

#### Layer 3: Platform Data Cross-Reference (The Delivery App Signal)
GigGuard is positioned as a B2B2C product, meaning policies are sold through partnerships with gig platforms (Swiggy, Zomato, Blinkit). This unlocks our most powerful verification layer.

-   **Last Active Order Timestamp:** The partner platform can confirm whether the worker had accepted and was actively fulfilling an order at the time of the disruption event. A genuine stranded worker will have an open, active order. A spoofer sitting at home will be offline on the platform.
-   **Order Geofence Match:** The delivery address of the active order can be cross-referenced with the disruption zone. If a worker's last order destination falls inside the affected zone, it is a strong corroborating signal.
-   **Platform Online Status:** We verify the worker was in "online/available" status on the delivery platform within the 30-minute window before the event, confirming they were actively working, not resting at home.

> This cross-reference is the single most powerful anti-spoofing signal available to us. It requires the syndicate to not only spoof GPS but also to **actively be on-shift and accepting orders at scale**, which dramatically increases their operational cost and exposure risk.

#### Layer 4: Network & Graph-Level Anomaly Detection
Individual spoofing is detectable. Coordinated syndicate spoofing requires a network-level defense.

-   **Graph Neural Network (GNN) Fraud Ring Detection:** As outlined in our Innovation Plan, we model all workers, claims, and devices as a graph. In a legitimate disruption event, claimants will be a **diverse, organically distributed set** of workers who happen to be in the zone. A syndicate attack produces a **topologically unusual cluster**: workers who share network infrastructure (same IP subnet, same Wi-Fi BSSID group), have recently activated policies within a short time window, and show synchronized claim timing. The GNN flags these unnatural cluster formations.
-   **IP & Network Fingerprinting:** Multiple workers submitting claims originating from the same IP address or the same residential subnet is a direct indicator of a coordinated home-based spoofing operation.
-   **Claim Timing Entropy:** In a genuine disruption event, claims arrive over a distributed time window as workers realize they are stuck. In a coordinated attack, claims arrive in a tight, synchronized burst — a pattern that a simple time-series anomaly detector can identify.

---

### 5.3 The Data: What We Analyze Beyond GPS

The following table summarizes all data points our anti-spoofing system analyzes, their source, and their fraud signal:

| Data Point | Source | Fraud Signal |
|---|---|---|
| GPS Coordinates | Device (claimed) | Baseline — **never trusted alone** |
| Cell Tower ID (CID/LAC) | Mobile network (carrier-level, device-readable) | Hard contradiction if mismatches GPS zone |
| Wi-Fi BSSID | Device OS | Home Wi-Fi = hard "not stranded" signal |
| Accelerometer / Motion | Device IMU | No motion during "stranding" = coherent; normal motion = suspicious |
| Battery Drain Rate | Device OS | High drain = spoofer app running |
| Historical GPS Breadcrumb (48hr) | GigGuard backend | No plausible trajectory to zone = flag |
| Zone Dwell Time (pre-event) | GigGuard backend | < 20 min in zone before event = flag |
| Velocity Between Pings | GigGuard backend | Impossible speed = GPS spoof telltale |
| Platform Online Status | Gig platform API | Offline on platform = not working, cannot claim |
| Active Order at Event Time | Gig platform API | No open order = not genuinely stranded |
| Order Destination Zone | Gig platform API | Order not in disruption zone = mismatch |
| Claim IP Address | GigGuard backend | Shared IP with multiple claimants = coordinated |
| Network Subnet Clustering | GigGuard backend | Multiple claimants on same subnet = ring flag |
| Policy Activation Recency | GigGuard DB | Policy activated <48 hrs before first claim = fraud flag |
| Claim Timing Distribution | GigGuard backend | Synchronized burst timing = coordinated attack |
| GNN Cluster Score | ML Service | Unusual social/network graph cluster = ring detection |

---

### 5.4 The UX Balance: Protecting Honest Workers

The greatest risk of an aggressive fraud detection system is **false positives** — incorrectly flagging a legitimate worker who is genuinely stranded. In a severe weather event, network connectivity is degraded by definition. Cell signals drop. GPS accuracy suffers. Battery drains faster in cold or wet conditions. Our system is explicitly designed to account for all of this.

#### The Three-Tier Response Model

Rather than a binary "pay/deny" decision, we operate on three tiers:

**Tier 1 — Auto-Approve (BCS ≥ 70):**
The claim is coherent across multiple independent layers. Payout is executed instantly and automatically. This is the path for the vast majority of legitimate claims. Zero friction, zero delay. Workers in this tier never know the system ran a check.

**Tier 2 — Soft-Flag / Provisional Payout (BCS 40–69):**
One or two signals are ambiguous or missing (e.g., cell tower data unavailable due to network congestion, or platform API timed out). Crucially, **we issue a provisional payout immediately** — the worker is not penalized for a network outage during a storm. In parallel, the system queues a lightweight asynchronous verification. If verification confirms legitimacy (which it will for genuine workers), the record is cleared automatically. If verification fails (e.g., platform confirms worker was offline), the provisional payout is logged as a disputed transaction for human review before any recovery action is taken.

> **This is the key UX principle:** A genuine worker experiencing a network drop during a flood should not have to wait or fight for their payout. We pay first, verify second, and only escalate if hard contradictions emerge.

**Tier 3 — Hard-Flag / Manual Review (BCS < 40):**
Multiple strong contradictions are detected (e.g., home Wi-Fi connected + no platform activity + shared IP with 15 other claimants). The claim is held for a rapid human review — targeted to complete within 4 hours. The worker receives an in-app notification explaining that their claim is under a "quick verification check" with a transparent, plain-language status tracker. If review confirms fraud, the claim is denied and the syndicate node is reported. If review clears the worker, payout is issued with a small goodwill bonus (e.g., ₹20) to compensate for the inconvenience.

#### Safeguards Against System Error

-   **Weather-Adjusted Thresholds:** During an active Red Alert (our highest disruption tier), the BCS threshold for Tier 1 auto-approval is **lowered by 15 points** to account for the fact that severe weather will degrade network signals for everyone in the zone. We are more permissive, not less, during the events that matter most.
-   **Appeals Mechanism:** Every denied or held claim includes a one-tap appeal button in the app. The appeal surfaces a human reviewer within 2 hours and provides the worker with a simple checklist of evidence they can submit (e.g., a timestamped photo from their location).
-   **No Punitive History Impact:** A Tier 2 or Tier 3 flag that resolves in the worker's favor has zero impact on their History Multiplier (used in premium calculation). Only confirmed fraudulent claims affect future premiums.
-   **Syndicate Quarantine, Not Blanket Bans:** When a fraud ring is detected, we surgically flag the specific cluster of accounts, not entire zones. Legitimate workers in the same zone continue to receive auto-approved payouts without interruption.

---

### 5.5 Syndicate-Specific Countermeasures

The Telegram-coordinated syndicate model has specific structural weaknesses we exploit:

| Syndicate Tactic | GigGuard Counter |
|---|---|
| GPS spoofing app fakes location | Cell Tower ID hard-contradicts GPS; velocity anomaly detection flags impossible position jumps |
| Organize via Telegram, claim simultaneously | Synchronized claim burst timing detected; GNN flags social cluster |
| 500 workers, all from home | IP subnet clustering flags shared residential networks; platform offline status confirms no active work |
| Recruit new members, activate policies before event | Policy activation recency flag (< 48 hrs) elevates fraud score for new accounts |
| Scale attack across multiple events | Cross-event pattern learning: ML model raises fraud prior for accounts flagged in previous events |
| Spoof platform "online" status | Requires compromising the gig platform's API — outside the syndicate's capability; our B2B partnership provides tamper-evident status feeds |

---

### 5.6 Architectural Integration

The anti-spoofing system integrates into the existing GigGuard microservices architecture as an extension of the **ML Service**, with a new dedicated module:

```
Backend (Node.js)
  └── Trigger Monitor detects disruption_event
        └── For each affected policyholder:
              └── Calls ML Service /score-claim endpoint
                    ├── Pulls telemetry from Device SDK store
                    ├── Queries platform API for worker status
                    ├── Pulls 48hr breadcrumb from PostgreSQL
                    ├── Runs GNN cluster check
                    └── Returns { bcs_score, tier, flags[] }
              └── Backend routes to Tier 1 / 2 / 3 workflow
                    ├── Tier 1 → Razorpay instant payout
                    ├── Tier 2 → Provisional payout + async verify queue
                    └── Tier 3 → Hold + human review queue + worker notification
```

No new infrastructure is required. The existing ML Service (Python/Flask) and PostgreSQL database are extended. The device SDK is a new lightweight addition to the frontend mobile app, requiring a one-time worker consent during onboarding.

---

## 6. Future Innovations

Beyond the core engine, we have a strategic plan to implement advanced features drawn from the world's leading technology companies, ensuring GigGuard stays at the forefront of the InsurTech space.

| Innovation                          | Borrowed From      | Explanation                                                               |
|-------------------------------------|--------------------|---------------------------------------------------------------------------|
| **H3 Geospatial Indexing**          | Uber               | Replaces vague text-based zones with Uber's hexagonal grid system for hyper-precise geographic accuracy, preventing payouts for unaffected workers. |
| **Contextual Bandits**              | Netflix            | Uses multi-armed bandit algorithms to personalize policy recommendations, increasing the rate of policy purchase by showing the right product to the right user. |
| **Reinforcement Learning Premiums** | Uber / DeepMind    | A self-tuning premium engine that learns the optimal price to maximize purchase rates while keeping the platform's loss ratio sustainable. |
| **Graph Neural Network Fraud**      | Stripe Radar       | Builds a graph of all users, claims, and payouts to detect and dismantle sophisticated, coordinated fraud rings that are invisible to traditional models. |
| **Causal Inference Validation**     | Netflix / Spotify  | Uses causal inference to determine if a worker would have been offline anyway, ensuring we only pay for income loss *caused* by the disruption event. |
| **Smart Contract Execution**        | AXA Fizzy          | Encodes the policy terms on a public blockchain (like Polygon) to create a mathematically guaranteed, tamper-proof insurance contract, offering ultimate transparency. |

> For technical details, schema changes, and implementation timelines for each innovation, see the [**Innovation Plan Document**](docs/GigGuard_Innovation_Plan.docx).

---

## 7. Tech Stack

| Layer                | Technology             | Purpose                                                    |
|----------------------|------------------------|------------------------------------------------------------|
| **Frontend**         | Next.js 14, TypeScript | Worker onboarding, policy management, and viewing claims.    |
| **Backend**          | Node.js, Express, TS   | Core business logic, API gateway, DB management, trigger polling. |
| **Machine Learning** | Python, Flask, Scikit  | Premium calculation and fraud detection ML models.         |
| **Database**         | PostgreSQL             | Storing all persistent data (workers, policies, claims).   |
| **Deployment**       | Docker, Docker Compose | Containerizing and orchestrating all services for development. |

---

## 8. Setup and Running the Project

**Prerequisites:**
- Node.js (v18+)
- Python (v3.9+)
- Docker and Docker Compose
- `pnpm` (or `npm`/`yarn`)

**1. Clone the repository:**
```bash
git clone https://github.com/your-repo/gigguard.git
cd gigguard
```

**2. Set up environment variables:**
Copy the `.env.example` file to `.env` and fill in the required API keys from OpenWeatherMap, AQICN, and Razorpay Sandbox.
```bash
cp .env.example .env
```

**3. Install dependencies:**
```bash
# Install backend dependencies
pnpm install --prefix backend

# Install frontend dependencies
pnpm install --prefix gigguard-frontend

# Install ML service dependencies
pip install -r ml-service/requirements.txt
```

**4. Build and run services with Docker Compose:**
This is the recommended way to run the entire stack.
```bash
# From the root directory
docker-compose up --build
```

If your project is inside OneDrive on Windows and Docker BuildKit fails with `invalid file request ...`, run Compose with the classic builder:
```powershell
$env:COMPOSE_DOCKER_CLI_BUILD='0'
$env:DOCKER_BUILDKIT='0'
docker compose build --no-cache
docker compose up
```

**5. Access URLs:**
- **Frontend App:** [http://localhost:3000](http://localhost:3000)
- **Backend API:** [http://localhost:4000](http://localhost:4000)
- **ML Service:** [http://localhost:5001](http://localhost:5001)

**6. Reset demo state (between demo runs):**
```bash
npm run demo:reset
```
This truncates claims, payouts, and disruption_events,
re-runs the seed script, and warms up all services.
Safe to run at any time - does not affect worker or policy data.

---
## 9. Documentation

For more in-depth information, please refer to the documents in the `/docs` directory:

-   [**Architecture Deep Dive**](docs/System_architecture.docx)
-   [**Premium Model Details**](docs/Premium_model.docx)
-   [**Trigger Definitions**](docs/trigger-definitions.md)
-   [**Innovation Plan**](docs/GigGuard_Innovation_Plan.docx)
-   [**Database ER Model**](docs/GigGuard_ER_Model.docx)
