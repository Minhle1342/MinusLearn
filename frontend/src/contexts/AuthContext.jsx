import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  loginAccount,
  logoutAccount,
  refreshSession,
  registerAccount,
  setAccessToken,
} from '../services/backendApi';


const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refreshSession()
      .then(result => setUser(result.user))
      .catch(() => {
        setAccessToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    login: async (email, password, rememberMe = true) => {
      const result = await loginAccount(email, password, rememberMe);
      setUser(result.user);
      return result.user;
    },
    register: async (email, password, rememberMe = true) => {
      const result = await registerAccount(email, password, rememberMe);
      setUser(result.user);
      return result.user;
    },
    logout: async () => {
      await logoutAccount();
      setUser(null);
    },
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

