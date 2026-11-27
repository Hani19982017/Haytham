import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, AuthUser } from '../services/api.js';

export interface AuthContextType {
  currentUser: AuthUser | null;
  login: (identifier: string, password: string) => Promise<{ success: boolean; user?: AuthUser; error?: string }>;
  logout: () => Promise<void>;
  isLoading: boolean;
  /** True after the user signed out on purpose: the next sign-in starts fresh on its own home page. */
  signedOut: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [signedOut, setSignedOut] = useState<boolean>(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    async function initAuth() {
      try {
        const storedToken = localStorage.getItem('auth_token');
        if (storedToken) {
          const user = await api.getCurrentUser();
          if (user) {
            setCurrentUser(user);
          } else {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_user');
            localStorage.removeItem('auth_user_id');
          }
        }
      } catch (err) {
        console.error('Failed to initialize session:', err);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();

    const handleUnauthorized = () => {
      setCurrentUser(null);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_user_id');
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const login = async (identifier: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.login(identifier, password);
      queryClient.clear(); // nothing loaded for an earlier account carries over
      setSignedOut(false);
      setCurrentUser(res.user);
      return { success: true, user: res.user };
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.messageAr ||
        err.response?.data?.message ||
        err.message ||
        'بيانات الدخول غير صحيحة';
      return { success: false, error: errorMsg };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await api.logout();
    } finally {
      // Forget everything about this account: its data and the page it was on.
      queryClient.clear();
      setSignedOut(true);
      setCurrentUser(null);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_user_id');
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, login, logout, isLoading, signedOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
