'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import AuthGuard from '@/components/AuthGuard';
import InsurerNav from '@/components/layout/InsurerNav';
import { api } from '@/lib/api';
import { InsurerPayoutsResponse } from '@/lib/types';

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatInr(value: number): string {
  return `\u20B9${Math.round(value).toLocaleString('en-IN')}`;
}

export default function InsurerPayoutsPage() {
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [data, setData] = useState<InsurerPayoutsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        const currentMonth = monthKey(monthCursor);
        const payload = await api.getInsurerPayouts({
          month: currentMonth,
          page: 1,
          limit: 100,
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
        setError(err instanceof Error ? err.message : 'Failed to load payouts');
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
  }, [monthCursor]);

  const payouts = data?.payouts ?? [];
  const averagePayout = payouts.length > 0 ? Math.round((data?.total_amount ?? 0) / payouts.length) : 0;

  const cityBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    payouts.forEach((payout) => {
      totals.set(payout.city, (totals.get(payout.city) ?? 0) + payout.amount);
    });

    const rows = Array.from(totals.entries()).map(([city, total]) => ({ city, total }));
    rows.sort((a, b) => b.total - a.total);
    return rows;
  }, [payouts]);

  const maxCity = cityBreakdown[0]?.total ?? 1;

  return (
    <AuthGuard allowedRoles={['insurer']}>
      <InsurerNav title="Payouts" subtitle="Monthly disbursement timeline and city distribution." />

      <section className="surface-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-secondary">Total paid this month</p>
            <p className="font-mono-data text-4xl text-amber-300">{formatInr(data?.total_amount ?? 0)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-slate-700 px-3 py-1 text-sm text-secondary"
              onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
            >
              {'<'}
            </button>
            <span className="font-mono-data text-sm">{monthKey(monthCursor)}</span>
            <button
              type="button"
              className="rounded border border-slate-700 px-3 py-1 text-sm text-secondary"
              onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
            >
              {'>'}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">Count: <span className="font-mono-data">{data?.total ?? 0}</span></div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">Average: <span className="font-mono-data">{formatInr(averagePayout)}</span></div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">Processed: <span className="font-mono-data">{payouts.filter((p) => p.status === 'paid').length}</span></div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-5 gap-5">
        <div className="surface-card col-span-3 p-4">
          <h3 className="text-lg font-semibold">Payout timeline</h3>
          {loading ? <div className="skeleton mt-3 h-64 rounded-xl" /> : null}
          {error ? <div className="mt-3 rounded-lg border border-rose-500/40 p-3 text-sm text-rose-300">{error}</div> : null}

          {!loading && !error ? (
            <div className="mt-4 space-y-3">
              {payouts.map((payout) => (
                <div key={payout.id} className="rounded-lg border border-slate-700 bg-slate-900/45 p-3">
                  <div className="grid grid-cols-[0.9fr_1.5fr_1fr] gap-3">
                    <div className="text-xs text-secondary">{new Date(payout.created_at).toLocaleString('en-IN')}</div>
                    <div>
                      <p>{payout.worker_name}</p>
                      <p className="text-xs text-secondary">{payout.trigger_type} • {payout.zone}</p>
                      <p className="font-mono-data text-xs text-muted">{payout.razorpay_payout_id ?? '-'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono-data text-xl text-amber-300">{formatInr(payout.amount)}</p>
                      <span className="status-pill badge-paid">{payout.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="surface-card col-span-2 p-4">
          <h3 className="text-lg font-semibold">City breakdown</h3>
          <div className="mt-4 space-y-3">
            {cityBreakdown.map((row, index) => (
              <div key={row.city}>
                <div className="mb-1 flex justify-between text-xs text-secondary">
                  <span>{row.city}</span>
                  <span>{formatInr(row.total)}</span>
                </div>
                <div className="h-3 rounded bg-slate-800">
                  <motion.div
                    className="h-3 rounded"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round((row.total / maxCity) * 100)}%` }}
                    transition={{ duration: 0.8, ease: "easeOut", delay: index * 0.1 }}
                    style={{
                      background: ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#fef3c7'][index % 5],
                    }}
                  />
                </div>
              </div>
            ))}
            {cityBreakdown.length === 0 ? <p className="text-sm text-secondary">No payouts for selected month.</p> : null}
          </div>
        </div>
      </section>
    </AuthGuard>
  );
}

