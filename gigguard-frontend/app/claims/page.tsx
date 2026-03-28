'use client';

import { useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import ClaimStatusBadge from '@/components/ClaimStatusBadge';
import TriggerBadge from '@/components/TriggerBadge';
import { APIError, api } from '@/lib/api';
import { ClaimsResponse } from '@/lib/types';
import { AlertTriangle, Calendar, Hash, IndianRupee } from 'lucide-react';

function formatInr(value: number): string {
  return `INR ${Math.round(value).toLocaleString('en-IN')}`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function FraudScoreBar({ score }: { score: number }) {
  const color = score < 0.3 ? 'bg-emerald-500' : score <= 0.65 ? 'bg-amber-500' : 'bg-rose-500';
  const width = Math.max(0, Math.min(100, score * 100));

  return (
    <div className="w-full">
      <div className="h-1.5 w-full rounded-full bg-slate-200">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-500">Fraud Score: {(score * 100).toFixed(2)}</p>
    </div>
  );
}

function SkeletonCard() {
  return <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />;
}

export default function ClaimsPage() {
  const [data, setData] = useState<ClaimsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        const response = await api.getClaims();
        if (!active) {
          return;
        }
        setData(response);
      } catch (err) {
        if (!active) {
          return;
        }
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

  const underReviewClaims = useMemo(() => {
    return (data?.claims || []).filter((claim) => claim.status === 'under_review' && claim.under_review_reason);
  }, [data]);

  return (
    <AuthGuard allowedRoles={['worker']}>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Claims History</h1>
          <p className="text-slate-600">Track claim progress, payouts, and risk checks.</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700">{error}</div>
        ) : data ? (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <IndianRupee className="h-4 w-4" />
                  Total Paid Out
                </p>
                <p className="text-2xl font-bold text-emerald-600">{formatInr(data.stats.total_paid_out)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <Calendar className="h-4 w-4" />
                  Claims This Month
                </p>
                <p className="text-2xl font-bold text-slate-900">{data.stats.claims_this_month}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <Hash className="h-4 w-4" />
                  Paid Claims Streak
                </p>
                <p className="text-2xl font-bold text-slate-900">{data.stats.paid_streak}</p>
              </div>
            </div>

            {underReviewClaims.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-amber-900">
                  <AlertTriangle className="h-5 w-5" />
                  Under Review
                </h2>
                <div className="mt-3 space-y-3">
                  {underReviewClaims.map((claim) => (
                    <div key={`review_${claim.id}`} className="rounded-lg bg-white p-4">
                      <p className="text-sm font-semibold text-slate-900">Claim {claim.id.slice(0, 8)}...</p>
                      <p className="text-sm text-slate-700">
                        BCS: {claim.under_review_reason?.behavioral_coherence_score} | Tier:{' '}
                        {claim.under_review_reason?.tier}
                      </p>
                      <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                        {(claim.under_review_reason?.flag_reasons || []).map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                      <p className="mt-2 text-sm text-slate-700">
                        Reviewer ETA: {claim.under_review_reason?.reviewer_eta_hours}h | Goodwill bonus: INR{' '}
                        {claim.under_review_reason?.goodwill_bonus}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-4">
              {data.claims.map((claim) => (
                <div key={claim.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                    <div className="lg:col-span-2">
                      <TriggerBadge triggerType={claim.trigger_type} />
                      <p className="mt-2 text-sm text-slate-600">
                        {claim.zone}, {claim.city}
                      </p>
                      <p className="text-xs text-slate-500">{formatDate(claim.created_at)}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Trigger value: {claim.trigger_value ?? '-'} | Disruption: {claim.disruption_hours}h
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Payout</p>
                      <p className="text-2xl font-bold text-slate-900">{formatInr(claim.payout_amount)}</p>
                      <p className="text-xs text-slate-500">Paid at: {formatDate(claim.paid_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Status</p>
                      <div className="mt-1">
                        <ClaimStatusBadge status={claim.status} />
                      </div>
                      {claim.razorpay_ref ? <p className="mt-2 text-xs text-slate-500">Ref: {claim.razorpay_ref}</p> : null}
                    </div>
                    <div>
                      <FraudScoreBar score={claim.fraud_score || 0} />
                    </div>
                  </div>
                </div>
              ))}

              {data.claims.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
                  No claims yet.
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </AuthGuard>
  );
}
