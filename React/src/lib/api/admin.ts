/**
 * Admin API client
 * Uses Basic Auth for admin endpoints
 */

const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || 'https://stream.noxamusic.com');

// Store admin credentials in session
let adminCredentials: { username: string; password: string } | null = null;

export function setAdminCredentials(username: string, password: string) {
  adminCredentials = { username, password };
  sessionStorage.setItem('admin_credentials', btoa(`${username}:${password}`));
}

export function getAdminCredentials(): string | null {
  if (adminCredentials) {
    return btoa(`${adminCredentials.username}:${adminCredentials.password}`);
  }
  return sessionStorage.getItem('admin_credentials');
}

export function clearAdminCredentials() {
  adminCredentials = null;
  sessionStorage.removeItem('admin_credentials');
}

export function isAdminAuthenticated(): boolean {
  return !!getAdminCredentials();
}

async function adminFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const credentials = getAdminCredentials();
  
  if (!credentials) {
    throw new Error('Admin authentication required');
  }
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${credentials}`,
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      clearAdminCredentials();
      throw new Error('Invalid admin credentials');
    }
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Admin API Error: ${response.status}`);
  }
  
  return response.json();
}

// Types
export interface AdminUser {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  created_at: string;
  last_login: string | null;
  last_activity?: string | null;
  was_active_today?: boolean;
  is_online?: boolean;
  music_count?: number;
  // Added from access logs merge
  device?: string | null;
  country?: string | null;
  last_seen?: string | null;
}

export interface AdminStats {
  // Backend field names
  total_songs?: number;
  unique_albums?: number;
  unique_artists?: number;
  total_plays?: number;
  total_size_bytes?: number;
  // Mapped field names
  total_tracks?: number;
  total_albums?: number;
  total_artists?: number;
  total_playlists?: number;
  total_users?: number;
  total_size?: number;
  total_duration?: number;
}

export interface UserStatus {
  users: AdminUser[];
  summary: {
    total_users: number;
    active_today: number;
    online_now: number;
  };
}

export interface DiskUsage {
  total: number;
  used: number;
  free: number;
  available?: number; // Alias for free
  percent_used: number;
  usagePercent?: number; // Alias for percent_used
  music_library_size?: number;
}

// API Functions

/**
 * Verify admin credentials
 */
export async function verifyAdminCredentials(username: string, password: string): Promise<boolean> {
  setAdminCredentials(username, password);
  
  try {
    await adminFetch('/api/admin/stats');
    return true;
  } catch (error) {
    clearAdminCredentials();
    return false;
  }
}

/**
 * Get admin dashboard stats
 */
export async function getAdminStats(): Promise<AdminStats> {
  return adminFetch<AdminStats>('/api/admin/stats');
}

/**
 * Get all users
 */
export async function getAdminUsers(): Promise<AdminUser[]> {
  return adminFetch<AdminUser[]>('/api/admin/users');
}

/**
 * Get user status (online, active today, etc.)
 */
export async function getUserStatus(): Promise<UserStatus> {
  return adminFetch<UserStatus>('/api/admin/user-status');
}

/**
 * Get user statistics (music count per user)
 */
export async function getUserStats(): Promise<AdminUser[]> {
  return adminFetch<AdminUser[]>('/api/admin/user-stats');
}

/**
 * Get disk usage
 */
export async function getDiskUsage(): Promise<DiskUsage> {
  return adminFetch<DiskUsage>('/api/admin/disk-usage');
}

/**
 * Scan music library
 */
export async function scanLibrary(): Promise<{ message: string; stats: AdminStats }> {
  return adminFetch('/api/admin/scan', { method: 'POST' });
}

/**
 * Cleanup library (remove orphaned entries)
 */
export async function cleanupLibrary(): Promise<{ message: string; removed: number }> {
  return adminFetch('/api/admin/cleanup', { method: 'POST' });
}

/**
 * Delete a user
 */
export async function deleteUser(userId: number): Promise<{ message: string }> {
  return adminFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
}

/**
 * Toggle user admin status
 */
export async function toggleUserAdmin(userId: number): Promise<{ message: string; is_admin: boolean }> {
  return adminFetch(`/api/admin/users/${userId}/toggle-admin`, { method: 'POST' });
}

// ==================== ANALYTICS ====================

export interface AnalyticsOverview {
  totalUsers: number;
  activeToday: number;
  newUsersToday: number;
  avgListenTimePerUserPerDay: number;
  totalListenTime: number;
  dateRange: { startDate: string; endDate: string };
}

export interface DAUTrend {
  trend: Array<{ date: string; dau: number }>;
  days: number;
}

export interface TopSong {
  id: number;
  title: string;
  artist: string;
  album: string;
  play_count: number;
}

export interface TopArtist {
  artist: string;
  play_count: number;
  track_count: number;
}

export interface EngagementData {
  avgSessionLength: number;
  avgSessionLengthFormatted: string;
  totalSessions: number;
  avgListenTimePerDay: number;
  avgListenTimeFormatted: string;
  skipsPerSession: number;
  totalSkips: number;
  searchesPerUser: number;
  totalSearches: number;
}

export interface TrafficSource {
  source: string;
  visits: number;
  unique_users: number;
  percentage: number;
}

export interface TrafficSourcesResponse {
  sources: TrafficSource[];
  totalVisits: number;
  totalUniqueUsers: number;
  days: number;
}

export interface AccessLogsResponse {
  summary: {
    hours: number;
    active_users: number;
    top_country: string;
    top_device: string;
    countries: Array<{ label: string; count: number }>;
    devices: Array<{ label: string; count: number }>;
  };
  recentUsers: Array<{
    user_id: number;
    username: string;
    last_access: string;
    country: string;
    device: string;
    ip_address: string;
  }>;
  logs: Array<{
    id: number;
    user_id: number;
    username: string;
    accessed_at: string;
    country: string;
    device: string;
    ip_address: string;
  }>;
}

/**
 * Get analytics overview
 */
export async function getAnalyticsOverview(range: string = '30d'): Promise<AnalyticsOverview> {
  return adminFetch<AnalyticsOverview>(`/api/analytics/overview?range=${range}`);
}

/**
 * Get DAU trend
 */
export async function getDAUTrend(days: number = 30): Promise<DAUTrend> {
  return adminFetch<DAUTrend>(`/api/analytics/dau-trend?days=${days}`);
}

/**
 * Get engagement data
 */
export async function getEngagementData(range: string = '30d'): Promise<EngagementData> {
  return adminFetch<EngagementData>(`/api/analytics/engagement?range=${range}`);
}

/**
 * Get top songs
 */
export async function getTopSongs(limit: number = 10): Promise<{ songs: TopSong[] }> {
  return adminFetch<{ songs: TopSong[] }>(`/api/analytics/top-songs?limit=${limit}`);
}

/**
 * Get top artists
 */
export async function getTopArtists(limit: number = 10): Promise<{ artists: TopArtist[] }> {
  return adminFetch<{ artists: TopArtist[] }>(`/api/analytics/top-artists?limit=${limit}`);
}

/**
 * Get traffic sources (where users come from)
 */
export async function getTrafficSources(days: number = 30): Promise<TrafficSourcesResponse> {
  return adminFetch<TrafficSourcesResponse>(`/api/analytics/traffic-sources?days=${days}`);
}

/**
 * Get access logs (for real-time user tracking)
 */
export async function getAccessLogs(hours: number = 24): Promise<AccessLogsResponse> {
  return adminFetch<AccessLogsResponse>(`/api/admin/access-logs?hours=${hours}`);
}

