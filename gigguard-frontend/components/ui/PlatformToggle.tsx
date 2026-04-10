'use client';

interface PlatformToggleProps {
  value: 'zomato' | 'swiggy';
  onChange: (platform: 'zomato' | 'swiggy') => void;
}

const platforms = [
  { key: 'zomato' as const, label: 'Zomato', color: '#E23744' },
  { key: 'swiggy' as const, label: 'Swiggy', color: '#FC8019' },
];

export default function PlatformToggle({ value, onChange }: PlatformToggleProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-slate-100">Platform</p>
      <div className="grid grid-cols-2 gap-3">
        {platforms.map((platform) => {
          const active = value === platform.key;
          return (
            <button
              key={platform.key}
              type="button"
              onClick={() => onChange(platform.key)}
              className="rounded-xl border px-4 py-3 text-sm font-semibold transition"
              style={
                active
                  ? {
                      borderColor: platform.color,
                      background: `${platform.color}22`,
                      color: platform.color,
                      boxShadow: `0 0 20px ${platform.color}33`,
                    }
                  : undefined
              }
            >
              {platform.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
