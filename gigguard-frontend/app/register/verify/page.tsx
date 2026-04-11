'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
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
  preferredLanguage?: string;
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
  const t = useTranslations('auth');
  const { setWorkerLogin } = useAuth();
  const [context, setContext] = useState<RegistrationContext | null>(null);
  const [otp, setOtp] = useState('');
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const verifyInFlight = useRef(false);

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
        setInfo(t('otp_sent'));
      } catch (err) {
        if (err instanceof APIError && err.status === 0) {
          setError(t('login_error_network'));
        } else if (err instanceof APIError) {
          setError(err.message || t('login_error_otp'));
        } else {
          setError(t('login_error_otp'));
        }
      } finally {
        setSending(false);
      }
    };

    void triggerOtp();
  }, [router, t]);

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
    if (!context || code.length !== 6 || verifying || verifyInFlight.current) {
      return;
    }

    verifyInFlight.current = true;
    setVerifying(true);
    setError(null);

    try {
      const response = await api.verifyOtp({
        phone_number: context.phone_number,
        otp: code,
      });

      // Sync locale cookie from registration language preference
      const lang = context.preferredLanguage || 'en';
      document.cookie = `gigguard_locale=${lang}; path=/; max-age=31536000; SameSite=Lax`;

      setWorkerLogin(response.token, response.worker);

      sessionStorage.removeItem('gigguard_registration_context');
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof APIError && err.status === 0) {
        setError(t('login_error_network'));
      } else if (err instanceof APIError) {
        setError(err.message || t('login_error_otp_invalid'));
      } else {
        setError(t('login_error_otp_invalid'));
      }
      setOtp('');
    } finally {
      verifyInFlight.current = false;
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
      setInfo(t('otp_sent'));
      setCountdown(RESEND_SECONDS);
      setOtp('');
    } catch (err) {
      if (err instanceof APIError) {
        setError(err.message || t('login_error_otp'));
      } else {
        setError(t('login_error_otp'));
      }
    } finally {
      setSending(false);
    }
  };

  const resendLabel = useMemo(() => {
    if (countdown > 0) {
      return t('resend_in', { seconds: countdown });
    }
    return t('resend_otp');
  }, [countdown, t]);

  if (!context) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <section className="surface-card p-6 sm:p-7">
        <RegistrationStepper current="verify" />
        <h1 className="mt-5 text-3xl font-semibold">{t('verify_title')}</h1>
      </section>

      <section className="surface-card space-y-6 p-6 text-center sm:p-8">
        <p className="text-3xl font-semibold tracking-wide text-amber-300">{formatPhone(context.phone_number)}</p>
        <p className="text-sm text-secondary">{t('otp_sent_to')}</p>

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
          {verifying ? t('verifying') : t('verify_otp')}
        </button>
      </section>
    </div>
  );
}
