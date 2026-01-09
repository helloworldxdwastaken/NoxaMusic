import { get, post } from './client';

export interface Track {
  id: number;
  title: string;
  artist: string;
  album: string;
  album_cover: string | null;
  artist_image: string | null;
  duration: number;
  file_path: string;
  genre: string | null;
  year: number | null;
  track_number: number | null;
}

export interface Artist {
  name: string;
  image: string | null;
  track_count: number;
}

export interface Album {
  name: string;
  artist: string;
  cover: string | null;
  track_count: number;
  year: number | null;
}

export interface SearchResult {
  results: Track[];
  total: number;
}

export interface ArtistDetail {
  artist: string;
  tracks: Track[];
  albums: Album[];
}

export interface AlbumDetail {
  album: string;
  artist: string;
  tracks: Track[];
  album_cover: string | null;
}

export type AlbumDetailResult = AlbumDetail | null;

/**
 * Get all tracks in library
 */
export async function getLibrary(): Promise<Track[]> {
  const response = await get<{ tracks: Track[] } | Track[]>('/api/library/library');
  return Array.isArray(response) ? response : response.tracks || [];
}

/**
 * Full search result including songs, artists, and albums
 */
export interface FullSearchResult {
  songs: Track[];
  artists: { artist: string; artist_image: string | null; track_count: number }[];
  albums: { album: string; artist: string; album_cover: string | null; track_count: number }[];
}

/**
 * Search the library
 */
export async function searchLibrary(query: string, type: string = 'all'): Promise<SearchResult & { fullResults?: FullSearchResult }> {
  const response = await get<{ 
    songs?: Track[]; 
    artists?: { artist: string; artist_image: string | null; track_count: number }[];
    albums?: { album: string; artist: string; album_cover: string | null; track_count: number }[];
    results?: Track[]; 
    total?: number 
  }>(
    `/api/library/search?q=${encodeURIComponent(query)}&type=${type}`
  );
  
  // Backend returns 'songs', normalize to 'results'
  const results = response.songs || response.results || [];
  return {
    results,
    total: response.total || results.length,
    fullResults: {
      songs: response.songs || [],
      artists: response.artists || [],
      albums: response.albums || [],
    }
  };
}

/**
 * Get all unique artists
 */
export async function getArtists(): Promise<Artist[]> {
  const response = await get<{ artists: Artist[] } | Artist[]>('/api/library/artists');
  return Array.isArray(response) ? response : response.artists || [];
}

// Raw album response from API
interface RawAlbum {
  album: string;
  artist: string;
  albumCover?: string;  // API uses albumCover
  cover?: string;       // Some endpoints use cover
  trackCount?: number;
  track_count?: number;
  year?: number | null;
}

/**
 * Get all unique albums
 */
export async function getAlbums(): Promise<Album[]> {
  const response = await get<{ albums: RawAlbum[] } | RawAlbum[]>('/api/library/albums');
  const rawAlbums = Array.isArray(response) ? response : response.albums || [];
  
  // Normalize the response
  return rawAlbums.map((raw) => ({
    name: raw.album,
    artist: raw.artist,
    cover: normalizeArtworkPath(raw.albumCover || raw.cover || null),
    track_count: raw.trackCount || raw.track_count || 0,
    year: raw.year || null,
  }));
}

/**
 * Normalize artwork paths - convert file system paths to web paths
 */
function normalizeArtworkPath(path: string | null): string | null {
  if (!path) return null;
  // Convert /mnt/UNO/Music_lib/ to /music_lib/
  if (path.startsWith('/mnt/UNO/Music_lib/')) {
    return path.replace('/mnt/UNO/Music_lib/', '/music_lib/');
  }
  return path;
}

/**
 * Get artist details
 */
export async function getArtistDetail(artistName: string): Promise<ArtistDetail | null> {
  try {
    // Backend returns array of tracks for this artist
    const response = await get<Track[] | { tracks?: Track[]; songs?: Track[] }>(
      `/api/library/artist/${encodeURIComponent(artistName)}`
    );
    
    let tracks: Track[] = [];
    
    if (Array.isArray(response)) {
      tracks = response;
    } else if (response.tracks) {
      tracks = response.tracks;
    } else if (response.songs) {
      tracks = response.songs;
    }
    
    if (tracks.length === 0) {
      return null;
    }
    
    // Group tracks by album to create albums list
    const albumMap = new Map<string, { name: string; artist: string; cover: string | null; track_count: number; year: number | null }>();
    
    tracks.forEach(track => {
      if (track.album) {
        const existing = albumMap.get(track.album);
        if (!existing) {
          // First track for this album
          albumMap.set(track.album, {
            name: track.album,
            artist: track.artist,
            cover: track.album_cover || null,
            track_count: tracks.filter(t => t.album === track.album).length,
            year: track.year || null,
          });
        } else if (!existing.cover && track.album_cover) {
          // Update with cover if we found one
          existing.cover = track.album_cover;
        }
      }
    });
    
    return {
      artist: artistName,
      tracks: tracks,
      albums: Array.from(albumMap.values()),
    };
  } catch (error) {
    console.error('Failed to get artist detail:', error);
    return null;
  }
}

/**
 * Get album details
 */
export async function getAlbumDetail(albumName: string): Promise<AlbumDetail | null> {
  try {
    // Backend returns array of tracks for this album
    const response = await get<Track[] | { tracks?: Track[]; songs?: Track[] }>(
      `/api/library/album/${encodeURIComponent(albumName)}`
    );
    
    let tracks: Track[] = [];
    
    if (Array.isArray(response)) {
      tracks = response;
    } else if (response.tracks) {
      tracks = response.tracks;
    } else if (response.songs) {
      tracks = response.songs;
    }
    
    if (tracks.length === 0) {
      return null;
    }
    
    // Construct AlbumDetail from tracks
    const firstTrack = tracks[0];
    
    // Find album cover from any track (not just first one)
    const albumCover = tracks.find(t => t.album_cover)?.album_cover || null;
    
    return {
      album: firstTrack.album || albumName,
      artist: firstTrack.artist || 'Unknown Artist',
      tracks: tracks,
      album_cover: albumCover,
    };
  } catch (error) {
    console.error('Failed to get album detail:', error);
    return null;
  }
}

// ============ Library Management ============

export interface ScanResult {
  success: boolean;
  added: number;
  updated: number;
  removed: number;
  message?: string;
}

export interface CleanupResult {
  success: boolean;
  duplicatesRemoved: number;
  missingRemoved: number;
  message?: string;
}

/**
 * Scan music directory for new songs
 */
export async function scanLibrary(): Promise<ScanResult> {
  return post<ScanResult>('/api/library/scan');
}

/**
 * Cleanup library - remove duplicates and missing files
 */
export async function cleanupLibrary(): Promise<CleanupResult> {
  return post<CleanupResult>('/api/library/cleanup');
}

