'use client';

import Link from 'next/link';
import { LogOut, Shield } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function Navbar() {
  const { role, worker, insurer, logout } = useAuth();

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5">
        <div className="flex items-center gap-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-400" />
            <span className="text-lg font-semibold tracking-wide">GigGuard</span>
          </Link>
          <div className="flex items-center gap-5 text-sm text-secondary">
            {role === null ? <Link href="/">Home</Link> : null}
            {role === 'worker' ? (
              <>
                <Link href="/dashboard" className="hover:text-white">Dashboard</Link>
                <Link href="/buy-policy" className="hover:text-white">Buy Policy</Link>
                <Link href="/claims" className="hover:text-white">Claims</Link>
              </>
            ) : null}
            {role === 'insurer' ? (
              <Link href="/insurer" className="hover:text-white">
                Insurer Command Center
              </Link>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {role === 'worker' ? (
            <div className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-secondary">
              {worker?.name ?? 'Worker'}
            </div>
          ) : null}
          {role === 'insurer' ? (
            <div className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-secondary">
              {insurer?.name ?? 'Insurer'}
            </div>
          ) : null}

          {role ? (
            <button
              onClick={() => logout()}
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-1.5 text-sm text-secondary transition hover:border-slate-600 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          ) : null}
        </div>
      </div>
    </nav>
  );
}

