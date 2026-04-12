import { CSSProperties } from 'react';

interface AmountDisplayProps {
  amount: number | string;
  currency?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSymbol?: boolean;
  style?: CSSProperties;
}

export function AmountDisplay({ 
  amount, 
  currency = 'INR', 
  className = '', 
  size = 'md',
  showSymbol = true,
  style
}: AmountDisplayProps) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0,
  });

  const parts = formatter.formatToParts(num);
  const symbol = parts.find(p => p.type === 'currency')?.value ?? '₹';
  const val = parts.filter(p => p.type !== 'currency').map(p => p.value).join('');

  const sizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-2xl font-bold',
    xl: 'text-4xl font-extrabold tracking-tight',
  };

  return (
    <span 
      style={style}
      className={`inline-flex items-baseline gap-0.5 font-monoData ${sizes[size]} ${className}`}
    >
      {showSymbol && <span className="text-[0.6em] opacity-70 font-display">{symbol}</span>}
      <span>{val}</span>
    </span>
  );
}
