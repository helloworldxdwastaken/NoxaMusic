import { useCallback } from 'react';

import { useOffline } from '../context/OfflineContext';
import type { Playlist, Song } from '../types/models';

export const useAutoDownloadNewTracks = () => {
  const { isPlaylistDownloaded, downloadSong } = useOffline();

  return useCallback(
    (playlist: Playlist | undefined | null, song: Song | undefined | null) => {
      if (!playlist || !song) {
        return;
      }
      if (!isPlaylistDownloaded(playlist.id)) {
        return;
      }
      downloadSong(song, playlist).catch(error =>
        console.warn('Auto offline download failed', error),
      );
    },
    [downloadSong, isPlaylistDownloaded],
  );
};
