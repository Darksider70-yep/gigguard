/**
 * GigGuard Graceful Degradation Defaults
 *
 * When external services are unavailable, the platform falls back to
 * these safe values. Workers are never denied a payout due to an
 * infrastructure outage.
 *
 * Dependency        | Fallback behaviour                   | Impact
 * ------------------|--------------------------------------|-------------------------
 * OpenWeatherMap    | weather_multiplier = 1.0             | Neutral pricing
 * AQICN             | Skip AQI trigger check this cycle    | Missed trigger possible
 * ML Service        | fraud_score = 0.0 (auto-approve)     | Slightly higher fraud risk
 * ML Service        | premium = formula only, no RL        | No shadow logging
 * ML Service        | bandit = arm 1 (INR 44 default)      | No personalisation
 * Redis/BullMQ      | Synchronous claim processing          | Slower but correct
 * Razorpay          | Payout queued, retried on reconnect  | Delayed payout
 */

export const GRACEFUL_DEFAULTS = {
  WEATHER_MULTIPLIER: 1.0,
  FRAUD_SCORE: 0.0,
  FRAUD_TIER: 1,
  BANDIT_ARM: 1,
  BANDIT_PREMIUM: 44,
  ZONE_MULTIPLIER: 1.1,
  HISTORY_MULTIPLIER: 1.0,
  ML_TIMEOUT_MS: 500,
  OWM_TIMEOUT_MS: 3000,
  AQICN_TIMEOUT_MS: 3000,
  RAZORPAY_TIMEOUT_MS: 10000,
} as const;

export function formulaPremium(
  zone_multiplier: number,
  weather_multiplier: number,
  history_multiplier: number
): number {
  return Math.round(35 * zone_multiplier * weather_multiplier * history_multiplier);
}
