'use client';

import { createContext, useContext, useState, ReactNode, FC } from 'react';
import { useRouter } from 'next/navigation';

type Role = 'worker' | 'insurer' | null;

interface AuthContextType {
  role: Role;
  login: (role: 'worker' | 'insurer') => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<Role>(null);
  const router = useRouter();

  const login = (newRole: 'worker' | 'insurer') => {
    setRole(newRole);
    if (newRole === 'worker') {
      router.push('/dashboard');
    } else if (newRole === 'insurer') {
      router.push('/insurer');
    }
  };

  const logout = () => {
    setRole(null);
    router.push('/');
  };

  return (
    <AuthContext.Provider value={{ role, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
