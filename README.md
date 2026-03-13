
# GigGuard
### AI-powered parametric income insurance for India's gig economy

![Built for Guidewire DEVTrails 2026](https://img.shields.io/badge/Built%20for-Guidewire%20DEVTrails%202026-blue)
![Phase 1](https://img.shields.io/badge/Phase-1-brightgreen)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

---

## 1. The Problem: A Safety Net for the Unseen Workforce

India's gig economy is not a niche; it's a revolution in employment, projected to encompass over 23 million workers by 2030. At the forefront are the millions of food delivery partners for platforms like Zomato and Swiggy, who form the logistical backbone of urban India. A 2024 report by the Fairwork India initiative highlighted the precarious nature of this work. These individuals are classified as "partners," not employees, leaving them without a traditional safety net: no paid leave, no sick days, no insurance. Their income is directly proportional to the number of deliveries they complete. When they can't ride, they don't earn.

This vulnerability is brutally exposed by external disruptions. A sudden Mumbai downpour exceeding 15mm/hr doesn't just mean getting wet; it means zero visibility, water-logged streets, and a forced halt to work. For a worker earning an average of ₹800 a day, this isn't an inconvenience—it's a direct loss of that day's income. Similarly, when Delhi's AQI skyrockets past 300, or Chennai's heat index hits a blistering 44°C, it becomes physically dangerous to work. These aren't edge cases; they are increasingly frequent realities. Industry estimates suggest that delivery workers can lose between 20-30% of their potential monthly income—upwards of ₹5,000—due to such disruptions.

Existing insurance products are fundamentally misaligned with this reality. They focus on asset protection (vehicle damage) or major life events (hospitalization, accidents) with high deductibles and complex, paper-based claim processes. They operate on monthly or annual premium cycles, a mismatch for workers who manage finances on a weekly or even daily basis. Filing a claim for a single day's lost income is unimaginable. The result is a massive, underserved population facing constant income volatility with no tool to manage their biggest and most frequent risk: the inability to work due to external factors beyond their control. GigGuard is built to fill this void.

---

## 2. Our Solution: Parametric Insurance, Reimagined

GigGuard is an AI-powered parametric insurance platform designed specifically for the income risks of gig-economy food delivery workers. In simple terms, we provide an automated financial safety net that pays out when external events stop them from working.

Our model is built on a simple, powerful premise: instead of requiring a worker to file a claim and prove a loss, we use objective, verifiable data to automatically trigger a payout. When a pre-defined trigger is met—for example, when the OpenWeatherMap API reports rainfall in a specific Mumbai zone has exceeded 15 mm/hr—our system automatically creates a claim for all policyholders in that zone. The claim is processed instantly, and the payout for lost income is sent directly to their registered bank account via Razorpay, often within minutes. There is no paperwork, no manual review, no lengthy approval process. The entire experience is zero-touch.

This parametric approach is coupled with a weekly pricing model that aligns directly with the financial reality of our users. Workers pay a small, dynamic weekly premium calculated by our AI model, based on their location's risk profile, the short-term weather forecast, and their personal claims history. This makes the product affordable and flexible, allowing them to opt-in for coverage during high-risk seasons (like monsoon) and opt-out when risks are lower. By automating claims and aligning the business model with the user's life, GigGuard provides the fast, fair, and transparent income protection that the gig economy desperately needs.

---

## 3. Persona: Who We Are Insuring

We are focused exclusively on food delivery partners for Zomato and Swiggy in 5 major Indian metros.

**Persona 1: Ramesh Kumar**
- **Age:** 28
- **City:** Delhi
- **Platform:** Zomato
- **Details:** Works 8-10 hours a day, earning ~₹750. Rides an electric bike.
- **Risk Exposure:** Highly exposed to winter pollution (AQI > 300) and summer heatwaves (>44°C), which force him off the road.
- **Pain Point:** "Last winter, there were 5-6 days I just couldn't work because the smog was so bad. I couldn't breathe and my eyes were burning. That was nearly ₹4,000 of lost income I never got back."

**Persona 2: Sameer Shaikh**
- **Age:** 22
- **City:** Mumbai
- **Platform:** Swiggy
- **Details:** Works 6-8 hours a day during evening peaks, earning ~₹600. New to the gig.
- **Risk Exposure:** Extremely vulnerable to the monsoon season (June-Sept), where heavy rainfall and localized flooding are common.
- **Pain Point:** "During a heavy rain day, the app shows high demand, but I can't ride. The streets are waterlogged and it's too dangerous. That means I earn zero for the day, but my weekly expenses don't stop."

**Persona 3: Priya Murthy**
- **Age:** 31
- **City:** Chennai
- **Platform:** Zomato
- **Details:** Works 10 hours a day, earning ~₹900. Supports her family.
- **Risk Exposure:** Faces extreme heat and humidity, which can lead to heat exhaustion.
- **Pain Point:** "The heat is getting worse every year. On some afternoons, it's unbearable. I have to take a 3-4 hour break, which means losing out on the lunch peak and a lot of money."

#### Income at Risk Summary

| City      | Avg. Daily Earning | Top Disruption Risk      | Avg. Disruption Days/Month | Monthly Income at Risk |
|-----------|--------------------|--------------------------|----------------------------|------------------------|
| Delhi     | ₹750               | Severe AQI / Extreme Heat| 5-7                        | ₹3,750 - ₹5,250        |
| Mumbai    | ₹600               | Heavy Rainfall / Floods  | 6-8                        | ₹3,600 - ₹4,800        |
| Chennai   | ₹900               | Extreme Heat             | 4-6                        | ₹3,600 - ₹5,400        |
| Bangalore | ₹800               | Heavy Rainfall           | 3-5                        | ₹2,400 - ₹4,000        |
| Hyderabad | ₹700               | Extreme Heat / Rainfall  | 3-4                        | ₹2,100 - ₹2,800        |

---

## 4. Weekly Premium Model

Our pricing is designed to be fair, transparent, and dynamic. The weekly premium is calculated using a multi-factor formula powered by our ML model.

**Formula:**
`weekly_premium = base_rate × zone_multiplier × weather_multiplier × history_multiplier`

- **Base Rate (₹35):** A fixed component that covers the basic operational cost and a baseline level of risk.
- **Zone Multiplier (0.8–1.4):** An ML-driven factor based on the historical frequency and severity of disruption events in the worker's registered zone. A high-risk zone in Mumbai will have a higher multiplier than a low-risk zone in Hyderabad.
- **Weather Multiplier (0.9–1.3):** A forward-looking factor based on the 7-day weather and AQI forecast for the worker's city. If a cyclone is forecast, this multiplier will increase premiums for that week.
- **History Multiplier (0.85–1.25):** A personal multiplier that rewards workers with a clean claims history, promoting good faith engagement. New workers start at 1.0.

**Why Weekly?**
A weekly cycle matches the earning and expense patterns of a gig worker. It avoids the large financial commitment of a monthly premium and gives them the flexibility to opt-in for coverage when they need it most (e.g., during monsoon season).

#### Worked Examples:

**Ramesh (Delhi):**
- Base: ₹35
- Zone (Connaught Place - High AQI risk): `zone_multiplier` = 1.3
- Weather (Heatwave forecast): `weather_multiplier` = 1.2
- History (1 minor claim in 6 months): `history_multiplier` = 0.9
- **Premium:** `₹35 × 1.3 × 1.2 × 0.9 = ₹49.14 ≈ ₹49/week`
- **Coverage:** Up to ₹800/week.

**Sameer (Mumbai):**
- Base: ₹35
- Zone (Andheri - High flood risk): `zone_multiplier` = 1.4
- Weather (Monsoon active): `weather_multiplier` = 1.3
- History (New worker): `history_multiplier` = 1.0
- **Premium:** `₹35 × 1.4 × 1.3 × 1.0 = ₹63.7 ≈ ₹64/week`
- **Coverage:** Up to ₹800/week.

**Priya (Chennai):**
- Base: ₹35
- Zone (T. Nagar - Medium heat risk): `zone_multiplier` = 1.1
- Weather (Clear forecast): `weather_multiplier` = 1.0
- History (No claims): `history_multiplier` = 0.85
- **Premium:** `₹35 × 1.1 × 1.0 × 0.85 = ₹32.72 ≈ ₹33/week`
- **Coverage:** Up to ₹800/week.

#### Premium Range Table

| City      | Risk Tier   | Weekly Premium Range | Weekly Coverage Cap |
|-----------|-------------|----------------------|---------------------|
| Mumbai    | High-Risk   | ₹60 - ₹75            | ₹800                |
| Delhi     | High-Risk   | ₹55 - ₹70            | ₹800                |
| Chennai   | Medium-Risk | ₹40 - ₹55            | ₹800                |
| Bangalore | Medium-Risk | ₹40 - ₹55            | ₹800                |
| Hyderabad | Low-Risk    | ₹30 - ₹45            | ₹800                |

---

## 5. Parametric Triggers

Triggers are the heart of our parametric model. They are objective, data-driven thresholds that automatically initiate a claim.

| Trigger Type      | Data Source          | Threshold                 | Disruption Hours Formula       | Max Payout (Example) |
|-------------------|----------------------|---------------------------|--------------------------------|----------------------|
| Heavy Rainfall    | OpenWeatherMap API   | > 15 mm/hr                | `4 hours`                      | ₹240 (`600/8 * 4 * 0.8`)  |
| Severe AQI        | AQICN API            | > 300 (PM2.5)             | `5 hours`                      | ₹300 (`600/8 * 5 * 0.8`)  |
| Extreme Heat      | OpenWeatherMap API   | > 44°C (Feels Like)       | `4 hours`                      | ₹240 (`600/8 * 4 * 0.8`)  |
| Flood / Red Alert | IMD Mock RSS / Manual| Alert Active for Zone     | `8 hours` (Full Day)           | ₹480 (`600 * 0.8`)        |
| Curfew / Strike   | Mock Webhook         | Event Active for Zone     | `8 hours` (Full Day)           | ₹480 (`600 * 0.8`)        |

**What "Parametric" Means:** The insurance contract is based on a "parameter"—an objective index like rainfall amount or AQI value. If the parameter crosses the threshold, the policy pays out. It does not matter if a specific worker's house was flooded or not; it only matters that they held a policy in a zone where the trigger event occurred. This removes ambiguity, subjectivity, and the potential for claim disputes, enabling instant, automated payouts.

---

## 6. AI/ML Integration Plan

AI/ML is core to GigGuard's ability to price risk accurately and operate securely. We use two primary models managed by a dedicated Python/Flask microservice.

**1. Premium Prediction Model (Linear Regression):**
This model calculates the `zone_multiplier`, a key component of our dynamic weekly premium.
- **Algorithm:** Linear Regression was chosen for its interpretability and speed, which is critical for real-time premium quoting.
- **Features:**
    - `zone_id`: Categorical feature for the delivery zone.
    - `city`: Categorical feature for the metro city.
    - `historical_disruption_freq`: (Numeric) Average number of disruption days per month in that zone over the last 2 years.
    - `historical_disruption_severity`: (Numeric) Average disruption hours per event in that zone.
    - `zone_population_density`: (Numeric) Proxy for traffic and logistical complexity.
- **Training Data:** We will generate a synthetic dataset based on historical weather and AQI data for our 5 target cities, combined with zone definitions. The model will be trained to predict the "risk score" of a zone, which is then normalized to produce the multiplier.
- **Integration:** The backend Node.js service calls the `/predict/premium` endpoint on the ML service whenever a worker requests a premium quote. The request includes the worker's zone, and the ML service returns the calculated `zone_multiplier`.

**2. Fraud Detection Model (Isolation Forest):**
This model acts as our third layer of defense against anomalous claim behavior, providing a "fraud score" for each claim.
- **Algorithm:** Isolation Forest is an unsupervised anomaly detection algorithm, ideal for identifying unusual patterns without needing pre-labeled fraudulent data.
- **Features:**
    - `claims_in_last_7_days`: (Numeric)
    - `claims_in_last_30_days`: (Numeric)
    - `time_since_last_claim_hours`: (Numeric)
    - `payout_amount`: (Numeric)
    - `claim_frequency_vs_zone_average`: (Numeric) A ratio comparing the worker's claim rate to their zone's average.
- **Fraud Defense Layers:**
    1. **GPS Check (Backend):** The backend verifies the worker's last known location is within the disruption zone at the time of the trigger.
    2. **Duplicate Guard (Backend):** The system prevents more than one claim per worker for the same disruption event.
    3. **ML Anomaly Scorer:** The Isolation Forest model analyzes the claim pattern. A high anomaly score flags the claim for manual review; otherwise, it is approved automatically.
- **Retraining:** Both models are scheduled for retraining on a weekly basis, incorporating the latest claims and payout data to continuously adapt to new risk patterns and user behaviors.

---

## 7. Tech Stack and Architecture Overview

We are building GigGuard on a modern, scalable microservices architecture.

| Layer                | Technology             | Purpose                                                    |
|----------------------|------------------------|------------------------------------------------------------|
| **Frontend**         | Next.js 14, TypeScript | Worker onboarding, policy management, and viewing claims.    |
| **Backend**          | Node.js, Express, TS   | Core business logic, API gateway, DB management, trigger polling. |
| **Machine Learning** | Python, Flask, Scikit  | Premium calculation and fraud detection ML models.         |
| **Database**         | PostgreSQL             | Storing all persistent data (workers, policies, claims).   |
| **Deployment**       | Docker, Docker Compose | Containerizing and orchestrating all services for development. |

The four services communicate via REST APIs. The **Frontend** (running on port 3000) makes calls to the **Backend API** (port 4000) for all data operations. The **Backend** in turn communicates with the **PostgreSQL Database** for data persistence and calls the **ML Service** (port 5001) for risk calculations.

#### API Endpoint Summary

| Method | Endpoint                    | Purpose                                         |
|--------|-----------------------------|-------------------------------------------------|
| POST   | `/workers/register`         | Onboard a new worker.                           |
| GET    | `/policies/premium`         | Get a dynamic weekly premium quote.             |
| POST   | `/policies`                 | Purchase a new weekly policy.                   |
| GET    | `/claims`                   | Get a worker's claim history.                   |
| POST   | `/payouts/webhook`          | Handle payout status updates from Razorpay.     |
| GET    | `/insurer/dashboard`        | (For Hackathon) View high-level platform stats. |

#### Parametric Trigger Monitor
A `node-cron` job runs within the Backend service every 30 minutes. It queries the OpenWeatherMap and AQICN APIs for each active operational zone. If a response value exceeds a predefined threshold (e.g., AQI > 300), the monitor logs a `disruption_event` in the database and triggers a service to automatically create claims for all active policyholders in that affected zone.

---

## 8. Development Roadmap

**Phase 1 (Current Submission - 40%)**
- **DONE:** Detailed architecture, data models, and technical specifications.
- **DONE:** Full project documentation (README, architecture, premium model, triggers).
- **IN PROGRESS:** Backend scaffolding with worker and policy creation endpoints.
- **IN PROGRESS:** ML service with a basic linear regression model for premium calculation.
- **IN PROGRESS:** Basic Next.js frontend for worker registration.

**Phase 2 Targets (Goal: 80%)**
- **Parametric Trigger Engine:** Implement the cron job to poll external APIs and create `disruption_event` records.
- **Automated Claim Creation:** Build the pipeline that generates claims for affected users when a trigger fires.
- **Razorpay Integration:** Integrate the Razorpay sandbox for processing premium payments and claim payouts.
- **Worker Dashboard:** A complete frontend dashboard for workers to view their policy, see live trigger status in their city, and track claims.

**Phase 3 Targets (Goal: 100% - Final Submission)**
- **Fraud Detection:** Fully integrate the Isolation Forest model for flagging anomalous claims.
- **Insurer Dashboards:** Build out the internal dashboards for monitoring platform health, loss ratios, and claim frequencies.
- **Model Retraining Pipeline:** Automate the weekly retraining process for both ML models.
- **End-to-End Testing & Deployment Prep:** Finalize testing, documentation, and prepare for the final demo.

---

## 9. Team

*This section will be populated with team member details for the final submission.*

---

## 10. Setup and Running the Project

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
Copy the `.env.example` file to `.env` and fill in the required values.
```bash
cp .env.example .env
```
You will need to get free API keys from:
- [OpenWeatherMap](https://openweathermap.org/api)
- [AQICN](https://aqicn.org/api/)
- [Razorpay Sandbox](https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/)

**3. Install dependencies for all services:**
```bash
# From the root directory
# Install backend dependencies
cd backend && pnpm install

# Install frontend dependencies
cd ../frontend && pnpm install

# Install ML service dependencies
cd ../ml-service && pip install -r requirements.txt
```

**4. Build and run services with Docker Compose:**
This is the recommended way to run the entire stack.
```bash
# From the root directory
docker-compose up --build
```

**5. Access URLs:**
- **Frontend App:** [http://localhost:3000](http://localhost:3000)
- **Backend API:** [http://localhost:4000](http://localhost:4000)
- **ML Service:** [http://localhost:5001](http://localhost:5001)

The database will be running on port `5432`, accessible from the backend service.
