import { create } from 'zustand';
import type { LyricLine } from '../utils/lrcParser';
import { parseLRC, parsePlainLyrics, findCurrentLineIndex } from '../utils/lrcParser';
import { fetchLyrics, getCachedLyrics } from '../api/lyrics';
import type { Track } from '../api/library';

interface LyricsState {
  lyrics: LyricLine[];
  currentLineIndex: number;
  isLoading: boolean;
  error: string | null;
  isInstrumental: boolean;
  isSynced: boolean;
  
  // Track for which lyrics are loaded
  currentLyricsTrack: { artist: string; title: string } | null;
  
  // Actions
  loadLyrics: (track: Track) => Promise<void>;
  updateCurrentLine: (currentTime: number) => void;
  seekToLine: (index: number) => number | null;
  clearLyrics: () => void;
}

export const useLyricsStore = create<LyricsState>((set, get) => ({
  lyrics: [],
  currentLineIndex: -1,
  isLoading: false,
  error: null,
  isInstrumental: false,
  isSynced: false,
  currentLyricsTrack: null,
  
  loadLyrics: async (track: Track) => {
    const { artist, title, album, duration } = track;
    
    // Check if lyrics are already loaded for this track
    const { currentLyricsTrack } = get();
    if (
      currentLyricsTrack?.artist === artist &&
      currentLyricsTrack?.title === title
    ) {
      return;
    }
    
    set({
      isLoading: true,
      error: null,
      lyrics: [],
      currentLineIndex: -1,
      isInstrumental: false,
      isSynced: false,
      currentLyricsTrack: { artist, title },
    });
    
    // Check cache first
    const cached = getCachedLyrics(artist, title);
    
    try {
      const data = cached || await fetchLyrics(artist, title, album, duration);
      
      if (data.success) {
        if (data.instrumental) {
          set({
            lyrics: [{ time: null, text: '♪ Instrumental ♪' }],
            isInstrumental: true,
            isSynced: false,
            isLoading: false,
          });
        } else if (data.syncedLyrics) {
          const parsed = parseLRC(data.syncedLyrics);
          set({
            lyrics: parsed,
            isSynced: true,
            isLoading: false,
          });
        } else if (data.plainLyrics) {
          const parsed = parsePlainLyrics(data.plainLyrics);
          set({
            lyrics: parsed,
            isSynced: false,
            isLoading: false,
          });
        } else {
          set({
            lyrics: [{ time: null, text: 'No lyrics available' }],
            isLoading: false,
          });
        }
      } else {
        set({
          lyrics: [{ time: null, text: 'No lyrics found' }],
          error: data.error || null,
          isLoading: false,
        });
      }
    } catch (err) {
      set({
        lyrics: [{ time: null, text: 'Failed to load lyrics' }],
        error: err instanceof Error ? err.message : 'Unknown error',
        isLoading: false,
      });
    }
  },
  
  updateCurrentLine: (currentTime: number) => {
    const { lyrics, isSynced, currentLineIndex } = get();
    
    if (!isSynced || lyrics.length === 0) return;
    
    const newIndex = findCurrentLineIndex(lyrics, currentTime);
    
    if (newIndex !== currentLineIndex) {
      set({ currentLineIndex: newIndex });
    }
  },
  
  seekToLine: (index: number) => {
    const { lyrics } = get();
    const line = lyrics[index];
    
    if (line?.time !== null) {
      return line.time;
    }
    
    return null;
  },
  
  clearLyrics: () => {
    set({
      lyrics: [],
      currentLineIndex: -1,
      isLoading: false,
      error: null,
      isInstrumental: false,
      isSynced: false,
      currentLyricsTrack: null,
    });
  },
}));

