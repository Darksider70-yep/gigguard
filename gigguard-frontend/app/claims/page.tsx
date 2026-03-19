// app/claims/page.tsx
'use client';

import { MOCK_CLAIMS } from '@/lib/mockData';
import ClaimStatusBadge from '@/components/ClaimStatusBadge';
import TriggerBadge from '@/components/TriggerBadge';
import { IndianRupee, Hash, Calendar, AlertOctagon, BarChartHorizontal } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';

const totalPayouts = MOCK_CLAIMS.filter(c => c.status === 'paid').reduce((acc, claim) => acc + claim.payoutAmount, 0);
const claimsThisMonth = MOCK_CLAIMS.filter(c => new Date(c.date).getMonth() === new Date("Mar 19, 2026").getMonth()).length;

const FraudScoreBar = ({ score }: { score: number }) => {
    let color = 'bg-emerald-500';
    if (score > 0.3 && score <= 0.6) color = 'bg-amber-500';
    if (score > 0.6) color = 'bg-red-500';

    return (
        <div>
            <div className="w-full bg-slate-200 rounded-full h-1.5">
                <div className={`${color} h-1.5 rounded-full`} style={{ width: `${score * 100}%` }}></div>
            </div>
            <span className="text-xs text-slate-500">Fraud Score: {score.toFixed(2)}</span>
        </div>
    );
};

const BcsBar = ({ score }: { score: number }) => {
    let color = 'bg-red-500';
    if (score > 60) color = 'bg-emerald-500';
    else if (score > 40) color = 'bg-amber-500';

    return (
        <div>
            <div className="w-full bg-slate-200 rounded-full h-2.5">
                <div className={`${color} h-2.5 rounded-full`} style={{ width: `${score}%` }}></div>
            </div>
        </div>
    );
};

export default function ClaimsPage() {
  return (
    <AuthGuard allowedRoles={['worker']}>
      <div className="space-y-8">
          <div>
              <h1 className="text-3xl font-bold text-slate-900">Claims History</h1>
              <p className="text-slate-600">All your automated insurance claims in one place.</p>
          </div>

          {/* Header Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                  <p className="text-sm text-slate-500 flex items-center gap-2"><IndianRupee className="h-4 w-4" /> Total Paid Out</p>
                  <p className="text-2xl font-bold text-emerald-600">₹{totalPayouts.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                  <p className="text-sm text-slate-500 flex items-center gap-2"><Calendar className="h-4 w-4" /> Claims This Month</p>
                  <p className="text-2xl font-bold text-slate-800">{claimsThisMonth}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                  <p className="text-sm text-slate-500 flex items-center gap-2"><Hash className="h-4 w-4" /> Paid Claims Streak</p>
                  <p className="text-2xl font-bold text-slate-800">3</p>
              </div>
          </div>

          {/* Claims List */}
          <div className="space-y-6">
              {MOCK_CLAIMS.map(claim => (
                  <div key={claim.id} className={`rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden
                      ${claim.status === 'flagged' ? 'border-l-4 border-red-500' : ''} 
                      transition-shadow hover:shadow-md
                  `}>
                      <div className="p-5 grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
                          {/* Info */}
                          <div className="md:col-span-2 space-y-2">
                               <TriggerBadge triggerType={claim.triggerType} triggerLabel={claim.triggerLabel} />
                              <p className="text-slate-500 text-sm">{claim.date} at {claim.time}</p>
                              <p className="text-sm"><span className="font-semibold text-slate-700">{claim.zone}, {claim.city}</span></p>
                               <p className="text-sm text-slate-600 font-mono border-l-2 border-slate-300 pl-2">
                                  Trigger: {claim.rainfallValue}
                               </p>
                          </div>
                          
                          {/* Payout */}
                          <div className="flex flex-col items-start md:items-center">
                              <p className="text-xs text-slate-500">Payout</p>
                              <p className={`text-3xl font-bold ${claim.status === 'paid' ? 'text-emerald-600' : 'text-slate-700'}`}>
                                  ₹{claim.payoutAmount}
                              </p>
                              <p className="text-xs text-slate-500">{claim.disruptionHours} hours disruption</p>
                          </div>

                          {/* Status */}
                          <div className="flex flex-col items-start md:items-center">
                             <p className="text-xs text-slate-500 mb-1">Status</p>
                             <ClaimStatusBadge status={claim.status as any} />
                             {claim.paidAt && <p className="text-xs text-slate-400 mt-1">{claim.paidAt}</p>}
                          </div>

                           {/* Details */}
                          <div className="flex flex-col items-start md:items-end">
                              {claim.razorpayRef && (
                                  <p className="text-xs text-slate-400 font-mono">Ref: {claim.razorpayRef}</p>
                              )}
                              <div className="mt-2 w-32">
                                  <FraudScoreBar score={claim.fraudScore} />
                              </div>
                          </div>
                      </div>

                      {/* Flagged Details */}
                      {claim.status === 'flagged' && (
                          <div className="bg-red-50 border-t border-red-200 p-5">
                              <div className="flex flex-col md:flex-row gap-6">
                                  <div className="flex-shrink-0">
                                       <h4 className="font-semibold text-red-800 flex items-center gap-2"><BarChartHorizontal className="h-5 w-5"/>Behavioral Coherence Score</h4>
                                       <p className="text-3xl font-bold text-red-700">{claim.bcsScore}/100</p>
                                       <BcsBar score={claim.bcsScore} />
                                       <p className="text-sm font-semibold text-red-700 mt-1">Tier {claim.bcsTier}</p>
                                  </div>
                                  <div className="border-l border-red-200 pl-6">
                                      <h4 className="font-semibold text-red-800 flex items-center gap-2"><AlertOctagon className="h-5 w-5"/>Anti-Spoofing System Alert</h4>
                                      <p className="text-sm text-red-700 mt-1">Our system detected the following inconsistencies:</p>
                                      <ul className="mt-2 list-disc list-inside text-sm text-red-900 space-y-1">
                                          {claim.flagReasons?.map(reason => <li key={reason}>{reason}</li>)}
                                      </ul>
                                      <p className="text-xs text-red-600 mt-3">
                                         A human reviewer will contact you within 4 hours. If cleared, you'll receive a ₹20 goodwill bonus.
                                      </p>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
              ))}
          </div>
      </div>
    </AuthGuard>
  );
}
