'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import RegistrationStepper from '@/components/ui/RegistrationStepper';
import { WorkerProfile } from '@/lib/types';

const platformClasses: Record<string, string> = {
  zomato: 'bg-[#E23744]/15 text-[#ff8f99] border-[#E23744]/45',
  swiggy: 'bg-[#FC8019]/15 text-[#ffd3b0] border-[#FC8019]/45',
};

export default function RegisterCompletePage() {
  const router = useRouter();
  const [worker, setWorker] = useState<WorkerProfile | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('gigguard_registration_complete_worker');
    if (!raw) {
      router.replace('/register');
      return;
    }

    setWorker(JSON.parse(raw) as WorkerProfile);
  }, [router]);

  const avatarUrl = useMemo(() => {
    if (!worker) {
      return '';
    }
    const seed = worker.avatar_seed || worker.id;
    return `https://api.dicebear.com/8.x/pixel-art/svg?seed=${encodeURIComponent(seed)}`;
  }, [worker]);

  if (!worker) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <section className="surface-card p-6 sm:p-7">
        <RegistrationStepper current="complete" />
      </section>

      <section className="surface-card relative overflow-hidden p-6 text-center sm:p-8">
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

        <h1 className="mt-4 text-3xl font-semibold">Welcome to GigGuard, {worker.name}! ??</h1>
        <p className="mt-2 text-sm text-secondary">Your account is active and your zone monitoring has started.</p>

        <article className="mx-auto mt-6 max-w-xl rounded-2xl border border-slate-700 bg-slate-900/60 p-5 text-left">
          <div className="flex items-center gap-4">
            <img src={avatarUrl} alt="Worker avatar" className="h-16 w-16 rounded-xl border border-slate-700 bg-slate-950" />
            <div>
              <p className="text-lg font-semibold text-slate-100">{worker.name}</p>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${platformClasses[worker.platform] || 'border-slate-600 text-slate-200'}`}
              >
                {worker.platform}
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
            <p>
              <span className="text-slate-400">Zone:</span> {worker.zone || '-'}
            </p>
            <p>
              <span className="text-slate-400">City:</span> {worker.city}
            </p>
          </div>
        </article>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => window.location.assign('/buy-policy')}
            className="btn-saffron w-full px-5 py-3 text-base"
          >
            Buy Your First Policy ?
          </button>
          <button
            type="button"
            onClick={() => window.location.assign('/dashboard')}
            className="btn-outline-saffron w-full px-5 py-3 text-base"
          >
            Go to Dashboard
          </button>
        </div>

        <p className="mt-5 text-sm text-secondary">
          Your zone is being monitored 24/7. Buy a weekly policy to activate payouts.
        </p>
      </section>
    </div>
  );
}
