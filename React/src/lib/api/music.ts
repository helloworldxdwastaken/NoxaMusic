import { get, post } from './client';

export interface OnlineTrack {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId?: string;
  duration: number;
  preview: string;
  artwork: string;
  source: 'deezer' | 'youtube';
  downloadUrl?: string;
  trackNumber?: number;
}

export interface OnlineArtist {
  id: string;
  name: string;
  image: string;
  fans?: number;
  source: 'deezer';
}

export interface OnlineAlbum {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  image: string;
  trackCount?: number;
  releaseDate?: string;
  type?: string; // album, single, ep
  source: 'deezer';
}

export interface OnlineArtistDetail extends OnlineArtist {
  albums: OnlineAlbum[];
}

export interface OnlineAlbumDetail extends OnlineAlbum {
  tracks: OnlineTrack[];
  duration?: number;
}

// Raw response from Deezer API
interface RawOnlineTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  preview: string;
  image: string;
  source: 'deezer' | 'youtube';
}

export interface OnlineSearchResult {
  results: OnlineTrack[];
  total: number;
}

export interface SmartSearchResult {
  tracks: OnlineTrack[];
  artists: OnlineArtist[];
  albums: OnlineAlbum[];
}

/**
 * Search for music online (Deezer API)
 */
export async function searchOnline(query: string): Promise<OnlineSearchResult> {
  const response = await get<RawOnlineTrack[] | { results?: OnlineTrack[] }>(
    `/api/music/search?q=${encodeURIComponent(query)}`
  );
  
  // API returns array directly, normalize to our format
  if (Array.isArray(response)) {
    const results: OnlineTrack[] = response.map((track) => ({
      id: String(track.id),
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      preview: track.preview,
      artwork: track.image, // Map 'image' to 'artwork'
      source: track.source,
    }));
    return { results, total: results.length };
  }
  
  return { results: response.results || [], total: response.results?.length || 0 };
}

/**
 * Smart search - returns tracks, artists, albums at once
 */
export async function smartSearchOnline(query: string): Promise<SmartSearchResult> {
  const response = await get<{
    tracks: Array<{ id: number; title: string; artist: string; artistId?: number; album?: string; albumId?: number; image?: string; duration?: number; preview?: string; source: string }>;
    artists: Array<{ id: number; name: string; image?: string; fans?: number; source: string }>;
    albums: Array<{ id: number; title: string; artist: string; artistId?: number; image?: string; trackCount?: number; source: string }>;
  }>(`/api/music/smart-search?q=${encodeURIComponent(query)}`);
  
  return {
    tracks: (response.tracks || []).map(t => ({
      id: String(t.id),
      title: t.title,
      artist: t.artist,
      artistId: t.artistId ? String(t.artistId) : undefined,
      album: t.album || '',
      albumId: t.albumId ? String(t.albumId) : undefined,
      artwork: t.image || '',
      duration: t.duration || 0,
      preview: t.preview || '',
      source: 'deezer' as const,
    })),
    artists: (response.artists || []).map(a => ({
      id: String(a.id),
      name: a.name,
      image: a.image || '',
      fans: a.fans,
      source: 'deezer' as const,
    })),
    albums: (response.albums || []).map(a => ({
      id: String(a.id),
      title: a.title,
      artist: a.artist,
      artistId: a.artistId ? String(a.artistId) : undefined,
      image: a.image || '',
      trackCount: a.trackCount,
      source: 'deezer' as const,
    })),
  };
}

/**
 * Get online artist details with albums
 */
export async function getOnlineArtist(artistId: string): Promise<OnlineArtistDetail> {
  const response = await get<{
    id: number;
    name: string;
    image?: string;
    fans?: number;
    albums: Array<{ id: number; title: string; image?: string; releaseDate?: string; trackCount?: number; type?: string }>;
  }>(`/api/music/artist/${artistId}`);
  
  return {
    id: String(response.id),
    name: response.name,
    image: response.image || '',
    fans: response.fans,
    source: 'deezer',
    albums: (response.albums || []).map(a => ({
      id: String(a.id),
      title: a.title,
      artist: response.name,
      image: a.image || '',
      releaseDate: a.releaseDate,
      trackCount: a.trackCount,
      type: a.type,
      source: 'deezer' as const,
    })),
  };
}

/**
 * Get online album details with tracks
 */
export async function getOnlineAlbum(albumId: string): Promise<OnlineAlbumDetail> {
  const response = await get<{
    id: number;
    title: string;
    artist: string;
    artistId?: number;
    image?: string;
    releaseDate?: string;
    trackCount?: number;
    duration?: number;
    tracks: Array<{ id: number; title: string; artist?: string; duration?: number; trackNumber?: number; preview?: string }>;
  }>(`/api/music/album/${albumId}`);
  
  return {
    id: String(response.id),
    title: response.title,
    artist: response.artist,
    artistId: response.artistId ? String(response.artistId) : undefined,
    image: response.image || '',
    releaseDate: response.releaseDate,
    trackCount: response.trackCount,
    duration: response.duration,
    source: 'deezer',
    tracks: (response.tracks || []).map(t => ({
      id: String(t.id),
      title: t.title,
      artist: t.artist || response.artist,
      album: response.title,
      albumId: String(response.id),
      artwork: response.image || '',
      duration: t.duration || 0,
      trackNumber: t.trackNumber,
      preview: t.preview || '',
      source: 'deezer' as const,
    })),
  };
}

/**
 * Download a track from online search result
 */
export async function downloadOnlineTrack(track: OnlineTrack): Promise<{ success: boolean; message: string }> {
  // Use search download endpoint with artist and title
  return post('/api/url-download/search', { 
    artist: track.artist,
    title: track.title,
    album: track.album
  });
}

/**
 * Download all tracks from an album
 */
export async function downloadOnlineAlbum(album: OnlineAlbumDetail): Promise<{ success: boolean; message: string; downloadIds?: string[] }> {
  const downloadIds: string[] = [];
  
  for (const track of album.tracks) {
    try {
      const result = await post<{ success: boolean; downloadId?: string }>('/api/url-download/search', {
        artist: track.artist,
        title: track.title,
        album: album.title
      });
      if (result.downloadId) {
        downloadIds.push(result.downloadId);
      }
    } catch (error) {
      console.error(`Failed to queue ${track.title}:`, error);
    }
  }
  
  return {
    success: downloadIds.length > 0,
    message: `Queued ${downloadIds.length}/${album.tracks.length} tracks for download`,
    downloadIds
  };
}

/**
 * Check if tracks/albums already exist in local library (fuzzy matching)
 */
export async function checkExistsInLibrary(
  tracks: Array<{ id: string; title: string; artist: string }>,
  albums: Array<{ id: string; title: string; artist: string }>
): Promise<{ tracks: Record<string, boolean>; albums: Record<string, boolean> }> {
  return post('/api/library/check-exists', { tracks, albums });
}

