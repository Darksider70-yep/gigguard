'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { APIError, api } from '@/lib/api';
import {
  AntiSpoofingAlertsResponse,
  DisruptionEventsResponse,
  InsurerDashboardResponse,
  PlatformStatusResponse,
  ShadowComparisonResponse,
  SimulateTriggerBody,
  ZoneRiskMatrixResponse,
  InsurerPayoutsResponse,
} from '@/lib/types';
import { GlassCard } from '@/components/ui/GlassCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { 
  ShieldCheck, 
  Zap, 
  Search, 
  ChevronRight, 
  Activity, 
  AlertCircle, 
  Globe, 
  Cpu, 
  History,
  TrendingUp,
  MapPin,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import BCSGauge from '@/components/ui/BCSGauge';
import TriggerBadge from '@/components/ui/TriggerBadge';

interface DashboardBundle {
  dashboard: InsurerDashboardResponse;
  events: DisruptionEventsResponse['events'];
  zones: ZoneRiskMatrixResponse['zones'];
  alerts: AntiSpoofingAlertsResponse['alerts'];
  shadow: ShadowComparisonResponse;
  payouts: InsurerPayoutsResponse;
  triggers: any[];
}

export default function InsurerPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simSteps, setSimSteps] = useState<string[]>([]);
  const [status, setStatus] = useState<PlatformStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [eventsFlash, setEventsFlash] = useState(false);
  const [selectedType, setSelectedType] = useState('heavy_rainfall');
  const [selectedCity, setSelectedCity] = useState('mumbai');

  const TRIGGER_TYPES = [
    { id: 'heavy_rainfall', label: 'Heavy Rainfall' },
    { id: 'extreme_heat', label: 'Extreme Heat' },
    { id: 'flood_red_alert', label: 'Flood Red Alert' },
    { id: 'severe_aqi', label: 'Severe AQI' },
    { id: 'curfew_strike', label: 'Curfew / Strike' },
    { id: 'pandemic_containment', label: 'Pandemic Zone' },
  ];

  const CITIES = ['mumbai', 'delhi', 'bangalore', 'chennai', 'hyderabad'];

  const fetchBundle = async (): Promise<DashboardBundle> => {
    const currentDate = new Date();
    const currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

    const [dashboard, events, zones, alerts, shadow, payouts, triggersData] = await Promise.all([
      api.getInsurerDashboard(),
      api.getDisruptionEvents(undefined, 20),
      api.getZoneRiskMatrix(),
      api.getAntiSpoofingAlerts(),
      api.getShadowComparison(),
      api.getInsurerPayouts({ month: currentMonth, page: 1, limit: 1000 }),
      api.getInsurerTriggers(),
    ]);

    return {
      dashboard,
      events: events.events,
      zones: zones.zones,
      alerts: alerts.alerts,
      shadow,
      payouts,
      triggers: triggersData.triggers,
    };
  };

  const { data, loading, error, lastUpdated, refresh } = useDataRefresh(fetchBundle, 15000, true);

  useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      try {
        const payload = await api.getPlatformStatus();
        if (!active) return;
        setStatus(payload);
        setStatusError(null);
      } catch (err) {
        if (!active) return;
        setStatusError('Status engine unreachable');
      }
    };
    void loadStatus();
    return () => { active = false; };
  }, [lastUpdated]);

  const approveClaim = async (claimId: string) => {
    try {
      const response = await api.approveClaim(claimId);
      setToast(`Approved. Payout ${Math.round(response.payout_amount)}`);
      await refresh();
      setEventsFlash(true);
    } catch {
      setToast('Approve action failed');
    }
  };

  const denyClaim = async (claimId: string) => {
    const reason = window.prompt('Enter reason for denial:');
    if (!reason) return;
    try {
      await api.denyClaim(claimId, reason);
      setToast('Claim denied');
      await refresh();
      setEventsFlash(true);
    } catch {
      setToast('Deny action failed');
    }
  };

  const simulateTrigger = async () => {
    setSimulating(true);
    setSimSteps([]);
    try {
      setSimSteps([`Initializing ${selectedType} event in ${selectedCity}...`, 'Analyzing affected workers...', 'Calculating parametric payouts...']);
      
      const cityCoords: any = {
        mumbai: { lat: 19.1364, lng: 72.8296, zone: 'Andheri West' },
        delhi: { lat: 28.6309, lng: 77.2164, zone: 'Connaught Place' },
        bangalore: { lat: 12.9708, lng: 77.6450, zone: 'Indiranagar' },
        chennai: { lat: 13.0397, lng: 80.2368, zone: 'T. Nagar' },
        hyderabad: { lat: 17.4149, lng: 78.4481, zone: 'Banjara Hills' },
      };

      const coords = cityCoords[selectedCity];
      const testValues: any = {
        heavy_rainfall: 25.4,
        extreme_heat: 42.5,
        flood_red_alert: 1,
        severe_aqi: 450,
        curfew_strike: 1,
        pandemic_containment: 1,
      };

      const payload: SimulateTriggerBody = {
        trigger_type: selectedType,
        city: selectedCity,
        zone: coords.zone,
        trigger_value: testValues[selectedType],
        lat: coords.lat,
        lng: coords.lng,
      };

      const result = (await api.simulateTrigger(payload)) as any;
      const names = result.affected_worker_names || [];
      const nameStr = names.length > 0 ? `: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '...' : ''}` : '';
      
      setSimSteps(prev => [...prev, `Success. ${result.affected_workers ?? 0} workers affected${nameStr}.`]);
      await refresh();
      setEventsFlash(true);
    } catch {
      setSimSteps(prev => [...prev, 'Simulation failed']);
    } finally {
      setSimulating(false);
    }
  };

  const stats = data?.dashboard.stats;
  const rawEvents = data?.events ?? [];
  const events = useMemo(() => {
    return rawEvents.filter(e => {
      const hoursSinceStart = (Date.now() - new Date(e.event_start).getTime()) / 3600000;
      return hoursSinceStart < 24;
    });
  }, [rawEvents]);
  const zones = data?.zones ?? [];
  const alerts = data?.alerts ?? [];
  const triggers = data?.triggers ?? [];

  return (
    <AuthGuard allowedRoles={['insurer']}>
      <div className="max-w-[1600px] mx-auto space-y-8 pb-20">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 animate-fade-in-up">
           <div className="space-y-1">
              <div className="flex items-center gap-2 mb-1">
                 <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                 <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">System Live & Synchronized</span>
              </div>
              <h1 className="text-4xl font-black tracking-tight text-white uppercase italic">Insurer Command Center</h1>
              <p className="text-text-secondary">Unified operations for risk intelligence, fraud reviews, and parametric disbursements.</p>
           </div>
           
           <GlassCard className="p-3 flex items-center gap-6 border-white/5 bg-white/[0.02]">
              <div className="text-right">
                 <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Last Sync</p>
                 <p className="font-monoData text-sm text-accent-saffron">{lastUpdated?.toLocaleTimeString('en-IN')}</p>
              </div>
              <button 
                onClick={() => refresh()}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
              >
                <Activity size={18} className="text-text-secondary" />
              </button>
           </GlassCard>
        </header>

        {stats && (
          <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 animate-fade-in-up delay-100">
             {[
               { label: 'Fleet Strength', val: stats.total_workers, icon: Globe, href: '/insurer/workers' },
               { label: 'Active Policies', val: stats.active_policies, icon: ShieldCheck, href: '/insurer/policies', variant: 'success' },
               { label: 'Monthly Payouts', val: stats.payouts_this_month, icon: Zap, href: '/insurer/payouts', prefix: '₹', variant: 'saffron' },
               { label: 'Flagged Claims', val: stats.flagged_claims, icon: AlertCircle, href: '/insurer/flagged', variant: 'error' },
               { label: 'Net Loss Ratio', val: (stats.loss_ratio * 100).toFixed(1), icon: TrendingUp, suffix: '%', href: '/insurer/analytics' },
               { label: 'Global Reach', val: stats.coverage_area.zones, icon: MapPin, suffix: ' Zones', href: '/insurer/coverage' },
               { label: 'Avg Premium', val: stats.average_premium, icon: History, prefix: '₹', href: '/insurer/analytics' },
             ].map((s, i) => (
               <GlassCard key={i} interactive className="p-4 group">
                  <Link href={s.href || '#'} className="block space-y-3">
                    <div className="flex items-center justify-between">
                       <div className={`p-2 rounded-lg bg-white/5 ${s.variant === 'success' ? 'text-emerald-400' : s.variant === 'saffron' ? 'text-accent-saffron' : s.variant === 'error' ? 'text-rose-400' : 'text-text-muted'} group-hover:scale-110 transition-transform`}>
                          <s.icon size={16} />
                       </div>
                       <ChevronRight size={14} className="text-text-muted opacity-0 group-hover:opacity-100 transition-all" />
                    </div>
                    <div>
                       <p className="text-[10px] text-text-muted font-bold uppercase tracking-tighter">{s.label}</p>
                       <p className="text-xl font-monoData font-bold leading-none mt-1">
                          {s.prefix}{s.val}{s.suffix}
                       </p>
                    </div>
                  </Link>
               </GlassCard>
             ))}
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
           {/* Main Feed */}
           <div className="lg:col-span-8 space-y-8 animate-fade-in-up delay-200">
              <GlassCard className={`p-0 overflow-hidden ${eventsFlash ? 'data-flash' : ''}`}>
                 <div className="p-6 border-b border-white/5 flex items-center justify-between">
                    <h2 className="text-xl font-bold flex items-center gap-2 uppercase italic tracking-tighter">
                      <Zap size={20} className="text-accent-saffron" /> Live Disruption Feed
                    </h2>
                    <StatusBadge variant="saffron" dot>Real-time</StatusBadge>
                 </div>
                 
                 <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                       <thead className="bg-white/[0.02] text-[10px] font-black uppercase tracking-widest text-text-muted">
                          <tr>
                             <th className="px-6 py-4">Trigger / Node</th>
                             <th className="px-6 py-4">Intensity</th>
                             <th className="px-6 py-4">Impact Scope</th>
                             <th className="px-6 py-4">Status</th>
                             <th className="px-6 py-4"></th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-white/5">
                          {events.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-12 text-center text-text-muted italic">No active disruption events detected.</td></tr>
                          ) : events.map((event) => (
                             <tr key={event.id} className="hover:bg-white/[0.02] transition-colors group">
                                <td className="px-6 py-4">
                                   <div className="flex items-center gap-3">
                                      <TriggerBadge triggerType={event.trigger_type} size="sm" />
                                      <div>
                                         <p className="font-bold text-white">{event.zone}</p>
                                         <p className="text-[10px] text-text-muted uppercase font-bold">{event.city}</p>
                                      </div>
                                   </div>
                                </td>
                                <td className="px-6 py-4 font-monoData">
                                   <span className="text-white font-bold">{event.trigger_value}</span>
                                   <span className="text-text-muted text-xs ml-1">/{event.threshold}</span>
                                </td>
                                <td className="px-6 py-4">
                                   <p className="font-bold text-accent-saffron">{event.affected_worker_count} Workers</p>
                                   <AmountDisplay amount={event.total_payout} size="sm" className="text-text-muted" />
                                </td>
                                <td className="px-6 py-4">
                                   {event.status === 'active' ? (
                                     <StatusBadge variant="error" dot>Active</StatusBadge>
                                   ) : (
                                     <StatusBadge variant="neutral">Processed</StatusBadge>
                                   )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                   <button className="p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <ChevronRight size={16} className="text-text-muted" />
                                   </button>
                                </td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </GlassCard>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <GlassCard className="p-6">
                    <div className="flex items-center justify-between mb-6">
                       <h3 className="font-bold uppercase tracking-tight italic flex items-center gap-2">
                         <Search size={18} className="text-accent-blue" /> Anti-Spoofing Queue
                       </h3>
                       <Link href="/insurer/flagged" className="text-[10px] font-bold text-accent-blue uppercase hover:underline">View All</Link>
                    </div>
                    <div className="space-y-4">
                       {alerts.length === 0 ? (
                         <div className="py-8 text-center text-text-muted italic border border-dashed border-white/10 rounded-2xl">Queue clear. All claims verified.</div>
                       ) : alerts.slice(0, 3).map((alert) => (
                         <div key={alert.claim_id} className="p-4 bg-white/5 border border-white/5 rounded-2xl space-y-4">
                            <div className="flex justify-between items-start">
                               <div>
                                  <p className="font-bold text-white leading-none">{alert.worker_name}</p>
                                  <p className="text-[10px] text-text-muted uppercase mt-1">{alert.zone}, {alert.city}</p>
                               </div>
                               <BCSGauge score={alert.bcs_score} size="sm" />
                            </div>
                            <div className="flex gap-2">
                               <button onClick={() => approveClaim(alert.claim_id)} className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase py-2 rounded-xl transition-all">Approve</button>
                               <button onClick={() => denyClaim(alert.claim_id)} className="flex-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] font-black uppercase py-2 rounded-xl transition-all">Reject</button>
                            </div>
                         </div>
                       ))}
                    </div>
                 </GlassCard>

                 <GlassCard className="p-6">
                    <div className="flex items-center justify-between mb-6">
                       <h3 className="font-bold uppercase tracking-tight italic flex items-center gap-2">
                         <Activity size={18} className="text-accent-saffron" /> Trigger Governance
                       </h3>
                    </div>
                    <div className="space-y-4">
                       <p className="text-xs text-text-secondary leading-relaxed">
                          Force trigger events for emergency overrides or stress testing the parametric pipeline.
                       </p>
                       
                       <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                             <label className="text-[10px] font-black text-text-muted uppercase tracking-widest pl-1">Trigger Type</label>
                             <select 
                               value={selectedType}
                               onChange={(e) => setSelectedType(e.target.value)}
                               className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none cursor-pointer uppercase tracking-tight focus:border-accent-saffron/50 transition-colors"
                             >
                                {TRIGGER_TYPES.map(t => (
                                   <option key={t.id} value={t.id} className="bg-bg-base">{t.label}</option>
                                ))}
                             </select>
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-black text-text-muted uppercase tracking-widest pl-1">Target City</label>
                             <select 
                               value={selectedCity}
                               onChange={(e) => setSelectedCity(e.target.value)}
                               className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none cursor-pointer uppercase tracking-tight focus:border-accent-saffron/50 transition-colors"
                             >
                                {CITIES.map(c => (
                                   <option key={c} value={c} className="bg-bg-base">{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                                ))}
                             </select>
                          </div>
                       </div>

                       <div className="p-4 bg-amber-500/10 border border-dashed border-amber-500/30 rounded-2xl space-y-3 mt-2">
                          <button 
                            disabled={simulating}
                            onClick={simulateTrigger}
                            className="w-full bg-accent-saffron hover:bg-amber-400 disabled:opacity-50 text-bg-base font-black py-2.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(251,191,36,0.2)]"
                          >
                             {simulating ? <span className="animate-spin w-4 h-4 border-2 border-bg-base border-t-transparent rounded-full" /> : `Simulate ${TRIGGER_TYPES.find(t => t.id === selectedType)?.label}`}
                          </button>
                          <div className="space-y-1 min-h-[40px]">
                             {simSteps.map((s, i) => <p key={i} className="text-[10px] text-amber-100/60 font-monoData"> {'>'} {s}</p>)}
                          </div>
                       </div>
                    </div>
                 </GlassCard>
              </div>
           </div>

           {/* Sidebar Controls */}
           <div className="lg:col-span-4 space-y-8 animate-fade-in-up delay-300">
              <GlassCard className="p-6">
                 <h3 className="font-bold uppercase tracking-tight mb-6 flex items-center gap-2">
                   <Cpu size={18} className="text-accent-purple" /> Service Health Monitor
                 </h3>
                 <div className="space-y-5">
                    {statusError ? (
                      <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs text-center">{statusError}</div>
                    ) : status?.services.map((svc) => (
                      <div key={svc.id} className="flex items-center justify-between p-3 bg-white/[0.03] rounded-xl border border-white/5">
                        <div className="flex items-center gap-3">
                           <div className={`w-2 h-2 rounded-full ${svc.status === 'live' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]' : 'bg-rose-400 animate-pulse'}`} />
                           <span className="text-sm font-bold text-text-secondary">{svc.name}</span>
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${svc.status === 'live' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {svc.status}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center px-1">
                       <p className="text-[9px] text-text-muted font-bold uppercase tracking-[0.2em]">Next Check In 15s</p>
                       <p className="text-[9px] text-text-muted font-bold uppercase tracking-[0.2em]">{lastUpdated?.toLocaleTimeString()}</p>
                    </div>
                 </div>
              </GlassCard>

              <GlassCard className="p-6">
                 <h3 className="font-bold uppercase tracking-tight mb-6 flex items-center gap-2">
                   <Zap size={18} className="text-accent-saffron" /> Trigger Nodes (Active)
                 </h3>
                 <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {triggers.length === 0 ? (
                      <p className="text-xs text-text-muted italic text-center py-4">Loading active triggers...</p>
                    ) : triggers.map((trigger: any) => (
                      <div key={trigger.id} className="p-3 bg-white/5 border border-white/5 rounded-xl space-y-2">
                         <div className="flex justify-between items-start">
                            <TriggerBadge triggerType={trigger.trigger_type} size="sm" />
                            <span className="text-[10px] font-monoData text-text-muted">{trigger.status}</span>
                         </div>
                         <div className="flex justify-between items-end">
                            <div>
                               <p className="text-xs font-bold text-white">{trigger.zone}</p>
                               <p className="text-[10px] text-text-muted uppercase font-medium">{trigger.city}</p>
                            </div>
                            <div className="text-right">
                               <p className="text-[10px] text-text-muted font-bold uppercase">Threshold</p>
                               <p className="text-xs font-monoData text-accent-saffron">{trigger.threshold}</p>
                            </div>
                         </div>
                      </div>
                    ))}
                 </div>
              </GlassCard>
           </div>
        </div>

        {toast && (
          <div className="fixed bottom-8 right-8 animate-fade-in-up z-50">
             <GlassCard className="px-6 py-3 bg-accent-saffron text-bg-base border-none shadow-2xl flex items-center gap-3">
                <CheckCircle2 size={20} />
                <span className="font-black text-sm uppercase tracking-tight">{toast}</span>
             </GlassCard>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
