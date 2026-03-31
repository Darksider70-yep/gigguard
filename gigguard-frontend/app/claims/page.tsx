'use client';

import { useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import CountUp from '@/components/ui/CountUp';
import RadialGauge from '@/components/ui/RadialGauge';
import TriggerBadge from '@/components/ui/TriggerBadge';
import { APIError, api } from '@/lib/api';
import { ClaimItem, ClaimsResponse } from '@/lib/types';

function statusColor(status: string): string {
  if (status === 'paid') return '#10b981';
  if (status === 'under_review') return '#f59e0b';
  if (status === 'denied') return '#ef4444';
  return '#3b82f6';
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ClaimsPage() {
  const [data, setData] = useState<ClaimsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await api.getClaims();
        if (!active) {
          return;
        }
        setData(response);
        setError(null);
      } catch (err) {
        if (!active) {
          return;
        }
        if (err instanceof APIError && err.status === 0) {
          setError('Network unavailable. Check backend connectivity.');
        } else {
          setError('Failed to load claims history.');
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

  const totalPaid = Math.round(data?.stats.total_paid_out ?? 0);
  const monthClaims = data?.stats.claims_this_month ?? 0;
  const streak = data?.stats.paid_streak ?? 0;

  const flaggedClaims = useMemo(() => {
    return (data?.claims ?? []).filter((claim) => claim.status === 'under_review');
  }, [data]);

  const renderClaimCard = (claim: ClaimItem) => {
    const scorePct = Math.max(0, Math.min(100, Math.round((claim.fraud_score ?? 0) * 100)));
    const open = expanded === claim.id;

    return (
      <article key={claim.id} className="surface-card overflow-hidden">
        <div className="grid grid-cols-[6px_1fr]">
          <div style={{ background: statusColor(claim.status) }} />
          <div className="p-4">
            <div className="grid grid-cols-[1.1fr_1fr_1fr] gap-4">
              <div>
                <TriggerBadge triggerType={claim.trigger_type} />
                <p className="mt-2 text-sm text-secondary">{formatDate(claim.created_at)}</p>
                <p className="text-sm text-secondary">{claim.zone}, {claim.city}</p>
              </div>

              <div>
                <p className="font-mono-data text-2xl">?{Math.round(claim.payout_amount)}</p>
                <span
                  className="status-pill mt-1 inline-block"
                  style={{ background: `${statusColor(claim.status)}26`, color: statusColor(claim.status) }}
                >
                  {claim.status}
                </span>
                {claim.razorpay_ref ? <p className="mt-2 font-mono-data text-xs text-muted">{claim.razorpay_ref}</p> : null}
              </div>

              <div>
                <p className="text-xs text-secondary">Fraud score</p>
                <div className="mt-2 h-5 rounded bg-slate-800 p-[2px]">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${scorePct}%`,
                      background: scorePct < 30 ? '#10b981' : scorePct <= 65 ? '#f59e0b' : '#ef4444',
                    }}
                    title={`Fraud Score: ${(claim.fraud_score ?? 0).toFixed(2)}`}
                  />
                </div>
                <p className="mt-1 text-xs text-muted">Fraud Score: {(claim.fraud_score ?? 0).toFixed(2)}</p>
              </div>
            </div>

            {claim.status === 'under_review' ? (
              <div className="mt-3">
                <button
                  type="button"
                  className="text-xs text-amber-300 hover:text-amber-200"
                  onClick={() => setExpanded((prev) => (prev === claim.id ? null : claim.id))}
                >
                  {open ? 'Hide review detail' : 'Show review detail'}
                </button>

                <div
                  className="grid transition-all duration-300"
                  style={{
                    gridTemplateRows: open ? '1fr' : '0fr',
                  }}
                >
                  <div className="overflow-hidden">
                    <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 p-4">
                      <div className="flex items-center gap-4">
                        <RadialGauge
                          value={claim.under_review_reason?.behavioral_coherence_score ?? claim.bcs_score ?? 0}
                          max={100}
                          color={(claim.under_review_reason?.behavioral_coherence_score ?? claim.bcs_score ?? 0) >= 65
                            ? 'var(--accent-green)'
                            : (claim.under_review_reason?.behavioral_coherence_score ?? claim.bcs_score ?? 0) >= 40
                              ? 'var(--accent-saffron)'
                              : 'var(--accent-red)'}
                          size={90}
                        />
                        <div className="text-sm text-secondary">
                          <p>A reviewer will contact you within 4 hours.</p>
                          <ul className="mt-2 list-disc pl-5">
                            {(claim.under_review_reason?.flag_reasons ?? []).map((reason) => (
                              <li key={reason}>{reason}</li>
                            ))}
                          </ul>
                          {(claim.under_review_reason?.goodwill_bonus ?? 0) > 0 ? (
                            <p className="mt-2 text-amber-200">+?{claim.under_review_reason?.goodwill_bonus} goodwill bonus ?</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </article>
    );
  };

  return (
    <AuthGuard allowedRoles={['worker']}>
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-24 rounded-xl" />
          <div className="skeleton h-24 rounded-xl" />
          <div className="skeleton h-24 rounded-xl" />
        </div>
      ) : error ? (
        <div className="surface-card border-rose-500/40 p-4 text-rose-300">{error}</div>
      ) : (
        <div className="space-y-5">
          <h1 className="text-3xl font-semibold">Claims History</h1>

          <section className="grid grid-cols-3 gap-4">
            <div className="surface-card p-4">
              <p className="text-xs text-secondary">Total Paid Out</p>
              <p className="mt-1 font-mono-data text-3xl text-amber-300">?<CountUp value={totalPaid} /></p>
            </div>
            <div className="surface-card p-4">
              <p className="text-xs text-secondary">Claims This Month</p>
              <p className="mt-1 font-mono-data text-3xl text-blue-300"><CountUp value={monthClaims} /></p>
            </div>
            <div className="surface-card p-4">
              <p className="text-xs text-secondary">Paid Streak ??</p>
              <p className="mt-1 font-mono-data text-3xl text-emerald-300"><CountUp value={streak} /></p>
            </div>
          </section>

          {flaggedClaims.length > 0 ? (
            <section className="surface-card border-amber-500/35 p-4 text-sm text-amber-200">
              {flaggedClaims.length} claim(s) currently under review by anti-spoofing pipeline.
            </section>
          ) : null}

          <section className="space-y-3">{(data?.claims ?? []).map(renderClaimCard)}</section>
        </div>
      )}
    </AuthGuard>
  );
}

