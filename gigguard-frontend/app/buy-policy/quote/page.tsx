'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Zap, Info, ChevronRight, AlertCircle, CreditCard, Sparkles } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import ConfettiOnce from '@/components/ui/ConfettiOnce';
import CountUp from '@/components/ui/CountUp';
import PremiumFormula from '@/components/ui/PremiumFormula';
import TriggerBadge from '@/components/ui/TriggerBadge';
import { APIError, api } from '@/lib/api';
import { PremiumQuoteResponse, PurchasePolicyResponse, RazorpayOrderResponse, WorkerProfile } from '@/lib/types';
import { GlassCard } from '@/components/ui/GlassCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AmountDisplay } from '@/components/ui/AmountDisplay';

interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: () => void) => void;
    };
  }
}

const TIERS = [
  { arm: 0, premium: 29, coverage: 290, title: 'Basic Shield' },
  { arm: 1, premium: 44, coverage: 440, title: 'Pro Guard' },
  { arm: 2, premium: 65, coverage: 640, title: 'Premium Lock' },
  { arm: 3, premium: 89, coverage: 890, title: 'Ultimate Hero' },
];

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    const existing = document.querySelector('script[data-razorpay="1"]');
    if (existing) { resolve(true); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpay = '1';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function BuyPolicyQuotePage() {
  const router = useRouter();
  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [quote, setQuote] = useState<PremiumQuoteResponse | null>(null);
  const [selectedArm, setSelectedArm] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  useEffect(() => {
    const workerRaw = sessionStorage.getItem('buy_policy_worker');
    const quoteRaw = sessionStorage.getItem('buy_policy_quote');
    if (!workerRaw || !quoteRaw) { router.replace('/buy-policy'); return; }
    const parsedWorker = JSON.parse(workerRaw) as WorkerProfile;
    const parsedQuote = JSON.parse(quoteRaw) as PremiumQuoteResponse;
    setWorker(parsedWorker);
    setQuote(parsedQuote);
    setSelectedArm(parsedQuote.recommended_arm);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!quote || isPaying) return;
      const token = localStorage.getItem('gigguard_token');
      if (!token) return;
      void fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/policies/bandit-update`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ context_key: quote.context_key, arm: quote.recommended_arm, reward: 0 }),
      }).catch(() => undefined);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [quote, isPaying]);

  const selectedTier = TIERS.find((tier) => tier.arm === selectedArm) ?? TIERS[1];

  const handlePay = async () => {
    if (!quote || !worker) return;
    setError(null);
    setIsPaying(true);

    try {
      const order = await api.createOrder(selectedTier.arm, selectedTier.coverage, Math.round(selectedTier.premium));
      const { checkout_data } = order;
      
      if (checkout_data.driver === 'dummy') {
        sessionStorage.setItem('buy_policy_tier', JSON.stringify(selectedTier));
        window.location.href = checkout_data.checkout_url;
        return;
      }

      if (checkout_data.driver === 'razorpay') {
        const loaded = await loadRazorpayScript();
        if (!loaded) throw new Error('Razorpay SDK failed');

        const razorpay = new window.Razorpay({
          key: checkout_data.key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: Math.round(selectedTier.premium) * 100,
          currency: 'INR',
          name: 'GigGuard',
          description: 'Weekly policy purchase',
          order_id: checkout_data.razorpay_order_id,
          handler: async (response: RazorpaySuccessResponse) => {
            try {
              const purchase = await api.purchasePolicy({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                premium_paid: selectedTier.premium,
                coverage_amount: selectedTier.coverage,
                recommended_arm: quote.recommended_arm,
                selected_arm: selectedTier.arm,
                context_key: quote.context_key,
                arm_accepted: selectedTier.arm === quote.recommended_arm,
              });
              sessionStorage.setItem('buy_policy_purchase', JSON.stringify({ ...purchase, zone: worker.zone, city: worker.city }));
              router.push('/buy-policy/confirmed');
            } catch (error) {
              setError('Purchase confirmation failed');
              setIsPaying(false);
            }
          },
          theme: { color: '#F59E0B' },
        });
        razorpay.on('payment.failed', () => { setError('Payment failed'); setIsPaying(false); });
        razorpay.open();
      }
    } catch (err) {
      setError('An error occurred during checkout');
      setIsPaying(false);
    }
  };

  return (
    <AuthGuard allowedRoles={['worker']}>
      <div className="max-w-4xl mx-auto space-y-8 pb-20">
        <ConfettiOnce active={!loading} />
        
        <div className="space-y-2 animate-fade-in-up">
           <div className="flex items-center gap-2 mb-2">
              <StatusBadge variant="saffron" dot>AI Analysis Complete</StatusBadge>
           </div>
           <h1 className="text-4xl font-black tracking-tight">Your Personalized Quote</h1>
           <p className="text-text-secondary">Customized pricing based on {worker?.city} real-time risk data.</p>
        </div>

        {loading ? (
          <div className="h-64 bg-white/5 rounded-2xl animate-pulse" />
        ) : quote ? (
          <div className="space-y-8">
            <GlassCard className="p-8 relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-80 h-80 bg-accent-saffron/10 blur-[100px] -mr-40 -mt-40 transition-all duration-1000 group-hover:bg-accent-saffron/20" />
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center relative z-10">
                  <div className="space-y-6">
                     <div className="space-y-1">
                        <p className="text-xs text-text-muted font-bold uppercase tracking-widest">Recommended Weekly Premium</p>
                        <div className="flex items-baseline gap-2">
                           <span className="text-5xl font-black text-white tracking-tighter">
                             ₹<CountUp value={Math.round(quote.premium)} />
                           </span>
                           <span className="text-text-muted font-medium">/ week</span>
                        </div>
                     </div>

                     <div className="space-y-3">
                         <div className="p-4 bg-white/5 border border-white/5 rounded-2xl">
                            <PremiumFormula
                              baseRate={quote.formula_breakdown.base_rate}
                              zoneMultiplier={quote.formula_breakdown.zone_multiplier}
                              weatherMultiplier={quote.formula_breakdown.weather_multiplier}
                              historyMultiplier={quote.formula_breakdown.history_multiplier}
                              healthMultiplier={quote.formula_breakdown.health}
                              finalPremium={quote.premium}
                            />
                         </div>
                     </div>
                  </div>

                  <div className="space-y-4">
                     <div className="p-4 bg-white/5 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between text-xs text-text-muted font-bold uppercase tracking-tight">
                           <span>Risk Multipliers</span>
                           <Sparkles size={14} className="text-accent-saffron" />
                        </div>
                        <div className="space-y-2">
                           {[
                             { label: 'Zone Intensity', val: quote.formula_breakdown.zone_multiplier },
                             { label: 'Weather Impact', val: quote.formula_breakdown.weather_multiplier },
                             { label: 'Worker History', val: quote.formula_breakdown.history_multiplier }
                           ].map((m, i) => (
                             <div key={i} className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0 text-sm">
                                <span className="text-text-secondary">{m.label}</span>
                                <span className="font-monoData font-bold text-white">×{m.val.toFixed(2)}</span>
                             </div>
                           ))}
                        </div>
                     </div>
                     <p className="text-[10px] text-text-muted leading-relaxed">
                        * Multipliers are calculated using dynamic pricing engines monitoring city-wide disruption trends.
                     </p>
                  </div>
               </div>
            </GlassCard>

            <div className="space-y-6">
               <h3 className="text-xl font-bold uppercase tracking-tighter flex items-center gap-2">
                 <ShieldCheck size={20} className="text-accent-saffron" /> Select Protection Tier
               </h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {TIERS.map((tier) => {
                    const isSelected = selectedArm === tier.arm;
                    const isRecommended = tier.arm === quote.recommended_arm;
                    
                    return (
                      <GlassCard 
                        key={tier.arm}
                        onClick={() => setSelectedArm(tier.arm)}
                        interactive
                        className={`
                          p-5 border-2 transition-all duration-300
                          ${isSelected ? 'border-accent-saffron bg-accent-saffron/10' : 'border-white/5 hover:border-white/20'}
                        `}
                      >
                         <div className="flex justify-between items-start mb-4">
                            <div className="space-y-1">
                               <p className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-accent-saffron' : 'text-text-muted'}`}>
                                 Tier {tier.arm}
                               </p>
                               <h4 className="font-bold text-lg">{tier.title}</h4>
                            </div>
                            {isRecommended && <StatusBadge variant="saffron">Best Fit</StatusBadge>}
                         </div>
                         <div className="flex justify-between items-end">
                            <div className="space-y-1">
                               <p className="text-xs text-text-muted font-bold uppercase">Weekly Coverage</p>
                               <AmountDisplay amount={tier.coverage} size="lg" className={isSelected ? 'text-accent-saffron' : ''} />
                            </div>
                            <div className="text-right">
                               <p className="text-[10px] text-text-muted font-bold uppercase">Premium</p>
                               <AmountDisplay amount={tier.premium} size="sm" />
                            </div>
                         </div>
                      </GlassCard>
                    );
                  })}
               </div>
            </div>

            {quote.health_advisory?.active && (
              <GlassCard className="p-4 border-amber-500/30 bg-amber-500/10 flex items-start gap-3">
                 <AlertCircle className="text-accent-saffron mt-0.5" />
                 <div>
                    <p className="text-sm font-bold text-amber-200">Health Risk Surcharge Applied</p>
                    <p className="text-xs text-amber-100/70 mt-1 leading-relaxed">
                       A {((quote.health_advisory.multiplier - 1) * 100).toFixed(0)}% adjustment has been factored in due to containment zone proximity.
                    </p>
                 </div>
              </GlassCard>
            )}

            <div className="pt-4 sticky bottom-6 z-30">
               <GlassCard className="p-4 bg-bg-surface/80 backdrop-blur-xl border-accent-saffron/20 shadow-2xl">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                     <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/5 rounded-xl">
                           <CreditCard className="text-text-muted" />
                        </div>
                        <div>
                           <p className="text-xs text-text-muted font-bold uppercase tracking-tight">Final Checkout Amount</p>
                           <AmountDisplay amount={selectedTier.premium} size="lg" className="text-white" />
                        </div>
                     </div>

                     <button
                        onClick={handlePay}
                        disabled={isPaying}
                        className="w-full md:w-auto bg-accent-saffron hover:bg-amber-400 text-bg-base font-black px-12 py-4 rounded-2xl flex items-center justify-center gap-3 shadow-xl hover:shadow-saffronGlow transition-all disabled:opacity-50 group"
                     >
                        {isPaying ? 'Securing Connection...' : 'Secure & Pay Now'}
                        <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                     </button>
                  </div>
                  {error && <p className="text-center text-xs text-rose-400 font-bold mt-4 uppercase tracking-widest">{error}</p>}
               </GlassCard>
            </div>
          </div>
        ) : null}
      </div>
    </AuthGuard>
  );
}
