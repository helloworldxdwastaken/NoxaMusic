import { create } from 'zustand';
import type { Playlist, GeneratedPlaylist } from '../api/playlists';
import {
  getPlaylists,
  getGeneratedPlaylists,
  createPlaylist as apiCreatePlaylist,
  deletePlaylist as apiDeletePlaylist,
  addTrackToPlaylist as apiAddTrack,
  removeTrackFromPlaylist as apiRemoveTrack,
} from '../api/playlists';

interface PlaylistsState {
  playlists: Playlist[];
  generatedPlaylists: GeneratedPlaylist[];
  
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchPlaylists: () => Promise<void>;
  fetchGeneratedPlaylists: () => Promise<void>;
  createPlaylist: (name: string, description?: string) => Promise<Playlist | null>;
  deletePlaylist: (id: number | string) => Promise<boolean>;
  addTrackToPlaylist: (playlistId: number | string, trackId: number) => Promise<boolean>;
  removeTrackFromPlaylist: (playlistId: number | string, trackId: number) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export const usePlaylistsStore = create<PlaylistsState>((set, get) => ({
  playlists: [],
  generatedPlaylists: [],
  
  isLoading: false,
  error: null,
  
  fetchPlaylists: async () => {
    set({ isLoading: true, error: null });
    
    try {
      const playlists = await getPlaylists();
      set({ playlists, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load playlists';
      set({ error: message, isLoading: false });
    }
  },
  
  fetchGeneratedPlaylists: async () => {
    // Retry up to 3 times with exponential backoff
    const maxRetries = 3;
    let lastError: unknown;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const generatedPlaylists = await getGeneratedPlaylists();
        set({ generatedPlaylists });
        return;
      } catch (err) {
        lastError = err;
        console.warn(`Failed to fetch generated playlists (attempt ${attempt + 1}/${maxRetries}):`, err);
        
        // Wait before retrying (500ms, 1s, 2s)
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
        }
      }
    }
    
    console.error('Failed to fetch generated playlists after retries:', lastError);
  },
  
  createPlaylist: async (name: string, description?: string) => {
    try {
      const playlist = await apiCreatePlaylist(name, description);
      set((state) => ({
        playlists: [...state.playlists, playlist],
      }));
      return playlist;
    } catch (err) {
      console.error('Failed to create playlist:', err);
      return null;
    }
  },
  
  deletePlaylist: async (id: number | string) => {
    try {
      await apiDeletePlaylist(id);
      set((state) => ({
        playlists: state.playlists.filter((p) => p.id !== id),
      }));
      return true;
    } catch (err) {
      console.error('Failed to delete playlist:', err);
      return false;
    }
  },
  
  addTrackToPlaylist: async (playlistId: number | string, trackId: number) => {
    try {
      await apiAddTrack(playlistId, trackId);
      // Refresh playlists to get updated track count
      get().fetchPlaylists();
      return true;
    } catch (err) {
      console.error('Failed to add track to playlist:', err);
      return false;
    }
  },
  
  removeTrackFromPlaylist: async (playlistId: number | string, trackId: number) => {
    try {
      await apiRemoveTrack(playlistId, trackId);
      // Refresh playlists to get updated track count
      get().fetchPlaylists();
      return true;
    } catch (err) {
      console.error('Failed to remove track from playlist:', err);
      return false;
    }
  },
  
  refresh: async () => {
    const { fetchPlaylists, fetchGeneratedPlaylists } = get();
    await Promise.all([fetchPlaylists(), fetchGeneratedPlaylists()]);
  },
}));

