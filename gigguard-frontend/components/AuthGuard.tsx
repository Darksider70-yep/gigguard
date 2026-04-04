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
    // Don't redirect while loading - wait for auth hydration to complete
    if (isLoading) {
      return;
    }

    // If auth is loaded and user doesn't have the required role, redirect to login
    if (!role || !allowedRoles.includes(role)) {
      router.replace('/login');
    }
  }, [role, isLoading, router, allowedRoles]);

  // Show loading skeleton while auth is hydrating
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-64 rounded-lg" />
        <div className="skeleton h-28 w-full rounded-lg" />
        <div className="skeleton h-28 w-full rounded-lg" />
      </div>
    );
  }

  // If auth is loaded but user doesn't have access, deny access  
  if (!role || !allowedRoles.includes(role)) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <p className="text-secondary">Access denied.</p>
          <p className="text-xs text-muted">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

