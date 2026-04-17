'use client';

import Link from 'next/link';
import { Globe, LogOut, Shield } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { LanguageSelector } from '@/components/LanguageSelector';

function getCurrentLocale(): string {
  if (typeof document === 'undefined') return 'en';
  const match = document.cookie.match(/(?:^|; )gigguard_locale=([^;]*)/);
  return match?.[1] || 'en';
}

export default function Navbar() {
  const t = useTranslations('nav');
  const { role, worker, insurer, logout } = useAuth();
  const [showLangPicker, setShowLangPicker] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-5">
        <div className="flex items-center gap-4 md:gap-8 min-w-0">
          <Link href="/" className="inline-flex items-center gap-2 shrink-0">
            <Shield className="h-5 w-5 text-amber-400" />
            <span className="text-base md:text-lg font-semibold tracking-wide truncate">GigGuard</span>
          </Link>
          <div className="hidden md:flex items-center gap-5 text-sm text-secondary">
            {role === null ? <Link href="/">Home</Link> : null}
            {role === 'worker' ? (
              <>
                <Link href="/dashboard" className="hover:text-white">{t('dashboard')}</Link>
                <Link href="/buy-policy" className="hover:text-white">{t('buy_policy')}</Link>
                <Link href="/claims" className="hover:text-white">{t('claims')}</Link>
              </>
            ) : null}
            {role === 'insurer' ? (
              <Link href="/insurer" className="hover:text-white">
                Insurer Command Center
              </Link>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {/* Language switcher for logged-in workers */}
          {role === 'worker' ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLangPicker((prev) => !prev)}
                className="inline-flex items-center gap-1 md:gap-1.5 rounded-md border border-slate-700 px-2 py-1.5 text-[10px] md:text-xs text-secondary transition hover:border-slate-600 hover:text-white"
                title="Change language"
              >
                <Globe className="h-3.5 w-3.5" />
                <span className="uppercase">{getCurrentLocale()}</span>
              </button>
              {showLangPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowLangPicker(false)} />
                  <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl">
                    <LanguageSelector
                      variant="profile"
                      currentLocale={getCurrentLocale()}
                      onSelect={() => setShowLangPicker(false)}
                    />
                  </div>
                </>
              )}
            </div>
          ) : null}

          {role === 'worker' ? (
            <div className="hidden sm:block rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-secondary">
              {worker?.name ?? 'Worker'}
            </div>
          ) : null}
          {role === 'insurer' ? (
            <div className="hidden sm:block rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-secondary">
              {insurer?.name ?? 'Insurer'}
            </div>
          ) : null}

          {role ? (
            <button
              onClick={() => logout()}
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-2 md:px-3 py-1.5 text-xs md:text-sm text-secondary transition hover:border-slate-600 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden xs:inline">{t('logout')}</span>
            </button>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
