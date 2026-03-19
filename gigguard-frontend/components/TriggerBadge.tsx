// components/TriggerBadge.tsx
import { CloudRain, Thermometer, Waves, Wind, ShieldAlert } from 'lucide-react';

interface TriggerBadgeProps {
  triggerType: string;
  triggerLabel: string;
}

const triggerConfig: { [key: string]: { icon: React.ElementType; color: string } } = {
  heavy_rainfall: { icon: CloudRain, color: 'bg-blue-100 text-blue-800' },
  extreme_heat: { icon: Thermometer, color: 'bg-orange-100 text-orange-800' },
  flood_alert: { icon: Waves, color: 'bg-red-100 text-red-800' },
  severe_aqi: { icon: Wind, color: 'bg-purple-100 text-purple-800' },
  curfew_strike: { icon: ShieldAlert, color: 'bg-slate-100 text-slate-800' },
};

const TriggerBadge = ({ triggerType, triggerLabel }: TriggerBadgeProps) => {
  const config = triggerConfig[triggerType] || triggerConfig['curfew_strike'];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-x-1.5 rounded-md px-2 py-1 text-xs font-medium ${config.color}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {triggerLabel}
    </span>
  );
};

export default TriggerBadge;
