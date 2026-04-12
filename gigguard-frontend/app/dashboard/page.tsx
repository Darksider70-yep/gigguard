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
import { GlassCard } from '@/components/ui/GlassCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { ShieldCheck, Zap, History, Clock, AlertTriangle, MapPin, Activity } from 'lucide-react';

const WEATHER_ICON: Record<string, string> = {
  heavy_rainfall: '🌧️',
  extreme_heat: '🌡️',
  severe_aqi: '😷',
  default: '☀️',
};

const WAVE = '👋';

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
        if (!active) return;
        setWorker(me);
        setActivePolicy(policyData);
        setClaims(claimData);
        setHistory(historyData);
        setQuote(premiumData);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof APIError && err.status === 0 ? 'Network unavailable' : 'Failed to load dashboard');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const weeklyEarnings = useMemo(() => Math.round((worker?.avg_daily_earning ?? 0) * 6), [worker]);
  const coverageAmount = Number(activePolicy?.policy?.coverage_amount ?? 0);
  const coveragePct = weeklyEarnings > 0 ? Math.min(100, Math.round((coverageAmount / weeklyEarnings) * 100)) : 0;
  const riskPosition = Math.min(100, Math.round(((worker?.zone_multiplier ?? 1) / 1.6) * 100));
  
  const weatherIcon = activePolicy?.active_claim?.trigger_type
    ? WEATHER_ICON[activePolicy.active_claim.trigger_type] ?? WEATHER_ICON.default
    : WEATHER_ICON.default;

  const monthTotal = Math.round(claims?.stats.total_paid_out ?? 0);
  const memberSince = worker?.created_at
    ? new Date(worker.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : '-';

  return (
    <AuthGuard allowedRoles={['worker']}>
      <div className="max-w-5xl mx-auto space-y-6 pb-20">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-32 bg-white/5 rounded-2xl" />
            <div className="grid grid-cols-5 gap-4">
              <div className="col-span-3 h-64 bg-white/5 rounded-2xl" />
              <div className="col-span-2 h-64 bg-white/5 rounded-2xl" />
            </div>
          </div>
        ) : error ? (
          <GlassCard className="border-rose-500/30 bg-rose-500/5 p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-rose-400 mb-2" />
            <p className="text-rose-200">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-4 text-sm font-bold text-white bg-rose-500 px-4 py-2 rounded-lg">Retry</button>
          </GlassCard>
        ) : (
          <>
            <section className="animate-fade-in-up">
              <GlassCard className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-saffron-500/10 blur-[100px] -mr-32 -mt-32" />
                <div className="relative z-10 space-y-3 text-center md:text-left">
                  <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                    {t('greeting', { name: worker?.name ?? 'Worker' })} {WAVE}
                  </h1>
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                    <StatusBadge variant="saffron" dot>{worker?.platform ?? '-'}</StatusBadge>
                    <div className="flex items-center gap-1.5 text-text-secondary text-sm">
                      <MapPin size={14} className="text-accent-saffron" />
                      <span>{worker?.zone ?? '-'}, {worker?.city ?? '-'}</span>
                    </div>
                  </div>
                </div>
                <div className="relative z-10 text-center md:text-right space-y-1">
                  <p className="font-monoData text-3xl font-medium tracking-tighter text-glow-saffron">
                    {clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-xs text-text-muted flex items-center justify-center md:justify-end gap-1.5">
                    {weatherIcon} Weather synced • <span className="text-emerald-400 flex items-center gap-1"><span className="live-dot" /> Live Monitoring</span>
                  </p>
                </div>
              </GlassCard>
            </section>

            {activePolicy?.active_claim && (
              <section className="animate-fade-in-up delay-100">
                <GlassCard className="border-amber-500/40 bg-amber-500/10 p-6">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-amber-500/20 rounded-xl">
                        <Activity className="text-amber-400" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-amber-500 font-bold">Active Claim Detected</p>
                        <h2 className="text-xl font-bold">{activePolicy.active_claim.trigger_type.replaceAll('_', ' ')}</h2>
                      </div>
                    </div>
                    <div className="text-center md:text-right">
                      <p className="text-xs text-amber-500/70 font-medium">Estimated Payout</p>
                      <AmountDisplay amount={activePolicy.active_claim.payout_amount} size="lg" className="text-amber-400" />
                    </div>
                  </div>
                  <ClaimStatusBar status={activePolicy.active_claim.claim_status} />
                </GlassCard>
              </section>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <section className="lg:col-span-3 animate-fade-in-up delay-200">
                <GlassCard className="h-full flex flex-col overflow-hidden">
                  <div className="p-6 border-b border-white/5 flex items-center justify-between">
                    <h3 className="font-bold flex items-center gap-2"><ShieldCheck size={18} className="text-accent-saffron" /> {t('active_policy_title')}</h3>
                    {activePolicy?.has_active_policy && <StatusBadge variant="success" dot>Active</StatusBadge>}
                  </div>
                  
                  <div className="flex-1 p-6">
                    {activePolicy?.has_active_policy && activePolicy.policy ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                        <div className="space-y-4 text-center">
                          <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Coverage Protection</p>
                          <div className="relative inline-flex items-center justify-center">
                             <svg className="w-40 h-40 transform -rotate-90">
                              <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/5" />
                              <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="8" fill="transparent" 
                                strokeDasharray={440} strokeDashoffset={440 - (440 * coveragePct) / 100}
                                className="text-accent-saffron transition-all duration-1000 ease-out" 
                              />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="font-monoData text-3xl font-bold">{coveragePct}%</span>
                              <span className="text-[10px] text-text-muted font-bold uppercase">Covered</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div className="grid grid-cols-2 gap-y-4 text-sm">
                            <div className="text-text-muted">Validity</div>
                            <div className="text-right font-medium">Weekly<br/><span className="text-[10px] opacity-60">{activePolicy.policy.week_start} - {activePolicy.policy.week_end}</span></div>
                            
                            <div className="text-text-muted">Premium Paid</div>
                            <div className="text-right"><AmountDisplay amount={activePolicy.policy.premium_paid} size="sm" /></div>
                            
                            <div className="text-text-muted">Total Potential Payout</div>
                            <div className="text-right"><AmountDisplay amount={activePolicy.policy.coverage_amount} size="sm" className="text-accent-saffron" /></div>
                          </div>

                          <button 
                            onClick={() => setShowFormula(!showFormula)}
                            className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold transition-all"
                          >
                            {showFormula ? 'Hide' : 'View'} Pricing Breakdown
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 space-y-4">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                          <ShieldCheck size={32} className="text-text-muted" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-bold text-text-secondary">No active policy found</p>
                          <p className="text-sm text-text-muted max-w-[240px] mx-auto">{t('no_policy_body')}</p>
                        </div>
                        <Link href="/buy-policy" className="inline-block mt-4 bg-accent-saffron text-bg-base font-black px-6 py-2.5 rounded-xl hover:shadow-saffronGlow transition-all">
                          Secure My Income
                        </Link>
                      </div>
                    )}

                    {showFormula && quote && (
                      <div className="mt-6 animate-fade-in-up">
                         <PremiumFormula
                           baseRate={quote.formula_breakdown.base_rate}
                           zoneMultiplier={quote.formula_breakdown.zone_multiplier}
                           weatherMultiplier={quote.formula_breakdown.weather_multiplier}
                           historyMultiplier={quote.formula_breakdown.history_multiplier}
                           finalPremium={quote.premium}
                         />
                      </div>
                    )}
                  </div>
                </GlassCard>
              </section>

              <section className="lg:col-span-2 animate-fade-in-up delay-300">
                <GlassCard className="h-full flex flex-col">
                   <div className="p-6 border-b border-white/5">
                    <h3 className="font-bold flex items-center gap-2"><Zap size={18} className="text-accent-blue" /> Risk Intelligence</h3>
                  </div>
                  <div className="p-6 flex-1 flex flex-col justify-between space-y-8">
                    <div>
                      <div className="flex justify-between items-end mb-4">
                        <div className="space-y-1">
                          <p className="text-xs text-text-muted font-bold uppercase">Zone risk intensity</p>
                          <p className="text-2xl font-monoData font-bold leading-none">×{(worker?.zone_multiplier ?? 1).toFixed(2)}</p>
                        </div>
                        <StatusBadge variant={ (worker?.zone_multiplier ?? 1) > 1.2 ? 'error' : 'info' }>
                          {(worker?.zone_multiplier ?? 1) > 1.2 ? 'High Risk' : 'Standard'}
                        </StatusBadge>
                      </div>
                      
                      <div className="relative h-2.5 rounded-full bg-white/5 overflow-hidden">
                        <div 
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 transition-all duration-1000"
                          style={{ width: `${riskPosition}%` }}
                        />
                        <div className="absolute inset-y-0 w-1 bg-white shadow-xl translate-x-1/2" style={{ left: `${riskPosition}%` }} />
                      </div>
                    </div>

                    <div className="bg-white/5 rounded-2xl p-4 space-y-3">
                      <p className="text-xs text-text-muted font-medium">GNN Fraud Prevention Status</p>
                      <div className="flex items-center gap-2 text-emerald-400">
                         <ShieldCheck size={16} />
                         <span className="text-sm font-bold tracking-tight">Enterprise Level Shield Active</span>
                      </div>
                    </div>

                    <div className="text-[10px] text-text-muted leading-relaxed uppercase tracking-widest font-bold">
                      Real-time disruption monitoring Active across {worker?.city ?? '-'} Network.
                    </div>
                  </div>
                </GlassCard>
              </section>
            </div>

            <section className="animate-fade-in-up delay-500">
               <div className="inline-flex p-1 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10">
                {(['dashboard', 'policies', 'claims'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`
                      px-6 py-2 rounded-xl text-sm font-bold capitalize transition-all
                      ${tab === t ? 'bg-accent-saffron text-bg-base shadow-lg' : 'text-text-secondary hover:text-white'}
                    `}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </section>

            {tab === 'dashboard' && (
              <section className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up">
                {[
                  { label: 'Total Payouts', value: monthTotal, prefix: '₹', icon: Zap, c: 'text-emerald-400' },
                  { label: 'Active Streak', value: history?.total ?? 0, suffix: ' Weeks', icon: History, c: 'text-accent-saffron' },
                  { label: 'Verified Claims', value: (claims?.claims ?? []).filter(c => c.status === 'paid').length, icon: ShieldCheck, c: 'text-accent-blue' },
                  { label: 'Fleet Member', value: memberSince, icon: Clock, c: 'text-text-muted' },
                ].map((stat, i) => (
                  <GlassCard key={i} className="p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className={`p-2 rounded-lg bg-white/5 ${stat.c}`}>
                        <stat.icon size={16} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted font-medium mb-1">{stat.label}</p>
                      <p className="text-xl font-monoData font-bold">
                        {stat.prefix}
                        {typeof stat.value === 'number' ? <CountUp value={stat.value} /> : stat.value}
                        {stat.suffix}
                      </p>
                    </div>
                  </GlassCard>
                ))}
              </section>
            )}

            {tab === 'policies' && (
              <section className="space-y-4 animate-fade-in-up">
                {(history?.policies ?? []).map((policy, i) => (
                   <GlassCard key={policy.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-[10px] font-monoData text-text-muted uppercase tracking-tighter">{policy.id}</p>
                        <p className="font-bold">{policy.week_start} — {policy.week_end}</p>
                      </div>
                      <div className="flex items-center gap-6">
                         <div className="text-right">
                            <p className="text-[10px] text-text-muted font-bold uppercase">Premium</p>
                            <AmountDisplay amount={policy.premium_paid} size="sm" />
                         </div>
                         <div className="text-right">
                            <p className="text-[10px] text-text-muted font-bold uppercase">Coverage</p>
                            <AmountDisplay amount={policy.coverage_amount} size="sm" className="text-accent-saffron" />
                         </div>
                      </div>
                   </GlassCard>
                ))}
              </section>
            )}

            {tab === 'claims' && (
              <section className="animate-fade-in-up">
                <GlassCard className="p-8 text-center space-y-6">
                  <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto">
                    <History size={32} className="text-accent-saffron" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">Full Claims History</h3>
                    <p className="text-text-secondary text-sm max-w-md mx-auto">
                      View your detailed anti-spoofing review results, appeals, and payout timelines on the dedicated claims page.
                    </p>
                  </div>
                  <Link href="/history/claims" className="inline-block bg-white text-bg-base font-black px-8 py-3 rounded-2xl hover:bg-white/90 transition-all">
                    View Complete Audit
                  </Link>
                </GlassCard>
              </section>
            )}
          </>
        )}
      </div>
    </AuthGuard>
  );
}
