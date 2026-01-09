// In development, use relative paths (Vite proxy handles it)
// In production, use the full API URL
const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || 'https://stream.noxamusic.com');

export interface ApiError {
  message: string;
  status: number;
}

/**
 * Get the auth token from localStorage
 */
function getAuthToken(): string | null {
  return localStorage.getItem('musicstream_token');
}

/**
 * API client wrapper with authentication
 */
export async function api<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    const error: ApiError = {
      message: `API Error: ${response.status}`,
      status: response.status,
    };
    
    try {
      const data = await response.json();
      error.message = data.message || data.error || error.message;
    } catch {
      // Ignore JSON parse errors
    }
    
    throw error;
  }
  
  // Check if response is JSON
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  
  return response as unknown as T;
}

/**
 * GET request helper
 */
export async function get<T = unknown>(endpoint: string): Promise<T> {
  return api<T>(endpoint, { method: 'GET' });
}

/**
 * POST request helper
 */
export async function post<T = unknown>(
  endpoint: string,
  body?: unknown
): Promise<T> {
  return api<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT request helper
 */
export async function put<T = unknown>(
  endpoint: string,
  body?: unknown
): Promise<T> {
  return api<T>(endpoint, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE request helper
 */
export async function del<T = unknown>(endpoint: string): Promise<T> {
  return api<T>(endpoint, { method: 'DELETE' });
}

/**
 * Get the stream URL for a track
 */
export function getStreamUrl(trackId: number): string {
  const token = getAuthToken();
  const base = import.meta.env.DEV ? '' : API_BASE;
  return `${base}/api/library/stream/${trackId}${token ? `?token=${token}` : ''}`;
}

/**
 * Get the API base URL
 */
export function getApiBase(): string {
  return API_BASE;
}

