'use client';

const STEPS = ['Triggered', 'Validating', 'Approved', 'Paid'];

const STEP_INDEX: Record<string, number> = {
  triggered: 1,
  validating: 2,
  approved: 3,
  paid: 4,
};

interface ClaimStatusBarProps {
  status: string;
}

export default function ClaimStatusBar({ status }: ClaimStatusBarProps) {
  const current = STEP_INDEX[status] ?? 0;
  const progress = Math.max(0, Math.min(100, ((current - 1) / (STEPS.length - 1)) * 100));

  return (
    <div className="space-y-3">
      <div className="relative h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="progress-grow h-full rounded-full bg-amber-400"
          style={{ width: `${Math.max(progress, current > 0 ? 12 : 0)}%` }}
        />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {STEPS.map((step, index) => {
          const done = current >= index + 1;
          return (
            <div
              key={step}
              className={`rounded-lg border px-2 py-1.5 text-center text-[11px] uppercase tracking-wide ${
                done
                  ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                  : 'border-slate-700 bg-slate-900/50 text-slate-500'
              }`}
            >
              {step}
            </div>
          );
        })}
      </div>
    </div>
  );
}

