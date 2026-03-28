'use client';

import { useEffect, useState } from 'react';
import { Shield, User, Briefcase, MapPin } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, APIError } from '@/lib/api';
import { DisruptionEventsResponse } from '@/lib/types';

export default function HomePage() {
  const { login, isLoading } = useAuth();
  const [liveEvent, setLiveEvent] = useState<DisruptionEventsResponse['events'][number] | null>(null);
  const [tickerLoading, setTickerLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadTicker = async () => {
      try {
        const data = await api.getPublicDisruptionEvents('active', 1);
        if (!active) {
          return;
        }
        setLiveEvent(data.events[0] || null);
      } catch {
        if (!active) {
          return;
        }
        setLiveEvent(null);
      } finally {
        if (active) {
          setTickerLoading(false);
        }
      }
    };

    loadTicker();
    const timer = setInterval(loadTicker, 60_000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const handleWorkerLogin = async () => {
    setAuthError(null);
    const phoneNumber = window.prompt('Enter phone number');
    if (!phoneNumber) {
      return;
    }
    try {
      await login('worker', { phoneNumber });
    } catch (error) {
      if (error instanceof APIError && error.status === 0) {
        setAuthError('Check your connection.');
      } else {
        setAuthError('Something went wrong. Please try again.');
      }
    }
  };

  const handleInsurerLogin = async () => {
    setAuthError(null);
    const secret = window.prompt('Enter insurer secret (if configured)', '') || undefined;
    try {
      await login('insurer', { secret });
    } catch (error) {
      if (error instanceof APIError && error.status === 0) {
        setAuthError('Check your connection.');
      } else {
        setAuthError('Something went wrong. Please try again.');
      }
    }
  };

  return (
    <div className="space-y-10">
      <section className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-4xl font-bold text-slate-900">GigGuard</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Parametric insurance for delivery workers. Buy weekly coverage and receive automatic payouts during
          weather and disruption events.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleWorkerLogin}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 py-3 font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-400"
          >
            <User className="h-4 w-4" />
            Login as Worker
          </button>
          <button
            type="button"
            onClick={handleInsurerLogin}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-5 py-3 font-semibold text-slate-800 hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-200"
          >
            <Shield className="h-4 w-4" />
            Login as Insurer
          </button>
        </div>

        {authError ? <p className="mt-4 text-sm text-rose-600">{authError}</p> : null}
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">Live Event Monitor</h2>

        {tickerLoading ? (
          <div className="mt-4 h-12 animate-pulse rounded-lg bg-slate-200" />
        ) : liveEvent ? (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            LIVE EVENT: {liveEvent.trigger_type} detected in {liveEvent.zone}, {liveEvent.city} -{' '}
            {liveEvent.affected_worker_count} workers receiving payouts now
          </div>
        ) : null}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="inline-flex rounded-md bg-sky-100 p-2 text-sky-700">
            <Briefcase className="h-5 w-5" />
          </div>
          <h3 className="mt-3 font-semibold text-slate-900">Weekly Protection</h3>
          <p className="mt-1 text-sm text-slate-600">Choose your coverage tier and activate protection for this week.</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="inline-flex rounded-md bg-sky-100 p-2 text-sky-700">
            <MapPin className="h-5 w-5" />
          </div>
          <h3 className="mt-3 font-semibold text-slate-900">Zone Monitoring</h3>
          <p className="mt-1 text-sm text-slate-600">H3 geospatial monitoring tracks disruptions in your delivery area.</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="inline-flex rounded-md bg-sky-100 p-2 text-sky-700">
            <Shield className="h-5 w-5" />
          </div>
          <h3 className="mt-3 font-semibold text-slate-900">Fraud Guardrails</h3>
          <p className="mt-1 text-sm text-slate-600">Isolation Forest scoring and review tiers keep payouts reliable.</p>
        </div>
      </section>
    </div>
  );
}
