'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { api, APIError } from '@/lib/api';
import { PremiumQuoteResponse, PurchasePolicyResponse, RazorpayOrderResponse, WorkerProfile } from '@/lib/types';

declare global {
  interface Window {
    Razorpay: any;
  }
}

const TIERS = [
  { arm: 0, premium: 29, coverage: 290 },
  { arm: 1, premium: 44, coverage: 440 },
  { arm: 2, premium: 65, coverage: 640 },
  { arm: 3, premium: 89, coverage: 890 },
];

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    const existing = document.querySelector('script[data-razorpay="1"]');
    if (existing) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpay = '1';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function BuyPolicyQuotePage() {
  const router = useRouter();
  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [quote, setQuote] = useState<PremiumQuoteResponse | null>(null);
  const [selectedArm, setSelectedArm] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  useEffect(() => {
    const workerRaw = sessionStorage.getItem('buy_policy_worker');
    const quoteRaw = sessionStorage.getItem('buy_policy_quote');

    if (!workerRaw || !quoteRaw) {
      router.replace('/buy-policy');
      return;
    }

    const parsedWorker = JSON.parse(workerRaw) as WorkerProfile;
    const parsedQuote = JSON.parse(quoteRaw) as PremiumQuoteResponse;

    setWorker(parsedWorker);
    setQuote(parsedQuote);
    setSelectedArm(parsedQuote.recommended_arm);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!quote) return;
      if (isPaying) return;
      const token = localStorage.getItem('gigguard_token');

      const payload = JSON.stringify({
        token,
        context_key: quote.context_key,
        arm: quote.recommended_arm,
        reward: 0,
      });

      navigator.sendBeacon(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/policies/bandit-update`,
        new Blob([payload], { type: 'application/json' })
      );
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [quote, isPaying]);

  const sortedTiers = useMemo(() => {
    const ordered = [...TIERS].sort((a, b) => {
      if (!quote) return 0;
      if (a.arm === quote.recommended_arm) return -1;
      if (b.arm === quote.recommended_arm) return 1;
      return a.arm - b.arm;
    });
    return ordered;
  }, [quote]);

  const selectedTier = TIERS.find((tier) => tier.arm === selectedArm) || TIERS[1];

  const openCheckout = async (order: RazorpayOrderResponse) => {
    const loaded = await loadRazorpayScript();
    if (!loaded || !quote) {
      throw new Error('Razorpay SDK failed to load');
    }

    return new Promise<PurchasePolicyResponse>((resolve, reject) => {
      const razorpay = new window.Razorpay({
        key: order.key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: 'GigGuard',
        description: 'Weekly policy purchase',
        order_id: order.order_id,
        handler: async (response: any) => {
          try {
            const purchase = await api.purchasePolicy({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              premium_paid: selectedTier.premium,
              coverage_amount: selectedTier.coverage,
              recommended_arm: quote.recommended_arm,
              selected_arm: selectedTier.arm,
              context_key: quote.context_key,
              arm_accepted: selectedTier.arm === quote.recommended_arm,
            });
            resolve(purchase);
          } catch (error) {
            reject(error);
          }
        },
        theme: { color: '#0284c7' },
      });

      razorpay.on('payment.failed', () => {
        reject(new Error('Payment failed'));
      });

      razorpay.open();
    });
  };

  const handlePay = async () => {
    if (!quote || !worker) return;
    setError(null);
    setIsPaying(true);

    try {
      const order = await api.createOrder(Math.round(selectedTier.premium) * 100);
      const purchase = await openCheckout(order);

      sessionStorage.setItem('buy_policy_purchase', JSON.stringify({
        ...purchase,
        zone: worker.zone || quote.worker.zone,
        city: worker.city,
      }));

      router.push('/buy-policy/confirmed');
    } catch (err) {
      if (err instanceof APIError && err.status === 0) {
        setError('Check your connection.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <AuthGuard allowedRoles={['worker']}>
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-3xl font-bold text-slate-900">Your quote</h1>

        {loading ? (
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded bg-slate-200" />
            <div className="h-32 animate-pulse rounded bg-slate-200" />
            <div className="h-32 animate-pulse rounded bg-slate-200" />
          </div>
        ) : quote ? (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-600">Weekly premium: INR {Math.round(quote.premium)}</p>
              <p className="mt-1 text-sm text-slate-600">RL premium: {quote.rl_premium === null ? 'N/A' : `INR ${Math.round(quote.rl_premium)}`}</p>
              <div className="mt-3 rounded bg-slate-50 p-3 text-xs font-mono text-slate-700">
                base {quote.formula_breakdown.base_rate} x zone {quote.formula_breakdown.zone_multiplier} x weather {quote.formula_breakdown.weather_multiplier} x history {quote.formula_breakdown.history_multiplier} = {quote.formula_breakdown.raw_premium.toFixed(2)}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Coverage by trigger</h2>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
                <div>Heavy Rainfall: INR {quote.coverage.heavy_rainfall}</div>
                <div>Extreme Heat: INR {quote.coverage.extreme_heat}</div>
                <div>Flood / Red Alert: INR {quote.coverage.flood_red_alert}</div>
                <div>Severe AQI: INR {quote.coverage.severe_aqi}</div>
                <div>Curfew / Strike: INR {quote.coverage.curfew_strike}</div>
              </div>
            </div>

            <div className="space-y-3">
              {sortedTiers.map((tier, index) => {
                const recommended = tier.arm === quote.recommended_arm;
                const isSelected = tier.arm === selectedArm;
                const inOtherOptions = index > 0;

                const card = (
                  <label
                    key={tier.arm}
                    className={`block cursor-pointer rounded-xl border p-4 ${recommended ? 'border-sky-500' : 'border-slate-200'} ${isSelected ? 'bg-sky-50' : 'bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">Tier {tier.arm}</p>
                        <p className="text-sm text-slate-600">Coverage INR {tier.coverage}</p>
                        {recommended ? (
                          <span className="mt-2 inline-block rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700">
                            Recommended for you ⭐
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xl font-bold text-slate-900">INR {tier.premium}</p>
                    </div>
                    <input
                      className="mt-3"
                      type="radio"
                      checked={isSelected}
                      onChange={() => setSelectedArm(tier.arm)}
                    />
                  </label>
                );

                if (!inOtherOptions) {
                  return card;
                }

                return null;
              })}
            </div>

            <details className="rounded-xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Other options</summary>
              <div className="mt-3 space-y-3">
                {sortedTiers
                  .filter((tier) => tier.arm !== quote.recommended_arm)
                  .map((tier) => {
                    const isSelected = tier.arm === selectedArm;
                    return (
                      <label key={tier.arm} className={`block cursor-pointer rounded-lg border p-4 ${isSelected ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-white'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-slate-900">Tier {tier.arm}</p>
                            <p className="text-sm text-slate-600">Coverage INR {tier.coverage}</p>
                          </div>
                          <p className="text-lg font-bold text-slate-900">INR {tier.premium}</p>
                        </div>
                        <input className="mt-3" type="radio" checked={isSelected} onChange={() => setSelectedArm(tier.arm)} />
                      </label>
                    );
                  })}
              </div>
            </details>

            {error ? <p className="text-sm text-rose-600">{error}</p> : null}

            <button
              type="button"
              onClick={handlePay}
              disabled={isPaying}
              className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400"
            >
              {isPaying ? 'Processing payment...' : `Pay via UPI - INR ${selectedTier.premium}`}
            </button>
          </>
        ) : null}
      </div>
    </AuthGuard>
  );
}
