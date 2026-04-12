'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MapPin, ShieldCheck, TrendingUp, ChevronRight, Info } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import { APIError, api } from '@/lib/api';
import { PremiumQuoteResponse, WorkerProfile } from '@/lib/types';
import { GlassCard } from '@/components/ui/GlassCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AmountDisplay } from '@/components/ui/AmountDisplay';

export default function BuyPolicyStepOnePage() {
  const router = useRouter();
  const t = useTranslations('buy_policy');
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
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof APIError && err.status === 0 ? 'Network unavailable' : 'Unable to fetch quote');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [router]);

  const continueToQuote = () => {
    if (!worker || !quote) return;
    sessionStorage.setItem('buy_policy_worker', JSON.stringify(worker));
    sessionStorage.setItem('buy_policy_quote', JSON.stringify(quote));
    router.push('/buy-policy/quote');
  };

  const coverageItems = [
    { id: 'heavy_rainfall', label: 'Heavy Rainfall', icon: '🌧️' },
    { id: 'extreme_heat', label: 'Extreme Heat', icon: '🌡️' },
    { id: 'flood_red_alert', label: 'Flood Alert', icon: '🌊' },
    { id: 'severe_aqi', label: 'Severe AQI', icon: '😷' },
    { id: 'curfew_strike', label: 'Curfew / Strike', icon: '🚧' },
    { id: 'pandemic_containment', label: 'Health Emergency', icon: '🏥' },
  ];

  return (
    <AuthGuard allowedRoles={['worker']}>
      <div className="max-w-4xl mx-auto space-y-8 pb-20">
        <div className="space-y-2 animate-fade-in-up">
           <h1 className="text-4xl font-black tracking-tight">{t('title')}</h1>
           <p className="text-text-secondary">Protect your income from uncontrollable disruptions.</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 animate-pulse">
            <div className="md:col-span-2 h-64 bg-white/5 rounded-2xl" />
            <div className="md:col-span-3 h-64 bg-white/5 rounded-2xl" />
          </div>
        ) : error ? (
           <GlassCard className="border-rose-500/30 bg-rose-500/5 p-8 text-center">
            <p className="text-rose-200">{error}</p>
          </GlassCard>
        ) : worker && quote ? (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <section className="lg:col-span-2 animate-fade-in-up delay-100">
              <GlassCard className="h-full p-6 space-y-8">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="relative">
                    <img
                      className="h-24 w-24 rounded-3xl border-2 border-accent-saffron/30 bg-bg-surface p-1 shadow-saffronGlow"
                      src={`https://api.dicebear.com/8.x/pixel-art/svg?seed=${worker.avatar_seed || worker.id}`}
                      alt="Worker avatar"
                    />
                    <div className="absolute -bottom-2 -right-2 bg-accent-saffron text-bg-base p-1.5 rounded-xl shadow-lg">
                      <ShieldCheck size={16} />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">{worker.name}</h2>
                    <StatusBadge variant="saffron" className="mt-2">{worker.platform}</StatusBadge>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-white/5">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="p-2 bg-white/5 rounded-lg text-accent-saffron"><MapPin size={16} /></div>
                    <div className="flex-1">
                      <p className="text-[10px] text-text-muted font-bold uppercase">Active Zone</p>
                      <p className="font-medium">{worker.zone}, {worker.city}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="p-2 bg-white/5 rounded-lg text-accent-saffron"><TrendingUp size={16} /></div>
                    <div className="flex-1">
                      <p className="text-[10px] text-text-muted font-bold uppercase">Average Earnings</p>
                      <AmountDisplay amount={worker.avg_daily_earning} size="sm" /> <span className="text-text-muted text-xs">/ day</span>
                    </div>
                  </div>
                  <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl flex items-center gap-3">
                     <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                     <p className="text-xs font-bold text-emerald-400 uppercase tracking-tight">Enterprise Monitoring Active</p>
                  </div>
                </div>
              </GlassCard>
            </section>

            <section className="lg:col-span-3 animate-fade-in-up delay-200">
              <GlassCard className="h-full flex flex-col">
                <div className="p-6 border-b border-white/5 space-y-1">
                  <h3 className="text-xl font-bold italic tracking-tight uppercase flex items-center gap-2">
                    <ShieldCheck size={20} className="text-accent-saffron" /> {t('what_is_covered')}
                  </h3>
                  <p className="text-xs text-text-muted font-medium">Parametric payout thresholds for your zone.</p>
                </div>

                <div className="p-6 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {coverageItems.map((item) => (
                    <div key={item.id} className="p-3 bg-white/5 border border-white/5 rounded-xl flex items-center justify-between group hover:border-white/10 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-lg grayscale group-hover:grayscale-0 transition-all">{item.icon}</span>
                        <span className="text-sm font-medium text-text-secondary">{item.label}</span>
                      </div>
                      <AmountDisplay amount={quote.coverage[item.id as keyof typeof quote.coverage] || 0} size="sm" className="font-bold" />
                    </div>
                  ))}
                </div>

                <div className="p-6 pt-0">
                  <div className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-start gap-3 mb-6">
                    <Info size={16} className="text-accent-blue mt-0.5" />
                    <p className="text-xs text-text-secondary leading-relaxed">
                      Payouts are triggered automatically based on verified environmental data. No claims filing required. 
                      <span className="text-accent-saffron font-bold ml-1">Safe, Secure & Instant.</span>
                    </p>
                  </div>

                  <button
                    onClick={continueToQuote}
                    className="w-full bg-accent-saffron hover:bg-amber-400 text-bg-base font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-xl hover:shadow-saffronGlow transition-all group"
                  >
                    Calculate My Premium
                    <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </GlassCard>
            </section>
          </div>
        ) : null}
      </div>
    </AuthGuard>
  );
}
