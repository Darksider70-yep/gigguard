import { config } from '../config';

export type Season = 'monsoon' | 'summer' | 'winter' | 'other';
export type ZoneRisk = 'low' | 'medium' | 'high';
export type ExperienceTier = 'new' | 'mid' | 'veteran';

export interface PremiumPredictionInput {
  worker_id: string;
  zone_multiplier: number;
  weather_multiplier: number;
  history_multiplier: number;
}

export interface PremiumPredictionResult {
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

export interface FraudScoreInput {
  claim_id: string;
  worker_id: string;
  payout_amount: number;
  claim_freq_30d: number;
  hours_since_trigger: number;
  zone_multiplier: number;
  platform: string;
  account_age_days: number;
}

export interface FraudScoreResult {
  fraud_score: number;
  gnn_fraud_score: number | null;
  graph_flags: string[];
  tier: number;
  flagged: boolean;
  scorer: string;
}

export interface RecommendTierInput {
  worker_id: string;
  context: {
    platform: 'zomato' | 'swiggy';
    city: string;
    experience_tier: ExperienceTier;
    season: Season;
    zone_risk: ZoneRisk;
  };
}

export interface RecommendTierResult {
  recommended_arm: number;
  recommended_premium: number;
  recommended_coverage: number;
  context_key: string;
  exploration: boolean;
}

export interface ShadowComparisonResult {
  total_logged: number;
  mean_formula_premium: number;
  mean_rl_premium: number;
  rl_lower_count: number;
  rl_higher_count: number;
  avg_delta: number;
}

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.mlTimeoutMs);

  try {
    const response = await fetch(`${config.mlServiceUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(`ML service ${path} failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new TimeoutError(`ML service ${path} timed out after ${config.mlTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function fallbackPremium(input: PremiumPredictionInput): PremiumPredictionResult {
  const zoneMultiplier = Number.isFinite(input.zone_multiplier) ? input.zone_multiplier : 1.1;
  const weatherMultiplier = Number.isFinite(input.weather_multiplier) ? input.weather_multiplier : 1.0;
  const historyMultiplier = Number.isFinite(input.history_multiplier) ? input.history_multiplier : 1.0;
  const rawPremium = 35 * zoneMultiplier * weatherMultiplier * historyMultiplier;

  return {
    premium: Number(rawPremium.toFixed(2)),
    formula_breakdown: {
      base_rate: 35,
      zone_multiplier: zoneMultiplier,
      weather_multiplier: weatherMultiplier,
      history_multiplier: historyMultiplier,
      raw_premium: rawPremium,
    },
    rl_premium: null,
    shadow_logged: false,
  };
}

export async function predictPremium(input: PremiumPredictionInput): Promise<PremiumPredictionResult> {
  try {
    return await request<PremiumPredictionResult>('/predict-premium', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  } catch {
    return fallbackPremium({
      ...input,
      zone_multiplier: 1.1,
      weather_multiplier: input.weather_multiplier,
      history_multiplier: input.history_multiplier,
    });
  }
}

export async function scoreFraud(input: FraudScoreInput): Promise<FraudScoreResult> {
  try {
    return await request<FraudScoreResult>('/score-fraud', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  } catch {
    return {
      fraud_score: 0,
      gnn_fraud_score: null,
      graph_flags: [],
      tier: 1,
      flagged: false,
      scorer: 'fallback',
    };
  }
}

export async function recommendTier(input: RecommendTierInput): Promise<RecommendTierResult> {
  try {
    return await request<RecommendTierResult>('/recommend-tier', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  } catch {
    return {
      recommended_arm: 1,
      recommended_premium: 44,
      recommended_coverage: 440,
      context_key: `${input.context.platform}_${input.context.city}_${input.context.experience_tier}_${input.context.season}_${input.context.zone_risk}`,
      exploration: false,
    };
  }
}

export async function banditUpdate(workerId: string, contextKey: string, arm: number, reward: number): Promise<void> {
  try {
    await request<{ success: boolean }>('/bandit-update', {
      method: 'POST',
      body: JSON.stringify({
        worker_id: workerId,
        context_key: contextKey,
        arm,
        reward,
      }),
    });
  } catch {
    // Fire-and-forget path intentionally swallows errors.
  }
}

export async function getShadowComparison(): Promise<ShadowComparisonResult> {
  try {
    return await request<ShadowComparisonResult>('/shadow-comparison', {
      method: 'GET',
    });
  } catch {
    return {
      total_logged: 0,
      mean_formula_premium: 0,
      mean_rl_premium: 0,
      rl_lower_count: 0,
      rl_higher_count: 0,
      avg_delta: 0,
    };
  }
}
