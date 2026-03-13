
# GigGuard Parametric Trigger Definitions

---

## 1. Introduction

Parametric triggers are the core of the GigGuard platform. Unlike traditional insurance which requires a policyholder to file a claim and prove a loss, parametric insurance relies on objective, independently verifiable data points—or "parameters"—to trigger a claim automatically.

This approach is uniquely suited for gig workers. When a heavy downpour starts, a worker's immediate problem is lost income, not filling out a form. They need a system that detects the disruption and pays out without any action required from them. GigGuard's trigger engine continuously monitors real-world data sources (weather APIs, pollution indexes) against pre-defined thresholds. When a threshold is breached in a specific geographic zone, the system assumes that all active policyholders in that zone have had their ability to work disrupted and automatically initiates a payout. This model eliminates ambiguity, disputes, and administrative overhead, enabling a truly zero-touch and instant claims experience.

---

## 2. Trigger Engine Overview

The trigger engine is a cron job that runs within our Node.js backend service. It is responsible for polling, evaluating, and acting on potential disruption events.

-   **Polling Schedule:** The engine runs **every 30 minutes**. This frequency provides a good balance between real-time responsiveness and respecting the rate limits of our external API providers.
-   **Evaluation Logic:** For each operational zone with active policies, the engine polls the relevant data sources. It compares the returned value (e.g., rainfall in mm/hr) against the specific trigger's threshold.
-   **Disruption Event Record:** If a threshold is breached, the engine creates a single `disruption_events` record in the database. This record captures the trigger type, the zone, the time of the event, and the data value that caused the breach.
-   **Anti-Duplication Window:** To prevent a single, long-lasting event (like a 4-hour rainstorm) from generating multiple claims, the engine uses a **6-hour anti-duplication window**. Before creating a new `disruption_events` record, it checks if another event of the *same type* in the *same zone* has occurred in the last 6 hours. If so, it assumes it's part of the same event and does nothing.
-   **Affected Worker Identification:** Once a new `disruption_event` is logged, a separate asynchronous process is kicked off. This process queries the database for all workers who have an `active` policy and whose registered `zone` matches the event's zone. For each of these workers, it automatically creates a `claims` record, linking the worker to the event.

---

## 3. Individual Trigger Specifications

### Trigger: Heavy Rainfall

-   **Type Key:** `heavy_rainfall`
-   **Data Source:** OpenWeatherMap One Call API 3.0 (Free Tier: 1,000 calls/day)
-   **Polling Frequency:** Every 30 minutes per active zone.
-   **Threshold:** `current.rain.1h` > 15 mm/hr.
-   **Threshold Justification:** 15 mm/hr is classified as "heavy rain" by meteorological standards. At this intensity, visibility for motorcycle riders is severely impaired and roads begin to flood, making delivery work extremely dangerous and impractical.
-   **Disruption Hours Formula:** Fixed at `4 hours`. This represents the typical duration of a severe downpour plus the time for water to recede enough for safe travel.
-   **Max Weekly Payout at this Trigger:** For a worker earning ₹800/day: `(800 / 8) * 4 * 0.8 = ₹320`.
-   **Sample API Response (`current.rain` object):**
    ```json
    {
      "rain": {
        "1h": 16.5
      }
    }
    ```
-   **Parsing Logic (Pseudocode):**
    ```
    response = call_openweathermap_api(zone.lat, zone.lon)
    if response.current.rain and response.current.rain['1h'] > 15:
      create_disruption_event('heavy_rainfall', zone, response.current.rain['1h'])
    ```
-   **Edge Cases:**
    -   *API Down:* If the API call fails, the error is logged, and the check for that zone is skipped until the next cycle. No event is created.
    -   *Value is Null/Missing:* If the `rain` object or `1h` key is not present, it is treated as 0mm rainfall.
-   **Real-World Scenario:** A sudden, intense monsoon shower hits Andheri, Mumbai on a Tuesday evening. The GigGuard engine detects the rainfall intensity at 7:30 PM. Sameer, a policyholder in that zone, receives an automated payout notification by 8:00 PM, compensating him for the lost peak dinner-time hours.

### Trigger: Severe AQI

-   **Type Key:** `severe_aqi`
-   **Data Source:** AQICN API (Free Tier: up to 1000 calls/min)
-   **Polling Frequency:** Every 30 minutes per active city.
-   **Threshold:** `iaqi.pm25.v` > 300 AQI.
-   **Threshold Justification:** An AQI over 300 is classified as "Hazardous" or "Severe," with health warnings of emergency conditions. It is physically dangerous to engage in strenuous outdoor activity, and many people experience significant respiratory distress.
-   **Disruption Hours Formula:** Fixed at `5 hours`. This covers the peak afternoon/evening period when traffic and pollution are often at their worst.
-   **Max Weekly Payout at this Trigger:** For a worker earning ₹750/day: `(750 / 8) * 5 * 0.8 = ₹375`.
-   **Sample API Response (Data object):**
    ```json
    {
      "status": "ok",
      "data": {
        "aqi": 321,
        "city": { "name": "Delhi" },
        "iaqi": {
          "pm25": { "v": 321 }
        }
      }
    }
    ```
