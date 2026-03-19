// app/insurer/page.tsx
'use client';
import { MOCK_INSURER_STATS, MOCK_DISRUPTION_EVENTS, MOCK_ZONE_RISK, MOCK_CLAIMS } from '@/lib/mockData';
import StatCard from '@/components/StatCard';
import TriggerBadge from '@/components/TriggerBadge';
import AuthGuard from '@/components/AuthGuard';
import { Users, ShieldCheck, IndianRupee, AlertTriangle, AreaChart, Map, MapPin, Check, X, Rocket } from 'lucide-react';

const flaggedClaim = MOCK_CLAIMS.find(c => c.status === 'flagged');

const LossRatioBar = ({ ratio }: { ratio: number }) => {
    const color = ratio < 0.7 ? 'bg-emerald-500' : 'bg-amber-500';
    return (
        <div className="w-full bg-slate-200 rounded-full h-2">
            <div className={`${color} h-2 rounded-full`} style={{ width: `${ratio * 100}%` }}></div>
        </div>
    )
}

const RiskLevelBadge = ({ level }: { level: string }) => {
    const color = {
        'High': 'bg-red-100 text-red-800',
        'Medium': 'bg-amber-100 text-amber-800',
        'Low': 'bg-emerald-100 text-emerald-800',
    }[level] || 'bg-slate-100 text-slate-800';
    return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${color}`}>{level}</span>
}

const SimulateTriggerPanel = () => {
    const handleSimulate = () => {
        alert("Disruption event fired! 142 workers identified. Claims created. Payouts processing via Razorpay.");
    };

    return (
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Rocket className="h-5 w-5 text-sky-500" />
                Simulate Trigger (Demo)
            </h3>
            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div>
                    <p className="text-xs text-slate-500">Trigger Type</p>
                    <p className="font-semibold">Heavy Rainfall</p>
                </div>
                 <div>
                    <p className="text-xs text-slate-500">City</p>
                    <p className="font-semibold">Mumbai</p>
                </div>
                 <div>
                    <p className="text-xs text-slate-500">Zone</p>
                    <p className="font-semibold">Andheri West</p>
                </div>
                 <div>
                    <p className="text-xs text-slate-500">Value</p>
                    <p className="font-semibold font-mono">25.4 mm/hr</p>
                </div>
            </div>
             <button
                onClick={handleSimulate}
                className="mt-6 w-full rounded-lg bg-sky-500 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-sky-500/30 hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
            >
                🚀 Simulate Event
            </button>
        </div>
    );
};


export default function InsurerPage() {
    return (
      <AuthGuard allowedRoles={['insurer']}>
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">Insurer Dashboard</h1>
                <p className="text-slate-600">Real-time platform overview · GigGuard Operations</p>
            </div>

            {/* Top Stats */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard Icon={Users} label="Total Workers" value={MOCK_INSURER_STATS.totalWorkers.toLocaleString('en-IN')} />
                <StatCard Icon={ShieldCheck} label="Active Policies" value={MOCK_INSURER_STATS.activePolicies.toLocaleString('en-IN')} color="text-emerald-500" />
                <StatCard Icon={IndianRupee} label="Payouts This Month" value={MOCK_INSURER_STATS.totalPayoutsThisMonth} color="text-emerald-500" />
                <StatCard Icon={AlertTriangle} label="Flagged Claims" value={MOCK_INSURER_STATS.fraudFlaggedClaims} color="text-red-500" />
            </div>

            {/* Second Stats Row */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <p className="text-sm font-medium text-slate-500 flex items-center gap-2"><AreaChart className="h-4 w-4"/>Loss Ratio</p>
                    <p className="text-2xl font-bold text-slate-800">{(MOCK_INSURER_STATS.lossRatio * 100).toFixed(0)}%</p>
                    <LossRatioBar ratio={MOCK_INSURER_STATS.lossRatio} />
                </div>
                 <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <p className="text-sm font-medium text-slate-500 flex items-center gap-2"><Map className="h-4 w-4"/>Coverage Area</p>
                    <p className="text-2xl font-bold text-slate-800">{MOCK_INSURER_STATS.citiesCovered} <span className="text-lg font-medium text-slate-500">Cities</span> / {MOCK_INSURER_STATS.zonesCovered} <span className="text-lg font-medium text-slate-500">Zones</span></p>
                </div>
                 <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <p className="text-sm font-medium text-slate-500 flex items-center gap-2"><IndianRupee className="h-4 w-4"/>Average Premium</p>
                    <p className="text-2xl font-bold text-slate-800">₹{MOCK_INSURER_STATS.avgPremium}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                     {/* Live Events Table */}
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-4">⚡ Disruption Events</h2>
                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Time</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Trigger</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Value / Threshold</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Affected</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {MOCK_DISRUPTION_EVENTS.map(event => (
                                        <tr key={event.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">{event.detectedAt.split(', ')[1]}</td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <TriggerBadge triggerType={event.triggerType} triggerLabel={event.triggerLabel} />
                                                <div className="text-sm text-slate-500 mt-1">{event.city} / {event.zone}</div>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                                                <span className="font-bold text-slate-800">{event.value}</span>
                                                <span className="text-slate-400"> ({event.threshold})</span>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <div className="text-sm font-semibold text-slate-800">{event.affectedWorkers} Workers</div>
                                                <div className="text-sm font-bold text-emerald-600">{event.totalPayout}</div>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap text-sm">
                                                {event.status === 'live' ? (
                                                    <span className="inline-flex items-center gap-2 rounded-full bg-red-100 px-2 py-1 font-semibold text-red-700">
                                                        <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span></span>
                                                        LIVE
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-800">✅ Processed</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <div className="space-y-8">
                     {/* Zone Risk */}
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-4">📍 Zone Risk Matrix</h2>
                        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
                            <ul className="space-y-3">
                                {MOCK_ZONE_RISK.map(zone => (
                                    <li key={zone.zone} className="flex items-center justify-between p-2 rounded-md hover:bg-slate-50">
                                        <div>
                                            <p className="font-semibold text-slate-800">{zone.zone}</p>
                                            <p className="text-sm text-slate-500">{zone.city}</p>
                                        </div>
                                        <div className="text-right">
                                            <RiskLevelBadge level={zone.riskLevel} />
                                            <p className="text-sm font-mono text-slate-600 mt-1">x {zone.multiplier.toFixed(2)}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                 {/* Flagged Claim */}
                {flaggedClaim && (
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-4">🚨 Anti-Spoofing Alerts</h2>
                        <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-md">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="font-semibold text-red-900">Sameer Shaikh · <span className="font-normal text-red-800">Heavy Rainfall</span></p>
                                    <p className="text-sm text-red-700">{flaggedClaim.zone}, {flaggedClaim.city}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-red-600">BCS Score</p>
                                    <p className="text-lg font-bold text-red-800">{flaggedClaim.bcsScore}/100 (Tier {flaggedClaim.bcsTier})</p>
                                </div>
                            </div>
                            <div className="mt-4 bg-white/60 rounded-lg p-3">
                                <p className="text-sm font-semibold text-red-900">Flag Reasons:</p>
                                <ul className="mt-1 list-disc list-inside text-sm text-red-800 space-y-0.5">
                                    {flaggedClaim.flagReasons?.map(r => <li key={r}>{r}</li>)}
                                </ul>
                            </div>
                            <div className="mt-4 flex gap-4">
                                <button className="flex-1 rounded-lg bg-emerald-500 text-white font-semibold py-2 px-4 hover:bg-emerald-600 flex items-center justify-center gap-2"><Check className="h-4 w-4"/>Approve Claim</button>
                                <button className="flex-1 rounded-lg bg-red-500 text-white font-semibold py-2 px-4 hover:bg-red-600 flex items-center justify-center gap-2"><X className="h-4 w-4"/>Deny Claim</button>
                            </div>
                        </div>
                    </div>
                )}
                
                 {/* Simulate Trigger */}
                 <div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-4 invisible">Simulate</h2>
                    <SimulateTriggerPanel />
                 </div>
            </div>

        </div>
      </AuthGuard>
    );
}
