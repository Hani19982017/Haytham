import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, AuthUser, setActiveAuthContext } from '../services/api.js';

interface AuthContextType {
  currentUser: AuthUser | null;
  usersList: AuthUser[];
  loginAs: (email: string) => Promise<void>;
  switchUser: (user: AuthUser) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [usersList, setUsersList] = useState<AuthUser[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function initAuth() {
      try {
        const users = await api.getUsers();
        setUsersList(users);
        // Default to student Omar Farouk (at risk demo)
        const defaultUser = users.find(u => u.id === 'user_student') || users[0];
        setCurrentUser(defaultUser);
        if (defaultUser) {
          setActiveAuthContext(`jwt_mock_${defaultUser.id}`, defaultUser.id);
        }
      } catch (err) {
        console.error('Failed to load users:', err);
      } finally {
        setIsLoading(false);
      }
    }
    initAuth();
  }, []);

  const loginAs = async (email: string) => {
    setIsLoading(true);
    try {
      const res = await api.login(email);
      setCurrentUser(res.user);
      setActiveAuthContext(res.token, res.user.id);
    } catch (err) {
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const switchUser = (user: AuthUser) => {
    setCurrentUser(user);
    setActiveAuthContext(`jwt_mock_${user.id}`, user.id);
  };

  const logout = () => {
    if (usersList.length > 0) {
      setCurrentUser(usersList[0]);
      setActiveAuthContext(`jwt_mock_${usersList[0].id}`, usersList[0].id);
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, usersList, loginAs, switchUser, logout, isLoading }}>
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
