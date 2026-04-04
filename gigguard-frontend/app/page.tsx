'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, Shield, ShoppingCart, Signal, Zap } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { DisruptionEventsResponse } from '@/lib/types';
import CountUp from '@/components/ui/CountUp';
import LiveTicker from '@/components/ui/LiveTicker';

const HOW_IT_WORKS = [
  {
    id: '01',
    icon: ShoppingCart,
    title: 'Buy weekly protection',
    copy: 'Workers buy a tiered policy in under 60 seconds via UPI.',
  },
  {
    id: '02',
    icon: Signal,
    title: 'Zone monitoring runs live',
    copy: 'Trigger monitor checks weather and disruption signals across active zones.',
  },
  {
    id: '03',
    icon: Zap,
    title: 'Claims auto-triggered',
    copy: 'H3 ring matching identifies affected workers with precise geospatial eligibility.',
  },
  {
    id: '04',
    icon: Briefcase,
    title: 'Payout in minutes',
    copy: 'Fraud scoring and payout queues push approved claims to worker UPI accounts.',
  },
];

export default function HomePage() {
  const router = useRouter();
  const { role, isLoading } = useAuth();
  const [events, setEvents] = useState<DisruptionEventsResponse['events']>([]);

  useEffect(() => {
    if (!isLoading && role) {
      if (role === 'worker') {
        router.replace('/dashboard');
      } else if (role === 'insurer') {
        router.replace('/insurer');
      }
    }
  }, [role, isLoading, router]);

  useEffect(() => {
    let active = true;

    const loadTicker = async () => {
      try {
        const data = await api.getPublicDisruptionEvents('active', 5);
        if (!active) {
          return;
        }
        setEvents(data.events ?? []);
      } catch {
        if (active) {
          setEvents([]);
        }
      }
    };

    void loadTicker();
    const timer = window.setInterval(() => {
      void loadTicker();
    }, 30000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const handleInsurerLogin = () => {
    window.location.href = '/insurer-login';
  };

  return (
    <div className="space-y-8">
      <section className="hero-grid relative flex min-h-[86vh] flex-col overflow-hidden rounded-3xl border border-slate-800 bg-[var(--bg-surface)] p-10">
        <div className="hex-bg absolute inset-0 opacity-45" />
        <div className="relative z-10 flex flex-1 flex-col justify-center">
          <p className="animate-fade-in-up delay-0 text-xs uppercase tracking-[0.25em] text-secondary">
            GigGuard Command Center
          </p>
          <h1 className="animate-fade-in-up delay-100 mt-4 text-6xl font-semibold leading-tight">
            <span>Your income,</span>
            <br />
            <span className="cursor-blink text-amber-400">protected.</span>
          </h1>
          <p className="animate-fade-in-up delay-300 mt-5 max-w-2xl text-lg text-secondary">
            AI-powered parametric insurance for Zomato and Swiggy riders. Trigger-driven payouts for monsoons,
            heatwaves, and disruption shocks.
          </p>

          <div className="animate-fade-in-up delay-400 mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
            <Link href="/login" className="btn-outline-saffron inline-flex items-center justify-center gap-2 px-5 py-3">
              <Shield className="h-4 w-4" />
              Login as Worker
            </Link>
            <Link href="/register" className="btn-saffron inline-flex items-center justify-center gap-2 px-5 py-3">
              New here? Register free
            </Link>
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={handleInsurerLogin}
              disabled={isLoading}
              className="btn-outline-saffron px-5 py-3 text-sm disabled:opacity-60"
            >
              Insurer Login
            </button>
          </div>
        </div>

        <div className="relative z-10">
          <LiveTicker events={events} />
        </div>
      </section>

      <section className="surface-card animate-fade-in-up delay-100 grid grid-cols-3 divide-x divide-slate-800 px-4 py-5">
        <div className="px-4">
          <p className="font-mono-data text-3xl font-semibold text-amber-300">
            <CountUp value={150000} />
          </p>
          <p className="text-sm text-secondary">gig workers in India</p>
        </div>
        <div className="px-4">
          <p className="font-mono-data text-3xl font-semibold text-amber-300">
            <CountUp value={5} />
          </p>
          <p className="text-sm text-secondary">cities covered</p>
        </div>
        <div className="px-4">
          <p className="font-mono-data text-3xl font-semibold text-amber-300">
            &lt; <CountUp value={15} /> min
          </p>
          <p className="text-sm text-secondary">average payout time</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">How it works</h2>
        <div className="grid grid-cols-2 gap-4">
          {HOW_IT_WORKS.map((item, index) => {
            const Icon = item.icon;
            return (
              <article
                key={item.id}
                className={`surface-card animate-fade-in-up delay-${index * 100} card-interactive relative overflow-hidden p-5`}
              >
                <span className="font-mono-data absolute -right-2 -top-3 text-6xl font-bold text-amber-500/12">
                  {item.id}
                </span>
                <Icon className="h-5 w-5 text-amber-300" />
                <h3 className="mt-3 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-secondary">{item.copy}</p>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
