'use client';

import { useEffect, useState } from 'react';

interface PremiumFormulaProps {
  baseRate: number;
  zoneMultiplier: number;
  weatherMultiplier: number;
  historyMultiplier: number;
  healthMultiplier?: number;
  finalPremium: number;
}
const INR = '\u20B9';

function partVisible(visible: number, index: number): string {
  return visible >= index ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2';
}

export default function PremiumFormula({
  baseRate,
  zoneMultiplier,
  weatherMultiplier,
  historyMultiplier,
  healthMultiplier,
  finalPremium,
}: PremiumFormulaProps) {
  const [visible, setVisible] = useState(0);
  const showHealthMultiplier = Boolean(
    typeof healthMultiplier === 'number' && Number.isFinite(healthMultiplier) && healthMultiplier !== 1
  );
  const totalSteps = showHealthMultiplier ? 6 : 5;

  useEffect(() => {
    setVisible(0);
    const timer = window.setInterval(() => {
      setVisible((prev) => {
        if (prev >= totalSteps) {
          window.clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 200);

    return () => window.clearInterval(timer);
  }, [baseRate, zoneMultiplier, weatherMultiplier, historyMultiplier, healthMultiplier, finalPremium, totalSteps]);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 font-mono-data text-base text-slate-100">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`transition duration-300 ${partVisible(visible, 1)}`}>{`${INR}${Math.round(baseRate)}`}</span>
        <span className={`transition duration-300 ${partVisible(visible, 2)}`}>× {zoneMultiplier.toFixed(2)}</span>
        <span className={`transition duration-300 ${partVisible(visible, 3)}`}>× {weatherMultiplier.toFixed(2)}</span>
        <span className={`transition duration-300 ${partVisible(visible, 4)}`}>× {historyMultiplier.toFixed(2)}</span>
        {showHealthMultiplier ? (
          <span className={`transition duration-300 ${partVisible(visible, 5)}`}>× {healthMultiplier!.toFixed(2)}</span>
        ) : null}
        <span className={`text-amber-300 transition duration-300 ${partVisible(visible, totalSteps)}`}>
          {`= ${INR}${Math.round(finalPremium)}`}
        </span>
      </div>
    </div>
  );
}

