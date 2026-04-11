import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, Clock3, XCircle } from 'lucide-react';

interface ClaimStatusBadgeProps {
  status: string;
}

export default function ClaimStatusBadge({ status }: ClaimStatusBadgeProps) {
  const t = useTranslations('claims');

  const statusConfig: Record<
    string,
    {
      label: string;
      icon: typeof CheckCircle2;
      className: string;
    }
  > = {
    paid: {
      label: t('status_paid'),
      icon: CheckCircle2,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    approved: {
      label: t('status_approved'),
      icon: CheckCircle2,
      className: 'border-sky-200 bg-sky-50 text-sky-700',
    },
    under_review: {
      label: t('status_under_review'),
      icon: AlertTriangle,
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    },
    flagged: {
      label: t('status_flagged'),
      icon: AlertTriangle,
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    },
    validating: {
      label: t('status_pending'),
      icon: Clock3,
      className: 'border-slate-200 bg-slate-100 text-slate-700',
    },
    triggered: {
      label: t('status_pending'),
      icon: Clock3,
      className: 'border-slate-200 bg-slate-100 text-slate-700',
    },
    denied: {
      label: t('status_denied'),
      icon: XCircle,
      className: 'border-rose-200 bg-rose-50 text-rose-700',
    },
  };

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
