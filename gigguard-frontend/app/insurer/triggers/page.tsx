'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { api } from '@/lib/api';
import { GlassCard } from '@/components/ui/GlassCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { Zap, MapPin, Clock, Search, Filter, ShieldCheck, Activity } from 'lucide-react';
import TriggerBadge from '@/components/ui/TriggerBadge';

export default function TriggerLogPage() {
  const [triggers, setTriggers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getInsurerTriggers();
        setTriggers(data.triggers);
      } catch {
        // Error handling
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const filtered = triggers.filter(t => 
    t.zone.toLowerCase().includes(search.toLowerCase()) || 
    t.city.toLowerCase().includes(search.toLowerCase()) ||
    t.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AuthGuard allowedRoles={['insurer']}>
      <div className="max-w-6xl mx-auto space-y-8 pb-20">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 animate-fade-in-up">
           <div className="space-y-1">
              <h1 className="text-4xl font-black tracking-tight text-white uppercase italic">Trigger Event Log</h1>
              <p className="text-text-secondary">Comprehensive history of all parametric disruption nodes and thresholds.</p>
           </div>
           
           <div className="flex items-center gap-3">
              <div className="relative">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                 <input 
                   type="text" 
                   placeholder="Search zones or triggers..."
                   value={search}
                   onChange={(e) => setSearch(e.target.value)}
                   className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-accent-saffron/50 transition-all w-64"
                 />
              </div>
              <button className="p-2 bg-white/5 border border-white/10 rounded-xl text-text-muted hover:text-white transition-all">
                 <Filter size={18} />
              </button>
           </div>
        </header>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {[1,2,3,4,5,6].map(i => <div key={i} className="h-48 bg-white/5 rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {filtered.map((trigger, i) => (
               <GlassCard key={i} className="animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="p-6 space-y-4">
                     <div className="flex justify-between items-start">
                        <TriggerBadge triggerType={trigger.type} />
                        <StatusBadge variant={trigger.status === 'active' ? 'error' : 'neutral'} dot={trigger.status === 'active'}>
                           {trigger.status}
                        </StatusBadge>
                     </div>
                     
                     <div className="space-y-4">
                        <div className="flex items-start gap-3">
                           <div className="p-2 bg-white/5 rounded-lg text-accent-saffron mt-0.5"><MapPin size={16} /></div>
                           <div>
                              <p className="text-[10px] text-text-muted font-black uppercase tracking-widest">Target Node</p>
                              <p className="font-bold text-lg leading-tight">{trigger.zone}</p>
                              <p className="text-sm text-text-secondary font-medium">{trigger.city}</p>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                           <div className="space-y-1">
                              <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Threshold</p>
                              <p className="font-monoData font-bold text-white tracking-widest">{trigger.threshold}</p>
                           </div>
                           <div className="space-y-1 text-right">
                              <p className="text-[10px] text-text-muted font-black uppercase tracking-widest">Active Policies</p>
                              <p className="font-monoData font-bold text-accent-saffron">{trigger.policy_count || 0}</p>
                           </div>
                        </div>

                        <div className="p-3 bg-white/[0.03] rounded-xl flex items-center justify-between">
                           <div className="flex items-center gap-2">
                              <Clock size={12} className="text-text-muted" />
                              <span className="text-[10px] text-text-muted font-bold uppercase">Last Heartbeat</span>
                           </div>
                           <span className="text-[10px] font-monoData text-white">{new Date().toLocaleTimeString()}</span>
                        </div>
                     </div>
                  </div>
               </GlassCard>
             ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="py-20 text-center space-y-4">
             <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto text-text-muted">
                <Search size={32} />
             </div>
             <p className="text-text-secondary font-medium">No triggers match your search criteria.</p>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
