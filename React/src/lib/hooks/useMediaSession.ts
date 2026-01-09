import { useEffect, useCallback } from 'react';
import { usePlayerStore } from '../stores/player';
import { getArtworkUrl } from '../utils/artwork';

/**
 * Custom hook to integrate with Media Session API for background playback control
 * Enables lock screen controls, notification media controls, and hardware key support
 */
export function useMediaSession() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    next,
    previous,
    seek,
  } = usePlayerStore();

  // Update media session metadata when track changes
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      return;
    }

    const artworkUrl = getArtworkUrl(currentTrack.album_cover);
    
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album || 'Unknown Album',
      artwork: artworkUrl ? [
        { src: artworkUrl, sizes: '96x96', type: 'image/jpeg' },
        { src: artworkUrl, sizes: '128x128', type: 'image/jpeg' },
        { src: artworkUrl, sizes: '192x192', type: 'image/jpeg' },
        { src: artworkUrl, sizes: '256x256', type: 'image/jpeg' },
        { src: artworkUrl, sizes: '384x384', type: 'image/jpeg' },
        { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' },
      ] : [],
    });
  }, [currentTrack]);

  // Update playback state
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  // Update position state
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;
    
    try {
      navigator.mediaSession.setPositionState({
        duration: duration || 0,
        playbackRate: 1,
        position: Math.min(currentTime, duration || 0),
      });
    } catch {
      // Ignore errors - some browsers don't support setPositionState
    }
  }, [currentTime, duration, currentTrack]);

  // Memoized action handlers
  const handlePlay = useCallback(() => {
    togglePlay();
  }, [togglePlay]);

  const handlePause = useCallback(() => {
    togglePlay();
  }, [togglePlay]);

  const handlePreviousTrack = useCallback(() => {
    previous();
  }, [previous]);

  const handleNextTrack = useCallback(() => {
    next();
  }, [next]);

  const handleSeekBackward = useCallback((details: MediaSessionActionDetails) => {
    const skipTime = details.seekOffset || 10;
    seek(Math.max(0, currentTime - skipTime));
  }, [currentTime, seek]);

  const handleSeekForward = useCallback((details: MediaSessionActionDetails) => {
    const skipTime = details.seekOffset || 10;
    seek(Math.min(duration, currentTime + skipTime));
  }, [currentTime, duration, seek]);

  const handleSeekTo = useCallback((details: MediaSessionActionDetails) => {
    if (details.seekTime !== undefined) {
      seek(details.seekTime);
    }
  }, [seek]);

  const handleStop = useCallback(() => {
    if (isPlaying) {
      togglePlay();
    }
  }, [isPlaying, togglePlay]);

  // Set up action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const actions: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ['play', handlePlay],
      ['pause', handlePause],
      ['previoustrack', handlePreviousTrack],
      ['nexttrack', handleNextTrack],
      ['seekbackward', handleSeekBackward],
      ['seekforward', handleSeekForward],
      ['seekto', handleSeekTo],
      ['stop', handleStop],
    ];

    // Set up all action handlers
    actions.forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Action not supported - ignore
      }
    });

    // Cleanup - remove all handlers
    return () => {
      actions.forEach(([action]) => {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // Ignore cleanup errors
        }
      });
    };
  }, [
    handlePlay,
    handlePause,
    handlePreviousTrack,
    handleNextTrack,
    handleSeekBackward,
    handleSeekForward,
    handleSeekTo,
    handleStop,
  ]);
}

export default useMediaSession;






