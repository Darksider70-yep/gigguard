'use client';

import { ChangeEvent } from 'react';

interface PhoneInputProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (digits: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  helperText?: string;
  error?: string | null;
  disabled?: boolean;
  required?: boolean;
}

function formatPhone(digits: string): string {
  const clean = digits.replace(/\D/g, '').slice(0, 10);
  if (clean.length <= 5) {
    return clean;
  }
  return `${clean.slice(0, 5)} ${clean.slice(5)}`;
}

export default function PhoneInput({
  id = 'phone_number',
  label = 'Phone Number',
  value,
  onChange,
  onBlur,
  placeholder = '98765 43210',
  helperText,
  error,
  disabled,
  required,
}: PhoneInputProps) {
  const displayValue = formatPhone(value);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 10);
    onChange(digits);
  };

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-100">
        {label}
      </label>
      <div
        className={`flex items-center rounded-xl border bg-slate-900/70 px-3 py-2.5 transition ${
          error ? 'border-rose-500/60' : 'border-slate-700 focus-within:border-amber-400/70'
        }`}
      >
        <span className="mr-2 text-sm font-semibold text-slate-300">+91</span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          value={displayValue}
          placeholder={placeholder}
          onChange={handleChange}
          onBlur={onBlur}
          disabled={disabled}
          required={required}
          className="w-full bg-transparent text-base outline-none placeholder:text-slate-500"
        />
      </div>
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      {!error && helperText ? <p className="text-xs text-slate-400">{helperText}</p> : null}
    </div>
  );
}
