import { get } from './client';

export interface LyricsResponse {
  success: boolean;
  syncedLyrics: string | null;
  plainLyrics: string | null;
  instrumental: boolean;
  error?: string;
}

/**
 * Fetch lyrics for a track
 */
export async function fetchLyrics(
  artist: string,
  track: string,
  album?: string,
  duration?: number
): Promise<LyricsResponse> {
  const params = new URLSearchParams({
    artist,
    track,
    ...(album && { album }),
    ...(duration && { duration: Math.round(duration).toString() }),
  });
  
  try {
    return await get<LyricsResponse>(`/api/lyrics?${params}`);
  } catch {
    return {
      success: false,
      syncedLyrics: null,
      plainLyrics: null,
      instrumental: false,
      error: 'Failed to fetch lyrics',
    };
  }
}

// Simple lyrics cache
const lyricsCache = new Map<string, LyricsResponse>();
const MAX_CACHE_SIZE = 20;

/**
 * Get cache key for a track
 */
function getCacheKey(artist: string, track: string): string {
  return `${artist.toLowerCase()}-${track.toLowerCase()}`;
}

/**
 * Get cached lyrics if available
 */
export function getCachedLyrics(
  artist: string,
  track: string
): LyricsResponse | null {
  return lyricsCache.get(getCacheKey(artist, track)) || null;
}

/**
 * Prefetch and cache lyrics for a track
 */
export async function prefetchLyrics(
  artist: string,
  track: string,
  album?: string,
  duration?: number
): Promise<void> {
  const key = getCacheKey(artist, track);
  
  if (lyricsCache.has(key)) return;
  
  const data = await fetchLyrics(artist, track, album, duration);
  
  // Limit cache size
  if (lyricsCache.size >= MAX_CACHE_SIZE) {
    const firstKey = lyricsCache.keys().next().value;
    if (firstKey) lyricsCache.delete(firstKey);
  }
  
  lyricsCache.set(key, data);
}

/**
 * Clear the lyrics cache
 */
export function clearLyricsCache(): void {
  lyricsCache.clear();
}

