export interface WorkerProfile {
  id: string;
  name: string;
  platform: 'zomato' | 'swiggy';
  city: string;
  zone: string | null;
  home_hex_id?: string | null;
  avg_daily_earning: number;
  zone_multiplier: number;
  history_multiplier: number;
  experience_tier?: 'new' | 'mid' | 'veteran' | null;
  upi_vpa?: string | null;
  created_at: string;
}

export interface InsurerProfile {
  id: string;
  name: string;
  email: string | null;
  phone_number: string | null;
  role: string;
  created_at: string;
}

export interface PremiumQuoteResponse {
  worker: {
    name: string;
    platform: string;
    zone: string;
    city: string;
    avg_daily_earning: number;
  };
  premium: number;
  formula_breakdown: {
    base_rate: number;
    zone_multiplier: number;
    weather_multiplier: number;
    history_multiplier: number;
    raw_premium: number;
  };
  rl_premium: number | null;
  coverage: {
    heavy_rainfall: number;
    extreme_heat: number;
    flood_red_alert: number;
    severe_aqi: number;
    curfew_strike: number;
  };
  recommended_arm: number;
  recommended_premium: number;
  context_key: string;
  has_active_policy: boolean;
  week_start: string;
  week_end: string;
  razorpay_key_id?: string;
}

export interface ActivePolicyResponse {
  has_active_policy: boolean;
  policy: {
    id: string;
    week_start: string;
    week_end: string;
    premium_paid: number;
    coverage_amount: number;
    zone: string;
    city: string;
    status: string;
  } | null;
  active_claim: {
    id: string;
    trigger_type: string;
    trigger_value: number | null;
    claim_status: string;
    payout_amount: number;
  } | null;
}

export interface PolicyHistoryResponse {
  policies: Array<{
    id: string;
    week_start: string;
    week_end: string;
    status: string;
    premium_paid: number;
    coverage_amount: number;
    purchased_at: string;
  }>;
  total: number;
  page: number;
  limit: number;
}

export interface ClaimItem {
  id: string;
  trigger_type: string;
  trigger_value: number | null;
  city: string;
  zone: string;
  payout_amount: number;
  disruption_hours: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  razorpay_ref: string | null;
  fraud_score: number;
  graph_flags: string[];
  bcs_score: number | null;
  under_review_reason: {
    behavioral_coherence_score: number;
    tier: number;
    flag_reasons: string[];
    reviewer_eta_hours: number;
    goodwill_bonus: number;
  } | null;
}

export interface ClaimsResponse {
  stats: {
    total_paid_out: number;
    claims_this_month: number;
    paid_streak: number;
  };
  claims: ClaimItem[];
}

export interface RazorpayOrderResponse {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
}

export interface PurchasePolicyBody {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
  premium_paid: number;
  coverage_amount: number;
  recommended_arm: number;
  selected_arm?: number;
  context_key: string;
  arm_accepted: boolean;
}

export interface PurchasePolicyResponse {
  policy_id: string;
  policy: {
    id: string;
    week_start: string;
    week_end: string;
    premium_paid: number;
    coverage_amount: number;
    status: string;
    razorpay_payment_id: string;
  };
  message: string;
}

export interface DisruptionEventsResponse {
  events: Array<{
    id: string;
    trigger_type: string;
    city: string;
    zone: string;
    trigger_value: number | null;
    threshold: number;
    affected_worker_count: number;
    total_payout: number;
    status: string;
    event_start: string;
  }>;
}

export interface ZoneRiskMatrixResponse {
  zones: Array<{
    zone: string;
    city: string;
    zone_multiplier: number;
    risk_level: 'High' | 'Medium' | 'Low';
  }>;
}

export interface AntiSpoofingAlertsResponse {
  alerts: Array<{
    claim_id: string;
    worker_name: string;
    trigger_type: string;
    city: string;
    zone: string;
    bcs_score: number;
    bcs_tier: number;
    payout_amount: number;
    graph_flags: string[];
    created_at: string;
  }>;
}

export interface InsurerDashboardResponse {
  stats: {
    total_workers: number;
    active_policies: number;
    payouts_this_month: number;
    flagged_claims: number;
    loss_ratio: number;
    coverage_area: {
      cities: number;
      zones: number;
    };
    average_premium: number;
  };
  disruption_events: DisruptionEventsResponse['events'];
  zone_risk_matrix: ZoneRiskMatrixResponse['zones'];
  anti_spoofing_alerts: AntiSpoofingAlertsResponse['alerts'];
}

export interface ShadowComparisonResponse {
  total_logged: number;
  mean_formula_premium: number;
  mean_rl_premium: number;
  rl_lower_count: number;
  rl_higher_count: number;
  avg_delta: number;
}

export interface LoginResponse {
  token: string;
  role: 'worker' | 'insurer';
  worker?: WorkerProfile;
  insurer?: InsurerProfile;
}

export interface SimulateTriggerBody {
  trigger_type: string;
  city: string;
  zone?: string;
  lat?: number;
  lng?: number;
  trigger_value?: number;
  disruption_hours?: number;
}
