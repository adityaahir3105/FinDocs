import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthState } from '../types';
import { checkAuth, googleLogin, logout as apiLogout } from '../api/client';

interface AuthContextType extends AuthState {
  loginWithGoogle: (code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    loading: true,
  });

  useEffect(() => {
    checkAuth()
      .then((result) => {
        setState({
          isAuthenticated: result.authenticated,
          user: result.user || null,
          loading: false,
        });
      })
      .catch(() => {
        setState({ isAuthenticated: false, user: null, loading: false });
      });
  }, []);

  const loginWithGoogle = async (code: string) => {
    const result = await googleLogin(code);
    if (result.success && result.user) {
      setState({
        isAuthenticated: true,
        user: result.user,
        loading: false,
      });
    } else {
      throw new Error(result.message || 'Login failed');
    }
  };

  const logout = async () => {
    await apiLogout();
    setState({ isAuthenticated: false, user: null, loading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
