import { create } from 'zustand';
import type { Track } from '../api/library';
import { getStreamUrl } from '../api/client';
import { prefetchLyrics } from '../api/lyrics';

type RepeatMode = 'off' | 'all' | 'one';

interface PlayerState {
  // Current track and queue
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  originalQueue: Track[]; // Store original queue for shuffle
  recentlyPlayed: Track[]; // Recently played tracks
  
  // Playback state
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  repeatMode: RepeatMode;
  isShuffled: boolean;
  
  // Audio element ref
  audioRef: HTMLAudioElement | null;
  
  // Actions
  setAudioRef: (audio: HTMLAudioElement | null) => void;
  playTrack: (track: Track, queue?: Track[], index?: number) => void;
  playQueue: (tracks: Track[], startIndex?: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  addToRecentlyPlayed: (track: Track) => void;
  clearRecentlyPlayed: () => void;
}

// Shuffle array utility
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Max recently played tracks to keep
const MAX_RECENTLY_PLAYED = 20;

// Load recently played from localStorage
function loadRecentlyPlayed(): Track[] {
  try {
    const stored = localStorage.getItem('recently_played');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Save recently played to localStorage
function saveRecentlyPlayed(tracks: Track[]) {
  try {
    localStorage.setItem('recently_played', JSON.stringify(tracks.slice(0, MAX_RECENTLY_PLAYED)));
  } catch {
    // Ignore storage errors
  }
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  queueIndex: 0,
  originalQueue: [],
  recentlyPlayed: loadRecentlyPlayed(),
  
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: parseFloat(localStorage.getItem('player_volume') || '1'),
  isMuted: false,
  repeatMode: 'off' as RepeatMode,
  isShuffled: false,
  
  audioRef: null,
  
  setAudioRef: (audio) => {
    set({ audioRef: audio });
    if (audio) {
      audio.volume = get().volume;
    }
  },
  
  playTrack: (track, queue, index) => {
    const { audioRef, isShuffled, currentTrack, addToRecentlyPlayed } = get();
    
    // Add current track to recently played before switching
    if (currentTrack) {
      addToRecentlyPlayed(currentTrack);
    }
    
    let newQueue = queue || [track];
    let newIndex = index ?? 0;
    
    // If we have a new queue, store original and shuffle if needed
    if (queue) {
      const originalQueue = [...queue];
      if (isShuffled) {
        // Keep current track at start, shuffle rest
        newQueue = [track, ...shuffleArray(queue.filter((_, i) => i !== index))];
        newIndex = 0;
      }
      set({ originalQueue });
    }
    
    set({
      currentTrack: track,
      queue: newQueue,
      queueIndex: newIndex,
      currentTime: 0,
      duration: track.duration || 0,
    });
    
    if (audioRef) {
      const streamUrl = getStreamUrl(track.id);
      console.log('🎵 Playing track:', { id: track.id, title: track.title, streamUrl });
      audioRef.src = streamUrl;
      audioRef.play().catch((err) => {
        console.error('❌ Audio play error:', err);
        console.error('❌ Stream URL was:', streamUrl);
      });
      set({ isPlaying: true });
    }
    
    // Prefetch lyrics in background
    if (track.artist && track.title) {
      prefetchLyrics(track.artist, track.title, track.album, track.duration);
    }
  },
  
  playQueue: (tracks, startIndex = 0) => {
    if (tracks.length === 0) return;
    
    const { isShuffled } = get();
    const track = tracks[startIndex];
    
    let newQueue = tracks;
    let newIndex = startIndex;
    
    if (isShuffled) {
      newQueue = [track, ...shuffleArray(tracks.filter((_, i) => i !== startIndex))];
      newIndex = 0;
    }
    
    set({
      originalQueue: [...tracks],
      queue: newQueue,
      queueIndex: newIndex,
    });
    
    get().playTrack(track, newQueue, newIndex);
  },
  
  play: () => {
    const { audioRef } = get();
    if (audioRef && audioRef.src) {
      audioRef.play().catch(console.error);
      set({ isPlaying: true });
    }
  },
  
  pause: () => {
    const { audioRef } = get();
    if (audioRef) {
      audioRef.pause();
      set({ isPlaying: false });
    }
  },
  
  togglePlay: () => {
    const { isPlaying } = get();
    if (isPlaying) {
      get().pause();
    } else {
      get().play();
    }
  },
  
  next: () => {
    const { queue, queueIndex, repeatMode } = get();
    
    if (queue.length === 0) return;
    
    let nextIndex = queueIndex + 1;
    
    if (nextIndex >= queue.length) {
      if (repeatMode === 'all') {
        nextIndex = 0;
      } else {
        // End of queue
        set({ isPlaying: false });
        return;
      }
    }
    
    const nextTrack = queue[nextIndex];
    if (nextTrack) {
      get().playTrack(nextTrack, queue, nextIndex);
    }
  },
  
  previous: () => {
    const { queue, queueIndex, currentTime, audioRef, repeatMode } = get();
    
    // If more than 3 seconds into song, restart it
    if (currentTime > 3) {
      if (audioRef) {
        audioRef.currentTime = 0;
        set({ currentTime: 0 });
      }
      return;
    }
    
    if (queue.length === 0) return;
    
    let prevIndex = queueIndex - 1;
    
    if (prevIndex < 0) {
      if (repeatMode === 'all') {
        prevIndex = queue.length - 1;
      } else {
        // At start, just restart
        if (audioRef) {
          audioRef.currentTime = 0;
          set({ currentTime: 0 });
        }
        return;
      }
    }
    
    const prevTrack = queue[prevIndex];
    if (prevTrack) {
      get().playTrack(prevTrack, queue, prevIndex);
    }
  },
  
  seek: (time) => {
    const { audioRef, isPlaying } = get();
    if (audioRef) {
      audioRef.currentTime = time;
      set({ currentTime: time });
      // Ensure playback continues after seeking
      if (isPlaying && audioRef.paused) {
        audioRef.play().catch(console.error);
      }
    }
  },
  
  setVolume: (volume) => {
    const { audioRef } = get();
    const clampedVolume = Math.max(0, Math.min(1, volume));
    
    if (audioRef) {
      audioRef.volume = clampedVolume;
    }
    
    localStorage.setItem('player_volume', clampedVolume.toString());
    set({ volume: clampedVolume, isMuted: clampedVolume === 0 });
  },
  
  toggleMute: () => {
    const { audioRef, isMuted, volume } = get();
    
    if (audioRef) {
      if (isMuted) {
        audioRef.volume = volume || 1;
        set({ isMuted: false });
      } else {
        audioRef.volume = 0;
        set({ isMuted: true });
      }
    }
  },
  
  toggleShuffle: () => {
    const { isShuffled, queue, queueIndex, currentTrack, originalQueue } = get();
    
    if (!isShuffled) {
      // Enable shuffle - keep current track, shuffle rest
      const currentIndex = queueIndex;
      const restOfQueue = queue.filter((_, i) => i > currentIndex);
      const shuffledRest = shuffleArray(restOfQueue);
      const newQueue = [...queue.slice(0, currentIndex + 1), ...shuffledRest];
      
      set({
        isShuffled: true,
        originalQueue: [...queue],
        queue: newQueue,
      });
    } else {
      // Disable shuffle - restore original order
      const newIndex = originalQueue.findIndex((t) => t.id === currentTrack?.id);
      
      set({
        isShuffled: false,
        queue: originalQueue,
        queueIndex: newIndex >= 0 ? newIndex : 0,
      });
    }
  },
  
  cycleRepeat: () => {
    const { repeatMode, audioRef } = get();
    
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    const currentIndex = modes.indexOf(repeatMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    
    if (audioRef) {
      audioRef.loop = nextMode === 'one';
    }
    
    set({ repeatMode: nextMode });
  },
  
  setCurrentTime: (time) => set({ currentTime: time }),
  
  setDuration: (duration) => set({ duration }),
  
  addToQueue: (track) => {
    const { queue } = get();
    set({ queue: [...queue, track] });
  },
  
  removeFromQueue: (index) => {
    const { queue, queueIndex } = get();
    const newQueue = queue.filter((_, i) => i !== index);
    
    // Adjust queue index if needed
    let newIndex = queueIndex;
    if (index < queueIndex) {
      newIndex = Math.max(0, queueIndex - 1);
    }
    
    set({ queue: newQueue, queueIndex: newIndex });
  },
  
  clearQueue: () => {
    set({ queue: [], queueIndex: 0, originalQueue: [] });
  },
  
  addToRecentlyPlayed: (track) => {
    const { recentlyPlayed } = get();
    
    // Remove track if it already exists (to avoid duplicates)
    const filtered = recentlyPlayed.filter(t => t.id !== track.id);
    
    // Add to beginning of list
    const updated = [track, ...filtered].slice(0, MAX_RECENTLY_PLAYED);
    
    set({ recentlyPlayed: updated });
    saveRecentlyPlayed(updated);
  },
  
  clearRecentlyPlayed: () => {
    set({ recentlyPlayed: [] });
    saveRecentlyPlayed([]);
  },
}));

