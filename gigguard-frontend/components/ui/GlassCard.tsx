import { ReactNode, CSSProperties } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
  style?: CSSProperties;
}

export function GlassCard({ children, className = '', onClick, interactive = false, style }: GlassCardProps) {
  return (
    <div 
      onClick={onClick}
      style={style}
      className={`
        relative overflow-hidden
        bg-white/[0.03] backdrop-blur-xl
        border border-white/[0.08]
        rounded-2xl
        ${interactive ? 'card-interactive cursor-pointer hover:bg-white/[0.05]' : ''}
        ${className}
      `}
    >
      {/* Subtle Inner Glow */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      
      {children}
    </div>
  );
}
