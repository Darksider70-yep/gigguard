'use client';

import { useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { api, APIError } from '@/lib/api';
import { ActivePolicyResponse, ClaimsResponse, PolicyHistoryResponse, PremiumQuoteResponse, WorkerProfile } from '@/lib/types';
import { Calendar, MapPin, Shield, TrendingUp } from 'lucide-react';

function formatInr(value: number): string {
  return `INR ${Math.round(value).toLocaleString('en-IN')}`;
}

function statusStep(status: string): number {
  if (status === 'triggered') return 1;
  if (status === 'validating') return 2;
  if (status === 'approved') return 3;
  if (status === 'paid') return 4;
  return 0;
}

function riskLabel(multiplier: number): string {
  if (multiplier > 1.2) return 'High risk zone';
  if (multiplier >= 1.0) return 'Medium risk zone';
  return 'Low risk zone';
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} />;
}

export default function DashboardPage() {
  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [activePolicy, setActivePolicy] = useState<ActivePolicyResponse | null>(null);
  const [claims, setClaims] = useState<ClaimsResponse | null>(null);
  const [history, setHistory] = useState<PolicyHistoryResponse | null>(null);
  const [premiumQuote, setPremiumQuote] = useState<PremiumQuoteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [showFormula, setShowFormula] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        const [me, activePolicyData, claimsData, historyData, quoteData] = await Promise.all([
          api.getMe(),
          api.getActivePolicy(),
          api.getClaims(1),
          api.getPolicyHistory(1, 10),
          api.getPremiumQuote(),
        ]);

        if (!active) return;

        setWorker(me);
        setActivePolicy(activePolicyData);
        setClaims(claimsData);
        setHistory(historyData);
        setPremiumQuote(quoteData);
      } catch (err) {
        if (!active) return;
        if (err instanceof APIError && err.status === 0) {
          setError('Check your connection.');
        } else {
          setError('Something went wrong. Please try again.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const message = sessionStorage.getItem('gigguard_flash');
    if (message) {
      setFlash(message);
      sessionStorage.removeItem('gigguard_flash');
      const timer = setTimeout(() => setFlash(null), 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  const weeklyEarnings = useMemo(() => {
    if (!worker) return 0;
    return Number(worker.avg_daily_earning || 0) * 6;
  }, [worker]);

  const coverageAmount = Number(activePolicy?.policy?.coverage_amount || 0);
  const coveragePercentage = weeklyEarnings > 0 ? ((coverageAmount / weeklyEarnings) * 100).toFixed(1) : '0.0';

  const riskScore = Math.min(1, Number(worker?.zone_multiplier || 1) / 1.5);
  const mostRecentClaim = claims?.claims?.[0] || null;
  const memberSince = worker?.created_at ? new Date(worker.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '-';

  return (
    <AuthGuard allowedRoles={['worker']}>
      <div className="space-y-6">
        {loading ? (
          <div className="space-y-4">
            <SkeletonBlock className="h-8 w-64" />
            <SkeletonBlock className="h-24 w-full" />
            <SkeletonBlock className="h-36 w-full" />
            <SkeletonBlock className="h-36 w-full" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700">{error}</div>
        ) : (
          <>
            {flash ? <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-700">{flash}</div> : null}

            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
                <p className="text-slate-600">Welcome back{worker?.name ? `, ${worker.name.split(' ')[0]}` : ''}.</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                <MapPin className="h-4 w-4" />
                {worker?.zone || 'Unknown'}, {worker?.city || 'Unknown'}
              </div>
            </div>

            {activePolicy?.active_claim ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                <p className="font-semibold text-amber-900">
                  {activePolicy.active_claim.trigger_type} detected. {activePolicy.active_claim.trigger_value ?? '-'} trigger value. Your claim is being processed.
                </p>
                <div className="mt-3 grid grid-cols-4 gap-2 text-xs text-slate-700">
                  {['Triggered', 'Validating', 'Approved', 'Paid'].map((label, index) => {
                    const filled = statusStep(activePolicy.active_claim?.claim_status || '') >= index + 1;
                    return (
                      <div key={label} className={`rounded px-2 py-1 text-center ${filled ? 'bg-amber-200 font-semibold' : 'bg-slate-100'}`}>
                        {label}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900">Active Policy</h2>
                  {activePolicy?.has_active_policy && activePolicy.policy ? (
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      <p>Week: {activePolicy.policy.week_start} to {activePolicy.policy.week_end}</p>
                      <p>Premium: {formatInr(activePolicy.policy.premium_paid)}</p>
                      <p>Coverage: {formatInr(activePolicy.policy.coverage_amount)}</p>
                      <p>Zone: {activePolicy.policy.zone}, {activePolicy.policy.city}</p>
                      <button
                        type="button"
                        onClick={() => setShowFormula((prev) => !prev)}
                        className="mt-2 text-sm font-semibold text-sky-700"
                      >
                        {showFormula ? 'Hide premium calculation' : 'Show premium calculation'}
                      </button>
                      {showFormula && premiumQuote ? (
                        <div className="rounded bg-slate-50 p-3 text-xs font-mono text-slate-700">
                          base {premiumQuote.formula_breakdown.base_rate} x zone {premiumQuote.formula_breakdown.zone_multiplier} x weather {premiumQuote.formula_breakdown.weather_multiplier} x history {premiumQuote.formula_breakdown.history_multiplier} = {premiumQuote.formula_breakdown.raw_premium.toFixed(2)}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-600">No active policy this week.</p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900">Recent Claim</h2>
                  {mostRecentClaim ? (
                    <div className="mt-3 text-sm text-slate-700">
                      <p>{mostRecentClaim.trigger_type} in {mostRecentClaim.zone}</p>
                      <p>Status: {mostRecentClaim.status}</p>
                      <p>Payout: {formatInr(mostRecentClaim.payout_amount)}</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-600">No claims yet.</p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="font-semibold text-slate-900">Earnings at Risk</h3>
                  <p className="mt-3 text-sm text-slate-700">Weekly earnings: {formatInr(weeklyEarnings)}</p>
                  <p className="text-sm text-slate-700">Coverage: {formatInr(coverageAmount)}</p>
                  <p className="text-sm text-slate-700">{coveragePercentage}% covered</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="font-semibold text-slate-900">Risk Profile</h3>
                  <p className="mt-3 text-sm text-slate-700">ML risk score: {riskScore.toFixed(2)}</p>
                  <p className="text-sm text-slate-700">Zone multiplier: {(worker?.zone_multiplier || 1).toFixed(2)}x</p>
                  <p className="text-sm text-slate-700">{riskLabel(worker?.zone_multiplier || 1)}</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="font-semibold text-slate-900">Quick Stats</h3>
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <p className="flex items-center gap-2"><Shield className="h-4 w-4" /> Total paid out: {formatInr(Number(claims?.stats.total_paid_out || 0))}</p>
                    <p className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Claims this month: {claims?.stats.claims_this_month || 0}</p>
                    <p className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Policies purchased: {history?.total || 0}</p>
                    <p>Member since: {memberSince}</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AuthGuard>
  );
}
