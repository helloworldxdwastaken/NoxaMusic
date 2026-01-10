import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { ReactNode } from 'react';

import type { Playlist, Song } from '../types/models';
import { offlineManager } from '../services/offline/OfflineManager';

type OfflineState = ReturnType<typeof offlineManager.snapshot>;

type OfflineContextValue = {
  state: OfflineState;
  downloadPlaylist: (playlist: Playlist, songs: Song[]) => Promise<void>;
  downloadSong: (song: Song, playlist?: Playlist) => Promise<void>;
  removePlaylist: (playlistId: number) => Promise<void>;
  removeSong: (songId: number) => Promise<void>;
  localUri: (songId: number) => string | null;
  isSongDownloaded: (songId: number) => boolean;
  isPlaylistDownloaded: (playlistId: number) => boolean;
  playlistSongs: (playlistId: number) => Song[];
};

const OfflineContext = createContext<OfflineContextValue | undefined>(undefined);

export const OfflineProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<OfflineState>(() => offlineManager.snapshot());

  useEffect(() => {
    let mounted = true;
    offlineManager.initialize().then(() => {
      if (!mounted) {
        return;
      }
      const unsubscribe = offlineManager.subscribe(snapshot => setState(snapshot));
      setState(offlineManager.snapshot());
      return () => {
        unsubscribe();
      };
    });
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<OfflineContextValue>(
    () => ({
      state,
      downloadPlaylist: (playlist, songs) => offlineManager.downloadPlaylist(playlist, songs),
      downloadSong: (song, playlist) => offlineManager.downloadSong(song, playlist?.id, playlist),
      removePlaylist: playlistId => offlineManager.removePlaylist(playlistId),
      removeSong: songId => offlineManager.removeTrack(songId),
      localUri: songId => offlineManager.localUri(songId),
      isSongDownloaded: songId => offlineManager.isSongDownloaded(songId),
      isPlaylistDownloaded: playlistId => offlineManager.isPlaylistDownloaded(playlistId),
      playlistSongs: playlistId => offlineManager.playlistSongs(playlistId),
    }),
    [state],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
};

export const useOffline = () => {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within OfflineProvider');
  }
  return context;
};
