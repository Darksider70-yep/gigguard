// components/PolicyCard.tsx
import { MOCK_ACTIVE_POLICY } from '@/lib/mockData';
import { BadgeCheck, ChevronsRight } from 'lucide-react';

type Policy = typeof MOCK_ACTIVE_POLICY;

interface PolicyCardProps {
  policy: Policy;
}

const PolicyCard = ({ policy }: PolicyCardProps) => {
  return (
    <div className="rounded-xl border-2 border-sky-500 bg-sky-50/50 p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <span className="inline-flex items-center space-x-2 rounded-full bg-sky-200 px-3 py-1 text-sm font-semibold text-sky-800">
            <BadgeCheck className="h-5 w-5" />
            <span>ACTIVE POLICY</span>
          </span>
          <h3 className="mt-3 text-lg font-bold text-slate-900">{policy.weekLabel}</h3>
          <p className="text-sm text-slate-500">Purchased: {policy.purchasedAt}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-600">Premium Paid</p>
          <p className="text-2xl font-bold text-sky-600">₹{policy.premium}</p>
        </div>
      </div>
      
      <div className="mt-4 rounded-lg bg-white p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Coverage</p>
            <p className="text-lg font-semibold text-slate-800">Up to ₹{policy.coverageAmount}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Zone</p>
            <p className="text-lg font-semibold text-slate-800">{policy.zone}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">City</p>
            <p className="text-lg font-semibold text-slate-800">{policy.city}</p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <details>
          <summary className="flex cursor-pointer items-center text-xs font-semibold text-slate-500 hover:text-slate-800">
            Show premium calculation
            <ChevronsRight className="ml-1 h-3 w-3" />
          </summary>
          <div className="mt-2 rounded-md bg-sky-100/70 p-3 text-xs text-slate-600">
            <p className="font-mono">
              Base <span className="font-bold">₹{policy.multipliers.baseRate}</span> × 
              Zone <span className="font-bold">{policy.multipliers.zoneMultiplier.toFixed(2)}</span> × 
              Weather <span className="font-bold">{policy.multipliers.weatherMultiplier.toFixed(2)}</span> × 
              History <span className="font-bold">{policy.multipliers.historyMultiplier.toFixed(2)}</span> 
              = <span className="font-bold">₹{policy.multipliers.finalPremium.toFixed(2)}</span>
            </p>
          </div>
        </details>
      </div>
    </div>
  );
};

export default PolicyCard;
