import { useEffect, useRef, useState } from 'react';

export function useCountUp(target: number, duration = 1500, delay = 0): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(target)) {
      setValue(0);
      return;
    }

    if (target === 0) {
      setValue(0);
      return;
    }

    const timeout = window.setTimeout(() => {
      const start = performance.now();

      const tick = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const next = Math.floor(eased * target);
        setValue(next);

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        setValue(target);
      };

      rafRef.current = requestAnimationFrame(tick);
    }, delay);

    return () => {
      window.clearTimeout(timeout);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, duration, delay]);

  return value;
}

