import { api } from './client';

export interface User {
  id: number;
  username: string;
  name?: string; // Fallback field name from some backends
  email: string;
  is_admin: boolean;
  created_at: string;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: User;
}

export interface SignupResponse {
  success: boolean;
  token: string;
  user: User;
}

/**
 * Login error response
 */
export interface AuthError {
  error: string;
  message?: string;
  details?: string[];
}

/**
 * Login with username and password
 */
export async function login(
  username: string,
  password: string
): Promise<LoginResponse> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    // Extract specific error message from backend
    const errorMessage = data.error || data.message || getErrorMessageForStatus(response.status);
    throw new Error(errorMessage);
  }
  
  return data;
}

/**
 * Get user-friendly error message based on HTTP status
 */
function getErrorMessageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Invalid request. Please check your input.';
    case 401:
      return 'Invalid credentials. Please check your username and password.';
    case 403:
      return 'Access denied. Your account may be suspended.';
    case 404:
      return 'User not found.';
    case 429:
      return 'Too many login attempts. Please try again later.';
    case 500:
      return 'Server error. Please try again later.';
    default:
      return 'Login failed. Please try again.';
  }
}

/**
 * Sign up a new user
 */
export async function signup(
  username: string,
  password: string,
  email: string,
  referrerUrl?: string,
  utmSource?: string,
  utmMedium?: string,
  utmCampaign?: string
): Promise<SignupResponse> {
  const response = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      email,
      referrerUrl,
      utmSource,
      utmMedium,
      utmCampaign,
    }),
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    // Extract specific error message from backend
    let errorMessage = data.error || data.message || 'Signup failed';
    
    // Include validation details if present
    if (data.details && Array.isArray(data.details)) {
      errorMessage = data.details.join('. ');
    }
    
    throw new Error(errorMessage);
  }
  
  return data;
}

/**
 * Get current user info
 */
export async function getCurrentUser(): Promise<User> {
  const response = await api<{ user: User }>('/api/auth/me');
  return response.user;
}

/**
 * Store auth data in localStorage
 */
export function storeAuth(token: string, user: User): void {
  localStorage.setItem('musicstream_token', token);
  localStorage.setItem('musicstream_user', JSON.stringify(user));
}

/**
 * Clear auth data from localStorage
 */
export function clearAuth(): void {
  localStorage.removeItem('musicstream_token');
  localStorage.removeItem('musicstream_user');
}

/**
 * Get stored user from localStorage
 */
export function getStoredUser(): User | null {
  const userStr = localStorage.getItem('musicstream_user');
  if (!userStr) return null;
  
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return !!localStorage.getItem('musicstream_token');
}

