'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';

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
      <div className="space-y-3">
        <div className="skeleton h-8 w-64 rounded-lg" />
        <div className="skeleton h-28 w-full rounded-lg" />
        <div className="skeleton h-28 w-full rounded-lg" />
      </div>
    );
  }

  if (!role || !allowedRoles.includes(role)) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <p className="text-secondary">Access denied.</p>
          <p className="text-xs text-muted">Redirecting to home...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

