'use client';

import { ClipboardEvent, KeyboardEvent, useEffect, useMemo, useRef } from 'react';

interface OtpInputProps {
  value: string;
  onChange: (otp: string) => void;
  onComplete?: (otp: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

const OTP_LENGTH = 6;

export default function OtpInput({ value, onChange, onComplete, disabled, autoFocus = true }: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const digits = useMemo(() => {
    const cleaned = value.replace(/\D/g, '').slice(0, OTP_LENGTH);
    return Array.from({ length: OTP_LENGTH }, (_, index) => cleaned[index] ?? '');
  }, [value]);

  useEffect(() => {
    if (autoFocus && refs.current[0]) {
      refs.current[0].focus();
    }
  }, [autoFocus]);

  const commit = (nextDigits: string[]) => {
    const otp = nextDigits.join('').slice(0, OTP_LENGTH);
    onChange(otp);
    if (otp.length === OTP_LENGTH) {
      onComplete?.(otp);
    }
  };

  const updateAt = (index: number, raw: string) => {
    const char = raw.replace(/\D/g, '').slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = char;
    commit(nextDigits);

    if (char && index < OTP_LENGTH - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Backspace') {
      return;
    }

    if (digits[index]) {
      const nextDigits = [...digits];
      nextDigits[index] = '';
      commit(nextDigits);
      return;
    }

    if (index > 0) {
      refs.current[index - 1]?.focus();
      const nextDigits = [...digits];
      nextDigits[index - 1] = '';
      commit(nextDigits);
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) {
      return;
    }
    const nextDigits = Array.from({ length: OTP_LENGTH }, (_, index) => pasted[index] ?? '');
    commit(nextDigits);
    const lastIndex = Math.min(pasted.length, OTP_LENGTH) - 1;
    refs.current[Math.max(lastIndex, 0)]?.focus();
  };

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(event) => updateAt(index, event.target.value)}
          onKeyDown={(event) => onKeyDown(index, event)}
          onPaste={onPaste}
          className="h-12 w-11 rounded-lg border border-slate-700 bg-slate-900/80 text-center text-xl font-semibold tracking-wider outline-none transition focus:border-amber-400/70 sm:h-14 sm:w-12"
        />
      ))}
    </div>
  );
}
