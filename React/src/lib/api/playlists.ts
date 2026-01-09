import { get, post, put, del } from './client';
import type { Track } from './library';

export interface Playlist {
  id: number;
  name: string;
  description: string | null;
  artwork: string | null;
  user_id: number;
  is_generated: boolean;
  track_count: number;
  total_duration: number;
  created_at: string;
  updated_at: string;
}

export interface GeneratedPlaylist extends Playlist {
  gradient?: [string, string];
}

export interface PlaylistsResponse {
  playlists: Playlist[];
}

export interface GeneratedPlaylistsResponse {
  playlists: GeneratedPlaylist[];
}

/**
 * Get all user playlists
 */
export async function getPlaylists(): Promise<Playlist[]> {
  const response = await get<PlaylistsResponse | Playlist[]>('/api/playlists');
  return Array.isArray(response) ? response : response.playlists || [];
}

/**
 * Get generated playlists (Daily Mix, etc.)
 */
export async function getGeneratedPlaylists(): Promise<GeneratedPlaylist[]> {
  try {
    const response = await get<GeneratedPlaylistsResponse | GeneratedPlaylist[]>(
      '/api/playlists/generated'
    );
    const playlists = Array.isArray(response) ? response : response.playlists || [];
    
    // Map 'image' field from backend to 'artwork' for frontend consistency
    return playlists.map(playlist => ({
      ...playlist,
      artwork: playlist.artwork || (playlist as any).image || null,
    }));
  } catch {
    return [];
  }
}

/**
 * Get a specific playlist
 */
export async function getPlaylist(id: number | string): Promise<Playlist> {
  // Handle generated playlist IDs (like 'daily-mix-1')
  const endpoint = typeof id === 'string' && id.includes('-') 
    ? `/api/playlists/generated/${id}`
    : `/api/playlists/${id}`;
  
  const response = await get<{ success?: boolean; playlist?: Playlist } | Playlist>(endpoint);
  
  // Backend returns { success, playlist } wrapper
  if ('playlist' in response && response.playlist) {
    return response.playlist;
  }
  
  return response as Playlist;
}

/**
 * Filter out orphaned/invalid tracks
 */
function filterValidTracks(tracks: Track[]): Track[] {
  return tracks.filter(track => {
    // Must have a title
    if (!track.title || track.title.trim() === '') return false;
    
    // Must have a valid artist (not unknown)
    if (!track.artist) return false;
    const artistLower = track.artist.toLowerCase();
    if (artistLower === 'unknown' || artistLower === 'unknown artist' || artistLower === 'various artists') {
      return false;
    }
    
    // Must have a file path (not orphaned)
    if (!track.file_path || track.file_path.trim() === '') return false;
    
    return true;
  });
}

/**
 * Get tracks in a playlist
 */
export async function getPlaylistTracks(id: number | string): Promise<Track[]> {
  // Handle generated playlist IDs
  const endpoint = typeof id === 'string' && id.includes('-')
    ? `/api/playlists/generated/${id}/tracks`
    : `/api/playlists/${id}/tracks`;
  
  try {
    const response = await get<{ success?: boolean; tracks?: Track[] } | { songs?: Track[] } | Track[]>(endpoint);
    
    let tracks: Track[] = [];
    
    if (Array.isArray(response)) {
      tracks = response;
    } else if ('tracks' in response && response.tracks) {
      tracks = response.tracks;
    } else if ('songs' in response && response.songs) {
      tracks = response.songs;
    }
    
    // Filter out orphaned/invalid tracks
    return filterValidTracks(tracks);
  } catch {
    return [];
  }
}

/**
 * Create a new playlist
 */
export async function createPlaylist(
  name: string,
  description?: string
): Promise<Playlist> {
  return post<Playlist>('/api/playlists', { name, description });
}

/**
 * Update playlist details
 */
export async function updatePlaylist(
  id: number | string,
  updates: { name?: string; description?: string }
): Promise<Playlist> {
  return put<Playlist>(`/api/playlists/${id}`, updates);
}

/**
 * Delete a playlist
 */
export async function deletePlaylist(id: number | string): Promise<void> {
  await del(`/api/playlists/${id}`);
}

/**
 * Add a track to a playlist
 */
export async function addTrackToPlaylist(
  playlistId: number | string,
  musicId: number
): Promise<void> {
  await post(`/api/playlists/${playlistId}/tracks`, { musicId });
}

/**
 * Remove a track from a playlist
 */
export async function removeTrackFromPlaylist(
  playlistId: number | string,
  musicId: number
): Promise<void> {
  await del(`/api/playlists/${playlistId}/tracks/${musicId}`);
}

/**
 * Reorder tracks in a playlist
 */
export async function reorderPlaylistTracks(
  playlistId: number | string,
  trackIds: number[]
): Promise<void> {
  // Backend expects array of { musicId, position }
  const trackOrders = trackIds.map((id, index) => ({
    musicId: id,
    position: index,
  }));
  await put(`/api/playlists/${playlistId}/reorder`, { trackOrders });
}

