
# GigGuard System Architecture

---

## 1. System Overview

The GigGuard platform is designed as a distributed system of microservices, ensuring a separation of concerns, independent scalability, and technological flexibility. Our design philosophy prioritizes reliability, real-time processing, and automation to deliver a seamless, zero-touch experience for our users.

The architecture consists of four primary, containerized services:

1.  **Frontend (Next.js):** The user-facing web application responsible for all client-side interactions, including worker onboarding, policy management, and claims visualization. It is a pure client, consuming data from the Backend API.
2.  **Backend (Node.js/Express):** The central nervous system of the platform. It exposes the primary REST API, manages core business logic, orchestrates interactions between all other services, and handles communication with external data providers.
3.  **ML Service (Python/Flask):** A specialized service that houses our machine learning models. It exposes simple endpoints for the Backend to calculate dynamic premiums and assess claim fraud risk, abstracting the data science complexity away from the core application logic.
4.  **Database (PostgreSQL):** The persistent storage layer for all platform data, including worker profiles, policies, claim events, and financial transactions.

This decoupled architecture allows the Frontend team to iterate on the UI independently of backend changes, and the ML team to retrain and deploy new models without affecting the core system's uptime. All services are containerized with Docker, enabling consistent development environments and simplifying deployment.

---

## 2. Component Diagram

```
+--------------------------------------------------------------------------------------------------+
|                                         User (Delivery Worker)                                   |
|                                       (Browser / Mobile Web)                                     |
+--------------------------------------------------------------------------------------------------+
                                                  |
                                                  | HTTP/S (React)
                                                  v
+--------------------------------------------------------------------------------------------------+
|                                     Frontend (Next.js) :3000                                     |
|                               (Onboarding, Dashboard, Policy Mgmt)                               |
+--------------------------------------------------------------------------------------------------+
                                                  |
                                                  | REST API Calls (JSON)
                                                  v
+--------------------------------------------------------------------------------------------------+
|                                   Backend API (Node.js/Express) :4000                            |
|                                                                                                  |
|    +-------------------------+    +-----------------------+    +-------------------------------+   |
|    |   Worker & Policy Mgmt  |--->|    Trigger Monitor    |--->|    Claim & Payout Service     |   |
|    |                         |    |     (node-cron)       |    |                               |   |
|    +-------------------------+    +-----------------------+    +-------------------------------+   |
|               |                               |                            |                     |
+---------------+-------------------------------+----------------------------+---------------------+
                |                               |                            |
                |                               |                            |
      (ML Model Calls)                          |                    (DB Operations)
                |                               |                            |
                v                               |                            v
+---------------------------+   (External API Polling)   +---------------------------------------+
|   ML Service (Flask)      |             |              |      Database (PostgreSQL) :5432      |
|          :5001            |             |              |                                       |
|                           |             |              |    +-----------+    +-------------+   |
| +-----------------------+ |             |              |    |  workers  |    |  policies   |   |
| |  /predict/premium     | |             |              |    +-----------+    +-------------+   |
| |  /predict/fraud       | |             |              |    |  claims   |    |  payouts    |   |
| +-----------------------+ |             |              |    +-----------+    +-------------+   |
|                           |             v              |    |disruption_events|                  |
+---------------------------+   +---------------------+  |    +-----------------+                  |
                              |  - OpenWeatherMap   |  |                                       |
                              |  - AQICN API        |  +---------------------------------------+
                              |  - Razorpay         |
                              |  - Mock IMD / Hooks |
                              +---------------------+
```

---

## 3. Database Schema

The PostgreSQL database schema is designed to be normalized and scalable. We use `UUID` for primary keys to ensure global uniqueness and prevent enumeration attacks.

#### 1. `workers` Table
Stores information about the delivery workers.

```sql
CREATE TABLE "workers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "phone_number" varchar(15) UNIQUE NOT NULL, -- Used for login/auth
  "full_name" varchar(255) NOT NULL,
  "city" varchar(100) NOT NULL, -- e.g., 'Mumbai', 'Delhi'
  "zone" varchar(100) NOT NULL, -- A specific operational area, e.g., 'Andheri West'
  "avg_daily_earning" integer NOT NULL, -- In Rupees, e.g., 800
  "vehicle_type" varchar(50), -- e.g., 'motorcycle', 'e-bike'
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);
```

#### 2. `policies` Table
Stores records of each weekly policy purchased by a worker.

```sql
CREATE TABLE "policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "worker_id" uuid NOT NULL,
  "status" varchar(50) NOT NULL DEFAULT 'active', -- 'active', 'expired', 'cancelled'
  "start_date" timestamptz NOT NULL,
  "end_date" timestamptz NOT NULL,
  "premium_amount" decimal(10, 2) NOT NULL,
  "coverage_amount" decimal(10, 2) NOT NULL, -- Max weekly payout cap
  "razorpay_payment_id" varchar(255) UNIQUE,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  
  FOREIGN KEY ("worker_id") REFERENCES "workers" ("id") ON DELETE CASCADE
);
```

