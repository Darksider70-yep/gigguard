
# GigGuard Weekly Premium Model

---

## 1. Design Philosophy

The GigGuard premium model is engineered from the ground up to serve the unique financial realities of a gig-economy delivery worker. Our core philosophy rejects the traditional, rigid structures of insurance in favor of a flexible, transparent, and highly aligned approach.

**Why Weekly?**
Gig workers live in a world of weekly, not monthly, finance. They track weekly earnings, pay for weekly expenses (like fuel), and manage their cash flow over a seven-day cycle. A monthly premium is a large, daunting commitment. A small, weekly premium is a manageable operational expense, akin to topping up a fuel tank. This cadence provides unparalleled flexibility, allowing a worker to be covered during high-risk periods (like a monsoon-heavy week in Mumbai) and opt-out during calmer periods, directly controlling their expenses.

**Why Parametric Pricing?**
Our pricing is a direct reflection of risk, calculated dynamically. Instead of a flat rate, our AI-driven model assesses the objective risk of a worker's specific zone, the immediate weather forecast, and their personal history. This means a worker in a historically safe, dry zone pays less than one in a flood-prone area. This is not just fairer; it's more transparent. Workers can understand why their premium might be slightly higher one week—a cyclone is forecast—and trust that it will decrease when the risk subsides.

**Why Income Replacement?**
We don't offer abstract, fixed-sum payouts. Our coverage is explicitly designed for **income loss replacement**. The payout is calculated based on the worker's own stated average daily earnings and the duration of the disruption. This makes the product tangible and easy to understand: if an event stops you from working for half a day, we replace the income you would have lost. This direct link between the premium paid and the real-world financial protection offered is the cornerstone of our product's value proposition.

---

## 2. The Formula

The weekly premium is calculated using a multi-factor formula that balances a baseline cost with dynamic, risk-adjusted multipliers.

### `weekly_premium = base_rate × zone_multiplier × weather_multiplier × history_multiplier`

---

#### `base_rate`
- **Value:** ₹35 (fixed)
- **Description:** This is the foundational cost of the policy. It was derived through a top-down analysis to cover the minimum operational expenses of the platform (API costs, server hosting, transaction fees) and a break-even level of risk for the most secure zones. It represents the absolute minimum price for a weekly policy under the most ideal conditions.

#### `zone_multiplier`
- **Range:** 0.8 – 1.4
- **Description:** This is the most critical AI-driven component, representing the long-term, geographically-specific risk of a worker's operational zone.
- **How it Works:** Zones are defined sub-regions within a city (e.g., 'Andheri West' in Mumbai). Our linear regression model is trained on years of historical weather and disruption data to assign a risk score to each zone based on the frequency and severity of past trigger events. A flood-prone coastal zone will have a multiplier near 1.4, while a dry, inland zone may have a multiplier below 1.0. This ensures that the premium is geographically precise.

#### `weather_multiplier`
- **Range:** 0.9 – 1.3
- **Description:** This multiplier introduces a short-term, forward-looking adjustment to the premium based on the 7-day forecast.
- **How it Works:** Before quoting a premium, our system fetches the 7-day weather and AQI forecast for the worker's city from the OpenWeatherMap API. The system looks for predicted patterns that correlate with our triggers (e.g., multiple days of >10mm rain, a predicted heatwave). The presence of such patterns will elevate the multiplier for that specific week, capturing the imminent, heightened risk. A clear, calm forecast would result in a multiplier of 1.0 or less.

#### `history_multiplier`
- **Range:** 0.85 – 1.25
- **Description:** This multiplier personalizes the premium based on the worker's individual claims history, creating a system of rewards and accountability.
- **How it Works:**
    - **New Workers:** Start with a neutral multiplier of `1.0`.
    - **Rewards:** For every 3 consecutive months without a claim, the multiplier is reduced by 0.05, down to a minimum of `0.85` (a 15% discount). This rewards long-term, low-claim customers.
    - **Penalties:** A high frequency of claims (e.g., >3 claims in a month) can temporarily increase the multiplier up to a maximum of `1.25`. This helps mitigate moral hazard and ensures that high-risk individuals contribute proportionally to the pool.

---

## 3. Coverage Amount Calculation

Our payout is not a fixed amount; it's a direct replacement for estimated lost income.

### `coverage_amount = avg_daily_earning × (disruption_hours / 8) × 0.8`

