import { config } from '../config';

export interface PremiumResponse {
  premium: number;
  formula_breakdown: {
    base_rate: number;
    zone_multiplier: number;
    weather_multiplier: number;
    history_multiplier: number;
    raw_premium: number;
  };
  rl_premium: number | null;
  shadow_logged: boolean;
}

export interface FraudResponse {
  fraud_score: number;
  gnn_fraud_score: number | null;
  graph_flags: string[];
  tier: 1 | 2 | 3;
  flagged: boolean;
  scorer: string;
}

export interface BanditRecommendation {
  recommended_arm: number;
  recommended_premium: number;
  recommended_coverage: number;
  context_key: string;
  exploration: boolean;
}

class MLService {
  private baseUrl: string;
  private timeout: number;

  constructor() {
    this.baseUrl = config.ML_SERVICE_URL;
    this.timeout = config.ML_SERVICE_TIMEOUT_MS;
  }

  private async post<T>(path: string, body: object): Promise<T | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        throw new Error(`ML service ${path} returned ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      console.warn(`ML service call failed: ${path}`, err);
      return null;
    }
  }

  private async get<T>(path: string): Promise<T | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      const res = await fetch(`${this.baseUrl}${path}`, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        throw new Error(`ML service GET ${path} returned ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      console.warn(`ML service GET failed: ${path}`, err);
      return null;
    }
  }

  async predictPremium(
    workerId: string,
    zoneMultiplier: number,
    weatherMultiplier: number,
    historyMultiplier: number
  ): Promise<PremiumResponse> {
    const result = await this.post<PremiumResponse>('/predict-premium', {
      worker_id: workerId,
      zone_multiplier: zoneMultiplier,
      weather_multiplier: weatherMultiplier,
      history_multiplier: historyMultiplier,
    });

    if (!result) {
      const raw = 35 * zoneMultiplier * weatherMultiplier * historyMultiplier;
      return {
        premium: Math.round(raw),
        formula_breakdown: {
          base_rate: 35,
          zone_multiplier: zoneMultiplier,
          weather_multiplier: weatherMultiplier,
          history_multiplier: historyMultiplier,
          raw_premium: raw,
        },
        rl_premium: null,
        shadow_logged: false,
      };
    }

    return result;
  }

  async scoreFraud(params: {
    claim_id: string;
    worker_id: string;
    payout_amount: number;
    claim_freq_30d: number;
    hours_since_trigger: number;
    zone_multiplier: number;
    platform: string;
    account_age_days: number;
  }): Promise<FraudResponse> {
    const result = await this.post<FraudResponse>('/score-fraud', params);
    if (!result) {
      return {
        fraud_score: 0.0,
        gnn_fraud_score: null,
        graph_flags: [],
        tier: 1,
        flagged: false,
        scorer: 'fallback_default',
      };
    }
    return result;
  }

  async recommendTier(
    workerId: string,
    context: {
      platform: string;
      city: string;
      experience_tier: string;
      season: string;
      zone_risk: string;
    }
  ): Promise<BanditRecommendation | null> {
    return this.post<BanditRecommendation>('/recommend-tier', {
      worker_id: workerId,
      context,
    });
  }

  updateBandit(
    workerId: string,
    contextKey: string,
    arm: number,
    reward: number
  ): Promise<boolean> {
    return this.post<{ success: boolean }>('/bandit-update', {
      worker_id: workerId,
      context_key: contextKey,
      arm,
      reward,
    })
      .then((result) => Boolean(result?.success))
      .catch(() => false);
  }

  async getShadowComparison(): Promise<Record<string, unknown> | null> {
    return this.get<Record<string, unknown>>('/shadow-comparison');
  }
}

export const mlService = new MLService();

// Backward-compatible helpers.
export async function predictPremium(params: {
  worker_id: string;
  zone_multiplier: number;
  weather_multiplier: number;
  history_multiplier: number;
}): Promise<PremiumResponse> {
  return mlService.predictPremium(
    params.worker_id,
    params.zone_multiplier,
    params.weather_multiplier,
    params.history_multiplier
  );
}

export async function scoreFraud(params: {
  claim_id: string;
  worker_id: string;
  payout_amount: number;
  claim_freq_30d: number;
  hours_since_trigger: number;
  zone_multiplier: number;
  platform: string;
  account_age_days: number;
}): Promise<FraudResponse> {
  return mlService.scoreFraud(params);
}

export async function recommendTier(params: {
  worker_id: string;
  context: {
    platform: string;
    city: string;
    experience_tier: string;
    season: string;
    zone_risk: string;
  };
}): Promise<BanditRecommendation | null> {
  return mlService.recommendTier(params.worker_id, params.context);
}

export function banditUpdate(
  workerId: string,
  contextKey: string,
  arm: number,
  reward: number
): Promise<boolean> {
  return mlService.updateBandit(workerId, contextKey, arm, reward);
}

export async function getShadowComparison(): Promise<Record<string, unknown> | null> {
  return mlService.getShadowComparison();
}
