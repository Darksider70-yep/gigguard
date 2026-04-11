# Multilingual Support — Technical Guide

## Overview

GigGuard supports **6 languages** for its worker-facing interface:

| Code | Language | Script | Coverage |
|------|----------|--------|----------|
| `en` | English | Latin | Default / Fallback |
| `hi` | Hindi | Devanagari | Delhi, parts of Mumbai (~30%) |
| `ta` | Tamil | Tamil | Chennai (~20%) |
| `te` | Telugu | Telugu | Hyderabad (~15%) |
| `kn` | Kannada | Kannada | Bangalore (~18%) |
| `mr` | Marathi | Devanagari | Mumbai (~17%) |

Combined: **100% of current GigGuard cities** with native-language support.

---

## Architecture

### Locale Resolution (Cookie-Based)

GigGuard uses **cookie-based locale resolution** — URLs remain unchanged regardless of language. This preserves deep links and bookmarks.

```
Priority order:
1. gigguard_locale cookie (set at login/registration)
2. 'en' hard fallback (never shows raw translation keys)
```

**Why not URL-prefix routing (`/hi/dashboard`)?**
- Gig workers share dashboard links via WhatsApp — URL mutation would break these links
- SEO is not a concern for authenticated worker pages
- Cookie-based approach is zero-friction for the worker

### Cookie Lifecycle

| Event | Action |
|-------|--------|
| Registration | Worker selects language → cookie set + saved to DB |
| Login (OTP verify) | Worker's `preferred_language` from DB → cookie set |
| Language change (Navbar/Profile) | Cookie updated + PATCH to backend + JWT refresh |
| Logout | Cookie persists (language is a device preference) |

### Data Flow

```
Worker selects language
  → gigguard_locale cookie set (client-side, immediate)
  → PATCH /api/workers/language (frontend route handler)
    → PATCH /workers/language (backend)
      → UPDATE workers SET preferred_language = $1
      → New JWT issued with preferred_language claim
    → JWT cookie refreshed on frontend
  → router.refresh() triggers next-intl to re-render
```

---

## Translation File Structure

```
gigguard-frontend/
  messages/
    en.json    ← Source of truth (all keys defined here first)
    hi.json    ← Hindi (Tier 1 + Tier 2 complete)
    ta.json    ← Tamil (Tier 2 machine-translated, Tier 1 stubs)
    te.json    ← Telugu (Tier 2 machine-translated, Tier 1 stubs)
    kn.json    ← Kannada (Tier 2 machine-translated, Tier 1 stubs)
    mr.json    ← Marathi (Tier 2 machine-translated, Tier 1 stubs)
```

### Translation Tiers

| Tier | Content | Translation Method | Quality Gate |
|------|---------|--------------------|-------------|
| **Tier 1** | Claim statuses, payout notifications, denial explanations, appeal messages | Professional human translation | Must pass native speaker review |
| **Tier 2** | UI labels, button text, form placeholders, navigation | Machine translation (reviewed) | Acceptable for launch |
| **Tier 3** | Legal documents, support chat, email receipts | Post-launch | Not yet started |

**Tier 1 strings are trust-critical.** A poorly translated claim denial message can cause a worker to panic, call support, or lose trust in the platform. These strings are protected by the `check:translations` CI gate.

### Key Namespaces

| Namespace | Purpose | Example Keys |
|-----------|---------|-------------|
| `common` | Shared UI primitives | `loading`, `save`, `cancel` |
| `nav` | Navigation bar | `dashboard`, `buy_policy`, `logout` |
| `auth` | Login/OTP flow | `send_otp`, `verify_otp`, `login_error_*` |
| `onboarding` | Registration flow | `name_label`, `language_title`, `register_button` |
| `dashboard` | Worker dashboard | `greeting`, `active_policy_title` |
| `buy_policy` | Policy purchase flow | `what_is_covered`, `pay_button` |
| `claims` | Claims list + statuses | `status_paid`, `trigger_heavy_rainfall` |
| `claim_detail` | Individual claim view | `approved_message`, `flag_cell_tower_mismatch` |
| `notifications` | Push notification text | `trigger_fired_title`, `claim_paid_body` |
| `profile` | Profile settings | `language_change`, `save_button` |
| `errors` | Error messages | `network`, `session_expired` |

---

## Database Schema

```sql
-- Migration: 012_add_preferred_language.sql
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) NOT NULL DEFAULT 'en';

ALTER TABLE workers
  ADD CONSTRAINT workers_language_valid
  CHECK (preferred_language IN ('en', 'hi', 'ta', 'te', 'kn', 'mr'));

CREATE INDEX IF NOT EXISTS idx_workers_language ON workers(preferred_language);
```

The `preferred_language` is included in the JWT payload so it's available server-side without a DB query.

---

## Frontend Integration

### next-intl Configuration

**`next.config.js`** — Plugin wraps Next.js config:
```js
const withNextIntl = require('next-intl/plugin')('./i18n/request.ts');
module.exports = withNextIntl(nextConfig);
```

**`i18n/request.ts`** — Server-side locale resolution:
```ts
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('gigguard_locale')?.value;
  const locale = isValidLocale(cookieLocale) ? cookieLocale : 'en';
  const messages = (await import(`../messages/${locale}.json`)).default;
  return { locale, messages };
});
```

**`app/layout.tsx`** — Provider wraps entire app:
```tsx
<NextIntlClientProvider messages={messages}>
  {children}
</NextIntlClientProvider>
```

### Using Translations in Components

```tsx
'use client';
import { useTranslations } from 'next-intl';

export default function MyComponent() {
  const t = useTranslations('dashboard');
  return <h1>{t('greeting', { name: 'Priya' })}</h1>;
  // Renders: "Hello, Priya" (en) or "नमस्ते, Priya" (hi)
}
```

### LanguageSelector Component

Two variants:
- **`onboarding`** — Full card grid for registration flow
- **`profile`** — Compact dropdown for navbar/settings

```tsx
<LanguageSelector
  variant="onboarding"
  currentLocale="en"
  onSelect={(locale) => console.log(locale)}
/>
```

---

## API Endpoints

### `PATCH /workers/language` (Backend)

Updates worker's preferred language and returns a refreshed JWT.

```json
// Request
{ "preferred_language": "hi" }

// Response
{ "status": "updated", "preferred_language": "hi", "jwt_token": "eyJ..." }
```

### `PATCH /api/workers/language` (Frontend Route Handler)

Proxies the request to the backend and updates the JWT cookie.

---

## Adding a New Language

1. **Database**: Add the locale code to the `workers_language_valid` CHECK constraint
2. **Backend**: Add the code to `VALID_LOCALES` in `workers.ts` PATCH endpoint
3. **Frontend**:
   - Add locale to `SUPPORTED_LOCALES` in `i18n/request.ts`
   - Add locale to `VALID_LOCALES` in `app/api/workers/language/route.ts`
   - Add entry to `LANGUAGES` array in `LanguageSelector.tsx`
   - Create `messages/{locale}.json` with all keys from `en.json`
4. **Validation**: Run `npm run check:translations` to verify key parity

---

## CI/CD Validation

```bash
# Check that all locale files have the same keys as en.json
npm run check:translations
```

This script:
- Compares every locale file's keys against `en.json`
- Reports missing and extra keys
- Exits with code 1 if any locale is missing keys
- Should be added to CI pipeline to prevent shipping incomplete translations

---

## Landing Page Decision

The public landing page (`app/page.tsx`) is intentionally **English-only**. It serves as marketing/SEO content for the platform. Worker-facing pages (dashboard, claims, buy-policy, registration, login) are fully localized.