-   **Parsing Logic (Pseudocode):**
    ```
    response = call_aqicn_api(city)
    if response.data.iaqi.pm25.v > 300:
      // AQI is city-wide, create event for all active zones in the city
      for zone in active_zones(city):
        create_disruption_event('severe_aqi', zone, response.data.iaqi.pm25.v)
    ```
-   **Edge Cases:**
    -   *API Down/Error:* Log error, skip check for the city in this cycle.
    -   *No PM2.5 Data:* If the `pm25` object is missing, the check fails for that cycle.
-   **Real-World Scenario:** During a winter afternoon in Delhi, post-Diwali smog pushes the AQI to 350. Ramesh, who works around Connaught Place, finds it difficult to breathe. GigGuard detects the city-wide AQI breach and triggers a payout, allowing him to stay indoors without losing a full day's income.

### Trigger: Extreme Heat

-   **Type Key:** `extreme_heat`
-   **Data Source:** OpenWeatherMap One Call API 3.0
-   **Polling Frequency:** Every 30 minutes per active zone.
-   **Threshold:** `current.feels_like` > 44.0°C.
-   **Threshold Justification:** A "feels like" temperature of 44°C (111°F) poses a significant risk of heat exhaustion and heatstroke for individuals engaged in physical labor while wearing helmets and jackets. This is a direct safety and health risk.
-   **Disruption Hours Formula:** Fixed at `4 hours`, typically covering the peak heat hours from 1 PM to 5 PM.
-   **Max Weekly Payout at this Trigger:** For a worker earning ₹900/day: `(900 / 8) * 4 * 0.8 = ₹360`.
-   **Sample API Response (`current` object):**
    ```json
    {
      "current": {
        "temp": 38.5,
        "feels_like": 44.2
      }
    }
    ```
-   **Parsing Logic (Pseudocode):**
    ```
    response = call_openweathermap_api(zone.lat, zone.lon)
    if response.current.feels_like > 44.0:
      create_disruption_event('extreme_heat', zone, response.current.feels_like)
    ```
-   **Edge Cases:**
    -   *API Down:* Log error, skip check for this cycle.
    -   *`feels_like` missing:* Fallback to checking `temp`. If `temp` is also missing, fail the check.
-   **Real-World Scenario:** In Chennai, the afternoon heat and humidity combine to create a "feels like" temperature of 45°C. Priya knows it's unsafe to ride. GigGuard detects this and issues a payout, compensating her for the lost lunch-to-evening shift hours.

### Trigger: Flood / Red Alert

-   **Type Key:** `flood_alert`
-   **Data Source:** Internal flag / Mock RSS feed from IMD. For the hackathon, this is a manually controlled flag per-zone.
-   **Polling Frequency:** Every 30 minutes.
-   **Threshold:** `is_alert_active` == `true`.
-   **Threshold Justification:** A formal red alert or flood warning from a government body like the IMD (India Meteorological Department) indicates a severe, widespread event where travel is officially discouraged or impossible.
-   **Disruption Hours Formula:** Fixed at `8 hours`. A flood alert effectively shuts down mobility for an entire day.
-   **Max Weekly Payout at this Trigger:** For a worker earning ₹600/day: `(600 / 8) * 8 * 0.8 = ₹480`.
-   **Sample API Response (Mock Endpoint):**
    ```json
    {
      "zone": "MUM-AND-W",
      "is_alert_active": true,
      "source": "IMD Red Alert"
    }
    ```
-   **Parsing Logic (Pseudocode):**
    ```
    response = call_mock_alert_api(zone)
    if response.is_alert_active:
      create_disruption_event('flood_alert', zone, 'Alert Active')
    ```
-   **Edge Cases:** Mock service being down is the main risk; handled by logging and skipping.
-   **Real-World Scenario:** After days of incessant rain, authorities declare a flood red alert for low-lying areas in Mumbai. We toggle the `is_alert_active` flag for Andheri. The system detects this and triggers a full-day income replacement payout for all policyholders in that zone.

### Trigger: Curfew / Local Strike

-   **Type Key:** `curfew_strike`
-   **Data Source:** Mock webhook endpoint. In a real-world scenario, this would be fed by news APIs or manual confirmation.
-   **Polling Frequency:** Event-driven (via webhook) or polled every 30 minutes.
-   **Threshold:** A valid, authenticated webhook payload is received indicating an active event.
-   **Threshold Justification:** A government-mandated curfew or a major transport strike makes delivery work impossible.
-   **Disruption Hours Formula:** Fixed at `8 hours`. These events typically disrupt a full working day.
-   **Max Weekly Payout at this Trigger:** For a worker earning ₹750/day: `(750 / 8) * 8 * 0.8 = ₹600`.
-   **Sample API Response (Mock Webhook):**
    ```json
    {
      "eventType": "curfew_active",
      "city": "Delhi",
      "zones": ["Connaught Place", "Karol Bagh"],
      "source": "Verified News Report"
    }
    ```
