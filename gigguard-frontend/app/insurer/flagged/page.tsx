'use client';

import { useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import InsurerNav from '@/components/layout/InsurerNav';
import BCSGauge from '@/components/ui/BCSGauge';
import { APIError, api } from '@/lib/api';
import { AntiSpoofingAlertsResponse } from '@/lib/types';

type Filter = 'all' | 'tier3' | 'tier2' | 'resolved';

export default function InsurerFlaggedPage() {
  const [alerts, setAlerts] = useState<AntiSpoofingAlertsResponse['alerts']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await api.getAntiSpoofingAlerts();
        if (!active) {
          return;
        }
        setAlerts(response.alerts);
        setError(null);
      } catch (err) {
        if (!active) {
          return;
        }
        if (err instanceof APIError && err.status === 0) {
          setError('Network unavailable');
        } else {
          setError('Failed to fetch flagged claims');
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

  const filtered = useMemo(() => {
    if (filter === 'tier3') return alerts.filter((item) => item.bcs_tier === 3 || item.bcs_score < 40);
    if (filter === 'tier2') return alerts.filter((item) => item.bcs_tier === 2 || (item.bcs_score >= 40 && item.bcs_score < 65));
    if (filter === 'resolved') return [];
    return alerts;
  }, [alerts, filter]);

  const handleApprove = async (claimId: string) => {
    await api.approveClaim(claimId);
    setAlerts((prev) => prev.filter((item) => item.claim_id !== claimId));
  };

  const handleDeny = async (claimId: string) => {
    const reason = window.prompt('Deny reason')?.trim() ?? '';
    if (!reason) {
      return;
    }
    await api.denyClaim(claimId, reason);
    setAlerts((prev) => prev.filter((item) => item.claim_id !== claimId));
  };

  const tier3Count = alerts.filter((item) => item.bcs_score < 40 || item.bcs_tier === 3).length;
  const tier2Count = alerts.filter((item) => item.bcs_score >= 40 && item.bcs_score < 65).length;

  return (
    <AuthGuard allowedRoles={['insurer']}>
      <InsurerNav title="Flagged Claims" subtitle="Behavioral coherence and graph anomaly review queue." />

      <section className="grid grid-cols-4 gap-3">
        <div className="surface-card p-4"><p className="text-xs text-secondary">Tier 3 (BCS &lt; 40)</p><p className="mt-1 font-mono-data text-3xl text-rose-300">{tier3Count}</p></div>
        <div className="surface-card p-4"><p className="text-xs text-secondary">Tier 2 (BCS 40-65)</p><p className="mt-1 font-mono-data text-3xl text-amber-300">{tier2Count}</p></div>
        <div className="surface-card p-4"><p className="text-xs text-secondary">Auto-approved today</p><p className="mt-1 font-mono-data text-3xl text-emerald-300">0</p></div>
        <div className="surface-card p-4"><p className="text-xs text-secondary">Fraud prevented</p><p className="mt-1 font-mono-data text-3xl text-amber-300">?0</p></div>
      </section>

      <section className="surface-card mt-4 p-4">
        <div className="mb-3 flex gap-2 text-xs">
          {(['all', 'tier3', 'tier2', 'resolved'] as Filter[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={`rounded-full px-3 py-1 ${filter === item ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-900 text-secondary'}`}
            >
              {item.toUpperCase()}
            </button>
          ))}
        </div>

        {loading ? <div className="skeleton h-60 rounded-xl" /> : null}
        {error ? <div className="rounded-lg border border-rose-500/40 p-3 text-sm text-rose-300">{error}</div> : null}

        {!loading && !error ? (
          <div className="space-y-3">
            {filtered.map((alert) => (
              <article key={alert.claim_id} className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-4">
                  <div>
                    <p className="text-lg font-semibold">{alert.worker_name}</p>
                    <p className="text-sm text-secondary">{alert.zone}, {alert.city}</p>
                    <p className="mt-1 text-xs text-secondary">Tier {alert.bcs_tier}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <BCSGauge score={alert.bcs_score} size="md" />
                    <p className="text-xs text-secondary">Behavioral Coherence: {alert.bcs_score < 40 ? 'Low' : alert.bcs_score < 65 ? 'Moderate' : 'Strong'}</p>
                  </div>

                  <div>
                    <p className="font-mono-data text-2xl">?{Math.round(alert.payout_amount)}</p>
                    <p className="text-xs text-secondary">{alert.trigger_type}</p>
                    <p className="text-xs text-muted">{new Date(alert.created_at).toLocaleString('en-IN')}</p>
                  </div>
                </div>

                <ul className="mt-3 list-disc pl-6 text-sm text-secondary">
                  {alert.graph_flags.map((flag) => (
                    <li key={`${alert.claim_id}_${flag}`}>{flag}</li>
                  ))}
                </ul>

                <div className="mt-4 flex gap-2">
                  <button onClick={() => void handleApprove(alert.claim_id)} className="rounded bg-emerald-500/20 px-3 py-1.5 text-xs text-emerald-200" type="button">Approve Claim</button>
                  <button onClick={() => void handleDeny(alert.claim_id)} className="rounded bg-rose-500/20 px-3 py-1.5 text-xs text-rose-200" type="button">Deny Claim</button>
                </div>
              </article>
            ))}
            {filtered.length === 0 ? <p className="text-sm text-secondary">No claims in selected filter.</p> : null}
          </div>
        ) : null}
      </section>
    </AuthGuard>
  );
}

