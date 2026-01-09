import { create } from 'zustand';

interface ModalState {
  isOpen: boolean;
  data?: unknown;
}

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface UIState {
  // Toast notifications
  toasts: Toast[];
  // Mobile detection
  isMobile: boolean;
  
  // Sidebar (desktop)
  isSidebarCollapsed: boolean;
  
  // Queue panel
  isQueueOpen: boolean;
  
  // Lyrics modal/panel
  isLyricsOpen: boolean;
  
  // Now Playing modal (mobile)
  isNowPlayingOpen: boolean;
  
  // Settings dropdown
  isSettingsOpen: boolean;
  
  // Generic modals
  artistDetailModal: ModalState & { data?: { artistName: string } };
  albumDetailModal: ModalState & { data?: { albumName: string; fromArtist?: string } };
  createPlaylistModal: ModalState;
  importModal: ModalState & { data?: { type: 'spotify' | 'youtube' | 'url' } };
  addToPlaylistModal: ModalState & { data?: { trackId: number } };
  
  // Actions
  setIsMobile: (isMobile: boolean) => void;
  toggleSidebar: () => void;
  toggleQueue: () => void;
  toggleLyrics: () => void;
  toggleNowPlaying: () => void;
  toggleSettings: () => void;
  
  openArtistDetail: (artistName: string) => void;
  closeArtistDetail: () => void;
  
  openAlbumDetail: (albumName: string, fromArtist?: string) => void;
  closeAlbumDetail: () => void;
  goBackFromAlbum: () => void;
  
  openCreatePlaylist: () => void;
  closeCreatePlaylist: () => void;
  
  openImportModal: (type: 'spotify' | 'youtube' | 'url') => void;
  closeImportModal: () => void;
  
  openAddToPlaylist: (trackId: number) => void;
  closeAddToPlaylist: () => void;
  
  closeAllModals: () => void;
  
  // Toast actions
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  dismissToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  isMobile: typeof window !== 'undefined' ? window.innerWidth <= 768 : false,
  
  isSidebarCollapsed: false,
  isQueueOpen: false,
  isLyricsOpen: false,
  isNowPlayingOpen: false,
  isSettingsOpen: false,
  
  toasts: [],
  
  artistDetailModal: { isOpen: false },
  albumDetailModal: { isOpen: false },
  createPlaylistModal: { isOpen: false },
  importModal: { isOpen: false },
  addToPlaylistModal: { isOpen: false },
  
  setIsMobile: (isMobile) => set({ isMobile }),
  
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  
  toggleQueue: () => set((state) => ({ isQueueOpen: !state.isQueueOpen })),
  
  toggleLyrics: () => set((state) => ({ isLyricsOpen: !state.isLyricsOpen })),
  
  toggleNowPlaying: () => set((state) => ({ isNowPlayingOpen: !state.isNowPlayingOpen })),
  
  toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
  
  openArtistDetail: (artistName) =>
    set({ artistDetailModal: { isOpen: true, data: { artistName } } }),
  
  closeArtistDetail: () => set({ artistDetailModal: { isOpen: false } }),
  
  openAlbumDetail: (albumName, fromArtist) =>
    set({ albumDetailModal: { isOpen: true, data: { albumName, fromArtist } } }),
  
  closeAlbumDetail: () => set({ albumDetailModal: { isOpen: false } }),
  
  goBackFromAlbum: () => {
    const { albumDetailModal } = get();
    const fromArtist = albumDetailModal.data?.fromArtist;
    set({ albumDetailModal: { isOpen: false } });
    if (fromArtist) {
      set({ artistDetailModal: { isOpen: true, data: { artistName: fromArtist } } });
    }
  },
  
  openCreatePlaylist: () => set({ createPlaylistModal: { isOpen: true } }),
  
  closeCreatePlaylist: () => set({ createPlaylistModal: { isOpen: false } }),
  
  openImportModal: (type) =>
    set({ importModal: { isOpen: true, data: { type } } }),
  
  closeImportModal: () => set({ importModal: { isOpen: false } }),
  
  openAddToPlaylist: (trackId) =>
    set({ addToPlaylistModal: { isOpen: true, data: { trackId } } }),
  
  closeAddToPlaylist: () => set({ addToPlaylistModal: { isOpen: false } }),
  
  closeAllModals: () =>
    set({
      artistDetailModal: { isOpen: false },
      albumDetailModal: { isOpen: false },
      createPlaylistModal: { isOpen: false },
      importModal: { isOpen: false },
      addToPlaylistModal: { isOpen: false },
      isQueueOpen: false,
      isLyricsOpen: false,
      isNowPlayingOpen: false,
      isSettingsOpen: false,
    }),
  
  showToast: (message, type = 'info', duration = 3000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const toast: Toast = { id, message, type, duration };
    
    set((state) => ({ toasts: [...state.toasts, toast] }));
    
    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        get().dismissToast(id);
      }, duration);
    }
  },
  
  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

// Listen for resize events
if (typeof window !== 'undefined') {
  let resizeTimeout: number;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = window.setTimeout(() => {
      useUIStore.getState().setIsMobile(window.innerWidth <= 768);
    }, 100);
  });
}

