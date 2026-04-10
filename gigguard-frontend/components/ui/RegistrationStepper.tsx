'use client';

import { RegistrationStep } from '@/lib/types';

interface RegistrationStepperProps {
  current: RegistrationStep;
}

const steps: Array<{ key: RegistrationStep; label: string }> = [
  { key: 'details', label: 'Details' },
  { key: 'verify', label: 'Verify OTP' },
  { key: 'complete', label: 'Complete' },
];

export default function RegistrationStepper({ current }: RegistrationStepperProps) {
  const currentIndex = steps.findIndex((step) => step.key === current);

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-[0.18em] text-amber-300">Step {currentIndex + 1} of 3</p>
      <div className="grid grid-cols-3 gap-2">
        {steps.map((step, index) => {
          const active = index <= currentIndex;
          return (
            <div key={step.key} className="space-y-1">
              <div className={`h-1.5 rounded-full ${active ? 'bg-amber-400' : 'bg-slate-700'}`} />
              <p className={`text-xs ${active ? 'text-slate-100' : 'text-slate-500'}`}>{step.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
