import {
  ActivePolicyResponse,
  AntiSpoofingAlertsResponse,
  ClaimsResponse,
  DisruptionEventsResponse,
  InsurerProfile,
  InsurerDashboardResponse,
  LoginResponse,
  PolicyHistoryResponse,
  PremiumQuoteResponse,
  PurchasePolicyBody,
  PurchasePolicyResponse,
  RazorpayOrderResponse,
  ShadowComparisonResponse,
  SimulateTriggerBody,
  WorkerProfile,
  ZoneRiskMatrixResponse,
} from './types';

export class APIError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class GigGuardAPI {
  private baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  private token: string | null = null;

  private unauthorizedHandler: (() => void) | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  setUnauthorizedHandler(handler: (() => void) | null) {
    this.unauthorizedHandler = handler;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          ...(options.headers || {}),
        },
      });

      const bodyText = await response.text();
      let payload: any = {};
      if (bodyText) {
        try {
          payload = JSON.parse(bodyText);
        } catch {
          payload = { message: bodyText };
        }
      }

      if (!response.ok) {
        if (response.status === 401 && this.unauthorizedHandler) {
          this.unauthorizedHandler();
        }
        throw new APIError(payload.message || 'Request failed', response.status, payload.code);
      }

      return payload as T;
    } catch (error: any) {
      if (error instanceof APIError) {
        throw error;
      }

      throw new APIError('Network error', 0);
    }
  }

  loginWorker(phone_number: string): Promise<LoginResponse> {
    return this.request<LoginResponse>('/workers/login', {
      method: 'POST',
      body: JSON.stringify({ role: 'worker', phone_number }),
    });
  }

  loginInsurer(secret?: string): Promise<LoginResponse> {
    return this.request<LoginResponse>('/workers/login', {
      method: 'POST',
      body: JSON.stringify({ role: 'insurer', secret }),
    });
  }

  getMe() {
    return this.request<WorkerProfile>('/workers/me');
  }

  getInsurerMe() {
    return this.request<InsurerProfile>('/insurer/me');
  }

  getPremiumQuote() {
    return this.request<PremiumQuoteResponse>('/policies/premium');
  }

  getActivePolicy() {
    return this.request<ActivePolicyResponse>('/policies/active');
  }

  getPolicyHistory(page = 1, limit = 10) {
    return this.request<PolicyHistoryResponse>(`/policies/history?page=${page}&limit=${limit}`);
  }

  purchasePolicy(body: PurchasePolicyBody) {
    return this.request<PurchasePolicyResponse>('/policies', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  getClaims(limit?: number) {
    const query = limit ? `?limit=${limit}` : '';
    return this.request<ClaimsResponse>(`/claims${query}`);
  }

  getClaimById(id: string) {
    return this.request(`/claims/${id}`);
  }

  createOrder(amount: number) {
    return this.request<RazorpayOrderResponse>('/razorpay/create-order', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  }

  getInsurerDashboard() {
    return this.request<InsurerDashboardResponse>('/insurer/dashboard');
  }

  getDisruptionEvents(status?: string, limit = 20) {
    const search = new URLSearchParams();
    if (status) {
      search.set('status', status);
    }
    search.set('limit', String(limit));
    return this.request<DisruptionEventsResponse>(`/insurer/disruption-events?${search.toString()}`);
  }

  getPublicDisruptionEvents(status = 'active', limit = 1) {
    const search = new URLSearchParams();
    if (status) {
      search.set('status', status);
    }
    search.set('limit', String(limit));
    return this.request<DisruptionEventsResponse>(`/triggers/live-events?${search.toString()}`);
  }

  getAntiSpoofingAlerts() {
    return this.request<AntiSpoofingAlertsResponse>('/insurer/anti-spoofing-alerts');
  }

  getZoneRiskMatrix() {
    return this.request<ZoneRiskMatrixResponse>('/insurer/zone-risk-matrix');
  }

  approveClaim(claimId: string) {
    return this.request<{ success: boolean; payout_amount: number }>(`/insurer/claims/${claimId}/approve`, {
      method: 'POST',
    });
  }

  denyClaim(claimId: string, reason: string) {
    return this.request<{ success: boolean }>(`/insurer/claims/${claimId}/deny`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  simulateTrigger(body: SimulateTriggerBody) {
    return this.request('/triggers/simulate', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  getShadowComparison() {
    return this.request<ShadowComparisonResponse>('/insurer/shadow-comparison');
  }

  banditUpdate(context_key: string, arm: number, reward: number) {
    return this.request<{ success: boolean }>('/policies/bandit-update', {
      method: 'POST',
      body: JSON.stringify({ context_key, arm, reward }),
    });
  }
}

export const api = new GigGuardAPI();
