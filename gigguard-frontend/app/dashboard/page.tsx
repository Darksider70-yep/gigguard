'use client';

import Link from 'next/link';
import { MOCK_WORKER, MOCK_ACTIVE_POLICY, MOCK_CLAIMS } from '@/lib/mockData';
import PolicyCard from '@/components/PolicyCard';
import ClaimStatusBadge from '@/components/ClaimStatusBadge';
import TriggerBadge from '@/components/TriggerBadge';
import { MapPin, Briefcase, BarChart, FileText, Calendar, Shield, PiggyBank, Award, Percent } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';

const totalPayouts = MOCK_CLAIMS.filter(c => c.status === 'paid').reduce((acc, claim) => acc + claim.payoutAmount, 0);

const ProgressBar = ({ progress }: { progress: number }) => (
    <div className="w-full bg-slate-200 rounded-full h-2.5">
        <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
    </div>
);

export default function DashboardPage() {
    const earningsAtRisk = MOCK_WORKER.avgDailyEarning * 6;
    const coverageRatio = (MOCK_ACTIVE_POLICY.coverageAmount / earningsAtRisk) * 100;

  return (
    <AuthGuard allowedRoles={['worker']}>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Main Column */}
          <div className="space-y-8 lg:col-span-2">
              {/* Welcome Banner */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                      <h1 className="text-3xl font-bold text-slate-900">Good evening, {MOCK_WORKER.name.split(' ')[0]} 👋</h1>
                      <p className="text-slate-500">Thursday, 19 March, 2026</p>
                  </div>
                  <div className="flex items-center gap-4">
                      <span className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-700">
                          <Briefcase className="h-4 w-4" /> {MOCK_WORKER.platform} Partner
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                          <MapPin className="h-4 w-4" /> {MOCK_WORKER.zone}, {MOCK_WORKER.city}
                      </span>
                  </div>
              </div>

              {/* Live Alert Banner */}
              <div className="relative overflow-hidden rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
                  <div className="flex items-start gap-4">
                      <div className="mt-1 h-5 w-5 flex-shrink-0 text-amber-500">
                          <span className="absolute flex h-5 w-5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-5 w-5 bg-amber-500"></span>
                          </span>
                      </div>
                      <div>
                          <h3 className="text-lg font-bold text-amber-900">Heavy Rainfall detected in your zone right now</h3>
                          <p className="font-mono text-sm text-amber-800">25.4 mm/hr. Your claim is being processed.</p>
                          <div className="mt-3 space-y-2">
                              <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                                  <span>Triggered</span>
                                  <span>Validating</span>
                                  <span className="font-bold">Approved</span>
                                  <span>Paid</span>
                              </div>
                              <ProgressBar progress={75} />
                          </div>
                      </div>
                  </div>
              </div>

              {/* Active Policy Card */}
              <PolicyCard policy={MOCK_ACTIVE_POLICY} />

              {/* Recent Claims */}
              <div>
                  <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-bold text-slate-900">Recent Claims</h2>
                      <Link href="/claims" className="text-sm font-semibold text-sky-600 hover:underline">
                          View All Claims →
                      </Link>
                  </div>
                  <div className="mt-4 space-y-4">
                      {MOCK_CLAIMS.slice(0, 3).map(claim => (
                          <div key={claim.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                                  <div>
                                      <p className="text-xs text-slate-500">{claim.date}</p>
                                      <TriggerBadge triggerType={claim.triggerType} triggerLabel={claim.triggerLabel} />
                                  </div>
                                  <div className="text-right sm:text-left">
                                      <p className="text-xs text-slate-500">Payout</p>
                                      <p className="font-bold text-emerald-600 text-lg">₹{claim.payoutAmount}</p>
                                  </div>
                                  <div className="sm:col-span-2 sm:flex sm:items-center sm:justify-end">
                                      <ClaimStatusBadge status={claim.status as any} />
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
              {/* Earnings at Risk */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Percent className="h-4 w-4 text-slate-500" />Earnings at Risk</h3>
                  <div className="mt-3">
                      <div className="flex justify-between text-sm">
                          <span className="text-slate-600">This week's estimated earnings</span>
                          <span className="font-semibold text-slate-800">₹{earningsAtRisk.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-sm mt-1">
                          <span className="text-slate-600">Active coverage</span>
                          <span className="font-semibold text-sky-600">₹{MOCK_ACTIVE_POLICY.coverageAmount}</span>
                      </div>
                      <div className="mt-3">
                          <div className="w-full bg-slate-200 rounded-full h-2">
                              <div className="bg-sky-500 h-2 rounded-full" style={{ width: `${coverageRatio.toFixed(1)}%` }}></div>
                          </div>
                          <p className="text-right text-xs text-slate-500 mt-1">{coverageRatio.toFixed(1)}% of earnings covered</p>
                      </div>
                  </div>
              </div>

              {/* Risk Score */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2"><BarChart className="h-4 w-4 text-slate-500" />Risk Profile</h3>
                   <div className="mt-3">
                      <div className="flex justify-between text-sm">
                          <span className="text-slate-600">ML Risk Score</span>
                          <span className="font-semibold text-amber-600">{MOCK_WORKER.riskScore} / 1.0</span>
                      </div>
                      <div className="mt-1 w-full bg-slate-200 rounded-full h-2">
                          <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${MOCK_WORKER.riskScore * 100}%` }}></div>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">Zone Multiplier: <span className="font-bold text-slate-700">{MOCK_ACTIVE_POLICY.multipliers.zoneMultiplier.toFixed(2)}x (High risk zone)</span></p>
                  </div>
              </div>
              
              {/* Quick Stats */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Award className="h-4 w-4 text-slate-500" />Quick Stats</h3>
                  <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                          <span className="text-slate-600 flex items-center gap-2"><PiggyBank className="h-4 w-4 text-emerald-500" /> Total Payouts Received</span>
                          <span className="font-semibold text-slate-800">₹{totalPayouts.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex items-center justify-between">
                          <span className="text-slate-600 flex items-center gap-2"><Shield className="h-4 w-4 text-sky-500" /> Policies Purchased</span>
                          <span className="font-semibold text-slate-800">4</span>
                      </div>
                      <div className="flex items-center justify-between">
                          <span className="text-slate-600 flex items-center gap-2"><FileText className="h-4 w-4 text-slate-400" /> Claims Paid</span>
                          <span className="font-semibold text-slate-800">3</span>
                      </div>
                      <div className="flex items-center justify-between">
                          <span className="text-slate-600 flex items-center gap-2"><Calendar className="h-4 w-4 text-slate-400" /> Member Since</span>
                          <span className="font-semibold text-slate-800">{MOCK_WORKER.memberSince}</span>
                      </div>
                  </div>
              </div>
          </div>
      </div>
    </AuthGuard>
  );
}
