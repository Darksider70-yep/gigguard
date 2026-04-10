'use client';

import { useMemo } from 'react';
import AuthGuard from '@/components/AuthGuard';
import InsurerNav from '@/components/layout/InsurerNav';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { api } from '@/lib/api';
import { InsurerDashboardResponse, ShadowComparisonResponse } from '@/lib/types';

interface AnalyticsBundle {
  dashboard: InsurerDashboardResponse;
  shadow: ShadowComparisonResponse;
}
const INR = '\u20B9';

function statusText(lossRatioPct: number): string {
  if (lossRatioPct < 65) return 'On target';
  if (lossRatioPct <= 80) return 'Watch zone';
  return 'Above target';
}

export default function InsurerAnalyticsPage() {
  const { data, loading, error } = useDataRefresh<AnalyticsBundle>(
    async () => {
      const [dashboard, shadow] = await Promise.all([api.getInsurerDashboard(), api.getShadowComparison()]);
      return { dashboard, shadow };
    },
    30000,
    true
  );

  const lossRatioPct = Math.round((data?.dashboard.stats.loss_ratio ?? 0) * 100);
  const needleColor = lossRatioPct > 80 ? '#ef4444' : lossRatioPct >= 65 ? '#f59e0b' : '#10b981';

  const distribution = useMemo(() => {
    const base = data?.dashboard.stats.average_premium ?? 50;
    return Array.from({ length: 7 }).map((_, index) => Math.max(20, Math.round(base * (0.78 + index * 0.05))));
  }, [data]);

  const maxDistribution = Math.max(...distribution, 1);

  return (
    <AuthGuard allowedRoles={['insurer']}>
      <InsurerNav title="Analytics" subtitle="Loss ratio, premium distribution, and RL shadow insights." />

      {loading ? <div className="skeleton h-64 rounded-xl" /> : null}
      {error ? <div className="surface-card border-rose-500/40 p-4 text-rose-300">{error}</div> : null}

      {!loading && !error && data ? (
        <div className="space-y-5">
          <section className="surface-card p-5">
            <h2 className="text-xl font-semibold">Loss ratio gauge</h2>
            <div className="mt-4 flex items-end gap-8">
              <div className="relative h-[180px] w-[360px] overflow-hidden rounded-t-full border border-slate-700 bg-slate-900/60">
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'conic-gradient(from 180deg, #10b981 0deg, #10b981 117deg, #f59e0b 117deg, #f59e0b 144deg, #ef4444 144deg, #ef4444 180deg, transparent 180deg)',
                    borderRadius: '999px 999px 0 0',
                  }}
                />
                <div className="absolute left-1/2 top-full h-[150px] w-[2px] origin-top -translate-x-1/2"
                  style={{
                    background: needleColor,
                    transform: `translateX(-50%) rotate(${-90 + (lossRatioPct / 100) * 180}deg)`,
                    transition: 'transform 900ms ease',
                  }}
                />
              </div>
              <div>
                <p className="font-mono-data text-4xl text-amber-300">{lossRatioPct}%</p>
                <p className="text-sm text-secondary">{statusText(lossRatioPct)}</p>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-5">
            <div className="surface-card p-5">
              <h3 className="text-lg font-semibold">Premium distribution (7 days)</h3>
              <div className="mt-4 flex h-48 items-end gap-3">
                {distribution.map((value, index) => (
                  <div key={index} className="group flex-1">
                    <div
                      className="rounded-t bg-amber-400/80 transition hover:bg-amber-300"
                      style={{ height: `${Math.round((value / maxDistribution) * 100)}%` }}
                      title={`${INR}${value}`}
                    />
                    <p className="mt-2 text-center text-xs text-secondary">D{index + 1}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface-card p-5">
              <h3 className="text-lg font-semibold">Shadow comparison</h3>
              <div className="mt-4 space-y-2 text-sm text-secondary">
                <p>
                  Formula premium: <span className="font-mono-data text-white">{`${INR}${Math.round(data.shadow.mean_formula_premium)}`}</span>
                </p>
                <p>
                  RL premium: <span className="font-mono-data text-white">{`${INR}${Math.round(data.shadow.mean_rl_premium)}`}</span>
                </p>
                <p>
                  Delta: <span className="font-mono-data text-amber-300">{`${INR}${Math.round(data.shadow.avg_delta)} avg`}</span>
                </p>
                <p>
                  RL Premium Engine Status:{' '}
                  <span className="status-pill badge-processing">Shadow Mode</span>
                </p>
                <p>
                  Comparisons logged:{' '}
                  <span className="font-mono-data text-white">{data.shadow.total_logged.toLocaleString('en-IN')}</span>
                </p>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </AuthGuard>
  );
}

