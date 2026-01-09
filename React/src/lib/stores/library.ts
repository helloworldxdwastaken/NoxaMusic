import { create } from 'zustand';
import type { Track, Artist, Album, ScanResult, CleanupResult } from '../api/library';
import {
  getLibrary,
  getArtists,
  getAlbums,
  searchLibrary,
  scanLibrary as scanLibraryApi,
  cleanupLibrary as cleanupLibraryApi,
} from '../api/library';

/**
 * Filter out orphaned/invalid tracks
 * Orphaned tracks are those with missing essential data
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

interface LibraryState {
  tracks: Track[];
  artists: Artist[];
  albums: Album[];
  
  isLoading: boolean;
  error: string | null;
  
  // Search
  searchQuery: string;
  searchResults: Track[];
  searchArtists: { artist: string; artist_image: string | null; track_count: number }[];
  searchAlbums: { album: string; artist: string; album_cover: string | null; track_count: number }[];
  isSearching: boolean;
  
  // Library management
  isScanning: boolean;
  isCleaning: boolean;
  lastScanResult: ScanResult | null;
  lastCleanupResult: CleanupResult | null;
  
  // Actions
  fetchLibrary: () => Promise<void>;
  fetchArtists: () => Promise<void>;
  fetchAlbums: () => Promise<void>;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  refresh: () => Promise<void>;
  scanLibrary: () => Promise<ScanResult | null>;
  cleanupLibrary: () => Promise<CleanupResult | null>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  tracks: [],
  artists: [],
  albums: [],
  
  isLoading: false,
  error: null,
  
  searchQuery: '',
  searchResults: [],
  searchArtists: [],
  searchAlbums: [],
  isSearching: false,
  
  isScanning: false,
  isCleaning: false,
  lastScanResult: null,
  lastCleanupResult: null,
  
  fetchLibrary: async () => {
    set({ isLoading: true, error: null });
    
    try {
      const allTracks = await getLibrary();
      // Filter out orphaned/invalid tracks
      const tracks = filterValidTracks(allTracks);
      set({ tracks, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load library';
      set({ error: message, isLoading: false });
    }
  },
  
  fetchArtists: async () => {
    try {
      const artists = await getArtists();
      set({ artists });
    } catch (err) {
      console.error('Failed to fetch artists:', err);
    }
  },
  
  fetchAlbums: async () => {
    try {
      const albums = await getAlbums();
      set({ albums });
    } catch (err) {
      console.error('Failed to fetch albums:', err);
    }
  },
  
  search: async (query: string) => {
    set({ searchQuery: query });
    
    if (!query.trim()) {
      set({ searchResults: [], searchArtists: [], searchAlbums: [], isSearching: false });
      return;
    }
    
    set({ isSearching: true });
    
    // Retry up to 2 times for rate limiting
    const maxRetries = 2;
    let lastError: unknown;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await searchLibrary(query);
        // Filter out orphaned/invalid tracks from search results
        const searchResults = filterValidTracks(result.results || []);
        const searchArtists = result.fullResults?.artists || [];
        const searchAlbums = result.fullResults?.albums || [];
        set({ searchResults, searchArtists, searchAlbums, isSearching: false });
        return;
      } catch (err) {
        lastError = err;
        console.warn(`Search attempt ${attempt + 1} failed:`, err);
        
        // Wait before retrying (300ms, 600ms)
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
        }
      }
    }
    
    console.error('Search failed after retries:', lastError);
    set({ searchResults: [], searchArtists: [], searchAlbums: [], isSearching: false });
  },
  
  clearSearch: () => {
    set({ searchQuery: '', searchResults: [], searchArtists: [], searchAlbums: [], isSearching: false });
  },
  
  refresh: async () => {
    const { fetchLibrary, fetchArtists, fetchAlbums } = get();
    await Promise.all([fetchLibrary(), fetchArtists(), fetchAlbums()]);
  },
  
  scanLibrary: async () => {
    set({ isScanning: true, error: null });
    
    try {
      const result = await scanLibraryApi();
      set({ lastScanResult: result, isScanning: false });
      
      // Refresh library data after scan
      const { refresh } = get();
      await refresh();
      
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to scan library';
      set({ error: message, isScanning: false });
      return null;
    }
  },
  
  cleanupLibrary: async () => {
    set({ isCleaning: true, error: null });
    
    try {
      const result = await cleanupLibraryApi();
      set({ lastCleanupResult: result, isCleaning: false });
      
      // Refresh library data after cleanup
      const { refresh } = get();
      await refresh();
      
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cleanup library';
      set({ error: message, isCleaning: false });
      return null;
    }
  },
}));

