'use client';

import Link from 'next/link';
import { useState } from 'react';
import OtpInput from '@/components/ui/OtpInput';
import PhoneInput from '@/components/ui/PhoneInput';
import { APIError, api } from '@/lib/api';

const RESEND_SECONDS = 30;

function prettyPhone(phone: string) {
  const digits = phone.replace(/\D/g, '').replace(/^91/, '').slice(-10);
  if (digits.length < 10) {
    return phone;
  }
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

export default function LoginPage() {
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const startCountdown = () => {
    setCountdown(RESEND_SECONDS);
    const timer = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const sendOtp = async () => {
    setError(null);
    setInfo(null);

    if (!/^\d{10}$/.test(phoneDigits)) {
      setError('Enter a valid 10-digit phone number.');
      return;
    }

    const fullPhone = `+91${phoneDigits}`;
    setBusy(true);

    try {
      await api.loginWorker(fullPhone);
      setPhoneNumber(fullPhone);
      setShowOtp(true);
      setOtp('');
      setInfo('OTP sent successfully.');
      startCountdown();
    } catch (err) {
      if (err instanceof APIError && err.status === 404) {
        setError('No worker account found for this number. Register first.');
      } else if (err instanceof APIError) {
        setError(err.message || 'Failed to send OTP.');
      } else {
        setError('Failed to send OTP.');
      }
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async (code: string) => {
    if (!phoneNumber || code.length !== 6 || busy) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await api.verifyOtp({ phone_number: phoneNumber, otp: code });
      localStorage.setItem('gigguard_token', response.token);
      localStorage.setItem('gigguard_role', 'worker');
      api.setToken(response.token);
      window.location.assign('/dashboard');
    } catch (err) {
      if (err instanceof APIError) {
        setError(err.message || 'Invalid OTP.');
      } else {
        setError('Invalid OTP.');
      }
      setOtp('');
    } finally {
      setBusy(false);
    }
  };

  const resendOtp = async () => {
    if (!phoneNumber || countdown > 0 || busy) {
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      await api.resendOtp(phoneNumber);
      setOtp('');
      setInfo('New OTP sent.');
      startCountdown();
    } catch (err) {
      if (err instanceof APIError) {
        setError(err.message || 'Could not resend OTP.');
      } else {
        setError('Could not resend OTP.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <section className="surface-card space-y-3 p-6 sm:p-7">
        <h1 className="text-3xl font-semibold">Worker Login</h1>
        <p className="text-sm text-secondary">Use OTP login to access your GigGuard dashboard and buy policy flow.</p>
      </section>

      <section className="surface-card space-y-5 p-6 sm:p-7">
        {!showOtp ? (
          <>
            <PhoneInput
              value={phoneDigits}
              onChange={setPhoneDigits}
              helperText="We'll send a 6-digit OTP to this number"
              onBlur={() => undefined}
            />
            <button type="button" onClick={sendOtp} disabled={busy} className="btn-saffron w-full px-5 py-3 text-base disabled:opacity-60">
              {busy ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </>
        ) : (
          <div className="space-y-4 text-center">
            <p className="text-2xl font-semibold text-amber-300">{prettyPhone(phoneNumber)}</p>
            <p className="text-sm text-secondary">Enter the 6-digit code sent to your phone.</p>
            <OtpInput value={otp} onChange={setOtp} onComplete={verifyOtp} disabled={busy} />
            <button
              type="button"
              onClick={resendOtp}
              disabled={countdown > 0 || busy}
              className="text-sm text-amber-300 transition hover:text-amber-200 disabled:cursor-not-allowed disabled:text-slate-500"
            >
              {countdown > 0 ? `Resend in ${countdown}s` : 'Resend OTP'}
            </button>
            <button
              type="button"
              onClick={() => verifyOtp(otp)}
              disabled={otp.length !== 6 || busy}
              className="btn-saffron w-full px-5 py-3 text-base disabled:opacity-60"
            >
              {busy ? 'Verifying...' : 'Verify OTP'}
            </button>
          </div>
        )}

        {info ? <p className="text-sm text-emerald-300">{info}</p> : null}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}

        <p className="text-sm text-secondary">
          Don't have an account?{' '}
          <Link href="/register" className="text-amber-300 hover:text-amber-200">
            Register free
          </Link>
        </p>
      </section>
    </div>
  );
}
