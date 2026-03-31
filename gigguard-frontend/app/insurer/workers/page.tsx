'use client';

import { useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import InsurerNav from '@/components/layout/InsurerNav';
import WorkerSlideOver from '@/components/ui/WorkerSlideOver';
import { api } from '@/lib/api';
import { InsurerWorkersResponse, WorkerProfile } from '@/lib/types';

const CITY_FILTERS = ['all', 'mumbai', 'delhi', 'chennai', 'bangalore', 'hyderabad'];
const PLATFORM_FILTERS = ['all', 'zomato', 'swiggy'];

export default function InsurerWorkersPage() {
  const [data, setData] = useState<InsurerWorkersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [selected, setSelected] = useState<WorkerProfile | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        const payload = await api.getInsurerWorkers({
          page: 1,
          limit: 100,
          city: city === 'all' ? undefined : city,
          platform: platform === 'all' ? undefined : platform,
          search: search.trim() || undefined,
        });
        if (!active) {
          return;
        }

        setData(payload);
        setError(null);
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to fetch workers');
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
  }, [search, city, platform]);

  const workers = useMemo(() => data?.workers ?? [], [data]);

  return (
    <AuthGuard allowedRoles={['insurer']}>
      <InsurerNav title="Workers" subtitle="Search by name, city, zone, or platform." />

      <section className="surface-card p-4">
        <div className="flex items-center gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-80 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm outline-none"
            placeholder="Search worker / zone / city"
          />

          <div className="flex gap-2">
            {PLATFORM_FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPlatform(item)}
                className={`rounded-full px-3 py-1 text-xs ${platform === item ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-900 text-secondary'}`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {CITY_FILTERS.slice(0, 4).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCity(item)}
                className={`rounded-full px-3 py-1 text-xs ${city === item ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-900 text-secondary'}`}
              >
                {item}
              </button>
            ))}
          </div>

          <span className="ml-auto text-sm text-secondary">Total: {data?.total ?? 0}</span>
        </div>

        {loading ? <div className="skeleton mt-4 h-56 rounded-xl" /> : null}
        {error ? <div className="mt-4 rounded-lg border border-rose-500/40 p-3 text-sm text-rose-300">{error}</div> : null}

        {!loading && !error ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-[0.1em] text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Platform</th>
                  <th className="px-3 py-2 text-left">City / Zone</th>
                  <th className="px-3 py-2 text-left">Avg Earning</th>
                  <th className="px-3 py-2 text-left">Risk</th>
                  <th className="px-3 py-2 text-left">Member Since</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((worker) => {
                  const risk = Math.min(100, Math.round((worker.zone_multiplier / 1.6) * 100));
                  return (
                    <tr
                      key={worker.id}
                      className="table-row-hover cursor-pointer border-t border-slate-800"
                      onClick={() => setSelected(worker)}
                    >
                      <td className="px-3 py-3">{worker.name}</td>
                      <td className="px-3 py-3">
                        <span className={`status-pill ${worker.platform === 'zomato' ? 'bg-rose-500/15 text-rose-200' : 'bg-amber-500/15 text-amber-200'}`}>
                          {worker.platform}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-secondary">{worker.city}, {worker.zone ?? '-'}</td>
                      <td className="px-3 py-3 font-mono-data">?{Math.round(worker.avg_daily_earning)}</td>
                      <td className="px-3 py-3">
                        <div className="h-2 w-28 rounded bg-slate-800">
                          <div
                            className="h-2 rounded"
                            style={{
                              width: `${risk}%`,
                              background: risk > 70 ? '#ef4444' : risk > 45 ? '#f59e0b' : '#10b981',
                            }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-secondary">
                        {new Date(worker.created_at).toLocaleDateString('en-IN', {
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <WorkerSlideOver open={Boolean(selected)} onClose={() => setSelected(null)} worker={selected} />
    </AuthGuard>
  );
}

