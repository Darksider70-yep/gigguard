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

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Premium Distribution - Redesigned */}
            <div className="surface-card p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold opacity-90">Premium distribution</h3>
                <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 border border-emerald-500/20">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Live Feed</span>
                </div>
              </div>
              
              <div className="flex items-baseline gap-2 mb-6">
                <span className="text-2xl font-mono-data font-bold">
                  {INR}{distribution.reduce((acc, curr) => acc + curr.total, 0).toLocaleString('en-IN')}
                </span>
                <span className="text-xs text-secondary opacity-70">Total weekly revenue</span>
              </div>

              <div className="relative mt-4 flex h-48 items-end gap-2 px-1">
                {distribution.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center opacity-40">
                    <div className="h-10 w-10 rounded-full border-2 border-dashed border-slate-500 animate-spin mb-3" />
                    <p className="text-xs">Initial sync in progress...</p>
                  </div>
                ) : (
                  distribution.map((d, index) => (
                    <div key={index} className="group relative flex-1 flex flex-col items-center justify-end h-full">
                      {/* Hover Tooltip */}
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-[10px] px-2 py-1 rounded border border-slate-700 pointer-events-none z-10 whitespace-nowrap">
                        {INR}{d.total.toLocaleString()}
                      </div>
                      
                      {/* Bar with Glow */}
                      <div
                        className="w-full rounded-t-sm bg-gradient-to-t from-amber-500/80 to-amber-300 transform transition-all duration-500 group-hover:scale-x-110 group-hover:from-amber-400 group-hover:to-amber-200"
                        style={{ height: `${Math.max((d.total / maxDistribution) * 100, 2)}%` }}
                      >
                         <div className="h-full w-full bg-white/10 opacity-0 group-hover:opacity-100" />
                      </div>
                      
                      {/* Label */}
                      <p className="mt-3 text-[10px] font-medium text-secondary group-hover:text-white transition-colors">
                        {new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  ))
                )}
                {/* Horizontal Grid Lines */}
                <div className="absolute inset-0 -z-10 flex flex-col justify-between py-1 opacity-10">
                  <div className="h-px w-full bg-slate-500" />
                  <div className="h-px w-full bg-slate-500" />
                  <div className="h-px w-full bg-slate-500" />
                </div>
              </div>
            </div>

            {/* Shadow Comparison - Redesigned */}
            <div className="surface-card p-6 border-l-4 border-l-indigo-500">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold opacity-90 text-indigo-100">AI Pricing Shadow</h3>
                  <p className="text-[10px] text-secondary tracking-wide uppercase opacity-70">Agentic RL vs. Actuarial Formula</p>
                </div>
                <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 relative">
                 {/* Connect Line */}
                <div className="absolute left-1/2 top-4 bottom-4 w-px bg-slate-700/50 -translate-x-1/2 hidden sm:block" />

                <div className="space-y-1">
                  <p className="text-[10px] text-secondary uppercase tracking-tighter">Traditional</p>
                  <p className="text-xl font-mono-data font-semibold text-slate-300">
                    {INR}{Math.round(data.shadow.mean_formula_premium ?? 0)}
                  </p>
                </div>

                <div className="text-right space-y-1">
                  <p className="text-[10px] text-indigo-400 uppercase tracking-tighter font-bold">AI Agentic</p>
                  <p className="text-xl font-mono-data font-bold text-indigo-200">
                    {INR}{Math.round(data.shadow.mean_rl_premium ?? 0)}
                  </p>
                </div>

                <div className="col-span-2 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-secondary">Pricing Efficiency Improvement</span>
                    <span className="text-sm font-bold text-emerald-400">
                      +{Math.round(((data.shadow.mean_formula_premium - data.shadow.mean_rl_premium) / data.shadow.mean_formula_premium) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
                     <div 
                        className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-all duration-1000"
                        style={{ width: `${Math.min(100, (data.shadow.mean_formula_premium / data.shadow.mean_rl_premium) * 50)}%` }}
                     />
                  </div>
                </div>

                <div className="col-span-2 grid grid-cols-2 gap-3">
                   <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 shadow-inner">
                      <p className="text-[9px] text-secondary uppercase opacity-60">Status</p>
                      <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5 mt-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Shadow Mode
                      </p>
                   </div>
                   <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 shadow-inner text-right">
                      <p className="text-[9px] text-secondary uppercase opacity-60">Verification Cycle</p>
                      <p className="text-xs font-mono-data text-white mt-0.5">
                        Tier {(data.shadow.total_logged ?? 0) > 10 ? 'Sigma' : 'Beta'}
                      </p>
                   </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </AuthGuard>
  );
}

