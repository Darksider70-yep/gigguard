'use client';

import { useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import StatCard from '@/components/StatCard';
import TriggerBadge from '@/components/TriggerBadge';
import { useAuth } from '@/context/AuthContext';
import { APIError, api } from '@/lib/api';
import {
  AntiSpoofingAlertsResponse,
  DisruptionEventsResponse,
  InsurerDashboardResponse,
  ShadowComparisonResponse,
  SimulateTriggerBody,
  ZoneRiskMatrixResponse,
} from '@/lib/types';
import {
  AlertTriangle,
  AreaChart,
  Check,
  IndianRupee,
  Map,
  Rocket,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';

function formatInr(value: number): string {
  return `INR ${Math.round(value).toLocaleString('en-IN')}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200 ${className}`} />;
}

export default function InsurerPage() {
  const { insurer } = useAuth();
  const [dashboard, setDashboard] = useState<InsurerDashboardResponse | null>(null);
  const [events, setEvents] = useState<DisruptionEventsResponse['events']>([]);
  const [zones, setZones] = useState<ZoneRiskMatrixResponse['zones']>([]);
  const [alerts, setAlerts] = useState<AntiSpoofingAlertsResponse['alerts']>([]);
  const [shadow, setShadow] = useState<ShadowComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);

  const loadAll = async () => {
    const [dashboardResponse, eventsResponse, zonesResponse, alertsResponse, shadowResponse] = await Promise.all([
      api.getInsurerDashboard(),
      api.getDisruptionEvents(undefined, 20),
      api.getZoneRiskMatrix(),
      api.getAntiSpoofingAlerts(),
      api.getShadowComparison(),
    ]);

    setDashboard(dashboardResponse);
    setEvents(eventsResponse.events);
    setZones(zonesResponse.zones);
    setAlerts(alertsResponse.alerts);
    setShadow(shadowResponse);
  };

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        if (loading) {
          setLoading(true);
        }
        await loadAll();
        if (!active) {
          return;
        }
        setError(null);
      } catch (err) {
        if (!active) {
          return;
        }
        if (err instanceof APIError && err.status === 0) {
          setError('Check your connection.');
        } else if (err instanceof APIError && err.status === 401) {
          setError('Session expired. Please login again.');
        } else {
          setError('Something went wrong. Please try again.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    run();
    const timer = setInterval(run, 30_000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleApprove = async (claimId: string) => {
    try {
      const response = await api.approveClaim(claimId);
      setAlerts((prev) => prev.filter((item) => item.claim_id !== claimId));
      setToast(`Claim approved. Payout INR ${Math.round(response.payout_amount)}.`);
    } catch (err) {
      if (err instanceof APIError && err.status === 0) {
        setToast('Check your connection.');
      } else {
        setToast('Something went wrong. Please try again.');
      }
    }
  };

  const handleDeny = async (claimId: string) => {
    const reason = window.prompt('Enter denial reason', 'GPS spoofing confirmed') || '';
    if (!reason.trim()) {
      return;
    }

    try {
      await api.denyClaim(claimId, reason.trim());
      setAlerts((prev) => prev.filter((item) => item.claim_id !== claimId));
      setToast('Claim denied.');
    } catch (err) {
      if (err instanceof APIError && err.status === 0) {
        setToast('Check your connection.');
      } else {
        setToast('Something went wrong. Please try again.');
      }
    }
  };

  const handleSimulateTrigger = async () => {
    setSimulating(true);
    const payload: SimulateTriggerBody = {
      trigger_type: 'heavy_rainfall',
      city: 'mumbai',
      zone: 'Andheri West',
      trigger_value: 25.4,
      disruption_hours: 4,
    };

    try {
      await api.simulateTrigger(payload);
      setToast('Event simulated. Checking for affected workers...');
      await loadAll();
    } catch (err) {
      if (err instanceof APIError && err.status === 0) {
        setToast('Check your connection.');
      } else {
        setToast('Something went wrong. Please try again.');
      }
    } finally {
      setSimulating(false);
    }
  };

  const topEvents = useMemo(() => events.slice(0, 20), [events]);
  const topZones = useMemo(() => zones.slice(0, 10), [zones]);

  return (
    <AuthGuard allowedRoles={['insurer']}>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Insurer Dashboard</h1>
          <p className="text-slate-600">
            Signed in as {insurer?.name || 'Insurer Admin'}. Real-time operations overview.
          </p>
        </div>

        {toast ? <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-700">{toast}</div> : null}

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SkeletonBlock className="h-28" />
              <SkeletonBlock className="h-28" />
              <SkeletonBlock className="h-28" />
              <SkeletonBlock className="h-28" />
            </div>
            <SkeletonBlock className="h-56" />
            <SkeletonBlock className="h-56" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700">{error}</div>
        ) : dashboard ? (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard Icon={Users} label="Total Workers" value={dashboard.stats.total_workers.toLocaleString('en-IN')} />
              <StatCard Icon={ShieldCheck} label="Active Policies" value={dashboard.stats.active_policies.toLocaleString('en-IN')} color="text-emerald-500" />
              <StatCard Icon={IndianRupee} label="Payouts This Month" value={formatInr(dashboard.stats.payouts_this_month)} color="text-emerald-500" />
              <StatCard Icon={AlertTriangle} label="Flagged Claims" value={dashboard.stats.flagged_claims} color="text-rose-500" />
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <AreaChart className="h-4 w-4" />
                  Loss Ratio
                </p>
                <p className="text-2xl font-bold text-slate-900">{Math.round(dashboard.stats.loss_ratio * 100)}%</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <Map className="h-4 w-4" />
                  Coverage Area
                </p>
                <p className="text-xl font-bold text-slate-900">
                  {dashboard.stats.coverage_area.cities} cities / {dashboard.stats.coverage_area.zones} zones
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <IndianRupee className="h-4 w-4" />
                  Average Premium
                </p>
                <p className="text-2xl font-bold text-slate-900">{formatInr(dashboard.stats.average_premium)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              <div className="space-y-8 lg:col-span-2">
                <div>
                  <h2 className="mb-4 text-2xl font-bold text-slate-900">Disruption Events</h2>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Time</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Trigger</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Value / Threshold</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Affected</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {topEvents.map((event) => (
                          <tr key={event.id} className="hover:bg-slate-50">
                            <td className="px-4 py-4 text-sm text-slate-600">{formatDate(event.event_start)}</td>
                            <td className="px-4 py-4">
                              <TriggerBadge triggerType={event.trigger_type} />
                              <p className="mt-1 text-sm text-slate-500">
                                {event.zone}, {event.city}
                              </p>
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-700">
                              <span className="font-semibold">{event.trigger_value ?? '-'}</span> ({event.threshold})
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-700">
                              <p className="font-semibold">{event.affected_worker_count} workers</p>
                              <p className="text-emerald-600">{formatInr(event.total_payout)}</p>
                            </td>
                            <td className="px-4 py-4 text-sm">
                              {event.status === 'live' ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-1 font-semibold text-rose-700">
                                  <span className="relative flex h-2 w-2">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                                  </span>
                                  LIVE
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-700">
                                  ✓ Processed
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {topEvents.length === 0 ? (
                          <tr>
                            <td className="px-4 py-6 text-sm text-slate-500" colSpan={5}>
                              No disruption events found.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <div>
                  <h2 className="mb-4 text-2xl font-bold text-slate-900">Zone Risk Matrix</h2>
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <ul className="space-y-3">
                      {topZones.map((zone) => (
                        <li key={`${zone.city}_${zone.zone}`} className="flex items-center justify-between rounded-md p-2 hover:bg-slate-50">
                          <div>
                            <p className="font-semibold text-slate-900">{zone.zone}</p>
                            <p className="text-sm text-slate-500">{zone.city}</p>
                          </div>
                          <div className="text-right">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                zone.risk_level === 'High'
                                  ? 'bg-rose-100 text-rose-700'
                                  : zone.risk_level === 'Medium'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {zone.risk_level}
                            </span>
                            <p className="mt-1 text-sm text-slate-600">x {zone.zone_multiplier.toFixed(2)}</p>
                          </div>
                        </li>
                      ))}
                      {topZones.length === 0 ? <li className="text-sm text-slate-500">No zone data yet.</li> : null}
                    </ul>
                  </div>
                </div>

                <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6">
                  <h3 className="flex items-center gap-2 font-bold text-slate-800">
                    <Rocket className="h-5 w-5 text-sky-500" />
                    Simulate Trigger
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">Fire a sample heavy rainfall event in Mumbai.</p>
                  <button
                    type="button"
                    onClick={handleSimulateTrigger}
                    disabled={simulating}
                    className="mt-4 w-full rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-400"
                  >
                    {simulating ? 'Simulating...' : 'Simulate Event'}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              <div>
                <h2 className="mb-4 text-2xl font-bold text-slate-900">Anti-Spoofing Alerts</h2>
                <div className="space-y-4">
                  {alerts.map((alert) => (
                    <div key={alert.claim_id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{alert.worker_name}</p>
                          <p className="text-sm text-slate-700">
                            {alert.trigger_type} | {alert.zone}, {alert.city}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500">BCS</p>
                          <p className="font-semibold text-slate-900">
                            {alert.bcs_score} (Tier {alert.bcs_tier})
                          </p>
                        </div>
                      </div>
                      <ul className="mt-3 list-disc pl-5 text-sm text-slate-700">
                        {alert.graph_flags.map((flag) => (
                          <li key={`${alert.claim_id}_${flag}`}>{flag}</li>
                        ))}
                      </ul>
                      <div className="mt-4 flex gap-3">
                        <button
                          type="button"
                          onClick={() => handleApprove(alert.claim_id)}
                          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                        >
                          <Check className="h-4 w-4" />
                          Approve Claim
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeny(alert.claim_id)}
                          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                        >
                          <X className="h-4 w-4" />
                          Deny Claim
                        </button>
                      </div>
                    </div>
                  ))}
                  {alerts.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
                      No under-review alerts.
                    </div>
                  ) : null}
                </div>
              </div>

              <div>
                <h2 className="mb-4 text-2xl font-bold text-slate-900">RL Shadow Comparison</h2>
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="grid grid-cols-2 gap-3 text-sm text-slate-700">
                    <p>Total logged</p>
                    <p className="text-right font-semibold">{shadow?.total_logged ?? 0}</p>
                    <p>Mean formula premium</p>
                    <p className="text-right font-semibold">{formatInr(shadow?.mean_formula_premium ?? 0)}</p>
                    <p>Mean RL premium</p>
                    <p className="text-right font-semibold">{formatInr(shadow?.mean_rl_premium ?? 0)}</p>
                    <p>RL lower count</p>
                    <p className="text-right font-semibold">{shadow?.rl_lower_count ?? 0}</p>
                    <p>RL higher count</p>
                    <p className="text-right font-semibold">{shadow?.rl_higher_count ?? 0}</p>
                    <p>Average delta</p>
                    <p className="text-right font-semibold">{Math.round(shadow?.avg_delta ?? 0)}</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AuthGuard>
  );
}
