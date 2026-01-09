import { post, get, del } from './client';

export interface ImportStatus {
  id: string;
  status: 'pending' | 'searching' | 'downloading' | 'completed' | 'failed';
  progress?: number;
  message?: string;
  title?: string;
  artist?: string;
  album?: string;
}

/**
 * Import a Spotify playlist
 */
export async function importSpotifyPlaylist(
  playlistUrl: string
): Promise<{ success: boolean; message: string }> {
  return post('/api/spotify-playlist/import', { playlistUrl });
}

/**
 * Download from Spotify URL (track or album)
 * Extracts metadata from Spotify, downloads via YouTube
 */
export async function downloadFromSpotifyUrl(
  url: string
): Promise<{ success: boolean; message: string; type?: string; track?: string; artist?: string; album?: string; trackCount?: number }> {
  return post('/api/download/spotify-url', { url });
}

/**
 * Detect Spotify URL type (track, album, or playlist)
 */
export function getSpotifyUrlType(url: string): 'track' | 'album' | 'playlist' | null {
  if (url.includes('spotify.com/track/') || url.includes('spotify:track:')) {
    return 'track';
  }
  if (url.includes('spotify.com/album/') || url.includes('spotify:album:')) {
    return 'album';
  }
  if (url.includes('spotify.com/playlist/') || url.includes('spotify:playlist:')) {
    return 'playlist';
  }
  return null;
}

/**
 * Import a YouTube Music playlist
 */
export async function importYouTubeMusicPlaylist(
  playlistUrl: string
): Promise<{ success: boolean; message: string }> {
  return post('/api/youtube-music-playlist/import', { playlistUrl });
}

/**
 * Download a song from URL
 */
export async function downloadFromUrl(
  url: string
): Promise<{ success: boolean; message: string }> {
  return post('/api/url-download/song', { url });
}

/**
 * Get download queue
 */
export async function getDownloadQueue(): Promise<ImportStatus[]> {
  const response = await get<{ downloads: ImportStatus[] }>('/api/download/list');
  return response.downloads || [];
}

/**
 * Add item to download queue
 */
export async function addToDownloadQueue(
  url: string
): Promise<{ id: string }> {
  return post('/api/download/add', { url });
}

/**
 * Get download status
 */
export async function getDownloadStatus(id: string): Promise<ImportStatus> {
  return get(`/api/download/status/${id}`);
}

/**
 * Cancel a download
 */
export async function cancelDownload(id: string): Promise<void> {
  await del(`/api/download/cancel/${id}`);
}

/**
 * Cleanup downloads - remove completed and failed downloads from the queue
 */
export async function cleanupDownloads(): Promise<{ success: boolean; removed: number }> {
  return post('/api/download/cleanup');
}