#### 3. `disruption_events` Table
A log of every time a parametric trigger threshold is breached.

```sql
CREATE TABLE "disruption_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "trigger_type" varchar(100) NOT NULL, -- e.g., 'heavy_rainfall', 'severe_aqi'
  "city" varchar(100) NOT NULL,
  "zone" varchar(100) NOT NULL,
  "disruption_value" varchar(100) NOT NULL, -- The value that breached the threshold, e.g., '16.5 mm/hr' or '350 AQI'
  "disruption_hours" integer NOT NULL, -- Calculated hours of disruption for this event
  "event_time" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);
```

#### 4. `claims` Table
Automatically generated claims linking workers to disruption events.

```sql
CREATE TABLE "claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "policy_id" uuid NOT NULL,
  "worker_id" uuid NOT NULL,
  "disruption_event_id" uuid NOT NULL,
  "status" varchar(50) NOT NULL DEFAULT 'triggered', -- 'triggered' -> 'validating' -> 'approved' -> 'paid'/'rejected'
  "payout_amount" decimal(10, 2) NOT NULL,
  "fraud_score" decimal(5, 4), -- Anomaly score from the ML model
  "notes" text, -- For logging validation steps or rejection reasons
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),

  UNIQUE ("policy_id", "disruption_event_id"), -- A worker can only have one claim per disruption event
  FOREIGN KEY ("policy_id") REFERENCES "policies" ("id"),
  FOREIGN KEY ("worker_id") REFERENCES "workers" ("id"),
  FOREIGN KEY ("disruption_event_id") REFERENCES "disruption_events" ("id")
);
```

#### 5. `payouts` Table
Tracks the financial transaction for each approved claim.

```sql
CREATE TABLE "payouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "claim_id" uuid UNIQUE NOT NULL,
  "worker_id" uuid NOT NULL,
  "amount" decimal(10, 2) NOT NULL,
  "status" varchar(50) NOT NULL DEFAULT 'pending', -- 'pending' -> 'processing' -> 'completed' -> 'failed'
  "razorpay_payout_id" varchar(255) UNIQUE,
  "processed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now()),

  FOREIGN KEY ("claim_id") REFERENCES "claims" ("id"),
  FOREIGN KEY ("worker_id") REFERENCES "workers" ("id")
);
```

---

## 4. API Design (REST)

All endpoints are served from the Backend service (`:4000`).

#### Worker Management
- **`POST /workers/register`**
  - **Description:** Onboards a new worker.
  - **Request Body:** `{ "fullName": "Ramesh Kumar", "phoneNumber": "9876543210", "city": "Delhi", "zone": "Connaught Place", "avgDailyEarning": 750 }`
  - **Response Body (201):** `{ "id": "uuid", "fullName": "Ramesh Kumar", ... }`
  - **Status Codes:** 201 (Created), 400 (Bad Request), 409 (Conflict - phone number exists)

- **`GET /workers/me`**
  - **Description:** Fetches the profile for the authenticated worker.
  - **Request Body:** None (Auth via JWT)
  - **Response Body (200):** `{ "id": "uuid", "fullName": "Ramesh Kumar", ... }`
  - **Status Codes:** 200 (OK), 401 (Unauthorized), 404 (Not Found)

#### Policy Management
- **`GET /policies/premium`**
  - **Description:** Gets a real-time weekly premium quote for a worker's zone.
  - **Query Params:** `?city=Delhi&zone=Connaught Place`
  - **Response Body (200):** `{ "weeklyPremium": 49.14, "coverageAmount": 800.00, "formula": { ... } }`
  - **Status Codes:** 200 (OK), 400 (Bad Request)

- **`POST /policies`**
  - **Description:** Creates a new weekly policy after successful payment.
  - **Request Body:** `{ "workerId": "uuid", "razorpayPaymentId": "pay_id_xyz", "premium": 49.14, "coverage": 800.00 }`
  - **Response Body (201):** `{ "id": "uuid", "status": "active", "startDate": "...", "endDate": "..." }`
  - **Status Codes:** 201 (Created), 400 (Bad Request)

#### Claim & Payout Management
- **`GET /claims`**
  - **Description:** Gets the claim history for the authenticated worker.
  - **Request Body:** None (Auth via JWT)
  - **Response Body (200):** `[{ "id": "uuid", "status": "paid", "payoutAmount": 240.00, "event": { ... } }, ...]`
  - **Status Codes:** 200 (OK), 401 (Unauthorized)

- **`POST /payouts/webhook`**
  - **Description:** Webhook endpoint for Razorpay to send updates on payout status.
  - **Request Body:** (Razorpay Payout Webhook Payload)
  - **Response Body (200):** `{ "status": "received" }`
  - **Status Codes:** 200 (OK)

