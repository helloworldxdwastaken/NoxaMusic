import { create } from 'zustand';
import type { Track } from '../api/library';

// IndexedDB database name and store
const DB_NAME = 'NoxaOfflineDB';
const DB_VERSION = 1;
const TRACKS_STORE = 'offlineTracks';

interface OfflineState {
  isOnline: boolean;
  offlineTracks: Track[];
  downloadingTracks: Set<number>;
  downloadProgress: Map<number, number>;
  
  // Actions
  setOnline: (online: boolean) => void;
  saveTrackForOffline: (track: Track) => Promise<void>;
  removeTrackFromOffline: (trackId: number) => Promise<void>;
  isTrackOffline: (trackId: number) => boolean;
  loadOfflineTracks: () => Promise<void>;
  clearAllOffline: () => Promise<void>;
  getOfflineStorageStats: () => Promise<{ count: number; size: number }>;
}

// Open IndexedDB
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(TRACKS_STORE)) {
        const store = db.createObjectStore(TRACKS_STORE, { keyPath: 'id' });
        store.createIndex('artist', 'artist', { unique: false });
        store.createIndex('album', 'album', { unique: false });
      }
    };
  });
}

// Get all tracks from IndexedDB
async function getAllTracksFromDB(): Promise<Track[]> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([TRACKS_STORE], 'readonly');
    const store = tx.objectStore(TRACKS_STORE);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// Save track to IndexedDB
async function saveTrackToDB(track: Track): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([TRACKS_STORE], 'readwrite');
    const store = tx.objectStore(TRACKS_STORE);
    const request = store.put(track);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Remove track from IndexedDB
async function removeTrackFromDB(trackId: number): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([TRACKS_STORE], 'readwrite');
    const store = tx.objectStore(TRACKS_STORE);
    const request = store.delete(trackId);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Clear all tracks from IndexedDB
async function clearAllFromDB(): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([TRACKS_STORE], 'readwrite');
    const store = tx.objectStore(TRACKS_STORE);
    const request = store.clear();
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Message service worker to cache audio
function cacheAudioInServiceWorker(url: string) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_AUDIO',
      url,
    });
  }
}

// Message service worker to remove audio from cache
function removeAudioFromServiceWorker(url: string) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'REMOVE_AUDIO',
      url,
    });
  }
}

// Get stream URL for a track
function getStreamUrl(trackId: number): string {
  const baseUrl = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '');
  const token = localStorage.getItem('musicstream_token');
  return `${baseUrl}/api/library/stream/${trackId}${token ? `?token=${token}` : ''}`;
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  isOnline: navigator.onLine,
  offlineTracks: [],
  downloadingTracks: new Set(),
  downloadProgress: new Map(),
  
  setOnline: (online) => set({ isOnline: online }),
  
  saveTrackForOffline: async (track) => {
    const { downloadingTracks, offlineTracks } = get();
    
    // Already downloading
    if (downloadingTracks.has(track.id)) {
      return;
    }
    
    // Already saved
    if (offlineTracks.some(t => t.id === track.id)) {
      return;
    }
    
    // Mark as downloading
    set({
      downloadingTracks: new Set([...downloadingTracks, track.id]),
      downloadProgress: new Map(get().downloadProgress).set(track.id, 0),
    });
    
    try {
      // Cache the audio file via service worker
      const url = getStreamUrl(track.id);
      cacheAudioInServiceWorker(url);
      
      // Save track metadata to IndexedDB
      await saveTrackToDB(track);
      
      // Update state
      const { downloadingTracks: currentDownloading, downloadProgress } = get();
      const newDownloading = new Set(currentDownloading);
      newDownloading.delete(track.id);
      
      const newProgress = new Map(downloadProgress);
      newProgress.delete(track.id);
      
      set({
        offlineTracks: [...get().offlineTracks, track],
        downloadingTracks: newDownloading,
        downloadProgress: newProgress,
      });
      
      console.log('✅ Saved track for offline:', track.title);
    } catch (error) {
      console.error('Failed to save track for offline:', error);
      
      // Remove from downloading state
      const { downloadingTracks: currentDownloading, downloadProgress } = get();
      const newDownloading = new Set(currentDownloading);
      newDownloading.delete(track.id);
      
      const newProgress = new Map(downloadProgress);
      newProgress.delete(track.id);
      
      set({
        downloadingTracks: newDownloading,
        downloadProgress: newProgress,
      });
      
      throw error;
    }
  },
  
  removeTrackFromOffline: async (trackId) => {
    try {
      // Remove from service worker cache
      const url = getStreamUrl(trackId);
      removeAudioFromServiceWorker(url);
      
      // Remove from IndexedDB
      await removeTrackFromDB(trackId);
      
      // Update state
      set({
        offlineTracks: get().offlineTracks.filter(t => t.id !== trackId),
      });
      
      console.log('🗑️ Removed track from offline:', trackId);
    } catch (error) {
      console.error('Failed to remove track from offline:', error);
      throw error;
    }
  },
  
  isTrackOffline: (trackId) => {
    return get().offlineTracks.some(t => t.id === trackId);
  },
  
  loadOfflineTracks: async () => {
    try {
      const tracks = await getAllTracksFromDB();
      set({ offlineTracks: tracks });
      console.log('📱 Loaded offline tracks:', tracks.length);
    } catch (error) {
      console.error('Failed to load offline tracks:', error);
    }
  },
  
  clearAllOffline: async () => {
    try {
      // Clear IndexedDB
      await clearAllFromDB();
      
      // Clear audio cache via service worker
      if ('caches' in window) {
        await caches.delete('noxa-v1-audio');
      }
      
      set({ offlineTracks: [] });
      console.log('🗑️ Cleared all offline content');
    } catch (error) {
      console.error('Failed to clear offline content:', error);
      throw error;
    }
  },
  
  getOfflineStorageStats: async () => {
    const tracks = get().offlineTracks;
    let totalSize = 0;
    
    // Estimate storage usage
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      totalSize = estimate.usage || 0;
    }
    
    return {
      count: tracks.length,
      size: totalSize,
    };
  },
}));

// Initialize online/offline listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useOfflineStore.getState().setOnline(true);
    console.log('🟢 Back online');
  });
  
  window.addEventListener('offline', () => {
    useOfflineStore.getState().setOnline(false);
    console.log('🔴 Gone offline');
  });
  
  // Load offline tracks on startup
  useOfflineStore.getState().loadOfflineTracks();
}






