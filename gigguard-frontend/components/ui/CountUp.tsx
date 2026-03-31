'use client';

import { useCountUp } from '@/hooks/useCountUp';

interface CountUpProps {
  value: number;
  prefix?: string;
  suffix?: string;
  delay?: number;
  duration?: number;
  className?: string;
  formatValue?: (n: number) => string;
}

export default function CountUp({
  value,
  prefix = '',
  suffix = '',
  delay = 0,
  duration = 1500,
  className,
  formatValue,
}: CountUpProps) {
  const next = useCountUp(value, duration, delay);
  const output = formatValue ? formatValue(next) : next.toLocaleString('en-IN');

  return <span className={className}>{`${prefix}${output}${suffix}`}</span>;
}

