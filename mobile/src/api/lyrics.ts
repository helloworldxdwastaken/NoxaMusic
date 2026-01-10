// Lyrics API using lrclib.net
// Docs: https://lrclib.net/docs

export interface LyricsResponse {
  id: number;
  name: string;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export interface ParsedLyricLine {
  time: number; // in seconds
  text: string;
}

// Simple in-memory cache for lyrics (persists during app session)
const lyricsCache = new Map<string, LyricsResponse | null>();
const MAX_CACHE_SIZE = 50;

const getCacheKey = (trackName: string, artistName: string): string => {
  return `${trackName.toLowerCase()}|${artistName.toLowerCase()}`;
};

/**
 * Fetch lyrics from lrclib.net with caching
 */
export const fetchLyrics = async (
  trackName: string,
  artistName: string,
  albumName?: string,
  duration?: number,
): Promise<LyricsResponse | null> => {
  const cacheKey = getCacheKey(trackName, artistName);
  
  // Check cache first
  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey) ?? null;
  }

  try {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
    });

    if (albumName) {
      params.append('album_name', albumName);
    }

    if (duration) {
      params.append('duration', String(Math.round(duration)));
    }

    const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: {
        'User-Agent': 'MusicApp/1.0.0',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        // Cache "not found" results too to avoid repeated requests
        lyricsCache.set(cacheKey, null);
        return null;
      }
      throw new Error(`Failed to fetch lyrics: ${response.status}`);
    }

    const data: LyricsResponse = await response.json();
    
    // Manage cache size
    if (lyricsCache.size >= MAX_CACHE_SIZE) {
      const firstKey = lyricsCache.keys().next().value;
      if (firstKey) {
        lyricsCache.delete(firstKey);
      }
    }
    
    // Cache the result
    lyricsCache.set(cacheKey, data);
    
    return data;
  } catch (error) {
    console.warn('Lyrics fetch error:', error);
    return null;
  }
};

/**
 * Parse synced lyrics (LRC format) into an array of timed lines
 * Format: [mm:ss.xx] lyrics text
 */
export const parseSyncedLyrics = (syncedLyrics: string): ParsedLyricLine[] => {
  const lines = syncedLyrics.split('\n');
  const parsed: ParsedLyricLine[] = [];

  for (const line of lines) {
    // Match [mm:ss.xx] or [mm:ss] format
    const match = line.match(/^\[(\d{2}):(\d{2})(?:\.(\d{2}))?\]\s*(.*)$/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const hundredths = match[3] ? parseInt(match[3], 10) : 0;
      const text = match[4].trim();

      const time = minutes * 60 + seconds + hundredths / 100;
      
      // Only include non-empty lines
      if (text) {
        parsed.push({ time, text });
      }
    }
  }

  return parsed.sort((a, b) => a.time - b.time);
};

/**
 * Parse plain lyrics into lines
 */
export const parsePlainLyrics = (plainLyrics: string): string[] => {
  return plainLyrics
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
};

