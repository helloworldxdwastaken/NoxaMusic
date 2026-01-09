import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '../stores/player';
import {
  startSession,
  sessionHeartbeat,
  endSession,
  startListen,
  endListen,
  trackSearch,
} from '../api/analytics';

// Heartbeat interval (every 30 seconds)
const HEARTBEAT_INTERVAL = 30000;

// Minimum listen time to count as a valid listen (10 seconds)
const MIN_LISTEN_TIME = 10;

/**
 * Custom hook for analytics tracking
 * Tracks sessions, listens, and searches
 */
export function useAnalytics() {
  const { currentTrack, isPlaying, currentTime, duration } = usePlayerStore();
  
  // Refs to track listen state
  const sessionIdRef = useRef<string | null>(null);
  const listenIdRef = useRef<string | null>(null);
  const listenStartTimeRef = useRef<number>(0);
  const lastTrackIdRef = useRef<number | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);

  // Start session on mount
  useEffect(() => {
    const initSession = async () => {
      try {
        const { sessionId } = await startSession();
        sessionIdRef.current = sessionId;
        
        // Start heartbeat
        heartbeatIntervalRef.current = window.setInterval(async () => {
          try {
            await sessionHeartbeat();
          } catch (error) {
            console.error('Heartbeat failed:', error);
          }
        }, HEARTBEAT_INTERVAL);
      } catch (error) {
        console.error('Failed to start analytics session:', error);
      }
    };

    initSession();

    // Cleanup on unmount
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      
      // End session
      endSession().catch(console.error);
    };
  }, []);

  // Track listen events when track changes or playback state changes
  useEffect(() => {
    const trackId = currentTrack?.id;

    // Track changed - end previous listen
    if (lastTrackIdRef.current !== trackId && listenIdRef.current) {
      const listenDuration = Date.now() - listenStartTimeRef.current;
      const seconds = Math.floor(listenDuration / 1000);
      const completed = currentTime >= (duration - 2); // Within 2 seconds of end
      const skipped = seconds < MIN_LISTEN_TIME;
      
      if (seconds >= MIN_LISTEN_TIME) {
        endListen(listenIdRef.current, seconds, completed, skipped).catch(console.error);
      }
      
      listenIdRef.current = null;
    }

    // New track started playing
    if (trackId && isPlaying && trackId !== lastTrackIdRef.current) {
      startListen(trackId)
        .then(({ listenId }) => {
          listenIdRef.current = listenId;
          listenStartTimeRef.current = Date.now();
        })
        .catch(console.error);
    }

    // Track stopped (paused at end or manually)
    if (!isPlaying && listenIdRef.current) {
      const listenDuration = Date.now() - listenStartTimeRef.current;
      const seconds = Math.floor(listenDuration / 1000);
      const completed = currentTime >= (duration - 2);
      const skipped = seconds < MIN_LISTEN_TIME;
      
      if (seconds >= MIN_LISTEN_TIME) {
        endListen(listenIdRef.current, seconds, completed, skipped).catch(console.error);
      }
      
      listenIdRef.current = null;
    }

    // Track started playing again (resume)
    if (trackId && isPlaying && !listenIdRef.current && trackId === lastTrackIdRef.current) {
      startListen(trackId)
        .then(({ listenId }) => {
          listenIdRef.current = listenId;
          listenStartTimeRef.current = Date.now();
        })
        .catch(console.error);
    }

    lastTrackIdRef.current = trackId ?? null;
  }, [currentTrack?.id, isPlaying, currentTime, duration]);

  // Search tracking function
  const trackSearchQuery = useCallback(async (query: string, resultsCount: number) => {
    if (query.trim().length < 2) return; // Ignore very short queries
    
    try {
      await trackSearch(query, resultsCount);
    } catch (error) {
      console.error('Failed to track search:', error);
    }
  }, []);

  return { trackSearchQuery };
}

export default useAnalytics;






