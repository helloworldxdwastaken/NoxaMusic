// Detect if running in Capacitor
const isCapacitor = typeof window !== 'undefined' && 
  (window.location.protocol === 'file:' || 
   window.location.protocol === 'capacitor:' ||
   !!(window as any).Capacitor);

// In development web, use relative paths (Vite proxy handles it)
// In Capacitor or production, use the full API URL
const API_BASE = (import.meta.env.DEV && !isCapacitor) 
  ? '' 
  : (import.meta.env.VITE_API_URL || 'https://stream.noxamusic.com');

// Debug: Log the API base on startup
if (typeof window !== 'undefined') {
  console.log('🌐 API Client initialized:', { 
    API_BASE, 
    isCapacitor, 
    isDev: import.meta.env.DEV,
    protocol: window.location.protocol 
  });
}

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
  
  const url = `${API_BASE}${endpoint}`;
  console.log(`📡 API ${options.method || 'GET'}: ${url}`);
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  // Check if response is JSON
  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  
  if (!response.ok) {
    const error: ApiError = {
      message: `API Error: ${response.status}`,
      status: response.status,
    };
    
    if (isJson) {
      try {
        const data = await response.json();
        error.message = data.message || data.error || error.message;
      } catch {
        // Ignore JSON parse errors
      }
    } else {
      // Response is HTML - likely a server error or wrong URL
      error.message = `Server returned HTML instead of JSON. Check if the API URL is correct: ${url}`;
      console.error('❌ API returned HTML instead of JSON:', url);
    }
    
    throw error;
  }
  
  if (isJson) {
    return response.json();
  }
  
  // If not JSON but status is OK, it might be HTML error
  const text = await response.text();
  if (text.includes('<!DOCTYPE') || text.includes('<html')) {
    console.error('❌ Expected JSON but got HTML:', text.substring(0, 200));
    throw { message: 'Server returned HTML instead of JSON', status: 500 } as ApiError;
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
  return `${API_BASE}/api/library/stream/${trackId}${token ? `?token=${token}` : ''}`;
}

/**
 * Get the API base URL
 */
export function getApiBase(): string {
  return API_BASE;
}