- **`avg_daily_earning`:** The worker's self-declared average daily earning, captured during onboarding.
- **`disruption_hours`:** A pre-defined number of hours associated with each trigger type, representing the typical duration of work stoppage (e.g., 4 hours for Extreme Heat, 8 hours for a full-day Curfew).
- **Why 80% Replacement?** We replace 80% of the lost income, not 100%. This is a standard insurance practice that creates a "co-participation" in the loss. It helps reduce moral hazard (the temptation to not work even if one could) and keeps premiums more affordable for everyone.
- **Weekly Cap:** There is a hard cap on total weekly payouts of **₹800 per worker**. This is a crucial risk management control that prevents catastrophic losses for the platform during widespread, multi-day events (like a week-long flood) and makes the overall financial model sustainable.

---

## 4. Worked Examples

Here we use the three personas from the README to demonstrate the end-to-end calculation.

#### **Persona 1: Ramesh Kumar (Delhi)**
- **Inputs:**
    - Average Daily Earning: ₹750
    - Zone: Connaught Place (High AQI Risk) -> `zone_multiplier` = 1.3
    - Forecast: Impending heatwave -> `weather_multiplier` = 1.2
    - History: Good record -> `history_multiplier` = 0.9
- **Premium Calculation:**
    - `₹35 (base) × 1.3 (zone) × 1.2 (weather) × 0.9 (history) = ₹49.14`
    - **Final Weekly Premium:** **₹49**
- **Coverage Example (Extreme Heat Trigger):**
    - `disruption_hours` = 4
    - Payout = `₹750 * (4 / 8) * 0.8 = ₹300`
- **Income Protection Ratio:**
    - Weekly Earning (approx): `₹750 * 6 = ₹4500`
    - Max Coverage / Weekly Earning: `₹800 / ₹4500 ≈ 17.8%`

#### **Persona 2: Sameer Shaikh (Mumbai)**
- **Inputs:**
    - Average Daily Earning: ₹600
    - Zone: Andheri (High Flood Risk) -> `zone_multiplier` = 1.4
    - Forecast: Active monsoon week -> `weather_multiplier` = 1.3
    - History: New worker -> `history_multiplier` = 1.0
- **Premium Calculation:**
    - `₹35 (base) × 1.4 (zone) × 1.3 (weather) × 1.0 (history) = ₹63.7`
    - **Final Weekly Premium:** **₹64**
- **Coverage Example (Heavy Rainfall Trigger):**
    - `disruption_hours` = 4
    - Payout = `₹600 * (4 / 8) * 0.8 = ₹240`
- **Income Protection Ratio:**
    - Weekly Earning (approx): `₹600 * 6 = ₹3600`
    - Max Coverage / Weekly Earning: `₹800 / ₹3600 ≈ 22.2%`

#### **Persona 3: Priya Murthy (Chennai)**
- **Inputs:**
    - Average Daily Earning: ₹900
    - Zone: T. Nagar (Medium Heat Risk) -> `zone_multiplier` = 1.1
    - Forecast: Clear, calm week -> `weather_multiplier` = 1.0
    - History: Excellent record -> `history_multiplier` = 0.85
- **Premium Calculation:**
    - `₹35 (base) × 1.1 (zone) × 1.0 (weather) × 0.85 (history) = ₹32.72`
    - **Final Weekly Premium:** **₹33**
- **Coverage Example (Extreme Heat Trigger):**
    - `disruption_hours` = 4
    - Payout = `₹900 * (4 / 8) * 0.8 = ₹360`
- **Income Protection Ratio:**
    - Weekly Earning (approx): `₹900 * 6 = ₹5400`
    - Max Coverage / Weekly Earning: `₹800 / ₹5400 ≈ 14.8%`

---

## 5. Premium Range Table

This table illustrates the expected premium ranges based on city and zone risk tiers, assuming neutral weather and history multipliers.

