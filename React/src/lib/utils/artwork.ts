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

// Local fallback images - use bundled assets in Capacitor, relative paths on web
const LOCAL_DEFAULT_ARTWORK = './images/default-artwork.jpg';
const LOCAL_DEFAULT_ARTIST = './images/default-artist.jpg';

/**
 * Get the full URL for artwork
 */
export function getArtworkUrl(path: string | null | undefined): string {
  // Use local default if no path
  if (!path) return LOCAL_DEFAULT_ARTWORK;
  
  // Normalize server filesystem paths to web-accessible paths
  let normalizedPath = path;
  if (path.includes('/mnt/UNO/Music_lib/')) {
    normalizedPath = path.replace('/mnt/UNO/Music_lib/', '/music_lib/');
  }
  
  // Already a full URL or data URI
  if (normalizedPath.startsWith('http') || normalizedPath.startsWith('data:')) {
    // In dev web mode (not Capacitor), convert full URLs to relative for proxy
    if (import.meta.env.DEV && !isCapacitor && normalizedPath.startsWith('https://stream.noxamusic.com')) {
      return normalizedPath.replace('https://stream.noxamusic.com', '');
    }
    return normalizedPath;
  }
  
  // Relative path - prepend API base
  return `${API_BASE}${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`;
}

/**
 * Get album cover URL - constructs path from artist/album if needed
 */
export function getAlbumCoverUrl(cover: string | null | undefined, artist?: string, albumName?: string): string {
  // If we have a cover path, use it
  if (cover) {
    return getArtworkUrl(cover);
  }
  
  // Try to construct the path from artist and album name
  if (artist && albumName) {
    const path = `/music_lib/${encodeURIComponent(artist)}/${encodeURIComponent(albumName)}/cover.jpg`;
    return getArtworkUrl(path);
  }
  
  return LOCAL_DEFAULT_ARTWORK;
}

/**
 * Get the full URL for artist image
 */
export function getArtistImageUrl(path: string | null | undefined): string {
  // Use local default if no path
  if (!path) return LOCAL_DEFAULT_ARTIST;
  
  // Normalize server filesystem paths to web-accessible paths
  let normalizedPath = path;
  if (path.includes('/mnt/UNO/Music_lib/')) {
    normalizedPath = path.replace('/mnt/UNO/Music_lib/', '/music_lib/');
  }
  
  // Already a full URL or data URI
  if (normalizedPath.startsWith('http') || normalizedPath.startsWith('data:')) {
    // In dev web mode (not Capacitor), convert full URLs to relative for proxy
    if (import.meta.env.DEV && !isCapacitor && normalizedPath.startsWith('https://stream.noxamusic.com')) {
      return normalizedPath.replace('https://stream.noxamusic.com', '');
    }
    return normalizedPath;
  }
  
  // Relative path - prepend API base
  return `${API_BASE}${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`;
}

/**
 * Get default artwork URL (local)
 */
export function getDefaultArtwork(): string {
  return LOCAL_DEFAULT_ARTWORK;
}

/**
 * Get default artist image URL (local)
 */
export function getDefaultArtistImage(): string {
  return LOCAL_DEFAULT_ARTIST;
}

/**
 * Handle image load error by setting default image
 */
export function handleImageError(
  event: React.SyntheticEvent<HTMLImageElement>,
  type: 'artwork' | 'artist' = 'artwork'
): void {
  const img = event.currentTarget;
  const defaultUrl = type === 'artist' ? getDefaultArtistImage() : getDefaultArtwork();
  
  if (img.src !== defaultUrl) {
    img.src = defaultUrl;
  }
}

