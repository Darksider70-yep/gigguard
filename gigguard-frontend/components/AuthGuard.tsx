'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, ReactNode } from 'react';

interface AuthGuardProps {
  children: ReactNode;
  allowedRoles: Array<'worker' | 'insurer'>;
}

export default function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const { role, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!role || !allowedRoles.includes(role)) {
      router.replace('/');
    }
  }, [role, router, allowedRoles, isLoading]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
        <div className="h-28 w-full animate-pulse rounded bg-slate-200" />
        <div className="h-28 w-full animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  if (!role || !allowedRoles.includes(role)) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <p className="text-slate-500">Access denied.</p>
          <p className="text-sm text-slate-400">Redirecting to homepage...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
