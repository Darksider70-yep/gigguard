'use client';

import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, ReactNode } from 'react';

interface AuthGuardProps {
  children: ReactNode;
  allowedRoles: Array<'worker' | 'insurer'>;
}

export default function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const { role } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait for the role to be determined
    if (role === undefined) return;

    if (!role || !allowedRoles.includes(role)) {
      router.replace('/');
    }
  }, [role, router, allowedRoles]);

  if (!role || !allowedRoles.includes(role)) {
    // Render a loading state or null while redirecting
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
            <p className="text-slate-500">Access Denied.</p>
            <p className="text-sm text-slate-400">Redirecting to homepage...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
