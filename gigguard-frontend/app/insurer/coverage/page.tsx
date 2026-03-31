'use client';

import { useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import InsurerNav from '@/components/layout/InsurerNav';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { api } from '@/lib/api';
import { ZoneRiskMatrixResponse } from '@/lib/types';

interface CityGroup {
  city: string;
  zones: ZoneRiskMatrixResponse['zones'];
}

function riskClass(multiplier: number): string {
  if (multiplier > 1.2) return 'bg-rose-500/20 text-rose-200';
  if (multiplier >= 1.0) return 'bg-amber-500/20 text-amber-200';
  return 'bg-emerald-500/20 text-emerald-200';
}

export default function InsurerCoveragePage() {
  const [expandedCity, setExpandedCity] = useState<string | null>(null);

  const { data, loading, error } = useDataRefresh(async () => api.getZoneRiskMatrix(), 30000, true);

  const groups = useMemo(() => {
    const byCity = new Map<string, ZoneRiskMatrixResponse['zones']>();

    (data?.zones ?? []).forEach((zone) => {
      const key = zone.city.toLowerCase();
      const existing = byCity.get(key) ?? [];
      existing.push(zone);
      byCity.set(key, existing);
    });

    return Array.from(byCity.entries()).map(([city, zones]) => ({ city, zones } as CityGroup));
  }, [data]);

  return (
    <AuthGuard allowedRoles={['insurer']}>
      <InsurerNav title="Coverage" subtitle="City and zone risk coverage across active operations." />

      {loading ? <div className="skeleton h-64 rounded-xl" /> : null}
      {error ? <div className="surface-card border-rose-500/40 p-4 text-rose-300">{error}</div> : null}

      {!loading && !error ? (
        <div className="space-y-5">
          <section className="grid grid-cols-3 gap-4">
            {groups.map((group) => {
              const avgMultiplier = group.zones.reduce((sum, item) => sum + item.zone_multiplier, 0) / group.zones.length;
              const totalWorkers = group.zones.reduce((sum, item) => sum + (item.worker_count ?? 0), 0);

              return (
                <button
                  key={group.city}
                  type="button"
                  className="surface-card card-interactive p-4 text-left"
                  onClick={() => setExpandedCity((prev) => (prev === group.city ? null : group.city))}
                >
                  <p className="text-xl font-semibold capitalize">{group.city}</p>
                  <p className="mt-1 text-sm text-secondary">{group.zones.length} zones</p>
                  <p className="text-sm text-secondary">{totalWorkers} active workers</p>
                  <p className="mt-2 text-sm">
                    <span className={`status-pill ${riskClass(avgMultiplier)}`}>Risk {avgMultiplier.toFixed(2)}x</span>
                  </p>
                </button>
              );
            })}
          </section>

          {expandedCity ? (
            <section className="surface-card p-4">
              <h3 className="text-lg font-semibold capitalize">{expandedCity} zone details</h3>
              <table className="mt-3 w-full text-sm">
                <thead className="text-xs uppercase tracking-[0.08em] text-muted">
                  <tr>
                    <th className="px-2 py-2 text-left">Zone</th>
                    <th className="px-2 py-2 text-left">Multiplier</th>
                    <th className="px-2 py-2 text-left">Workers</th>
                    <th className="px-2 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {groups
                    .find((group) => group.city === expandedCity)
                    ?.zones.map((zone) => (
                      <tr key={`${zone.city}_${zone.zone}`} className="border-t border-slate-800">
                        <td className="px-2 py-2">{zone.zone}</td>
                        <td className="px-2 py-2">
                          <span className={`status-pill ${riskClass(zone.zone_multiplier)}`}>×{zone.zone_multiplier.toFixed(2)}</span>
                        </td>
                        <td className="px-2 py-2 font-mono-data">{zone.worker_count ?? 0}</td>
                        <td className="px-2 py-2 text-secondary">
                          {(zone.worker_count ?? 0) > 0 ? 'Active monitoring ?' : 'No active policies'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </div>
      ) : null}
    </AuthGuard>
  );
}

