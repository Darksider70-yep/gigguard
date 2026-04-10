'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import CountUp from './CountUp';

interface StatCardProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  href?: string;
  accent?: 'saffron' | 'green' | 'red' | 'blue' | 'default';
  icon?: ReactNode;
  delay?: number;
  formatValue?: (n: number) => string;
  subtitle?: string;
}

const ACCENT_CLASS: Record<NonNullable<StatCardProps['accent']>, string> = {
  saffron: 'text-amber-400 border-amber-500/40',
  green: 'text-emerald-400 border-emerald-500/40',
  red: 'text-rose-400 border-rose-500/40',
  blue: 'text-blue-400 border-blue-500/40',
  default: 'text-slate-200 border-slate-700',
};

export default function StatCard({
  label,
  value,
  prefix,
  suffix,
  href,
  accent = 'default',
  icon,
  delay = 0,
  formatValue,
  subtitle,
}: StatCardProps) {
  const router = useRouter();

  const className = ACCENT_CLASS[accent];

  return (
    <button
      type="button"
      onClick={() => {
        if (href) {
          router.push(href);
        }
      }}
      className={`surface-card card-interactive animate-fade-in-up delay-${delay} w-full border-l-4 p-4 text-left ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-secondary">{label}</p>
          <div className="mt-2 text-3xl font-semibold font-mono-data">
            <CountUp
              value={value}
              prefix={prefix}
              suffix={suffix}
              delay={delay}
              formatValue={formatValue}
            />
          </div>
          {subtitle ? <p className="mt-1 text-xs text-muted">{subtitle}</p> : null}
        </div>
        {icon ? <div className="text-xl opacity-85">{icon}</div> : null}
      </div>
    </button>
  );
}

