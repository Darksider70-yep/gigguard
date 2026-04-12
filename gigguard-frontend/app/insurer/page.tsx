'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import StatCard from '@/components/ui/StatCard';
import TriggerBadge from '@/components/ui/TriggerBadge';
import BCSGauge from '@/components/ui/BCSGauge';
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

interface DashboardBundle {
  dashboard: InsurerDashboardResponse;
  events: DisruptionEventsResponse['events'];
  zones: ZoneRiskMatrixResponse['zones'];
  alerts: AntiSpoofingAlertsResponse['alerts'];
  shadow: ShadowComparisonResponse;
  payouts: InsurerPayoutsResponse;
}
const INR = '\u20B9';

function formatInr(value: number): string {
  return `\u20B9${Math.round(value).toLocaleString('en-IN')}`;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function riskClass(multiplier: number): string {
  if (multiplier > 1.2) return 'bg-rose-500/20 text-rose-200 border-rose-500/30';
  if (multiplier >= 1.0) return 'bg-amber-500/20 text-amber-200 border-amber-500/30';
  return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30';
}

export default function InsurerPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simSteps, setSimSteps] = useState<string[]>([]);
  const [status, setStatus] = useState<PlatformStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [eventsFlash, setEventsFlash] = useState(false);

  const fetchBundle = async (): Promise<DashboardBundle> => {
    const currentDate = new Date();
    const currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

    const [dashboard, events, zones, alerts, shadow, payouts] = await Promise.all([
      api.getInsurerDashboard(),
      api.getDisruptionEvents(undefined, 20),
      api.getZoneRiskMatrix(),
      api.getAntiSpoofingAlerts(),
      api.getShadowComparison(),
      api.getInsurerPayouts({ month: currentMonth, page: 1, limit: 1000 }),
    ]);

    return {
      dashboard,
      events: events.events,
      zones: zones.zones,
      alerts: alerts.alerts,
      shadow,
      payouts,
    };
  };

  const { data, loading, error, lastUpdated, refresh } = useDataRefresh(fetchBundle, 30000, true);

  useEffect(() => {
    let active = true;

    const loadStatus = async () => {
      try {
        const payload = await api.getPlatformStatus();
        if (!active) {
          return;
        }
        setStatus(payload);
        setStatusError(null);
      } catch (err) {
        if (!active) {
          return;
        }
        setStatusError(err instanceof Error ? err.message : 'Status unavailable');
      }
    };

    void loadStatus();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!eventsFlash) {
      return;
    }

    const timer = window.setTimeout(() => setEventsFlash(false), 1800);
    return () => window.clearTimeout(timer);
  }, [eventsFlash]);

  const approveClaim = async (claimId: string) => {
    const password = window.prompt('Enter your insurer password to approve claim:')?.trim() ?? '';
    if (!password) {
      return;
    }

    try {
      const response = await api.approveClaim(claimId);
      setToast(`Approved. Payout ${formatInr(response.payout_amount)}`);
      await refresh();
      setEventsFlash(true);
    } catch (err) {
      if (err instanceof APIError && err.status === 0) {
        setToast('Network unavailable');
      } else {
        setToast('Approve action failed');
      }
    }
  };

  const denyClaim = async (claimId: string) => {
    const password = window.prompt('Enter your insurer password to deny claim:')?.trim() ?? '';
    if (!password) {
      return;
    }

    const reason = window.prompt('Reason for denial')?.trim() ?? '';
    if (!reason) {
      return;
    }

    try {
      await api.denyClaim(claimId, reason);
      setToast('Claim denied');
      await refresh();
      setEventsFlash(true);
    } catch (err) {
      if (err instanceof APIError && err.status === 0) {
        setToast('Network unavailable');
      } else {
        setToast('Deny action failed');
      }
    }
  };

  const simulateTrigger = async () => {
    setSimulating(true);
    setSimSteps([]);

    const pushStep = (label: string, delay: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(() => {
          setSimSteps((prev) => [...prev, label]);
          resolve();
        }, delay);
      });

    try {
      await pushStep('Creating disruption event...', 0);
      await pushStep('Finding affected workers...', 800);
      await pushStep('Enqueueing claims...', 800);

      const payload: SimulateTriggerBody = {
        trigger_type: 'heavy_rainfall',
        city: 'mumbai',
        zone: 'Andheri West',
        trigger_value: 25.4,
        lat: 19.1364,
        lng: 72.8296,
      };

      const result = (await api.simulateTrigger(payload)) as {
        affected_workers?: number;
      };

      await pushStep(`Done. ${result.affected_workers ?? 0} workers affected.`, 800);
      await refresh();
      setEventsFlash(true);
    } catch {
      setSimSteps((prev) => [...prev, 'Simulation failed. Check service logs.']);
    } finally {
      setSimulating(false);
    }
  };

  const stats = data?.dashboard.stats;
  const events = useMemo(() => data?.events ?? [], [data]);
  const zones = useMemo(() => data?.zones ?? [], [data]);
  const alerts = useMemo(() => data?.alerts ?? [], [data]);

  return (
    <AuthGuard allowedRoles={['insurer']}>
      {loading && !data ? (
        <div className="space-y-3">
          <div className="skeleton h-24 rounded-xl" />
          <div className="skeleton h-40 rounded-xl" />
          <div className="skeleton h-56 rounded-xl" />
        </div>
      ) : error ? (
        <div className="surface-card border-rose-500/40 p-4 text-rose-300">{error}</div>
      ) : data && stats ? (
        <div className="space-y-6">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Insurer Command Center</h1>
              <p className="text-sm text-secondary">Real-time operations for triggers, fraud review, and payouts.</p>
            </div>
            <p className="text-xs text-muted">
              Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString('en-IN') : '---'}
            </p>
          </div>

          {toast ? <div className="surface-card border-amber-500/40 p-3 text-sm text-amber-200">{toast}</div> : null}

          <section className="grid grid-cols-7 gap-3">
            <StatCard label="Total Workers" value={stats.total_workers} href="/insurer/workers" accent="default" subtitle="Tracked workers" />
            <StatCard label="Active Policies" value={stats.active_policies} href="/insurer/policies" accent="green" subtitle="Weekly active" />
            <StatCard label="Payouts This Month" value={stats.payouts_this_month} prefix={INR} href="/insurer/payouts" accent="saffron" />
            <StatCard label="Flagged Claims" value={stats.flagged_claims} href="/insurer/flagged" accent="red" subtitle="Needs review" />
            <StatCard label="Loss Ratio" value={Math.round(stats.loss_ratio * 100)} suffix="%" href="/insurer/analytics" accent="blue" />
            <StatCard
              label="Coverage Area"
              value={stats.coverage_area.zones}
              suffix=" zones"
              href="/insurer/coverage"
              accent="default"
              subtitle={`${stats.coverage_area.cities} cities`}
            />
            <StatCard label="Average Premium" value={stats.average_premium} prefix={INR} href="/insurer/analytics" accent="saffron" />
          </section>

          <section className="grid grid-cols-5 gap-5">
            <div className={`surface-card col-span-3 overflow-hidden p-4 ${eventsFlash ? 'data-flash shake-on-update' : ''}`}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Disruption Events</h2>
                <span className="text-xs text-secondary">Refreshing every 30s...</span>
              </div>
              <table className="w-full border-separate border-spacing-y-2 text-sm">
                <thead className="text-xs uppercase tracking-[0.1em] text-muted">
                  <tr>
                    <th className="text-left">Trigger</th>
                    <th className="text-left">Value</th>
                    <th className="text-left">Affected</th>
                    <th className="text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="table-row-hover rounded-lg border border-slate-800 bg-slate-900/40">
                      <td className="px-2 py-2">
                        <TriggerBadge triggerType={event.trigger_type} size="sm" />
                        <p className="mt-1 text-xs text-secondary">{event.zone}, {event.city}</p>
                        <p className="text-xs text-muted">{formatTime(event.event_start)}</p>
                      </td>
                      <td className="px-2 py-2 font-mono-data">{event.trigger_value ?? '-'} (&gt; {event.threshold})</td>
                      <td className="px-2 py-2">
                        <Link href="/insurer/workers" className="font-mono-data text-amber-300 hover:text-amber-200">
                          {event.affected_worker_count} workers
                        </Link>
                        <p className="text-xs text-secondary">{formatInr(event.total_payout)}</p>
                      </td>
                      <td className="px-2 py-2">
                        {event.status === 'active' ? (
                          <span className="status-pill badge-live inline-flex items-center gap-2">
                            <span className="live-dot" />
                            LIVE
                          </span>
                        ) : (
                          <span className="status-pill badge-paid">Processed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="col-span-2 space-y-4">
              <div className="surface-card p-4">
                <h3 className="text-lg font-semibold">Zone Risk Matrix</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {zones.slice(0, 16).map((zone) => (
                    <Link
                      key={`${zone.city}_${zone.zone}`}
                      href={`/insurer/coverage?zone=${encodeURIComponent(zone.zone)}`}
                      className={`rounded-full border px-2 py-1 text-xs ${riskClass(zone.zone_multiplier)}`}
                    >
                      {zone.zone} x{zone.zone_multiplier.toFixed(2)}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="surface-card border-dashed border-amber-500/40 p-4">
                <h3 className="text-lg font-semibold">Simulate Trigger</h3>
                <p className="mt-1 text-sm text-secondary">Heavy Rainfall / Mumbai / Andheri West</p>
                <button
                  type="button"
                  onClick={simulateTrigger}
                  disabled={simulating}
                  className="btn-saffron mt-3 w-full px-3 py-2 disabled:opacity-60"
                >
                  Simulate Event
                </button>
                <div className="mt-3 space-y-1 text-xs text-secondary">
                  {simSteps.map((step) => (
                    <p key={step}>{step}</p>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-5">
            <div className="surface-card p-4">
              <h3 className="text-lg font-semibold">Anti-Spoofing Alerts</h3>
              <div className="mt-3 space-y-3">
                {alerts.length === 0 ? <p className="text-sm text-secondary">No active alerts</p> : null}
                {alerts.map((alert) => (
                  <article key={alert.claim_id} className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold">{alert.worker_name}</p>
                        <p className="text-xs text-secondary">{alert.zone}, {alert.city}</p>
                      </div>
                      <BCSGauge score={alert.bcs_score} size="sm" />
                    </div>
                    <ul className="mt-2 list-disc pl-5 text-xs text-secondary">
                      {Array.isArray(alert.graph_flags) ? alert.graph_flags.map((flag: string) => (
                        <li key={`${alert.claim_id}_${flag}`}>{flag}</li>
                      )) : <li>GNN Fraud Intelligence Event</li>}
                    </ul>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => void approveClaim(alert.claim_id)}
                        className="rounded bg-emerald-500/20 px-3 py-1 text-xs text-emerald-200"
                        type="button"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => void denyClaim(alert.claim_id)}
                        className="rounded bg-rose-500/20 px-3 py-1 text-xs text-rose-200"
                        type="button"
                      >
                        Deny
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="surface-card p-4">
              <h3 className="text-lg font-semibold">Live Service Health</h3>
              {statusError ? <p className="mt-2 text-sm text-rose-300">{statusError}</p> : null}
              {status ? (
                <div className="mt-4 space-y-3">
                  {status.services.map((svc) => (
                    <div key={svc.id} className="flex items-center justify-between">
                      <span className="text-sm font-medium">{svc.name}</span>
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${svc.status === 'live' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]'}`} />
                        <span className={`text-xs uppercase tracking-wider ${svc.status === 'live' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {svc.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                  <p className="mt-4 border-t border-slate-800 pt-2 text-[10px] uppercase tracking-widest text-muted">
                    Last Health Check: {new Date(status.checked_at).toLocaleTimeString('en-IN')}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-secondary italic">Monitoring system connectivity...</p>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </AuthGuard>
  );
}
