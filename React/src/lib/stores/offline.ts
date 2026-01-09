import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Network } from '@capacitor/network';
import { Filesystem, Directory } from '@capacitor/filesystem';
import type { Track } from '../api/library';

// Detect if running in Capacitor
const isCapacitor = Capacitor.isNativePlatform();

// IndexedDB database name and store (for web)
const DB_NAME = 'NoxaOfflineDB';
const DB_VERSION = 1;
const TRACKS_STORE = 'offlineTracks';

// Capacitor storage keys
const PREF_OFFLINE_TRACKS = 'offline_tracks';
const AUDIO_FOLDER = 'offline_audio';

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

// ============= CAPACITOR STORAGE FUNCTIONS =============

async function getTracksFromCapacitor(): Promise<Track[]> {
  try {
    const { value } = await Preferences.get({ key: PREF_OFFLINE_TRACKS });
    return value ? JSON.parse(value) : [];
  } catch (error) {
    console.error('Failed to get tracks from Capacitor Preferences:', error);
    return [];
  }
}

async function saveTracksToCapacitor(tracks: Track[]): Promise<void> {
  try {
    await Preferences.set({
      key: PREF_OFFLINE_TRACKS,
      value: JSON.stringify(tracks),
    });
  } catch (error) {
    console.error('Failed to save tracks to Capacitor Preferences:', error);
    throw error;
  }
}

async function saveAudioToCapacitor(trackId: number, audioBlob: Blob): Promise<string> {
  try {
    // Convert blob to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;
        // Remove data URL prefix
        resolve(base64data.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(audioBlob);
    });

    const fileName = `track_${trackId}.mp3`;
    
    await Filesystem.writeFile({
      path: `${AUDIO_FOLDER}/${fileName}`,
      data: base64,
      directory: Directory.Data,
    });

    return fileName;
  } catch (error) {
    console.error('Failed to save audio to Capacitor Filesystem:', error);
    throw error;
  }
}

async function removeAudioFromCapacitor(trackId: number): Promise<void> {
  try {
    const fileName = `track_${trackId}.mp3`;
    await Filesystem.deleteFile({
      path: `${AUDIO_FOLDER}/${fileName}`,
      directory: Directory.Data,
    });
  } catch (error) {
    // File might not exist, that's okay
    console.log('Audio file not found or already deleted:', error);
  }
}

async function clearCapacitorAudio(): Promise<void> {
  try {
    await Filesystem.rmdir({
      path: AUDIO_FOLDER,
      directory: Directory.Data,
      recursive: true,
    });
  } catch (error) {
    // Folder might not exist
    console.log('Audio folder not found or already deleted:', error);
  }
}

async function getCapacitorStorageSize(): Promise<number> {
  try {
    const result = await Filesystem.readdir({
      path: AUDIO_FOLDER,
      directory: Directory.Data,
    });
    
    let totalSize = 0;
    for (const file of result.files) {
      try {
        const stat = await Filesystem.stat({
          path: `${AUDIO_FOLDER}/${file.name}`,
          directory: Directory.Data,
        });
        totalSize += stat.size || 0;
      } catch (e) {
        // Skip files we can't stat
      }
    }
    return totalSize;
  } catch (error) {
    return 0;
  }
}

// ============= INDEXEDDB FUNCTIONS (WEB) =============

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

// Message service worker to cache audio (web only)
function cacheAudioInServiceWorker(url: string) {
  if (!isCapacitor && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_AUDIO',
      url,
    });
  }
}

function removeAudioFromServiceWorker(url: string) {
  if (!isCapacitor && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'REMOVE_AUDIO',
      url,
    });
  }
}

// Get stream URL for a track
function getStreamUrl(trackId: number): string {
  // Use full API URL in Capacitor or production
  const baseUrl = (import.meta.env.DEV && !isCapacitor) 
    ? '' 
    : (import.meta.env.VITE_API_URL || 'https://stream.noxamusic.com');
  const token = localStorage.getItem('musicstream_token');
  return `${baseUrl}/api/library/stream/${trackId}${token ? `?token=${token}` : ''}`;
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
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
      if (isCapacitor) {
        // Capacitor: Download audio and save to filesystem
        const url = getStreamUrl(track.id);
        const response = await fetch(url);
        const blob = await response.blob();
        await saveAudioToCapacitor(track.id, blob);
        
        // Save track metadata
        const currentTracks = await getTracksFromCapacitor();
        await saveTracksToCapacitor([...currentTracks, track]);
      } else {
        // Web: Use service worker and IndexedDB
        const url = getStreamUrl(track.id);
        cacheAudioInServiceWorker(url);
        await saveTrackToDB(track);
      }
      
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
      
      console.log('✅ Saved track for offline:', track.title, isCapacitor ? '(Capacitor)' : '(Web)');
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
      if (isCapacitor) {
        // Remove audio file
        await removeAudioFromCapacitor(trackId);
        
        // Update track list
        const currentTracks = await getTracksFromCapacitor();
        await saveTracksToCapacitor(currentTracks.filter(t => t.id !== trackId));
      } else {
        // Web
        const url = getStreamUrl(trackId);
        removeAudioFromServiceWorker(url);
        await removeTrackFromDB(trackId);
      }
      
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
      let tracks: Track[];
      
      if (isCapacitor) {
        tracks = await getTracksFromCapacitor();
      } else {
        tracks = await getAllTracksFromDB();
      }
      
      set({ offlineTracks: tracks });
      console.log('📱 Loaded offline tracks:', tracks.length, isCapacitor ? '(Capacitor)' : '(Web)');
    } catch (error) {
      console.error('Failed to load offline tracks:', error);
    }
  },
  
  clearAllOffline: async () => {
    try {
      if (isCapacitor) {
        await clearCapacitorAudio();
        await Preferences.remove({ key: PREF_OFFLINE_TRACKS });
      } else {
        await clearAllFromDB();
        if ('caches' in window) {
          await caches.delete('noxa-v1-audio');
        }
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
    
    if (isCapacitor) {
      totalSize = await getCapacitorStorageSize();
    } else if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      totalSize = estimate.usage || 0;
    }
    
    return {
      count: tracks.length,
      size: totalSize,
    };
  },
}));

// Initialize network listeners
if (typeof window !== 'undefined') {
  if (isCapacitor) {
    // Use Capacitor Network plugin
    Network.addListener('networkStatusChange', (status) => {
      useOfflineStore.getState().setOnline(status.connected);
      console.log(status.connected ? '🟢 Back online' : '🔴 Gone offline', `(${status.connectionType})`);
    });
    
    // Get initial status
    Network.getStatus().then((status) => {
      useOfflineStore.getState().setOnline(status.connected);
      console.log('📶 Network status:', status.connected ? 'online' : 'offline', `(${status.connectionType})`);
    });
  } else {
    // Web: Use browser events
    window.addEventListener('online', () => {
      useOfflineStore.getState().setOnline(true);
      console.log('🟢 Back online');
    });
    
    window.addEventListener('offline', () => {
      useOfflineStore.getState().setOnline(false);
      console.log('🔴 Gone offline');
    });
  }
  
  // Load offline tracks on startup
  useOfflineStore.getState().loadOfflineTracks();
}
