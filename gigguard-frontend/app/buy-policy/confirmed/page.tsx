'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import ConfettiOnce from '@/components/ui/ConfettiOnce';

interface PurchaseConfirmationState {
  policy_id: string;
  policy: {
    id: string;
    week_start: string;
    week_end: string;
    premium_paid: number;
    coverage_amount: number;
    status: string;
    razorpay_payment_id: string;
  };
  message: string;
  zone?: string;
  city?: string;
}

export default function BuyPolicyConfirmedPage() {
  const router = useRouter();
  const [data, setData] = useState<PurchaseConfirmationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem('buy_policy_purchase');
    if (!raw) {
      router.replace('/buy-policy');
      return;
    }

    const parsed = JSON.parse(raw) as PurchaseConfirmationState;
    setData(parsed);
    setLoading(false);
  }, [router]);

  const copyPolicyId = async () => {
    if (!data) {
      return;
    }

    try {
      await navigator.clipboard.writeText(data.policy_id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <AuthGuard allowedRoles={['worker']}>
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-24 rounded-xl" />
          <div className="skeleton h-96 rounded-xl" />
        </div>
      ) : data ? (
        <div className="space-y-5">
          <section className="surface-card relative overflow-hidden p-8 text-center">
            <ConfettiOnce active />
            <div className="mx-auto h-24 w-24">
              <svg viewBox="0 0 100 100" className="h-full w-full">
                <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(16,185,129,0.35)" strokeWidth="6" />
                <path
                  d="M30 52 L44 66 L72 38"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ strokeDasharray: 120, strokeDashoffset: 0, animation: 'fadeInUp 700ms ease' }}
                />
              </svg>
            </div>
            <h1 className="mt-3 text-4xl font-semibold text-emerald-300">Policy Active!</h1>
            <p className="mt-2 text-secondary">Your coverage is now live for this week.</p>
          </section>

          <section className="surface-card relative overflow-hidden border-2 border-double border-amber-500/45 p-6">
            <div className="absolute right-4 top-4 text-6xl font-bold text-amber-500/10">GG</div>
            <p className="text-xs uppercase tracking-[0.24em] text-amber-200">GigGuard Policy Certificate</p>
            <p className="mt-2 font-mono-data text-lg text-amber-300">{data.policy_id}</p>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                Week<br />
                <span className="font-mono-data">{data.policy.week_start} ? {data.policy.week_end}</span>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                Premium<br />
                <span className="font-mono-data">?{Math.round(data.policy.premium_paid)}</span>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                Coverage<br />
                <span className="font-mono-data">?{Math.round(data.policy.coverage_amount)}</span>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                Razorpay Ref<br />
                <span className="font-mono-data text-xs">{data.policy.razorpay_payment_id}</span>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 col-span-2">
                Zone<br />
                <span className="font-mono-data">{data.zone ?? '-'}, {data.city ?? '-'}</span>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button onClick={copyPolicyId} type="button" className="btn-saffron px-4 py-2 text-sm">
                Share Policy ID
              </button>
              {copied ? <span className="text-sm text-emerald-300">Copied ?</span> : null}
            </div>
          </section>

          <button type="button" onClick={() => router.push('/dashboard')} className="btn-outline-saffron w-full px-4 py-3">
            Go to dashboard
          </button>
        </div>
      ) : null}
    </AuthGuard>
  );
}

