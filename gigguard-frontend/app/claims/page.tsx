'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import AuthGuard from '@/components/AuthGuard';
import CountUp from '@/components/ui/CountUp';
import RadialGauge from '@/components/ui/RadialGauge';
import { APIError, api } from '@/lib/api';
import { ClaimItem, ClaimsResponse } from '@/lib/types';
import { GlassCard } from '@/components/ui/GlassCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { History, ShieldAlert, ShieldCheck, Zap, Search, ChevronDown, MessageSquare, Send } from 'lucide-react';

export default function ClaimsPage() {
  const t = useTranslations('claims');
  const [data, setData] = useState<ClaimsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [appealReason, setAppealReason] = useState('');
  const [isAppealing, setIsAppealing] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await api.getClaims();
        if (!active) return;
        setData(response);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof APIError && err.status === 0 ? 'Network unavailable' : 'Failed to load claims');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const totalPaid = Math.round(data?.stats.total_paid_out ?? 0);
  const monthClaims = data?.stats.claims_this_month ?? 0;
  const streak = data?.stats.paid_streak ?? 0;

  const handleAppeal = async (claimId: string) => {
    if (!appealReason || appealReason.length < 10) return;
    setIsAppealing(claimId);
    try {
      await api.appealClaim(claimId, appealReason);
      // Refresh
      const response = await api.getClaims();
      setData(response);
      setAppealReason('');
      setExpanded(null);
    } catch {
      alert('Failed to submit appeal');
    } finally {
      setIsAppealing(null);
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'paid': return 'success';
      case 'approved': return 'success';
      case 'under_review': return 'warning';
      case 'denied': return 'error';
      default: return 'neutral';
    }
  };

  const renderClaimCard = (claim: ClaimItem) => {
    const isOpen = expanded === claim.id;
    const isDenied = claim.status === 'denied';
    const isReview = claim.status === 'under_review';
    const scorePct = Math.max(0, Math.min(100, Math.round((claim.fraud_score ?? 0) * 100)));

    return (
      <GlassCard key={claim.id} className="overflow-hidden animate-fade-in-up">
        <div className="p-5 md:p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <StatusBadge variant={getStatusVariant(claim.status)} dot>{claim.status.replace('_', ' ')}</StatusBadge>
                <p className="text-[10px] text-text-muted font-monoData">{claim.id}</p>
              </div>
              <h4 className="text-xl font-bold capitalize">{claim.trigger_type.replace('_', ' ')}</h4>
              <p className="text-xs text-text-muted flex items-center gap-1.5">
                <History size={12} /> {new Date(claim.created_at).toLocaleString('en-IN')}
              </p>
            </div>

            <div className="flex items-center gap-8 self-end md:self-auto">
              <div className="text-right">
                <p className="text-[10px] text-text-muted font-bold uppercase">Payout Amount</p>
                <AmountDisplay amount={claim.payout_amount} size="lg" className="text-white" />
              </div>
              <button 
                onClick={() => setExpanded(isOpen ? null : claim.id)}
                className={`p-2 bg-white/5 rounded-full transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
              >
                <ChevronDown size={20} className="text-text-muted" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 py-3 border-t border-b border-white/5">
             <div className="flex-1 space-y-1.5">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-text-muted">
                   <span>Anti-Spoofing Score</span>
                   <span className={scorePct > 65 ? 'text-rose-400' : scorePct > 35 ? 'text-amber-400' : 'text-emerald-400'}>
                     {scorePct < 30 ? 'Trustworthy' : scorePct < 70 ? 'Suspect' : 'High Risk'}
                   </span>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                   <div 
                      className={`h-full transition-all duration-1000 ${scorePct > 65 ? 'bg-rose-500' : scorePct > 35 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${scorePct}%` }}
                   />
                </div>
             </div>
          </div>

          {isOpen && (
            <div className="animate-fade-in-up space-y-6 pt-2">
               {isReview && (
                 <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-4">
                    <RadialGauge 
                      value={claim.under_review_reason?.behavioral_coherence_score ?? claim.bcs_score ?? 0}
                      max={100} 
                      size={64}
                      color="#F59E0B"
                    />
                    <div className="space-y-1 py-1">
                      <p className="text-sm font-bold text-amber-200">System Review In Progress</p>
                      <ul className="text-xs text-amber-100/70 list-disc list-inside">
                        {(claim.under_review_reason?.flag_reasons ?? ['Pending analysis results']).map(r => <li key={r}>{r}</li>)}
                      </ul>
                    </div>
                 </div>
               )}

               {isDenied && (
                 <div className="space-y-4">
                    <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl">
                       <p className="text-sm font-bold text-rose-300 flex items-center gap-2"><ShieldAlert size={16} /> Claim Rejected</p>
                       <p className="text-xs text-rose-200/70 mt-1">{claim.notes || 'System detected inconsistencies. Tap below to appeal if this is a mistake.'}</p>
                    </div>
                    
                    <div className="space-y-3">
                       <label className="text-xs text-text-muted font-bold uppercase">Submit Formal Appeal</label>
                       <div className="relative">
                          <textarea 
                            value={appealReason}
                            onChange={(e) => setAppealReason(e.target.value)}
                            placeholder="Explain why this claim should be reconsidered (min. 10 chars)..."
                            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm min-h-[100px] focus:outline-none focus:border-accent-saffron/50 transition-colors"
                          />
                          <button 
                            disabled={!appealReason || appealReason.length < 10 || !!isAppealing}
                            onClick={() => handleAppeal(claim.id)}
                            className="absolute bottom-4 right-4 bg-accent-saffron disabled:opacity-50 text-bg-base p-2 rounded-xl transition-all shadow-lg"
                          >
                             {isAppealing === claim.id ? <span className="animate-spin w-5 h-5 block border-2 border-bg-base border-t-transparent rounded-full" /> : <Send size={20} />}
                          </button>
                       </div>
                    </div>
                 </div>
               )}

               {!isDenied && !isReview && (
                 <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                       <p className="text-[10px] text-text-muted font-bold uppercase">City / Zone</p>
                       <p className="text-sm font-medium">{claim.city} • {claim.zone}</p>
                    </div>
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                       <p className="text-[10px] text-text-muted font-bold uppercase">Transaction Ref</p>
                       <p className="text-[10px] font-monoData break-all">{claim.razorpay_ref || 'TRX_STMT_PENDING'}</p>
                    </div>
                 </div>
               )}
            </div>
          )}
        </div>
      </GlassCard>
    );
  };

  return (
    <AuthGuard allowedRoles={['worker']}>
      <div className="max-w-4xl mx-auto space-y-8 pb-20">
        <div className="space-y-2 animate-fade-in-up">
           <h1 className="text-4xl font-black tracking-tight">{t('title')}</h1>
           <p className="text-text-secondary">Historical audit of all disruption payouts and anti-spoofing reviews.</p>
        </div>

        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-24 bg-white/5 rounded-2xl" />
            <div className="h-64 bg-white/5 rounded-2xl" />
          </div>
        ) : error ? (
           <GlassCard className="border-rose-500/30 bg-rose-500/5 p-8 text-center text-rose-200">
             {error}
           </GlassCard>
        ) : (
          <>
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in-up">
               {[
                 { label: 'Total Paid Out', val: totalPaid, icon: Zap, c: 'text-accent-saffron' },
                 { label: 'Verified Events', val: monthClaims, icon: Activity, c: 'text-accent-blue' },
                 { label: 'Trust Streak', val: streak, icon: ShieldCheck, c: 'text-emerald-400' },
               ].map((stat, i) => (
                 <GlassCard key={i} className="p-6">
                    <div className={`p-2 w-fit rounded-lg bg-white/5 ${stat.c} mb-3`}>
                       <stat.icon size={18} />
                    </div>
                    <div>
                       <p className="text-xs text-text-muted font-bold uppercase tracking-wide">{stat.label}</p>
                       <p className="text-3xl font-monoData font-bold mt-1">
                          {stat.label === 'Total Paid Out' && '₹'}
                          <CountUp value={stat.val} />
                       </p>
                    </div>
                 </GlassCard>
               ))}
            </section>

            <div className="space-y-4">
               <div className="flex items-center justify-between px-2">
                  <h3 className="font-bold flex items-center gap-2 text-text-secondary uppercase tracking-tighter"><Search size={16} /> Detailed History</h3>
                  <p className="text-xs text-text-muted font-bold tracking-widest uppercase">{data?.claims.length} Records found</p>
               </div>
               
               <div className="space-y-3">
                  {(data?.claims ?? []).map(renderClaimCard)}
               </div>
            </div>
          </>
        )}
      </div>
    </AuthGuard>
  );
}

// Re-using simplified components locally or imports
function Activity(props: any) { return <Zap {...props} /> }
