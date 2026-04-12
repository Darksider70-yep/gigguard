'use client';

import { useEffect, useState } from 'react';
import { ClaimsResponse, PolicyHistoryResponse, WorkerProfile } from '@/lib/types';
import BCSGauge from './BCSGauge';
import { api } from '@/lib/api';

interface WorkerSlideOverProps {
  open: boolean;
  onClose: () => void;
  worker: WorkerProfile | null;
}

type TabKey = 'overview' | 'policies' | 'claims' | 'risk';
const INR = '\u20B9';

export default function WorkerSlideOver({
  open,
  onClose,
  worker,
}: WorkerSlideOverProps) {
  const [tab, setTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(false);
  const [policies, setPolicies] = useState<PolicyHistoryResponse['policies']>([]);
  const [claims, setClaims] = useState<ClaimsResponse['claims']>([]);

  const tabs: TabKey[] = ['overview', 'policies', 'claims', 'risk'];

  useEffect(() => {
    if (!worker?.id || !open) {
      setPolicies([]);
      setClaims([]);
      return;
    }

    let active = true;
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const [pRes, cRes] = await Promise.all([
          api.getWorkerPolicies(worker.id),
          api.getWorkerClaims(worker.id)
        ]);
        if (!active) return;
        setPolicies(pRes.policies);
        setClaims(cRes.claims);
      } catch (err) {
        console.error('Failed to fetch worker history:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchHistory();
    return () => { active = false; };
  }, [worker?.id, open]);

  const riskScore = Math.round(Math.min(100, ((worker?.zone_multiplier ?? 1) / 1.6) * 100));

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-950/55 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed right-0 top-0 z-50 h-full w-[440px] border-l border-slate-700 bg-[var(--bg-surface)] p-5 transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">{worker?.name ?? 'Worker details'}</h3>
            <p className="text-sm text-secondary">{worker?.platform ?? '-'} • {worker?.zone ?? '-'}</p>
          </div>
          <button onClick={onClose} className="text-sm text-secondary hover:text-white" type="button">
            Close
          </button>
        </div>

        <div className="mt-4 grid grid-cols-4 rounded-lg bg-slate-900/60 p-1 text-xs">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              className={`rounded-md px-2 py-1.5 uppercase tracking-wide ${
                tab === item ? 'bg-amber-500/20 text-amber-300' : 'text-secondary hover:text-white'
              }`}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3 text-sm text-secondary">
          {loading ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2">
              <span className="loading-spinner h-8 w-8 text-amber-500/50" />
              <p className="text-secondary animate-pulse italic">Fetching historical records...</p>
            </div>
          ) : tab === 'overview' ? (
            <>
              <p>
                City: <span className="text-white">{worker?.city ?? '-'}</span>
              </p>
              <p>
                Daily Earning:{' '}
                <span className="font-mono-data text-white">{`${INR}${Math.round(worker?.avg_daily_earning ?? 0)}`}</span>
              </p>
              <p>
                Zone Multiplier:{' '}
                <span className="font-mono-data text-white">×{(worker?.zone_multiplier ?? 1).toFixed(2)}</span>
              </p>
              <p>
                Member Since:{' '}
                <span className="text-white">
                  {worker?.created_at ? new Date(worker.created_at).toLocaleDateString('en-IN') : '-'}
                </span>
              </p>
            </>
          ) : null}

          {tab === 'policies' ? (
            <div className="space-y-2">
              {policies.length === 0 ? <p>No policy history.</p> : null}
              {policies.map((policy) => (
                <div key={policy.id} className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                  <p className="font-mono-data text-xs text-amber-200">{policy.id.slice(0, 8)}</p>
                  <p>
                    {policy.week_start} ? {policy.week_end}
                  </p>
                  <p className="font-mono-data">
                    {`${INR}${Math.round(policy.premium_paid)} / ${INR}${Math.round(policy.coverage_amount)}`}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {tab === 'claims' ? (
            <div className="space-y-2">
              {claims.length === 0 ? <p>No claims found.</p> : null}
              {claims.map((claim) => (
                <div key={claim.id} className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                  <p>
                    {claim.trigger_type} • {claim.status}
                  </p>
                  <p className="font-mono-data">{`${INR}${Math.round(claim.payout_amount)}`}</p>
                </div>
              ))}
            </div>
          ) : null}

          {tab === 'risk' ? (
            <div className="flex items-start gap-4">
              <BCSGauge score={riskScore} size="md" />
              <div className="space-y-1">
                <p className="text-white">Behavioral score proxy</p>
                <p>Zone risk multiplier drives this preview.</p>
                <p className="font-mono-data text-xs">fraud_score stream visible on claims</p>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}

