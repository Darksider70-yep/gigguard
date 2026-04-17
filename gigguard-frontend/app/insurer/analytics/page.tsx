'use client';

import { useMemo } from 'react';
import AuthGuard from '@/components/AuthGuard';
import InsurerNav from '@/components/layout/InsurerNav';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { api } from '@/lib/api';
import { InsurerDashboardResponse, PremiumDistributionResponse, ShadowComparisonResponse } from '@/lib/types';

interface AnalyticsBundle {
  dashboard: InsurerDashboardResponse;
  shadow: ShadowComparisonResponse;
  distribution: PremiumDistributionResponse;
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
      const [dashboard, shadow, distribution] = await Promise.all([
        api.getInsurerDashboard(),
        api.getShadowComparison(),
        api.getPremiumDistribution(),
      ]);
      return { dashboard, shadow, distribution };
    },
    30000,
    true
  );

  const lossRatioPct = Math.round((data?.dashboard.stats.loss_ratio ?? 0) * 100);
  const needleColor = lossRatioPct > 80 ? '#ef4444' : lossRatioPct >= 65 ? '#f59e0b' : '#10b981';

  const distribution = useMemo(() => {
    return data?.distribution.distribution ?? [];
  }, [data]);

  const maxDistribution = Math.max(...distribution.map(d => d.total), 1);

  return (
    <AuthGuard allowedRoles={['insurer']}>
      <InsurerNav title="Analytics" subtitle="Loss ratio, premium distribution, and RL shadow insights." />

      {loading ? <div className="skeleton h-64 rounded-xl" /> : null}
      {error ? <div className="surface-card border-rose-500/40 p-4 text-rose-300">{error}</div> : null}

      {!loading && !error && data ? (
        <div className="space-y-5">
          <section className="surface-card p-6">
            <h2 className="text-xl font-semibold opacity-90">Loss ratio health</h2>
            <div className="mt-6 flex flex-col items-center justify-center gap-10 md:flex-row md:items-start md:justify-start">
              <div className="relative h-48 w-48">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90 transform">
                  {/* Background Track */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#1e293b"
                    strokeWidth="8"
                    className="opacity-50"
                  />
                  {/* Segments */}
                  {/* Secure: 0-65% */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#10b981"
                    strokeWidth="8"
                    strokeDasharray={`${(65 / 100) * 251.2} 251.2`}
                    className="opacity-20"
                  />
                  {/* Warning: 65-80% */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#f59e0b"
                    strokeWidth="8"
                    strokeDasharray={`${(15 / 100) * 251.2} 251.2`}
                    strokeDashoffset={`${-(65 / 100) * 251.2}`}
                    className="opacity-20"
                  />
                  {/* Danger: 80-100% */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#ef4444"
                    strokeWidth="8"
                    strokeDasharray={`${(20 / 100) * 251.2} 251.2`}
                    strokeDashoffset={`${-(80 / 100) * 251.2}`}
                    className="opacity-20"
                  />
                  
                  {/* Active Value Ring */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke={needleColor}
                    strokeWidth="10"
                    strokeDasharray={`${(lossRatioPct / 100) * 251.2} 251.2`}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 1.2s ease, stroke 0.5s ease' }}
                    className="drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]"
                  />
                </svg>
                
                {/* Center Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-mono-data text-3xl font-bold" style={{ color: needleColor }}>
                    {lossRatioPct}%
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-secondary opacity-80">
                    Loss Ratio
                  </span>
                </div>

                {/* Glow layer */}
                <div 
                  className="absolute inset-2 -z-10 rounded-full opacity-10 blur-2xl"
                  style={{ backgroundColor: needleColor }}
                />
              </div>

              <div className="max-w-xs space-y-4 pt-2">
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-medium text-white">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: needleColor }} />
                    {statusText(lossRatioPct)}
                  </h4>
                  <p className="mt-1 text-xs text-secondary leading-relaxed">
                    The loss ratio represents the percentage of premiums paid out as claims. 
                    GigGuard targets a <span className="text-emerald-400">&lt;65% ratio</span> for sustainable unit economics.
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-800/40 p-3 border border-slate-700/50">
                  <div>
                    <p className="text-[10px] text-secondary uppercase tracking-tight">Total Payouts</p>
                    <p className="font-mono-data text-sm">{INR}{data.dashboard.stats.payouts_this_month.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-secondary uppercase tracking-tight">Active Policies</p>
                    <p className="font-mono-data text-sm">{data.dashboard.stats.active_policies.toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-5">
            <div className="surface-card p-5">
              <h3 className="text-lg font-semibold">Premium distribution (7 days)</h3>
              <div className="mt-4 flex h-48 items-end gap-3">
                {distribution.map((d, index) => (
                  <div key={index} className="group flex-1">
                    <div
                      className="rounded-t bg-amber-400/80 transition hover:bg-amber-300"
                      style={{ height: `${Math.round((d.total / maxDistribution) * 100)}%` }}
                      title={`${INR}${d.total}`}
                    />
                    <p className="mt-2 text-center text-[10px] text-secondary">
                      {new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface-card p-5">
              <h3 className="text-lg font-semibold">Shadow comparison</h3>
              <div className="mt-4 space-y-2 text-sm text-secondary">
                <p>
                  Formula premium: <span className="font-mono-data text-white">{`${INR}${Math.round(data.shadow.mean_formula_premium ?? 0)}`}</span>
                </p>
                <p>
                  RL premium: <span className="font-mono-data text-white">{`${INR}${Math.round(data.shadow.mean_rl_premium ?? 0)}`}</span>
                </p>
                <p>
                  Delta: <span className="font-mono-data text-amber-300">{`${INR}${Math.round(data.shadow.avg_delta ?? 0)} avg`}</span>
                </p>
                <p>
                  RL Premium Engine Status:{' '}
                  <span className="status-pill badge-processing">Shadow Mode</span>
                </p>
                <p>
                  Comparisons logged:{' '}
                  <span className="font-mono-data text-white">{(data.shadow.total_logged ?? 0).toLocaleString('en-IN')}</span>
                </p>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </AuthGuard>
  );
}

