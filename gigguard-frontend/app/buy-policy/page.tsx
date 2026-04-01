'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, ShieldCheck, TrendingUp } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import { APIError, api } from '@/lib/api';
import { PremiumQuoteResponse, WorkerProfile } from '@/lib/types';
const INR = '\u20B9';

export default function BuyPolicyStepOnePage() {
  const router = useRouter();
  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [quote, setQuote] = useState<PremiumQuoteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [workerResponse, quoteResponse] = await Promise.all([api.getMe(), api.getPremiumQuote()]);
        if (!active) {
          return;
        }

        if (quoteResponse.has_active_policy) {
          sessionStorage.setItem('gigguard_flash', 'You already have an active policy this week.');
          router.replace('/dashboard');
          return;
        }

        setWorker(workerResponse);
        setQuote(quoteResponse);
        setError(null);
      } catch (err) {
        if (!active) {
          return;
        }
        if (err instanceof APIError && err.status === 0) {
          setError('Network unavailable. Check backend connectivity.');
        } else {
          setError('Unable to fetch quote details right now.');
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
  }, [router]);

  const continueToQuote = () => {
    if (!worker || !quote) {
      return;
    }

    sessionStorage.setItem('buy_policy_worker', JSON.stringify(worker));
    sessionStorage.setItem('buy_policy_quote', JSON.stringify(quote));
    router.push('/buy-policy/quote');
  };

  return (
    <AuthGuard allowedRoles={['worker']}>
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-20 rounded-xl" />
          <div className="skeleton h-[420px] rounded-xl" />
        </div>
      ) : error ? (
        <div className="surface-card border-rose-500/40 p-4 text-rose-300">{error}</div>
      ) : worker && quote ? (
        <div className="space-y-5">
          <h1 className="text-3xl font-semibold">Buy policy</h1>
          <div className="grid grid-cols-5 gap-5">
            <section className="surface-card col-span-2 p-5">
              <div className="flex items-center gap-4">
                <img
                  className="h-20 w-20 rounded-xl border border-slate-700 bg-slate-900"
                  src={`https://api.dicebear.com/8.x/pixel-art/svg?seed=${worker.id}`}
                  alt="Worker avatar"
                />
                <div>
                  <h2 className="text-2xl font-semibold">{worker.name}</h2>
                  <span className="status-pill mt-1 inline-block bg-amber-500/15 text-amber-300">{worker.platform}</span>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm text-secondary">
                <p className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-amber-300" />{worker.zone}, {worker.city}</p>
                <p className="inline-flex items-center gap-2"><TrendingUp className="h-4 w-4 text-amber-300" />{`${INR}${Math.round(worker.avg_daily_earning)} avg/day`}</p>
                <p className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" />Zone monitoring active</p>
              </div>
            </section>

            <section className="surface-card col-span-3 p-5">
              <h3 className="text-xl font-semibold">What you are buying</h3>
              <p className="mt-1 text-sm text-secondary">Coverage preview for all trigger types in your active zone.</p>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-slate-700 bg-slate-900/45 p-3">Heavy Rainfall <span className="font-mono-data float-right">{`${INR}${quote.coverage.heavy_rainfall}`}</span></div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/45 p-3">Extreme Heat <span className="font-mono-data float-right">{`${INR}${quote.coverage.extreme_heat}`}</span></div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/45 p-3">Flood Alert <span className="font-mono-data float-right">{`${INR}${quote.coverage.flood_red_alert}`}</span></div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/45 p-3">Severe AQI <span className="font-mono-data float-right">{`${INR}${quote.coverage.severe_aqi}`}</span></div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/45 p-3 col-span-2">Curfew/Strike <span className="font-mono-data float-right">{`${INR}${quote.coverage.curfew_strike}`}</span></div>
              </div>

              <div className="mt-4 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                Active in your zone right now • live trigger monitoring enabled
              </div>

              <button
                type="button"
                onClick={continueToQuote}
                className="btn-saffron mt-5 inline-flex w-full items-center justify-center gap-2 px-5 py-3"
              >
                {'Calculate My Premium ->'}
              </button>
            </section>
          </div>
        </div>
      ) : null}
    </AuthGuard>
  );
}

