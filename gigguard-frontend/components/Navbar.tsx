// components/Navbar.tsx
'use client';

import Link from 'next/link';
import { Shield, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const Navbar = () => {
  const { role, worker, insurer, logout } = useAuth();

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center space-x-8">
          <Link href="/" className="flex items-center space-x-2">
            <Shield className="h-7 w-7 text-sky-500" />
            <span className="text-xl font-bold text-slate-900">GigGuard</span>
          </Link>
          <div className="hidden items-center space-x-6 md:flex">
            {role === null && (
              <Link href="/" className="text-sm font-medium text-slate-600 hover:text-sky-500">
                Home
              </Link>
            )}
            {role === 'worker' && (
              <>
                <Link href="/dashboard" className="text-sm font-medium text-slate-600 hover:text-sky-500">
                  Dashboard
                </Link>
                <Link href="/buy-policy" className="text-sm font-medium text-slate-600 hover:text-sky-500">
                  Buy Policy
                </Link>
                <Link href="/claims" className="text-sm font-medium text-slate-600 hover:text-sky-500">
                  Claims
                </Link>
              </>
            )}
            {role === 'insurer' && (
              <Link href="/insurer" className="text-sm font-medium text-slate-600 hover:text-sky-500">
                Insurer Dashboard
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {role === 'worker' && (
            <div className="flex items-center space-x-2 rounded-full bg-slate-100 py-1 pl-3 pr-2 text-sm font-medium text-slate-700">
              <span>{worker?.name?.split(' ')[0] || 'Worker'}</span>
              <div className="relative h-6 w-6">
                <img
                  className="h-full w-full rounded-full"
                  src={`https://api.dicebear.com/8.x/pixel-art/svg?seed=${worker?.id || 'worker'}`}
                  alt="Avatar"
                />
                <span className="absolute bottom-0 right-0 block h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-white"></span>
              </div>
            </div>
          )}
          {role === 'insurer' && (
            <div className="flex items-center space-x-2 rounded-full bg-slate-100 py-1 pl-3 pr-2 text-sm font-medium text-slate-700">
              <span>{insurer?.name?.split(' ')[0] || 'Insurer'}</span>
              <div className="relative h-6 w-6">
                <img
                  className="h-full w-full rounded-full"
                  src={`https://api.dicebear.com/8.x/pixel-art/svg?seed=${insurer?.id || 'insurer'}`}
                  alt="Avatar"
                />
                <span className="absolute bottom-0 right-0 block h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-white"></span>
              </div>
            </div>
          )}
          {role !== null && (
            <button
              onClick={() => logout()}
              className="flex items-center space-x-2 rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
