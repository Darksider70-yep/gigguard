// components/ClaimStatusBadge.tsx
import { CheckCircle2, AlertTriangle, Clock, XCircle } from 'lucide-react';

type Status = 'paid' | 'flagged' | 'approved' | 'pending' | 'triggered';

interface ClaimStatusBadgeProps {
  status: Status;
}

const statusConfig = {
  paid: {
    label: 'Paid',
    icon: CheckCircle2,
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle2,
    color: 'text-sky-700 bg-sky-50 border-sky-200',
  },
  pending: {
    label: 'Processing',
    icon: Clock,
    color: 'text-amber-700 bg-amber-50 border-amber-200',
  },
  flagged: {
    label: 'Under Review',
    icon: AlertTriangle,
    color: 'text-red-700 bg-red-50 border-red-200',
  },
  triggered: {
    label: 'Triggered',
    icon: AlertTriangle,
    color: 'text-amber-700 bg-amber-50 border-amber-200',
  },
};

const ClaimStatusBadge = ({ status }: ClaimStatusBadgeProps) => {
  const config = statusConfig[status];

  if (!config) {
    return null;
  }

  const { label, icon: Icon, color } = config;

  return (
    <div
      className={`inline-flex items-center space-x-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${color}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </div>
  );
};

export default ClaimStatusBadge;
