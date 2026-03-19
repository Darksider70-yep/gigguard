// components/StatCard.tsx
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  Icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

const StatCard = ({ Icon, label, value, sub, color = 'text-sky-500' }: StatCardProps) => {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex flex-col space-y-1">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          {sub && <p className="text-xs text-slate-400">{sub}</p>}
        </div>
        <div className={`rounded-lg bg-slate-100 p-2 ${color}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
};

export default StatCard;
