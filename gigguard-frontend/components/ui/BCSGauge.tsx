'use client';

interface BCSGaugeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_MAP: Record<NonNullable<BCSGaugeProps['size']>, number> = {
  sm: 64,
  md: 96,
  lg: 128,
};

export default function BCSGauge({ score, size = 'md' }: BCSGaugeProps) {
  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  const color = bounded >= 70 ? 'var(--accent-green)' : bounded >= 40 ? 'var(--accent-saffron)' : 'var(--accent-red)';
  const label = bounded >= 70 ? 'Strong' : bounded >= 40 ? 'Moderate' : 'Weak';
  const px = SIZE_MAP[size];
  const degrees = Math.round(bounded * 3.6);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        style={{
          width: px,
          height: px,
          borderRadius: '50%',
          background: `conic-gradient(${color} ${degrees}deg, var(--bg-elevated) ${degrees}deg)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: px * 0.7,
            height: px * 0.7,
            borderRadius: '50%',
            background: 'var(--bg-surface)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--border)',
          }}
        >
          <span className="font-mono-data font-bold" style={{ color, fontSize: px * 0.22, lineHeight: 1 }}>
            {bounded}
          </span>
          <span style={{ fontSize: px * 0.11, color: 'var(--text-muted)' }}>/100</span>
        </div>
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}

