# GigGuard
### AI-powered parametric income insurance for India's gig economy

![Built for Guidewire DEVTrails 2026](https://img.shields.io/badge/Built%20for-Guidewire%20DEVTrails%202026-blue)
![Phase-1](https://img.shields.io/badge/Phase-1-brightgreen)
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

> For a deeper technical dive, including the full database schema and API design, see the [**Architecture Document**](docs/architecture.md) and the [**ER Model**](docs/GigGuard_ER_Model.pdf).

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

> For a complete breakdown of the formula and business viability analysis, see the [**Premium Model Document**](docs/premium-model.md).

### AI-Powered Fraud Detection
To protect the platform and keep premiums low, we use an **Isolation Forest** model to analyze claim patterns in real-time. This is an anomaly detection algorithm that excels at finding unusual behavior. It assigns a fraud score to each claim based on features like a worker's claim frequency compared to their zone's average. High-risk claims are flagged for a quick manual review, while legitimate claims are processed instantly.

---

## 5. Future Innovations

Beyond the core engine, we have a strategic plan to implement advanced features drawn from the world's leading technology companies, ensuring GigGuard stays at the forefront of the InsurTech space.

| Innovation                          | Borrowed From      | Explanation                                                               |
|-------------------------------------|--------------------|---------------------------------------------------------------------------|
| **H3 Geospatial Indexing**          | Uber               | Replaces vague text-based zones with Uber's hexagonal grid system for hyper-precise geographic accuracy, preventing payouts for unaffected workers. |
| **Contextual Bandits**              | Netflix            | Uses multi-armed bandit algorithms to personalize policy recommendations, increasing the rate of policy purchase by showing the right product to the right user. |
| **Reinforcement Learning Premiums** | Uber / DeepMind    | A self-tuning premium engine that learns the optimal price to maximize purchase rates while keeping the platform's loss ratio sustainable. |
| **Graph Neural Network Fraud**      | Stripe Radar       | Builds a graph of all users, claims, and payouts to detect and dismantle sophisticated, coordinated fraud rings that are invisible to traditional models. |
| **Causal Inference Validation**     | Netflix / Spotify  | Uses causal inference to determine if a worker would have been offline anyway, ensuring we only pay for income loss *caused* by the disruption event. |
| **Smart Contract Execution**        | AXA Fizzy          | Encodes the policy terms on a public blockchain (like Polygon) to create a mathematically guaranteed, tamper-proof insurance contract, offering ultimate transparency. |

> For technical details, schema changes, and implementation timelines for each innovation, see the [**Innovation Plan Document**](docs/GigGuard_Innovation_Plan.pdf).

---

## 6. Tech Stack

| Layer                | Technology             | Purpose                                                    |
|----------------------|------------------------|------------------------------------------------------------|
| **Frontend**         | Next.js 14, TypeScript | Worker onboarding, policy management, and viewing claims.    |
| **Backend**          | Node.js, Express, TS   | Core business logic, API gateway, DB management, trigger polling. |
| **Machine Learning** | Python, Flask, Scikit  | Premium calculation and fraud detection ML models.         |
| **Database**         | PostgreSQL             | Storing all persistent data (workers, policies, claims).   |
| **Deployment**       | Docker, Docker Compose | Containerizing and orchestrating all services for development. |

---

## 7. Setup and Running the Project

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
pnpm install --prefix frontend

# Install ML service dependencies
pip install -r ml-service/requirements.txt
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

---
## 8. Documentation

For more in-depth information, please refer to the documents in the `/docs` directory:

-   [**Architecture Deep Dive**](docs/architecture.md)
-   [**Premium Model Details**](docs/premium-model.md)
-   [**Trigger Definitions**](docs/trigger-definitions.md)
-   [**Innovation Plan**](docs/GigGuard_Innovation_Plan.pdf)
-   [**Database ER Model**](docs/GigGuard_ER_Model.pdf)