| City      | Zone Type        | Base Risk | `zone_mult` (Est.) | `weather_mult` (Avg.) | Weekly Premium Range | Weekly Coverage Cap |
|-----------|------------------|-----------|------------------|---------------------|----------------------|---------------------|
| Mumbai    | Flood Prone      | High      | 1.3 - 1.4        | 1.1                 | ₹50 - ₹58            | ₹800                |
| Mumbai    | Inland           | Medium    | 1.1 - 1.2        | 1.1                 | ₹42 - ₹46            | ₹800                |
| Delhi     | High AQI Zone    | High      | 1.25 - 1.35      | 1.1                 | ₹48 - ₹52            | ₹800                |
| Delhi     | Outer Green Zone | Low       | 0.9 - 1.0        | 1.1                 | ₹35 - ₹38            | ₹800                |
| Chennai   | Coastal/Heat Prone| Medium    | 1.1 - 1.2        | 1.05                | ₹40 - ₹44            | ₹800                |
| Chennai   | Inland           | Low-Med   | 1.0 - 1.1        | 1.05                | ₹37 - ₹40            | ₹800                |
| Bangalore | Low-Lying Area   | Medium    | 1.1 - 1.2        | 1.0                 | ₹38 - ₹42            | ₹800                |
| Bangalore | Elevated Area    | Low       | 0.9 - 1.0        | 1.0                 | ₹32 - ₹35            | ₹800                |
| Hyderabad | Old City         | Medium    | 1.0 - 1.15       | 1.0                 | ₹35 - ₹40            | ₹800                |
| Hyderabad | HITEC City       | Low       | 0.85 - 0.95      | 1.0                 | ₹30 - ₹33            | ₹800                |

---

## 6. Business Viability

-   **Target Loss Ratio: 65%**
    Our goal is to maintain a healthy loss ratio, where for every ₹100 collected in premiums, a maximum of ₹65 is paid out in claims. The remaining 35% is allocated to cover operational costs, transaction fees, and a sustainable profit margin. The dynamic multipliers are the primary tool for maintaining this ratio.

-   **Break-Even Analysis (Simplified):**
    Assuming an average premium of ₹45/week and fixed monthly costs of ₹50,000 (servers, APIs, salaries), the break-even volume is:
    -   `Weekly Revenue Needed = 50000 / 4 = ₹12,500`
    -   `Policies Needed = 12500 / 45 ≈ 278 active policies`
    This suggests that the model can achieve operational break-even at a relatively small scale, demonstrating its capital efficiency.

-   **Scenario Modelling: Mumbai Monsoon Week**
    -   **Assumptions:** 500 active policies in Mumbai. A severe rainfall event triggers claims for 40% of the user base.
    -   `Number of Claims = 500 * 0.40 = 200`
    -   `Average Payout = ₹240` (from Sameer's example)
    -   `Total Payout = 200 * 240 = ₹48,000`
    -   `Total Premiums for the week (avg. ₹60) = 500 * 60 = ₹30,000`
    -   **Resulting Loss Ratio:** `48000 / 30000 = 160%`
    This scenario highlights that the platform will be unprofitable during peak disaster weeks. This is expected and acceptable. The model is designed to be profitable during the many low-claim weeks, building a surplus that allows it to absorb the losses during these high-payout periods, ultimately balancing out to the target 65% loss ratio over an annual cycle.

---

## 7. ML Model Details

-   **Model:** `scikit-learn` Linear Regression
-   **Evaluation Metric:** Mean Absolute Error (MAE) with a target of `< ₹3.00`. We want the model's contribution to the final premium to be off by no more than a few rupees from the ideal risk price.
-   **Feature Set for `zone_multiplier` prediction:**
    | Feature Name                         | Data Type | Source                                  | Example                               |
    |--------------------------------------|-----------|-----------------------------------------|---------------------------------------|
    | `zone_id`                            | Categorical| Internal Definition                     | `MUM-AND-W`                           |
    | `city`                               | Categorical| Internal Definition                     | `Mumbai`                              |
    | `historical_rain_days_per_year`      | Numeric   | Weather API (historical data)           | `45`                                  |
    | `historical_aqi_gt300_days_per_year` | Numeric   | AQI API (historical data)               | `25`                                  |
    | `historical_heat_gt44_days_per_year` | Numeric   | Weather API (historical data)           | `10`                                  |
    | `is_coastal`                         | Boolean   | Internal Definition                     | `true`                                |
    | `avg_elevation_meters`               | Numeric   | Topographical Data                      | `14`                                  |

-   **Training Data Generation:** A synthetic dataset of 10,000+ entries will be created. We will define ~50-100 zones across the 5 cities and use historical API data to populate the features. The "target variable" (the true risk score) will be a hand-crafted value based on known realities (e.g., giving Mumbai monsoon zones a high score).
-   **Retraining Schedule:** The model is scheduled for retraining every week. A automated pipeline will run that pulls the latest claims data, appends it to the training set (weighting recent data more heavily), and re-runs the regression. If the new model's MAE is better than the current production model, it is automatically promoted and deployed.
