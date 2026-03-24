'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';

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

function formatInr(value: number): string {
  return `INR ${Math.round(value).toLocaleString('en-IN')}`;
}

export default function BuyPolicyConfirmedPage() {
  const router = useRouter();
  const [data, setData] = useState<PurchaseConfirmationState | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <AuthGuard allowedRoles={['worker']}>
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-bold text-slate-900">Policy Confirmed</h1>

        {loading ? (
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
            <div className="h-40 animate-pulse rounded-xl bg-slate-200" />
          </div>
        ) : data ? (
          <>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">
              <p className="text-lg font-semibold">{data.message}</p>
              <p className="mt-1 text-sm">Your zone is now protected for this week.</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Policy details</h2>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded bg-slate-50 p-3 text-sm">
                  <p className="text-slate-500">Policy Code</p>
                  <p className="font-semibold text-slate-900">{data.policy_id}</p>
                </div>
                <div className="rounded bg-slate-50 p-3 text-sm">
                  <p className="text-slate-500">Status</p>
                  <p className="font-semibold text-slate-900">{data.policy.status}</p>
                </div>
                <div className="rounded bg-slate-50 p-3 text-sm">
                  <p className="text-slate-500">Week</p>
                  <p className="font-semibold text-slate-900">
                    {data.policy.week_start} to {data.policy.week_end}
                  </p>
                </div>
                <div className="rounded bg-slate-50 p-3 text-sm">
                  <p className="text-slate-500">Premium Paid</p>
                  <p className="font-semibold text-slate-900">{formatInr(data.policy.premium_paid)}</p>
                </div>
                <div className="rounded bg-slate-50 p-3 text-sm">
                  <p className="text-slate-500">Coverage Amount</p>
                  <p className="font-semibold text-slate-900">{formatInr(data.policy.coverage_amount)}</p>
                </div>
                <div className="rounded bg-slate-50 p-3 text-sm">
                  <p className="text-slate-500">Payment Reference</p>
                  <p className="font-semibold text-slate-900">{data.policy.razorpay_payment_id}</p>
                </div>
                <div className="rounded bg-slate-50 p-3 text-sm sm:col-span-2">
                  <p className="text-slate-500">Location</p>
                  <p className="font-semibold text-slate-900">
                    {data.zone || 'Unknown zone'}, {data.city || 'Unknown city'}
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="w-full rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white hover:bg-sky-700"
            >
              Go to dashboard
            </button>
          </>
        ) : null}
      </div>
    </AuthGuard>
  );
}
