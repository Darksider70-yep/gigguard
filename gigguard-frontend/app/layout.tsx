// app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';

import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'GigGuard - Your Income, Protected.',
  description: 'AI-powered parametric income insurance for India\'s gig economy.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-50 text-slate-900`}>
        <Providers>
          <Navbar />
          <main className="container mx-auto max-w-7xl px-4 py-8">{children}</main>
        </Providers>
        <footer className="mt-12 border-t border-slate-200 py-6 text-center text-sm text-slate-500">
          © 2026 GigGuard · Built for Guidewire DEVTrails 2026 · AI-Powered Parametric Insurance
        </footer>
      </body>
    </html>
  );
}
