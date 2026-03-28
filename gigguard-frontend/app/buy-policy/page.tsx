'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { api, APIError } from '@/lib/api';
import { PremiumQuoteResponse, WorkerProfile } from '@/lib/types';

function SkeletonRow() {
  return <div className="h-10 animate-pulse rounded bg-slate-200" />;
}

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
        if (!active) return;

        if (quoteResponse.has_active_policy) {
          sessionStorage.setItem('gigguard_flash', 'You already have an active policy this week.');
          router.replace('/dashboard');
          return;
        }

        setWorker(workerResponse);
        setQuote(quoteResponse);
      } catch (err) {
        if (!active) return;
        if (err instanceof APIError && err.status === 0) {
          setError('Check your connection.');
        } else {
          setError('Something went wrong. Please try again.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

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
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-bold text-slate-900">Buy Policy</h1>

        {loading ? (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700">{error}</div>
        ) : worker && quote ? (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Confirm your details</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded bg-slate-50 p-3 text-sm">
                <p className="text-slate-500">Name</p>
                <p className="font-semibold text-slate-900">{worker.name}</p>
              </div>
              <div className="rounded bg-slate-50 p-3 text-sm">
                <p className="text-slate-500">Platform</p>
                <p className="font-semibold text-slate-900">{worker.platform}</p>
              </div>
              <div className="rounded bg-slate-50 p-3 text-sm">
                <p className="text-slate-500">Location</p>
                <p className="font-semibold text-slate-900">{worker.zone || quote.worker.zone}, {worker.city}</p>
              </div>
              <div className="rounded bg-slate-50 p-3 text-sm">
                <p className="text-slate-500">Avg daily earning</p>
                <p className="font-semibold text-slate-900">INR {Math.round(worker.avg_daily_earning || 0)}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={continueToQuote}
              className="w-full rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white hover:bg-sky-700"
            >
              Continue to quote
            </button>
          </div>
        ) : null}
      </div>
    </AuthGuard>
  );
}
