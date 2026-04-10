'use client';

interface TriggerBadgeProps {
  triggerType: string;
  size?: 'sm' | 'md' | 'lg';
}

const TRIGGER_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  heavy_rainfall: { icon: '\uD83C\uDF27\uFE0F', label: 'Heavy Rainfall', color: '#3b82f6' },
  extreme_heat: { icon: '\uD83C\uDF21\uFE0F', label: 'Extreme Heat', color: '#f97316' },
  flood_red_alert: { icon: '\uD83C\uDF0A', label: 'Flood/Red Alert', color: '#0ea5e9' },
  flood_alert: { icon: '\uD83C\uDF0A', label: 'Flood/Red Alert', color: '#0ea5e9' },
  severe_aqi: { icon: '\uD83D\uDE37', label: 'Severe AQI', color: '#8b5cf6' },
  curfew_strike: { icon: '\uD83D\uDEAB', label: 'Curfew/Strike', color: '#ef4444' },
};

const SIZE_MAP: Record<NonNullable<TriggerBadgeProps['size']>, string> = {
  sm: 'text-[11px] px-2 py-1',
  md: 'text-xs px-2.5 py-1',
  lg: 'text-sm px-3 py-1.5',
};

export default function TriggerBadge({ triggerType, size = 'md' }: TriggerBadgeProps) {
  const config = TRIGGER_CONFIG[triggerType] ?? TRIGGER_CONFIG.curfew_strike;

  return (
    <span
      className={`status-pill inline-flex items-center gap-1.5 ${SIZE_MAP[size]}`}
      style={{
        background: `${config.color}1A`,
        color: config.color,
        border: `1px solid ${config.color}4D`,
      }}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}

