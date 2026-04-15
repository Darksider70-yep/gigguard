'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import InsurerNav from '@/components/layout/InsurerNav';
import { api } from '@/lib/api';
import { InsurerPoliciesResponse } from '@/lib/types';
import { GlassCard } from '@/components/ui/GlassCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { 
  Shield, 
  ChevronLeft, 
  ChevronRight, 
  Filter,
  Users,
  CreditCard,
  Target
} from 'lucide-react';

export default function InsurerPoliciesPage() {
  const [data, setData] = useState<InsurerPoliciesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        const payload = await api.getInsurerPolicies({ page, limit: 12, status });
        if (!active) return;
        setData(payload);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError('Failed to load active policy portfolio');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [page, status]);

  return (
    <AuthGuard allowedRoles={['insurer']}>
      <div className="max-w-[1600px] mx-auto space-y-8 pb-20">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 animate-fade-in-up">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Shield size={14} className="text-emerald-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Risk Portfolio Management</span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white uppercase italic">Active Policies</h1>
            <p className="text-text-secondary">Comprehensive view of all active insurance contracts and risk exposure.</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <Filter size={14} className="text-text-muted mr-2" />
              <select 
                value={status} 
                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer uppercase tracking-tight"
              >
                <option value="" className="bg-bg-base">All Status</option>
                <option value="active" className="bg-bg-base">Active</option>
                <option value="expired" className="bg-bg-base">Expired</option>
              </select>
            </div>
          </div>
        </header>

        {data && (
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-fade-in-up delay-100">
            {[
              { label: 'Total Enrolled', val: data.total, icon: Users },
              { label: 'Monthly Premium', val: data.total_premiums, icon: CreditCard, prefix: '₹' },
              { label: 'Avg Premium', val: data.avg_premium, icon: Target, prefix: '₹' },
              { label: 'Avg Coverage', val: data.avg_coverage, icon: Shield, prefix: '₹' },
            ].map((s, i) => (
              <GlassCard key={i} className="p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-white/5 text-text-muted">
                    <s.icon size={16} />
                  </div>
                  <p className="text-[10px] text-text-muted font-bold uppercase tracking-tight">{s.label}</p>
                </div>
                <p className="text-2xl font-monoData font-bold leading-none">
                  {s.prefix}{s.val.toLocaleString('en-IN')}
                </p>
              </GlassCard>
            ))}
          </section>
        )}

        <GlassCard className="p-0 overflow-hidden animate-fade-in-up delay-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-white/[0.02] text-[10px] font-black uppercase tracking-widest text-text-muted">
                <tr>
                  <th className="px-6 py-4">Worker</th>
                  <th className="px-6 py-4">Geography / Fleet</th>
                  <th className="px-6 py-4">Coverage Term</th>
                  <th className="px-6 py-4">Premium / Amount</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={5} className="px-6 py-8"><div className="h-4 bg-white/5 rounded animate-pulse w-full" /></td></tr>
                  ))
                ) : data?.policies.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-text-muted italic">No policies found matching criteria.</td></tr>
                ) : data?.policies.map((policy) => (
                  <tr key={policy.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <p className="font-bold text-white">{policy.worker_name}</p>
                      <p className="text-[10px] text-text-muted uppercase font-bold tracking-tight">{policy.id.slice(0, 8)}...</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-white">{policy.zone}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-text-muted uppercase font-bold">{policy.city}</span>
                        <span className="w-1 h-1 rounded-full bg-white/10" />
                        <span className="text-[10px] text-text-muted uppercase font-bold">{policy.platform}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-white font-monoData text-xs">
                        <span>{new Date(policy.week_start).toLocaleDateString()}</span>
                        <ChevronRight size={10} className="text-text-muted" />
                        <span>{new Date(policy.week_end).toLocaleDateString()}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-accent-saffron">₹{policy.premium_paid} <span className="text-[10px] text-text-muted font-normal">Prem</span></span>
                        <span className="font-bold text-white">₹{policy.coverage_amount} <span className="text-[10px] text-text-muted font-normal">Limit</span></span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge variant={policy.status === 'active' ? 'success' : 'neutral'} dot={policy.status === 'active'}>
                        {policy.status}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-white/5 flex items-center justify-between bg-white/[0.01]">
            <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">
              Showing {data?.policies.length ?? 0} of {data?.total ?? 0} Policies
            </p>
            <div className="flex items-center gap-2">
              <button 
                disabled={page <= 1 || loading}
                onClick={() => setPage(p => p - 1)}
                className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded-lg transition-all"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-monoData px-2">{page}</span>
              <button 
                disabled={!data || page * 12 >= data.total || loading}
                onClick={() => setPage(p => p + 1)}
                className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded-lg transition-all"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </GlassCard>
      </div>
    </AuthGuard>
  );
}

