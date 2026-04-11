'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import ClaimStatusBar from '@/components/ui/ClaimStatusBar';
import CountUp from '@/components/ui/CountUp';
import PremiumFormula from '@/components/ui/PremiumFormula';
import { useTranslations } from 'next-intl';
import TriggerBadge from '@/components/ui/TriggerBadge';
import { APIError, api } from '@/lib/api';
import { ActivePolicyResponse, ClaimsResponse, PolicyHistoryResponse, PremiumQuoteResponse, WorkerProfile } from '@/lib/types';

const WEATHER_ICON: Record<string, string> = {
  heavy_rainfall: '\uD83C\uDF27\uFE0F',
  extreme_heat: '\uD83C\uDF21\uFE0F',
  severe_aqi: '\uD83D\uDE37',
  default: '\u2600\uFE0F',
};
const INR = '\u20B9';
const WAVE = '\uD83D\uDC4B';

type Tab = 'dashboard' | 'policies' | 'claims';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [activePolicy, setActivePolicy] = useState<ActivePolicyResponse | null>(null);
  const [claims, setClaims] = useState<ClaimsResponse | null>(null);
  const [history, setHistory] = useState<PolicyHistoryResponse | null>(null);
  const [quote, setQuote] = useState<PremiumQuoteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(new Date());
  const [tab, setTab] = useState<Tab>('dashboard');
  const [showFormula, setShowFormula] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [me, policyData, claimData, historyData, premiumData] = await Promise.all([
          api.getMe(),
          api.getActivePolicy(),
          api.getClaims(20),
          api.getPolicyHistory(1, 10),
          api.getPremiumQuote(),
        ]);

        if (!active) {
          return;
        }

        setWorker(me);
        setActivePolicy(policyData);
        setClaims(claimData);
        setHistory(historyData);
        setQuote(premiumData);
        setError(null);
      } catch (err) {
        if (!active) {
          return;
        }
        if (err instanceof APIError && err.status === 0) {
          setError('Network unavailable. Check backend and retry.');
        } else {
          setError('Failed to load dashboard data.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const weeklyEarnings = useMemo(() => Math.round((worker?.avg_daily_earning ?? 0) * 6), [worker]);
  const coverageAmount = Number(activePolicy?.policy?.coverage_amount ?? 0);
  const coveragePct = weeklyEarnings > 0 ? Math.min(100, Math.round((coverageAmount / weeklyEarnings) * 100)) : 0;
  const riskPosition = Math.min(100, Math.round(((worker?.zone_multiplier ?? 1) / 1.6) * 100));
  const weatherIcon = activePolicy?.active_claim?.trigger_type
    ? WEATHER_ICON[activePolicy.active_claim.trigger_type] ?? WEATHER_ICON.default
    : WEATHER_ICON.default;

  const monthTotal = Math.round(claims?.stats.total_paid_out ?? 0);
  const claimsPaid = (claims?.claims ?? []).filter((claim) => claim.status === 'paid').length;
  const memberSince = worker?.created_at
    ? new Date(worker.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : '-';

  return (
    <AuthGuard allowedRoles={['worker']}>
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-20 rounded-xl" />
          <div className="skeleton h-36 rounded-xl" />
          <div className="skeleton h-80 rounded-xl" />
        </div>
      ) : error ? (
        <div className="surface-card border-rose-500/40 p-4 text-rose-300">{error}</div>
      ) : (
        <div className="space-y-5">
          <section className="surface-card animate-fade-in-up delay-0 flex items-center justify-between p-5">
            <div>
              <h1 className="text-3xl font-semibold">{t('greeting', { name: worker?.name ?? 'Worker' })} {WAVE}</h1>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="status-pill bg-amber-500/20 text-amber-300">{worker?.platform ?? '-'}</span>
                <span className="text-secondary">{worker?.zone ?? '-'}, {worker?.city ?? '-'}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono-data text-2xl">{clock.toLocaleTimeString('en-IN')}</p>
              <p className="text-sm text-secondary">{weatherIcon} Weather synced for your zone</p>
              <p className="mt-1 inline-flex items-center gap-2 text-xs text-emerald-300"><span className="live-dot" />Your zone is being monitored</p>
            </div>
          </section>

          {activePolicy?.active_claim ? (
            <section className="surface-card data-flash animate-fade-in-up delay-100 border-amber-500/40 bg-amber-500/8 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Active claim in progress</p>
                  <h2 className="mt-2 text-2xl font-semibold">{activePolicy.active_claim.trigger_type.replaceAll('_', ' ')}</h2>
                  <p className="mt-2 font-mono-data text-amber-200">
                    Trigger value: {activePolicy.active_claim.trigger_value ?? '-'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-secondary">Estimated payout</p>
                  <p className="font-mono-data text-3xl text-amber-300">{`${INR}${Math.round(activePolicy.active_claim.payout_amount)}`}</p>
                </div>
              </div>
              <div className="mt-4">
                <ClaimStatusBar status={activePolicy.active_claim.claim_status} />
              </div>
            </section>
          ) : null}

          <div className="grid grid-cols-5 gap-5">
            <section className="surface-card animate-fade-in-up delay-200 col-span-3 p-5">
              <h3 className="text-lg font-semibold">{t('active_policy_title')}</h3>
              {activePolicy?.has_active_policy && activePolicy.policy ? (
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                    <p className="text-sm text-secondary">Coverage vs weekly earnings</p>
                    <div className="mt-4 grid place-items-center">
                      <div
                        style={{
                          width: 170,
                          height: 170,
                          borderRadius: '50%',
                          background: `conic-gradient(var(--accent-saffron) ${coveragePct * 3.6}deg, rgba(51,65,85,0.7) ${coveragePct * 3.6}deg)`,
                        }}
                        className="grid place-items-center"
                      >
                        <div className="grid h-[120px] w-[120px] place-items-center rounded-full bg-[var(--bg-surface)] border border-slate-700">
                          <div className="text-center">
                            <p className="font-mono-data text-2xl text-amber-300">{coveragePct}%</p>
                            <p className="text-xs text-secondary">covered</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm">
                    <div className="grid grid-cols-2 gap-2 text-secondary">
                      <p>Week</p>
                      <p className="text-right font-mono-data text-white">{activePolicy.policy.week_start} - {activePolicy.policy.week_end}</p>
                      <p>Premium</p>
                      <p className="text-right font-mono-data text-white">{`${INR}${Math.round(activePolicy.policy.premium_paid)}`}</p>
                      <p>Coverage</p>
                      <p className="text-right font-mono-data text-white">{`${INR}${Math.round(activePolicy.policy.coverage_amount)}`}</p>
                      <p>Status</p>
                      <p className="text-right">
                        <span className="status-pill badge-paid">{activePolicy.policy.status}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowFormula((prev) => !prev)}
                      className="mt-4 text-xs text-amber-300 hover:text-amber-200"
                    >
                      {showFormula ? 'Hide premium calculation' : 'Show premium calculation'}
                    </button>
                    {showFormula && quote ? (
                      <div className="mt-3">
                        <PremiumFormula
                          baseRate={quote.formula_breakdown.base_rate}
                          zoneMultiplier={quote.formula_breakdown.zone_multiplier}
                          weatherMultiplier={quote.formula_breakdown.weather_multiplier}
                          historyMultiplier={quote.formula_breakdown.history_multiplier}
                          finalPremium={quote.premium}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-secondary">{t('no_policy_body')}</p>
              )}
            </section>

            <section className="surface-card animate-fade-in-up delay-300 col-span-2 p-5">
              <h3 className="text-lg font-semibold">Risk profile</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="mb-1 flex justify-between text-xs text-secondary">
                    <span>Low risk</span>
                    <span>High risk</span>
                  </div>
                  <div className="relative h-4 rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500">
                    <span
                      className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-slate-950 bg-white"
                      style={{ left: `calc(${riskPosition}% - 8px)` }}
                    />
                  </div>
                </div>
                <p className="font-mono-data text-2xl">×{(worker?.zone_multiplier ?? 1).toFixed(2)}</p>
                <p className="text-sm text-secondary">
                  {(worker?.zone_multiplier ?? 1) > 1.2
                    ? 'High risk zone'
                    : (worker?.zone_multiplier ?? 1) >= 1
                      ? 'Medium risk zone'
                      : 'Low risk zone'}
                </p>
                {activePolicy?.active_claim ? <TriggerBadge triggerType={activePolicy.active_claim.trigger_type} /> : null}
              </div>
            </section>
          </div>

          <section className="surface-card animate-fade-in-up delay-400 p-3">
            <div className="flex gap-2 text-sm">
              <button
                type="button"
                onClick={() => setTab('dashboard')}
                className={`rounded-lg px-4 py-2 ${tab === 'dashboard' ? 'bg-amber-500/20 text-amber-300' : 'text-secondary'}`}
              >
                Dashboard
              </button>
              <button
                type="button"
                onClick={() => setTab('policies')}
                className={`rounded-lg px-4 py-2 ${tab === 'policies' ? 'bg-amber-500/20 text-amber-300' : 'text-secondary'}`}
              >
                My Policies
              </button>
              <button
                type="button"
                onClick={() => setTab('claims')}
                className={`rounded-lg px-4 py-2 ${tab === 'claims' ? 'bg-amber-500/20 text-amber-300' : 'text-secondary'}`}
              >
                Claims History
              </button>
            </div>
          </section>

          {tab === 'dashboard' ? (
            <section className="grid grid-cols-4 gap-4">
              <div className="surface-card p-4">
                <p className="text-xs text-secondary">Total Payouts Received</p>
                <p className="mt-2 font-mono-data text-2xl text-amber-300">{INR}<CountUp value={monthTotal} /></p>
              </div>
              <div className="surface-card p-4">
                <p className="text-xs text-secondary">Policies Purchased</p>
                <p className="mt-2 font-mono-data text-2xl"><CountUp value={history?.total ?? 0} /></p>
              </div>
              <div className="surface-card p-4">
                <p className="text-xs text-secondary">Claims Paid</p>
                <p className="mt-2 font-mono-data text-2xl"><CountUp value={claimsPaid} /></p>
              </div>
              <div className="surface-card p-4">
                <p className="text-xs text-secondary">Member Since</p>
                <p className="mt-2 font-mono-data text-2xl">{memberSince}</p>
              </div>
            </section>
          ) : null}

          {tab === 'policies' ? (
            <section className="space-y-3">
              {(history?.policies ?? []).map((policy) => (
                <div key={policy.id} className="surface-card card-interactive p-4">
                  <p className="font-mono-data text-xs text-amber-300">{policy.id}</p>
                  <p className="mt-1 text-sm text-secondary">{policy.week_start} - {policy.week_end}</p>
                  <p className="mt-1 font-mono-data">{`${INR}${Math.round(policy.premium_paid)} premium • ${INR}${Math.round(policy.coverage_amount)} coverage`}</p>
                </div>
              ))}
            </section>
          ) : null}

          {tab === 'claims' ? (
            <section className="surface-card p-4 text-sm text-secondary">
              <p>
                View complete claims timeline and anti-spoofing review details on{' '}
                <Link href="/claims" className="text-amber-300 hover:text-amber-200">
                  /claims
                </Link>
                .
              </p>
            </section>
          ) : null}
        </div>
      )}
    </AuthGuard>
  );
}

