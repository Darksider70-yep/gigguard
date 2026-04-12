import { ReactNode, CSSProperties } from 'react';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'saffron';

interface StatusBadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
  dot?: boolean;
  style?: CSSProperties;
}

export function StatusBadge({ children, variant = 'neutral', className = '', dot = false, style }: StatusBadgeProps) {
  const variants: Record<BadgeVariant, string> = {
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    error: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    neutral: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    saffron: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  };

  const dots: Record<BadgeVariant, string> = {
    success: 'bg-emerald-400',
    warning: 'bg-amber-400',
    error: 'bg-rose-400',
    info: 'bg-blue-400',
    neutral: 'bg-zinc-400',
    saffron: 'bg-orange-400',
  };

  return (
    <span 
      style={style}
      className={`
      inline-flex items-center gap-1.5
      px-2.5 py-0.5 rounded-full
      text-[11px] font-bold uppercase tracking-wider
      border
      ${variants[variant]}
      ${className}
    `}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dots[variant]} shadow-[0_0_8px_rgba(0,0,0,0.5)]`} />}
      {children}
    </span>
  );
}