-   **Parsing Logic (Pseudocode):**
    ```
    // on receiving webhook
    if is_payload_valid(payload):
      for zone in payload.zones:
        create_disruption_event('curfew_strike', zone, 'Event Active')
    ```
-   **Edge Cases:** Validating the source of the webhook is critical to prevent malicious triggers. This is done via a pre-shared secret or HMAC signature.
-   **Real-World Scenario:** A city-wide strike is called in Delhi. We push a signed payload to our webhook endpoint. The engine receives it and creates claims for all policyholders in the affected zones.

---

## 4. Trigger Combinations

It's possible for multiple triggers to be active simultaneously (e.g., Heavy Rainfall and a Flood Alert).

-   **Policy:** We maintain a rule of **one claim per worker per day**. A worker cannot receive multiple payouts for the same day, even if multiple triggers fire.
-   **Payout Logic:** When multiple `disruption_events` are active for a worker's zone on the same day, the system calculates the potential payout for each. It then **honors the single trigger that results in the highest `payout_amount`**.
-   **Database Handling:** A single `claims` record is created. The `payout_amount` is set to the maximum calculated value. The `disruption_event_id` might link to the primary event (the one with the highest payout), and a `notes` field or a separate `JSONB` column can be used to record the other trigger types that were also active.

---

## 5. Fraud Guard Per Trigger

-   **Heavy Rain / Extreme Heat:**
    -   **Vector:** GPS spoofing. A worker might use an app to fake their location to appear inside a disruption zone and get a claim while they are actually in a different, unaffected area.
    -   **Defense:** We perform a **post-trigger location check**. When the claim is created, we query the worker's last known location from our own application logs (assuming they've used our app recently). If their last ping was more than a few kilometers outside the disruption zone around the time of the event, the claim is flagged for review.

-   **Severe AQI:**
    -   **Vector:** Zone boundary gaming. A worker lives in a clean suburb but registers their primary "zone" as a perpetually high-AQI industrial area to maximize their chances of getting a claim.
    -   **Defense:** Our **Isolation Forest ML model** is key here. A worker consistently getting claims at a much higher frequency than the average for their registered zone will be flagged as an anomaly. We can then prompt them to verify their primary work area.

-   **Flood Alert / Curfew:**
    -   **Vector:** Alert abuse. A flood is declared, but the worker's specific area is still navigable, and they continue to work while also receiving a payout.
    -   **Defense:** This is the hardest to defend against automatically. Our primary defense is the **History Multiplier**. Workers who consistently claim every possible event will see their premiums rise significantly, making the product less attractive. In the long run, we can integrate with platform APIs (like Swiggy/Zomato) to verify if a worker completed any deliveries during the disruption window.

---

## 6. Mock API Setup for Development

To enable development without relying on live external APIs, the entire trigger engine can be switched to mock mode.

-   **Environment Flag:** Set `USE_MOCK_APIS=true` in the `.env` file of the backend service.
-   **OpenWeatherMap & AQICN:** When the flag is true, the API clients will be pointed to mock servers or will return hardcoded JSON responses instead of making external calls. Developers can edit these mock files to simulate various scenarios.
    -   **URL:** `http://localhost:4000/mock/weather` and `http://localhost:4000/mock/aqi`
    -   **Sample Mock (`/mock/weather`):**
        ```json
        {
          "current": {
            "dt": 1678886400,
            "temp": 28.5,
            "feels_like": 32.1,
            "rain": {
              "1h": 17.2
            }
          }
        }
        ```
-   **API Keys:** In mock mode, the actual API keys for OpenWeatherMap and AQICN are not required.

---

## 7. Testing Triggers

Triggers can be tested manually using the backend's simulation endpoint. This is crucial for demos and end-to-end testing.

-   **Endpoint:** `POST /triggers/simulate`
-   **Request Body:**
    ```json
    {
      "triggerType": "heavy_rainfall",
      "city": "Mumbai",
      "zone": "Andheri West",
      "value": "25" 
    }
    ```
    -   `triggerType` must be one of the defined keys (`heavy_rainfall`, `severe_aqi`, etc.).
    -   `value` is the string representation of the disruptive value.
-   **Expected Database State:**
    1.  A new row is created in the `disruption_events` table with the specified details.
    2.  The system finds all active policies in `Mumbai` / `Andheri West`.
    3.  For each policy, a new row is created in the `claims` table with `status = 'triggered'`.
-   **Expected Claim Status Flow:**
    -   After simulation, the claim status is `triggered`.
    -   A background job immediately picks it up, runs validations (like the mock GPS check), and moves it to `validating`.
    -   It then calls the fraud model. If the score is low, the status moves to `approved`.
    -   Another job then creates a `payouts` record and marks the claim as `paid`.
-   **Resetting State:** To reset between demos, you can run a SQL script to `TRUNCATE` the `claims`, `payouts`, and `disruption_events` tables.
