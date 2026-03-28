import { CloudRain, ShieldAlert, Thermometer, Waves, Wind } from 'lucide-react';

interface TriggerBadgeProps {
  triggerType: string;
}

const triggerConfig: Record<
  string,
  {
    label: string;
    icon: typeof CloudRain;
    className: string;
  }
> = {
  heavy_rainfall: {
    label: 'Heavy Rainfall',
    icon: CloudRain,
    className: 'bg-blue-100 text-blue-800',
  },
  extreme_heat: {
    label: 'Extreme Heat',
    icon: Thermometer,
    className: 'bg-orange-100 text-orange-800',
  },
  flood_red_alert: {
    label: 'Flood / Red Alert',
    icon: Waves,
    className: 'bg-cyan-100 text-cyan-800',
  },
  severe_aqi: {
    label: 'Severe AQI',
    icon: Wind,
    className: 'bg-violet-100 text-violet-800',
  },
  curfew_strike: {
    label: 'Curfew / Strike',
    icon: ShieldAlert,
    className: 'bg-slate-200 text-slate-800',
  },
};

export default function TriggerBadge({ triggerType }: TriggerBadgeProps) {
  const config = triggerConfig[triggerType] || triggerConfig.curfew_strike;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${config.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </span>
  );
}
