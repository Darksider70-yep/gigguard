'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { APIError, api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { InsurerProfile } from '@/lib/types';

export default function InsurerLoginPage() {
  const router = useRouter();
  const { role, isLoading, setInsurerLogin } = useAuth();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && role === 'insurer') {
      router.replace('/insurer');
    }
  }, [role, isLoading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!password.trim()) {
      setError('Please enter a password.');
      setLoading(false);
      return;
    }

    try {
      const response = await api.loginInsurer(password);
      setInsurerLogin(response.token, response.insurer ?? { name: 'Insurer', id: '', created_at: new Date().toISOString() } as InsurerProfile);
      router.replace('/insurer');
    } catch (err) {
      if (err instanceof APIError && err.status === 0) {
        setError('Network unavailable. Check backend connectivity.');
      } else if (err instanceof APIError) {
        setError(err.message || 'Login failed. Check password and retry.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <section className="surface-card space-y-3 p-6 sm:p-7">
        <h1 className="text-3xl font-semibold">Insurer Login</h1>
        <p className="text-sm text-secondary">Access the GigGuard command center with your credentials.</p>
      </section>

      <section className="surface-card space-y-5 p-6 sm:p-7">
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-secondary mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your insurer password"
              disabled={loading}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50 disabled:opacity-60"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-saffron w-full px-5 py-3 text-base disabled:opacity-60"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}

        <p className="text-sm text-secondary">
          Back to{' '}
          <Link href="/" className="text-amber-300 hover:text-amber-200">
            home
          </Link>
        </p>
      </section>
    </div>
  );
}
