import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { ReactNode } from 'react';

import {
  getSessionToken,
  initializeApi,
  login as apiLogin,
  logout as apiLogout,
  registerUnauthorizedHandler,
  setAdminCredentials as apiSetAdminCredentials,
  signup as apiSignup,
  updateBaseUrl as apiUpdateBaseUrl,
} from '../api/service';
import type { AdminCredentials, User } from '../types/models';

type AuthState = {
  isBootstrapped: boolean;
  isAuthenticating: boolean;
  user: User | null;
  token: string | null;
  baseUrl: string;
  adminCredentials: AdminCredentials | null;
};

const INITIAL_STATE: AuthState = {
  isBootstrapped: false,
  isAuthenticating: false,
  user: null,
  token: null,
  baseUrl: 'https://stream.noxamusic.com',
  adminCredentials: null,
};

type AuthContextValue = {
  state: AuthState;
  login: (username: string, password: string, remember?: boolean) => Promise<User>;
  signup: (username: string, password: string, remember?: boolean) => Promise<User>;
  logout: () => Promise<void>;
  updateServerUrl: (url: string) => Promise<void>;
  setAdminCredentials: (creds: AdminCredentials | null, remember?: boolean) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);

  useEffect(() => {
    let mounted = true;
    initializeApi()
      .then(({ baseUrl, token, user, adminCredentials }) => {
        if (!mounted) {
          return;
        }
        setState(prev => ({
          ...prev,
          isBootstrapped: true,
          baseUrl,
          token,
          user,
          adminCredentials,
        }));
      })
      .catch(() => {
        if (!mounted) {
          return;
        }
        setState(prev => ({
          ...prev,
          isBootstrapped: true,
        }));
      });

    registerUnauthorizedHandler(() => {
      setState(prev => ({
        ...prev,
        user: null,
        token: null,
      }));
    });

    return () => {
      mounted = false;
      registerUnauthorizedHandler(undefined);
    };
  }, []);

  const login = useCallback(
    async (username: string, password: string, remember = true) => {
      setState(prev => ({ ...prev, isAuthenticating: true }));
      try {
        const user = await apiLogin(username, password, remember);
        const token = getSessionToken() ?? null;
        setState(prev => ({
          ...prev,
          isAuthenticating: false,
          user,
          token,
        }));
        return user;
      } catch (error) {
        setState(prev => ({ ...prev, isAuthenticating: false }));
        throw error;
      }
    },
    [],
  );

  const signup = useCallback(
    async (username: string, password: string, remember = true) => {
      setState(prev => ({ ...prev, isAuthenticating: true }));
      try {
        const user = await apiSignup(username, password, remember);
        const token = getSessionToken() ?? null;
        setState(prev => ({
          ...prev,
          isAuthenticating: false,
          user,
          token,
        }));
        return user;
      } catch (error) {
        setState(prev => ({ ...prev, isAuthenticating: false }));
        throw error;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    await apiLogout();
    setState(prev => ({
      ...prev,
      user: null,
      token: null,
    }));
  }, []);

  const updateServerUrl = useCallback(async (url: string) => {
    await apiUpdateBaseUrl(url);
    setState(prev => ({
      ...prev,
      baseUrl: url.replace(/\/+$/, ''),
    }));
  }, []);

  const setAdminCredentials = useCallback(
    async (creds: AdminCredentials | null, remember = true) => {
      await apiSetAdminCredentials(creds, remember);
      setState(prev => ({
        ...prev,
        adminCredentials: creds,
      }));
    },
    [],
  );

  const value = useMemo(
    () => ({
      state,
      login,
      signup,
      logout,
      updateServerUrl,
      setAdminCredentials,
    }),
    [login, logout, setAdminCredentials, signup, state, updateServerUrl],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};

