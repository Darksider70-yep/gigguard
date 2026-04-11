'use client';

import { useRouter } from 'next/navigation';

const LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்' },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी' },
] as const;

export interface LanguageSelectorProps {
  currentLocale: string;
  /** 'onboarding' = full card grid; 'profile' = compact dropdown */
  variant?: 'onboarding' | 'profile';
  onSelect?: (locale: string) => void;
}

export function LanguageSelector({
  currentLocale,
  variant = 'profile',
  onSelect,
}: LanguageSelectorProps) {
  const router = useRouter();

  const handleSelect = async (locale: string) => {
    // Set cookie (expires 1 year)
    document.cookie = `gigguard_locale=${locale}; path=/; max-age=31536000; SameSite=Lax`;

    // Persist to backend (fire and forget — UI updates immediately)
    try {
      await fetch('/api/workers/language', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferred_language: locale }),
      });
    } catch {
      // Non-fatal: cookie already set, DB sync can retry
    }

    onSelect?.(locale);
    router.refresh(); // Re-render with new locale
  };

  if (variant === 'onboarding') {
    // Full card grid — used on onboarding Step 3
    return (
      <div className="grid grid-cols-2 gap-3 mt-4">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleSelect(lang.code)}
            className={`
              flex flex-col items-start p-4 rounded-xl border-2 transition-all text-left
              ${currentLocale === lang.code
                ? 'border-amber-500 bg-amber-500/15'
                : 'border-slate-700 bg-slate-900/60 hover:border-slate-500'
              }
            `}
          >
            <span className="text-lg font-semibold text-slate-100">{lang.nativeLabel}</span>
            <span className="text-sm text-slate-400">{lang.label}</span>
            {currentLocale === lang.code && (
              <span className="mt-1 text-xs text-amber-400 font-medium">✓ Selected</span>
            )}
          </button>
        ))}
      </div>
    );
  }

  // Compact dropdown — used in Profile page and Navbar
  return (
    <select
      value={currentLocale}
      onChange={(e) => handleSelect(e.target.value)}
      className="block w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-amber-500/70"
    >
      {LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.nativeLabel} ({lang.label})
        </option>
      ))}
    </select>
  );
}
