import type { Metadata } from 'next';
import Navbar from '@/components/layout/Navbar';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'GigGuard Phase 2 Command Center',
  description: 'AI-powered parametric income insurance for gig workers in India.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[var(--bg-base)] text-[var(--text-primary)]">
        <Providers>
          <Navbar />
          <main className="mx-auto w-full max-w-7xl px-5 py-8">{children}</main>
        </Providers>
        <footer className="mt-14 border-t border-slate-800 py-6 text-center text-xs text-muted">
          © 2026 GigGuard | AI Parametric Insurance Command Center
        </footer>
      </body>
    </html>
  );
}

