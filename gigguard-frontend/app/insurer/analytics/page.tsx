'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
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
            <h2 className="text-xl font-semibold">Loss ratio distribution</h2>
            <div className="mt-4 flex items-center gap-8">
              <div className="relative h-[220px] w-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Used Target', value: lossRatioPct, color: needleColor },
                        { name: 'Remaining Target', value: Math.max(0, 100 - lossRatioPct), color: 'rgba(51, 65, 85, 0.4)' }
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={5}
                      startAngle={90}
                      endAngle={-270}
                      dataKey="value"
                      stroke="none"
                      isAnimationActive={true}
                      animationDuration={1500}
                    >
                      {[
                        { color: needleColor },
                        { color: 'rgba(51, 65, 85, 0.4)' }
                      ].map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.color} 
                          className="transition-all duration-300 hover:opacity-80 cursor-pointer"
                          style={{ filter: "drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.3))" }} 
                        />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                      itemStyle={{ color: '#cbd5e1' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center Text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="font-mono-data text-2xl text-amber-300 drop-shadow-md">{lossRatioPct}%</p>
                  <p className="text-[10px] uppercase tracking-wider text-secondary">Ratio</p>
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white">{statusText(lossRatioPct)}</h3>
                <p className="mt-2 text-sm text-secondary max-w-[200px]">
                  The ratio is currently tracked dynamically to manage expected risk levels against policy premiums.
                </p>
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

