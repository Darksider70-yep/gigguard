'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import OtpInput from '@/components/ui/OtpInput';
import RegistrationStepper from '@/components/ui/RegistrationStepper';
import { APIError, api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface RegistrationContext {
  name: string;
  phone_number: string;
  platform: 'zomato' | 'swiggy';
  city: string;
  zone: string;
  avgDailyEarning: string;
  upiVpa: string;
  worker_id: string;
  avatar_seed: string;
}

const RESEND_SECONDS = 30;

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '').replace(/^91/, '').slice(-10);
  if (digits.length < 10) {
    return phone;
  }
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

export default function RegisterVerifyPage() {
  const router = useRouter();
  const { setWorkerLogin } = useAuth();
  const [context, setContext] = useState<RegistrationContext | null>(null);
  const [otp, setOtp] = useState('');
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('gigguard_registration_context');
    if (!raw) {
      router.replace('/register');
      return;
    }

    const parsed = JSON.parse(raw) as RegistrationContext;
    setContext(parsed);

    const triggerOtp = async () => {
      setSending(true);
      try {
        await api.loginWorker(parsed.phone_number);
        setInfo('OTP sent successfully.');
      } catch (err) {
        if (err instanceof APIError && err.status === 0) {
          setError('Network unavailable. Check backend connectivity.');
        } else if (err instanceof APIError) {
          setError(err.message || 'Failed to send OTP.');
        } else {
          setError('Failed to send OTP.');
        }
      } finally {
        setSending(false);
      }
    };

    void triggerOtp();
  }, [router]);

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setCountdown((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [countdown]);

  const verifyOtp = async (code: string) => {
    if (!context || code.length !== 6 || verifying) {
      return;
    }

    setVerifying(true);
    setError(null);

    try {
      const response = await api.verifyOtp({
        phone_number: context.phone_number,
        otp: code,
      });

      setWorkerLogin(response.token, response.worker);

      sessionStorage.removeItem('gigguard_registration_context');
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof APIError && err.status === 0) {
        setError('Network unavailable. Check backend connectivity.');
      } else if (err instanceof APIError) {
        setError(err.message || 'Invalid OTP. Please try again.');
      } else {
        setError('Invalid OTP. Please try again.');
      }
      setOtp('');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!context || countdown > 0 || sending) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      await api.resendOtp(context.phone_number);
      setInfo('A fresh OTP has been sent.');
      setCountdown(RESEND_SECONDS);
      setOtp('');
    } catch (err) {
      if (err instanceof APIError) {
        setError(err.message || 'Could not resend OTP right now.');
      } else {
        setError('Could not resend OTP right now.');
      }
    } finally {
      setSending(false);
    }
  };

  const resendLabel = useMemo(() => {
    if (countdown > 0) {
      return `Resend in ${countdown}s`;
    }
    return 'Resend OTP';
  }, [countdown]);

  if (!context) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <section className="surface-card p-6 sm:p-7">
        <RegistrationStepper current="verify" />
        <h1 className="mt-5 text-3xl font-semibold">Verify your number</h1>
      </section>

      <section className="surface-card space-y-6 p-6 text-center sm:p-8">
        <p className="text-3xl font-semibold tracking-wide text-amber-300">{formatPhone(context.phone_number)}</p>
        <p className="text-sm text-secondary">We sent a 6-digit code to this number</p>

        <OtpInput value={otp} onChange={setOtp} onComplete={verifyOtp} disabled={verifying} />

        <button
          type="button"
          onClick={handleResend}
          disabled={countdown > 0 || sending}
          className="text-sm text-amber-300 transition hover:text-amber-200 disabled:cursor-not-allowed disabled:text-slate-500"
        >
          {resendLabel}
        </button>

        {info ? <p className="text-xs text-emerald-300">{info}</p> : null}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}

        <button
          type="button"
          onClick={() => verifyOtp(otp)}
          disabled={otp.length !== 6 || verifying}
          className="btn-saffron w-full px-5 py-3 text-base disabled:opacity-60"
        >
          {verifying ? 'Verifying...' : 'Verify OTP'}
        </button>
      </section>
    </div>
  );
}
