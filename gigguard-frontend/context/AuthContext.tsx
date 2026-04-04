'use client';

import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, APIError } from '@/lib/api';
import { InsurerProfile, WorkerProfile } from '@/lib/types';

type Role = 'worker' | 'insurer' | null;

interface LoginOptions {
  phoneNumber?: string;
  secret?: string;
}

interface AuthContextValue {
  token: string | null;
  role: Role;
  worker: WorkerProfile | null;
  insurer: InsurerProfile | null;
  isLoading: boolean;
  login: (role: Exclude<Role, null>, options?: LoginOptions) => Promise<void>;
  logout: (skipRedirect?: boolean) => void;
  setWorkerLogin: (token: string, worker: WorkerProfile) => void;
  setInsurerLogin: (token: string, insurer: InsurerProfile) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = 'gigguard_token';
const ROLE_KEY = 'gigguard_role';

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const recentAuthAtRef = useRef(0);
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [insurer, setInsurer] = useState<InsurerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = (skipRedirect = false) => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    setToken(null);
    setRole(null);
    setWorker(null);
    setInsurer(null);
    api.setToken(null);
    if (!skipRedirect) {
      router.replace('/');
    }
  };

  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      // Ignore stale 401s that can race in right after successful OTP login.
      if (Date.now() - recentAuthAtRef.current < 10_000) {
        return;
      }

      const currentRole = (localStorage.getItem(ROLE_KEY) as Role) || null;
      logout(true);

      if (currentRole === 'worker') {
        router.replace('/login');
        return;
      }

      if (currentRole === 'insurer') {
        router.replace('/insurer-login');
        return;
      }

      router.replace('/');
    });

    return () => {
      api.setUnauthorizedHandler(null);
    };
  }, [router]);

  useEffect(() => {
    const hydrate = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedRole = (localStorage.getItem(ROLE_KEY) as Role) || null;

      if (!storedToken || !storedRole) {
        setIsLoading(false);
        return;
      }

      setToken(storedToken);
      setRole(storedRole);
      api.setToken(storedToken);

      if (storedRole === 'worker') {
        try {
          const me = await api.getMe();
          setWorker(me);
        } catch (error) {
          // Keep user logged in even if profile fetch fails temporarily
          console.error('Failed to fetch worker profile:', error);
          // Don't logout - the user may still have valid auth
        }
      } else if (storedRole === 'insurer') {
        try {
          const me = await api.getInsurerMe();
          setInsurer(me);
        } catch (error) {
          // Keep user logged in even if profile fetch fails temporarily
          console.error('Failed to fetch insurer profile:', error);
          // Don't logout - the user may still have valid auth
        }
      }

      setIsLoading(false);
    };

    hydrate();
  }, []);

  const login = async (nextRole: Exclude<Role, null>, options: LoginOptions = {}) => {
    setIsLoading(true);

    try {
      if (nextRole === 'worker') {
        throw new APIError('Use OTP login on /login', 400, 'USE_OTP_LOGIN');
      } else {
        const response = await api.loginInsurer(options.secret);
        recentAuthAtRef.current = Date.now();
        localStorage.setItem(TOKEN_KEY, response.token);
        localStorage.setItem(ROLE_KEY, 'insurer');
        setToken(response.token);
        setRole('insurer');
        setWorker(null);
        if (response.insurer) {
          setInsurer(response.insurer);
        } else {
          const me = await api.getInsurerMe();
          setInsurer(me);
        }
        api.setToken(response.token);
        router.replace('/insurer');
      }
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new Error('Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const setWorkerLogin = (newToken: string, workerProfile: WorkerProfile) => {
    recentAuthAtRef.current = Date.now();
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(ROLE_KEY, 'worker');
    setToken(newToken);
    setRole('worker');
    setWorker(workerProfile);
    setInsurer(null);
    api.setToken(newToken);
    setIsLoading(false);
  };

  const setInsurerLogin = (newToken: string, insurerProfile: InsurerProfile) => {
    recentAuthAtRef.current = Date.now();
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(ROLE_KEY, 'insurer');
    setToken(newToken);
    setRole('insurer');
    setWorker(null);
    setInsurer(insurerProfile);
    api.setToken(newToken);
    setIsLoading(false);
  };

  const value = useMemo<AuthContextValue>(
    () => ({ token, role, worker, insurer, isLoading, login, logout, setWorkerLogin, setInsurerLogin }),
    [token, role, worker, insurer, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
