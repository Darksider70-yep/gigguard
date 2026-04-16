import type { Metadata } from 'next';
import Navbar from '@/components/layout/Navbar';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'GigGuard Command Center',
  description: 'AI-powered parametric income insurance for gig workers in India.',
};

import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="bg-[var(--bg-base)] text-[var(--text-primary)]">
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <Navbar />
            <main className="mx-auto w-full max-w-7xl px-5 py-8">{children}</main>
          </Providers>
          <footer className="mt-14 border-t border-slate-800 py-6 text-center text-xs text-muted">
            © 2026 GigGuard | AI Parametric Insurance
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

