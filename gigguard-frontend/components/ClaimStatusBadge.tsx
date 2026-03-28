import { AlertTriangle, CheckCircle2, Clock3, XCircle } from 'lucide-react';

interface ClaimStatusBadgeProps {
  status: string;
}

const statusConfig: Record<
  string,
  {
    label: string;
    icon: typeof CheckCircle2;
    className: string;
  }
> = {
  paid: {
    label: 'Paid',
    icon: CheckCircle2,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle2,
    className: 'border-sky-200 bg-sky-50 text-sky-700',
  },
  under_review: {
    label: 'Under Review',
    icon: AlertTriangle,
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  validating: {
    label: 'Validating',
    icon: Clock3,
    className: 'border-slate-200 bg-slate-100 text-slate-700',
  },
  triggered: {
    label: 'Triggered',
    icon: Clock3,
    className: 'border-slate-200 bg-slate-100 text-slate-700',
  },
  denied: {
    label: 'Denied',
    icon: XCircle,
    className: 'border-rose-200 bg-rose-50 text-rose-700',
  },
};

export default function ClaimStatusBadge({ status }: ClaimStatusBadgeProps) {
  const normalized = statusConfig[status] ? status : 'triggered';
  const config = statusConfig[normalized];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${config.className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </span>
  );
}
