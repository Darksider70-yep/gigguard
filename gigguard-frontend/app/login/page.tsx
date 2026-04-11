'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import OtpInput from '@/components/ui/OtpInput';
import PhoneInput from '@/components/ui/PhoneInput';
import { APIError, api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const RESEND_SECONDS = 30;

function prettyPhone(phone: string) {
  const digits = phone.replace(/\D/g, '').replace(/^91/, '').slice(-10);
  if (digits.length < 10) {
    return phone;
  }
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations('auth');
  const { role, isLoading, setWorkerLogin } = useAuth();
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const verifyInFlight = useRef(false);

  useEffect(() => {
    if (!isLoading && role === 'worker') {
      router.replace('/dashboard');
    }
  }, [role, isLoading, router]);

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
      setError(t('login_error_invalid'));
      return;
    }

    const fullPhone = `+91${phoneDigits}`;
    setBusy(true);

    try {
      await api.loginWorker(fullPhone);
      setPhoneNumber(fullPhone);
      setShowOtp(true);
      setOtp('');
      setInfo(t('otp_sent'));
      startCountdown();
    } catch (err) {
      if (err instanceof APIError && err.status === 404) {
        setError(t('login_error_not_found'));
      } else if (err instanceof APIError) {
        setError(err.message || t('login_error_otp'));
      } else {
        setError(t('login_error_otp'));
      }
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async (code: string) => {
    if (!phoneNumber || code.length !== 6 || busy || verifyInFlight.current) {
      return;
    }

    verifyInFlight.current = true;
    setBusy(true);
    setError(null);

    try {
      const response = await api.verifyOtp({ phone_number: phoneNumber, otp: code });

      // Sync locale cookie from worker's saved preference
      const workerLang = response.worker?.preferred_language;
      if (workerLang) {
        document.cookie = `gigguard_locale=${workerLang}; path=/; max-age=31536000; SameSite=Lax`;
      }

      setWorkerLogin(response.token, response.worker);
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof APIError) {
        setError(err.message || t('login_error_otp_invalid'));
      } else {
        setError(t('login_error_otp_invalid'));
      }
      setOtp('');
    } finally {
      verifyInFlight.current = false;
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
      setInfo(t('otp_sent'));
      startCountdown();
    } catch (err) {
      if (err instanceof APIError) {
        setError(err.message || t('login_error_otp'));
      } else {
        setError(t('login_error_otp'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <section className="surface-card space-y-3 p-6 sm:p-7">
        <h1 className="text-3xl font-semibold">{t('login_title')}</h1>
        <p className="text-sm text-secondary">{t('login_subtitle')}</p>
      </section>

      <section className="surface-card space-y-5 p-6 sm:p-7">
        {!showOtp ? (
          <>
            <PhoneInput
              value={phoneDigits}
              onChange={setPhoneDigits}
              helperText={t('otp_helper')}
              onBlur={() => undefined}
            />
            <button type="button" onClick={sendOtp} disabled={busy} className="btn-saffron w-full px-5 py-3 text-base disabled:opacity-60">
              {busy ? t('sending_otp') : t('send_otp')}
            </button>
          </>
        ) : (
          <div className="space-y-4 text-center">
            <p className="text-2xl font-semibold text-amber-300">{prettyPhone(phoneNumber)}</p>
            <p className="text-sm text-secondary">{t('enter_otp')}</p>
            <OtpInput value={otp} onChange={setOtp} onComplete={verifyOtp} disabled={busy} />
            <button
              type="button"
              onClick={resendOtp}
              disabled={countdown > 0 || busy}
              className="text-sm text-amber-300 transition hover:text-amber-200 disabled:cursor-not-allowed disabled:text-slate-500"
            >
              {countdown > 0 ? t('resend_in', { seconds: countdown }) : t('resend_otp')}
            </button>
            <button
              type="button"
              onClick={() => verifyOtp(otp)}
              disabled={otp.length !== 6 || busy}
              className="btn-saffron w-full px-5 py-3 text-base disabled:opacity-60"
            >
              {busy ? t('verifying') : t('verify_otp')}
            </button>
          </div>
        )}

        {info ? <p className="text-sm text-emerald-300">{info}</p> : null}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}

        <p className="text-sm text-secondary">
          {t('have_account')}{' '}
          <Link href="/register" className="text-amber-300 hover:text-amber-200">
            {t('register_link')}
          </Link>
        </p>
      </section>
    </div>
  );
}
