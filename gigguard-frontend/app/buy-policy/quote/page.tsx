'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import ConfettiOnce from '@/components/ui/ConfettiOnce';
import CountUp from '@/components/ui/CountUp';
import PremiumFormula from '@/components/ui/PremiumFormula';
import TriggerBadge from '@/components/ui/TriggerBadge';
import { APIError, api } from '@/lib/api';
import { PremiumQuoteResponse, PurchasePolicyResponse, RazorpayOrderResponse, WorkerProfile } from '@/lib/types';

interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: () => void) => void;
    };
  }
}

const TIERS = [
  { arm: 0, premium: 29, coverage: 290 },
  { arm: 1, premium: 44, coverage: 440 },
  { arm: 2, premium: 65, coverage: 640 },
  { arm: 3, premium: 89, coverage: 890 },
];
const INR = '\u20B9';
const STAR = '\u2B50';

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

function triggerRowsFromCoverage(quote: PremiumQuoteResponse) {
  return [
    { key: 'heavy_rainfall', amount: quote.coverage.heavy_rainfall, desc: 'Rainfall above threshold in your zone' },
    { key: 'extreme_heat', amount: quote.coverage.extreme_heat, desc: 'Feels-like temperature breach event' },
    { key: 'flood_red_alert', amount: quote.coverage.flood_red_alert, desc: 'Official flood/red alert notice' },
    { key: 'severe_aqi', amount: quote.coverage.severe_aqi, desc: 'AQI emergency crossing severe threshold' },
    { key: 'curfew_strike', amount: quote.coverage.curfew_strike, desc: 'City curfew or strike disruption block' },
    { key: 'pandemic_containment', amount: quote.coverage.pandemic_containment, desc: 'Official health or containment zone' },
  ] as const;
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
      if (!quote || isPaying) {
        return;
      }
      const token = localStorage.getItem('gigguard_token');
      if (!token) {
        return;
      }

      void fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/policies/bandit-update`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          context_key: quote.context_key,
          arm: quote.recommended_arm,
          reward: 0,
        }),
      }).catch(() => undefined);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [quote, isPaying]);

  const sortedTiers = useMemo(() => {
    const ordered = [...TIERS];
    if (!quote) {
      return ordered;
    }

    ordered.sort((a, b) => {
      if (a.arm === quote.recommended_arm) return -1;
      if (b.arm === quote.recommended_arm) return 1;
      return a.arm - b.arm;
    });

    return ordered;
  }, [quote]);

  const selectedTier = TIERS.find((tier) => tier.arm === selectedArm) ?? TIERS[1];

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
        handler: async (response: RazorpaySuccessResponse) => {
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
        theme: { color: '#f59e0b' },
      });

      razorpay.on('payment.failed', () => reject(new Error('Payment failed')));
      razorpay.open();
    });
  };

  const handlePay = async () => {
    if (!quote || !worker) {
      return;
    }

    setError(null);
    setIsPaying(true);

    try {
      const order = await api.createOrder(selectedTier.arm, selectedTier.coverage, Math.round(selectedTier.premium));
      
      const { checkout_data, order_id } = order;
      
      if (checkout_data.driver === 'dummy') {
        window.location.href = checkout_data.checkout_url;
        return;
      }

      if (checkout_data.driver === 'razorpay') {
        const purchase = await openCheckout({
          order_id: checkout_data.razorpay_order_id,
          amount: Math.round(selectedTier.premium) * 100,
          currency: 'INR',
          key_id: checkout_data.key_id
        });

        sessionStorage.setItem(
          'buy_policy_purchase',
          JSON.stringify({
            ...purchase,
            zone: worker.zone || quote.worker.zone,
            city: worker.city,
          })
        );
        router.push('/buy-policy/confirmed');
      }

    } catch (err) {
      if (err instanceof APIError && err.status === 0) {
        setError('Network unavailable. Check backend and retry.');
      } else {
        setError('Payment could not be completed. Try again.');
      }
      setIsPaying(false);
    }
  };

  return (
    <AuthGuard allowedRoles={['worker']}>
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-20 rounded-xl" />
          <div className="skeleton h-[500px] rounded-xl" />
        </div>
      ) : quote ? (
        <div className="space-y-6">
          <section className="surface-card relative overflow-hidden p-6">
            <ConfettiOnce active={!loading} />
            <h1 className="text-3xl font-semibold">Your Quote is Ready!</h1>
            <p className="mt-2 text-secondary">AI recommendation generated from zone risk and history context.</p>
            <p className="mt-4 font-mono-data text-6xl text-amber-300">
              {INR}<CountUp value={Math.round(quote.premium)} />
            </p>
            <div className="mt-4">
              <PremiumFormula
                baseRate={quote.formula_breakdown.base_rate}
                zoneMultiplier={quote.formula_breakdown.zone_multiplier}
                weatherMultiplier={quote.formula_breakdown.weather_multiplier}
                historyMultiplier={quote.formula_breakdown.history_multiplier}
                healthMultiplier={quote.formula_breakdown.health}
                finalPremium={quote.premium}
              />
              <div className="mt-3 space-y-1 rounded-lg border border-slate-700 bg-slate-900/45 p-3 text-sm">
                <div className="flex justify-between text-secondary">
                  <span>Zone risk</span>
                  <span className="font-medium text-slate-100">×{quote.formula_breakdown.zone_multiplier.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-secondary">
                  <span>Weather</span>
                  <span className="font-medium text-slate-100">×{quote.formula_breakdown.weather_multiplier.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-secondary">
                  <span>History</span>
                  <span className="font-medium text-slate-100">×{quote.formula_breakdown.history_multiplier.toFixed(2)}</span>
                </div>
                {typeof quote.formula_breakdown.health === 'number' &&
                quote.formula_breakdown.health !== 1.0 ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-200">Health advisory</span>
                    <span className="font-medium text-amber-300">×{quote.formula_breakdown.health.toFixed(2)}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-5 gap-4">
            {triggerRowsFromCoverage(quote).map((trigger) => (
              <div key={trigger.key} className="group [perspective:900px]">
                <div className="relative h-40 w-full transition-transform duration-500 [transform-style:preserve-3d] group-hover:[transform:rotateY(180deg)]">
                  <div className="surface-card absolute inset-0 p-3 [backface-visibility:hidden]">
                    <TriggerBadge triggerType={trigger.key} />
                    <p className="mt-4 font-mono-data text-2xl text-amber-300">{`${INR}${Math.round(trigger.amount)}`}</p>
                    <p className="mt-2 text-xs text-secondary">Payout amount</p>
                  </div>
                  <div className="surface-card absolute inset-0 p-3 [transform:rotateY(180deg)] [backface-visibility:hidden]">
                    <p className="text-sm text-secondary">What triggers this?</p>
                    <p className="mt-3 text-sm">{trigger.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </section>

          <section className="surface-card p-5">
            {quote.health_advisory?.active ? (
              <div className="mb-4 rounded-lg border border-amber-300/30 bg-amber-500/10 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-amber-300 text-xl">{'\u26A0\uFE0F'}</span>
                  <div>
                    <p className="font-semibold text-amber-200">
                      {quote.health_advisory.severity === 'containment'
                        ? 'Active containment zone in your district'
                        : quote.health_advisory.severity === 'adjacent'
                          ? 'Containment zone in a nearby district'
                          : 'Health advisory in your city'}
                    </p>
                    <p className="mt-1 text-sm text-amber-100/90">
                      A health risk surcharge of{' '}
                      {((quote.health_advisory.multiplier - 1) * 100).toFixed(0)}%
                      {' '}has been added to your premium this week. If a containment zone is declared
                      in your area after purchase, your coverage remains locked at today&apos;s price.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/50 bg-amber-500/15 px-3 py-1 text-sm text-amber-200">
              {`${STAR} AI Recommended tier: ${quote.recommended_arm}`}
            </div>
            <div className="space-y-3">
              {sortedTiers.map((tier) => {
                const selected = selectedArm === tier.arm;
                const recommended = tier.arm === quote.recommended_arm;

                return (
                  <label
                    key={tier.arm}
                    className={`block rounded-xl border p-4 transition ${
                      selected ? 'border-amber-400 bg-amber-500/10' : 'border-slate-700 bg-slate-900/50'
                    }`}
                  >
                    <input
                      type="radio"
                      className="mr-2"
                      checked={selected}
                      onChange={() => setSelectedArm(tier.arm)}
                    />
                    <span className="font-semibold">Tier {tier.arm}</span>
                    {recommended ? <span className="ml-2 text-xs text-amber-300">Recommended for you</span> : null}
                    <span className="float-right font-mono-data">{`${INR}${tier.premium} • ${INR}${tier.coverage}`}</span>
                  </label>
                );
              })}
            </div>

            {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

            <button
              type="button"
              onClick={handlePay}
              disabled={isPaying}
              className="btn-saffron mt-5 w-full px-4 py-3 text-lg disabled:opacity-60"
            >
              {isPaying ? 'Processing payment...' : `Pay via Razorpay • ${INR}${selectedTier.premium}`}
            </button>
          </section>
        </div>
      ) : null}
    </AuthGuard>
  );
}

