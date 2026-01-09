import { create } from 'zustand';
import type { User } from '../api/auth';
import {
  login as apiLogin,
  signup as apiSignup,
  getCurrentUser,
  storeAuth,
  clearAuth,
  getStoredUser,
  isAuthenticated,
} from '../api/auth';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (username: string, password: string) => Promise<boolean>;
  signup: (username: string, password: string, email: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

// Initialize with stored values
const initialUser = getStoredUser();
const initialAuth = isAuthenticated();

export const useAuthStore = create<AuthState>((set) => ({
  user: initialUser,
  isAuthenticated: initialAuth,
  isLoading: false, // Don't start as loading - inputs need to work immediately
  error: null,
  
  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    
    try {
      const response = await apiLogin(username, password);
      
      if (response.success) {
        storeAuth(response.token, response.user);
        set({
          user: response.user,
          isAuthenticated: true,
          isLoading: false,
        });
        return true;
      } else {
        set({
          error: 'Login failed',
          isLoading: false,
        });
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      set({ error: message, isLoading: false });
      return false;
    }
  },
  
  signup: async (username: string, password: string, email: string) => {
    set({ isLoading: true, error: null });
    
    try {
      const response = await apiSignup(username, password, email);
      
      if (response.success) {
        storeAuth(response.token, response.user);
        set({
          user: response.user,
          isAuthenticated: true,
          isLoading: false,
        });
        return true;
      } else {
        set({
          error: 'Signup failed',
          isLoading: false,
        });
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signup failed';
      set({ error: message, isLoading: false });
      return false;
    }
  },
  
  logout: () => {
    clearAuth();
    set({
      user: null,
      isAuthenticated: false,
      error: null,
    });
  },
  
  checkAuth: async () => {
    const hasToken = isAuthenticated();
    const storedUser = getStoredUser();
    
    if (!hasToken) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      return;
    }
    
    // If we have a stored user, use it immediately (but we'll refresh it)
    if (storedUser) {
      set({ user: storedUser, isAuthenticated: true, isLoading: false });
    } else {
      // Still show as authenticated but without user details while we fetch
      set({ isAuthenticated: true, isLoading: true });
    }
    
    // Always verify with server and update user data to get latest fields
    try {
      const user = await getCurrentUser();
      const token = localStorage.getItem('musicstream_token') || '';
      // Always update stored user with fresh data from server
      storeAuth(token, user);
      set({ user, isAuthenticated: true, isLoading: false });
      console.log('[Auth] User refreshed:', user.username);
    } catch (err) {
      console.error('Auth check failed:', err);
      // If we already have a stored user, keep them logged in
      // Only clear auth if we don't have stored user data
      if (!storedUser) {
        clearAuth();
        set({ user: null, isAuthenticated: false, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    }
  },
  
  clearError: () => set({ error: null }),
}));

