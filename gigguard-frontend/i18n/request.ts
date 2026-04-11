import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

// Supported languages — must match DB constraint
const SUPPORTED_LOCALES = ['en', 'hi', 'ta', 'te', 'kn', 'mr'] as const;
type Locale = typeof SUPPORTED_LOCALES[number];

function isValidLocale(locale: string): locale is Locale {
  return SUPPORTED_LOCALES.includes(locale as Locale);
}

export default getRequestConfig(async () => {
  // Priority order:
  // 1. Cookie set at login (persists across refreshes)
  // 2. Accept-Language header (browser preference, fallback)
  // 3. 'en' (hard fallback — never show a raw key)

  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('gigguard_locale')?.value;
  const locale = (cookieLocale && isValidLocale(cookieLocale))
    ? cookieLocale
    : 'en';

  // Load the locale messages, fall back to English if file is missing or a key is absent
  let messages;
  try {
    messages = (await import(`../messages/${locale}.json`)).default;
  } catch {
    messages = (await import('../messages/en.json')).default;
  }

  return { locale, messages };
});
