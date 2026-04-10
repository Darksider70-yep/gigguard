'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import PlatformToggle from '@/components/ui/PlatformToggle';
import PhoneInput from '@/components/ui/PhoneInput';
import RegistrationStepper from '@/components/ui/RegistrationStepper';
import ZoneSelect from '@/components/ui/ZoneSelect';
import { APIError, api } from '@/lib/api';
import { CITIES } from '@/lib/zones';

interface FormState {
  name: string;
  phone: string;
  platform: 'zomato' | 'swiggy';
  city: string;
  zone: string;
  avgDailyEarning: string;
  upiVpa: string;
}

type FormField = keyof FormState;

const INITIAL_FORM: FormState = {
  name: '',
  phone: '',
  platform: 'zomato',
  city: '',
  zone: '',
  avgDailyEarning: '',
  upiVpa: '',
};

const INR = '\u20B9';

function normalizeSeedName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function validate(form: FormState) {
  const errors: Partial<Record<FormField, string>> = {};

  const words = form.name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    errors.name = 'Enter first and last name.';
  }

  if (!/^\d{10}$/.test(form.phone)) {
    errors.phone = 'Phone must be exactly 10 digits.';
  }

  const earning = Number(form.avgDailyEarning);
  if (!Number.isFinite(earning) || earning < 200 || earning > 5000) {
    errors.avgDailyEarning = 'Daily earning should be between 200 and 5000.';
  }

  const atCount = (form.upiVpa.match(/@/g) || []).length;
  if (atCount !== 1) {
    errors.upiVpa = 'UPI VPA must contain exactly one @ symbol.';
  }

  if (!form.city) {
    errors.city = 'Select your city.';
  }

  if (form.city && !form.zone) {
    errors.zone = 'Select your zone.';
  }

  return errors;
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [touched, setTouched] = useState<Partial<Record<FormField, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneConflict, setPhoneConflict] = useState(false);

  const errors = useMemo(() => validate(form), [form]);

  const updateField = <K extends FormField>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const markTouched = (field: FormField) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched({
      name: true,
      phone: true,
      platform: true,
      city: true,
      zone: true,
      avgDailyEarning: true,
      upiVpa: true,
    });

    const hasErrors = Object.keys(errors).length > 0;
    if (hasErrors) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setPhoneConflict(false);

    try {
      const response = await api.registerWorker({
        name: form.name.trim(),
        phone_number: `+91${form.phone}`,
        platform: form.platform,
        city: form.city,
        zone: form.zone,
        avg_daily_earning: Number(form.avgDailyEarning),
        upi_vpa: form.upiVpa.trim(),
      });

      const avatarSeed = `${normalizeSeedName(form.name)}${form.phone.slice(-4)}`;
      sessionStorage.setItem(
        'gigguard_registration_context',
        JSON.stringify({
          ...form,
          worker_id: response.worker_id,
          phone_number: response.phone_number,
          avatar_seed: avatarSeed,
        })
      );

      router.push('/register/verify');
    } catch (err) {
      if (err instanceof APIError && err.status === 409 && err.code === 'PHONE_ALREADY_REGISTERED') {
        setPhoneConflict(true);
      } else if (err instanceof APIError && err.status === 0) {
        setError('Network unavailable. Check backend connectivity.');
      } else if (err instanceof APIError) {
        setError(err.message || 'Registration failed. Please try again.');
      } else {
        setError('Registration failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <section className="surface-card p-6 sm:p-7">
        <RegistrationStepper current="details" />
        <h1 className="mt-5 text-3xl font-semibold">Create your worker account</h1>
        <p className="mt-2 text-sm text-secondary">Register once and activate weekly protection when you buy your first policy.</p>
      </section>

      <form onSubmit={onSubmit} className="surface-card space-y-5 p-6 sm:p-7">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="name" className="text-sm font-medium text-slate-100">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
              onBlur={() => markTouched('name')}
              required
              className={`mt-1.5 w-full rounded-xl border bg-slate-900/70 px-3 py-2.5 text-sm outline-none transition ${
                touched.name && errors.name ? 'border-rose-500/60' : 'border-slate-700 focus:border-amber-400/70'
              }`}
              placeholder="Sameer Shaikh"
            />
            {touched.name && errors.name ? <p className="mt-1 text-xs text-rose-300">{errors.name}</p> : null}
          </div>

          <div className="sm:col-span-2">
            <PhoneInput
              value={form.phone}
              onChange={(digits) => updateField('phone', digits)}
              onBlur={() => markTouched('phone')}
              required
              error={touched.phone ? errors.phone ?? null : null}
            />
            {phoneConflict ? (
              <p className="mt-1 text-xs text-rose-300">
                This number is already registered.{' '}
                <Link href="/login" className="text-amber-300 hover:text-amber-200">
                  Login instead ?
                </Link>
              </p>
            ) : null}
          </div>

          <div className="sm:col-span-2">
            <PlatformToggle value={form.platform} onChange={(platform) => updateField('platform', platform)} />
          </div>

          <div>
            <label htmlFor="city" className="text-sm font-medium text-slate-100">
              City
            </label>
            <select
              id="city"
              value={form.city}
              onChange={(event) => {
                updateField('city', event.target.value);
                updateField('zone', '');
              }}
              onBlur={() => markTouched('city')}
              className={`mt-1.5 w-full rounded-xl border bg-slate-900/70 px-3 py-2.5 text-sm outline-none transition ${
                touched.city && errors.city ? 'border-rose-500/60' : 'border-slate-700 focus:border-amber-400/70'
              }`}
            >
              <option value="">Select city</option>
              {CITIES.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
            {touched.city && errors.city ? <p className="mt-1 text-xs text-rose-300">{errors.city}</p> : null}
          </div>

          <ZoneSelect
            city={form.city}
            value={form.zone}
            onChange={(zone) => updateField('zone', zone)}
            onBlur={() => markTouched('zone')}
            error={touched.zone ? errors.zone ?? null : null}
          />

          <div>
            <label htmlFor="avgDailyEarning" className="text-sm font-medium text-slate-100">
              Avg Daily Earning
            </label>
            <div
              className={`mt-1.5 flex items-center rounded-xl border bg-slate-900/70 px-3 py-2.5 ${
                touched.avgDailyEarning && errors.avgDailyEarning
                  ? 'border-rose-500/60'
                  : 'border-slate-700 focus-within:border-amber-400/70'
              }`}
            >
              <span className="mr-2 text-sm text-slate-400">{INR}</span>
              <input
                id="avgDailyEarning"
                type="number"
                min={200}
                max={5000}
                value={form.avgDailyEarning}
                onChange={(event) => updateField('avgDailyEarning', event.target.value)}
                onBlur={() => markTouched('avgDailyEarning')}
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-500"
                placeholder="e.g. 800"
              />
            </div>
            {touched.avgDailyEarning && errors.avgDailyEarning ? (
              <p className="mt-1 text-xs text-rose-300">{errors.avgDailyEarning}</p>
            ) : (
              <p className="mt-1 text-xs text-slate-400">Your typical daily earnings from deliveries</p>
            )}
          </div>

          <div>
            <label htmlFor="upiVpa" className="text-sm font-medium text-slate-100">
              UPI VPA
            </label>
            <input
              id="upiVpa"
              type="text"
              value={form.upiVpa}
              onChange={(event) => updateField('upiVpa', event.target.value)}
              onBlur={() => markTouched('upiVpa')}
              className={`mt-1.5 w-full rounded-xl border bg-slate-900/70 px-3 py-2.5 text-sm outline-none transition ${
                touched.upiVpa && errors.upiVpa ? 'border-rose-500/60' : 'border-slate-700 focus:border-amber-400/70'
              }`}
              placeholder="yourname@upi"
            />
            {touched.upiVpa && errors.upiVpa ? (
              <p className="mt-1 text-xs text-rose-300">{errors.upiVpa}</p>
            ) : (
              <p className="mt-1 text-xs text-slate-400">Used for automatic payouts when triggered</p>
            )}
          </div>
        </div>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}

        <button type="submit" disabled={submitting} className="btn-saffron w-full px-5 py-3 text-base disabled:opacity-60">
          {submitting ? 'Creating account...' : 'Continue ?'}
        </button>
      </form>
    </div>
  );
}
