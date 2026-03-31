'use client';

interface RadialGaugeProps {
  value: number;
  max?: number;
  label?: string;
  color?: string;
  size?: number;
}

export default function RadialGauge({
  value,
  max = 100,
  label,
  color = 'var(--accent-saffron)',
  size = 120,
}: RadialGaugeProps) {
  const bounded = Math.max(0, Math.min(max, value));
  const pct = max === 0 ? 0 : Math.round((bounded / max) * 100);
  const degrees = Math.round((pct / 100) * 360);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: `conic-gradient(${color} ${degrees}deg, rgba(51,65,85,0.55) ${degrees}deg)`,
          display: 'grid',
          placeItems: 'center',
          border: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            width: size * 0.72,
            height: size * 0.72,
            borderRadius: '50%',
            background: 'var(--bg-surface)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <span className="font-mono-data text-xl font-semibold" style={{ color }}>
            {Math.round(bounded)}
          </span>
        </div>
      </div>
      {label ? <p className="text-xs text-secondary">{label}</p> : null}
    </div>
  );
}

