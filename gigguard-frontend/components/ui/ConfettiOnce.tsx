'use client';

interface ConfettiOnceProps {
  active: boolean;
}

const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6'];

export default function ConfettiOnce({ active }: ConfettiOnceProps) {
  if (!active) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 12 }).map((_, index) => {
        const angle = index * 30;
        const distance = 42 + (index % 4) * 14;
        const color = COLORS[index % COLORS.length];

        return (
          <span
            key={index}
            style={{
              left: '50%',
              top: '50%',
              width: 8,
              height: 8,
              position: 'absolute',
              borderRadius: '999px',
              background: color,
              animation: `confettiBurst 900ms ease-out forwards`,
              transform: `rotate(${angle}deg) translateY(-${distance}px)`,
              opacity: 0,
              animationDelay: `${index * 30}ms`,
            }}
          />
        );
      })}
    </div>
  );
}