#### Internal & Simulation
- **`POST /triggers/simulate`**
  - **Description:** Manually triggers a disruption event for testing and demos.
  - **Request Body:** `{ "triggerType": "heavy_rainfall", "city": "Mumbai", "zone": "Andheri West", "value": "20" }`
  - **Response Body (202):** `{ "message": "Disruption event simulation accepted.", "eventId": "uuid" }`
  - **Status Codes:** 202 (Accepted), 400 (Bad Request)

- **`GET /insurer/dashboard`**
  - **Description:** Retrieves aggregate stats for the insurer dashboard.
  - **Response Body (200):** `{ "totalPolicies": 1250, "totalPremiums": 62500, "totalPayouts": 41200, "lossRatio": 0.66, ... }`
  - **Status Codes:** 200 (OK)

---

## 5. The Trigger Monitor (`monitor.ts`)

The trigger monitor is the automated heart of the parametric engine, running as a persistent `node-cron` job inside the Backend service.

- **Schedule:** The job is configured to run every **30 minutes**.
- **Logic:**
  1.  **Fetch Active Zones:** The job first queries the `policies` table to get a unique list of all `(city, zone)` combinations with at least one active policy.
  2.  **Iterate and Poll:** For each unique zone, it makes parallel API calls to the relevant external data sources.
      - **Rainfall/Heat:** Calls OpenWeatherMap's One Call API using the zone's lat/long coordinates. It checks `current.rain.1h` (for rainfall) and `current.feels_like` (for heat).
      - **AQI:** Calls the AQICN API for the specified city and parses the response to find the station nearest to the zone's center, checking the `pm25` value.
      - **Flood/Curfew:** Checks internal mock endpoints or flags in the database that can be manually toggled for demos.
  3.  **Threshold Comparison:** The retrieved value is compared against the hardcoded threshold for that trigger type.
  4.  **Breach Detection & Claim Creation:**
      - If a threshold is breached, the monitor first checks if a similar `disruption_event` (same trigger type, same zone) has been created in the last 6 hours. This "anti-duplication window" prevents a single, sustained weather event from generating multiple claims.
      - If no recent event exists, it creates a new record in the `disruption_events` table.
      - It then triggers an asynchronous job that finds all workers with an `active` policy in the affected zone and creates a corresponding record for each in the `claims` table, with status set to `triggered`. The payout amount is calculated based on the event's `disruption_hours` and the worker's `avg_daily_earning`.

---

## 6. ML Service Architecture (`ml-service`)

The ML service is a lightweight Flask application that serves the scikit-learn models over a simple REST API.

-   **`premium.py` (`/predict/premium`):**
    -   **Request:** Receives a JSON object with zone and city information: `{ "zone": "Andheri West", "city": "Mumbai" }`.
    -   **Feature Extraction:** It may enrich this with historical data fetched from a local cache or a shared data store.
    -   **Prediction:** The pre-trained Linear Regression model (`premium_model.pkl`) is loaded. The input features are transformed (e.g., one-hot encoding for categorical features) and fed into the model.
    -   **Response:** The model's raw output (a risk score) is scaled to fit the `zone_multiplier` range (0.8-1.4) and returned as JSON: `{ "zone_multiplier": 1.35 }`.

-   **`fraud.py` (`/predict/fraud`):**
    -   **Request:** Receives a JSON object with features related to the specific claim event: `{ "claims_in_last_30_days": 3, "payout_amount": 480, ... }`.
    -   **Prediction:** The pre-trained Isolation Forest model (`fraud_model.pkl`) is loaded and scores the input vector.
    -   **Response:** The model's anomaly score (-1 for outlier, 1 for inlier) is converted to a simple fraud risk score and returned: `{ "fraud_score": 0.92 }` (where > 0.9 is high risk).

-   **Model Versioning:** Models are stored as versioned `.pkl` files (e.g., `premium_model_v1.2.pkl`). The service configuration specifies which model version to load, allowing for safe rollouts of new models.
-   **Communication:** The Node.js backend uses `axios` to make HTTP POST requests to the ML service. It includes a short timeout (e.g., 500ms). If the service is down or times out, the backend uses a default `zone_multiplier` of 1.1 to ensure the user experience is not degraded.

---

## 7. Security and Data Considerations

-   **PII Handling:** Worker Personally Identifiable Information (PII) such as `full_name` and `phone_number` is treated as sensitive. The database has strict access controls, and all API communication is over HTTPS. We will not log PII in application-level logs.
-   **API Key Management:** All external API keys (OpenWeatherMap, AQICN, Razorpay) are stored exclusively in environment variables (`.env` file) and are not checked into source control. The Docker setup injects these variables into the correct containers at runtime.
-   **Razorpay Integration:** For the hackathon, we will operate exclusively in the Razorpay **Sandbox environment**. This means all payment and payout transactions are simulated and no real money is moved. The logic will be built to be production-ready, with the only change required being the switch from sandbox to production API keys. All webhook endpoints will validate the Razorpay signature to prevent spoofed callbacks.
