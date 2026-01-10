import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../stores/player';
import { useUIStore } from '../../stores/ui';
import { useLyricsStore } from '../../stores/lyrics';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';
import { getArtworkUrl, handleImageError } from '../../utils/artwork';
import { Controls } from './Controls';
import { ProgressBar } from './ProgressBar';
import './NowPlaying.css';

export const NowPlaying: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const {
    currentTrack,
    isPlaying,
    setAudioRef,
    setCurrentTime,
    setDuration,
    next,
    previous,
    repeatMode,
  } = usePlayerStore();
  const { isNowPlayingOpen, toggleNowPlaying, toggleLyrics, toggleQueue, openAddToPlaylist, openArtistDetail, isMobile } = useUIStore();
  const updateCurrentLine = useLyricsStore((state) => state.updateCurrentLine);

  // Swipe gestures: down to close, left/right to skip tracks
  const swipeHandlers = useSwipeGesture({
    onSwipeDown: toggleNowPlaying,
    onSwipeLeft: next,
    onSwipeRight: previous,
    threshold: 50,
  });

  // Keep stable refs for callbacks
  const updateCurrentLineRef = useRef(updateCurrentLine);
  const nextRef = useRef(next);
  const repeatModeRef = useRef(repeatMode);
  
  useEffect(() => {
    updateCurrentLineRef.current = updateCurrentLine;
    nextRef.current = next;
    repeatModeRef.current = repeatMode;
  }, [updateCurrentLine, next, repeatMode]);

  // Set audio ref on mount (mobile only)
  useEffect(() => {
    if (isMobile && audioRef.current) {
      setAudioRef(audioRef.current);
    }
  }, [isMobile, setAudioRef]);

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isMobile) return;

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      updateCurrentLineRef.current(time);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      if (repeatModeRef.current !== 'one') {
        nextRef.current();
      }
    };

    const handleError = (e: Event) => {
      const audioEl = e.target as HTMLAudioElement;
      console.error('❌ Mobile Audio error event:', {
        error: audioEl.error,
        errorCode: audioEl.error?.code,
        errorMessage: audioEl.error?.message,
        src: audioEl.src,
        networkState: audioEl.networkState,
        readyState: audioEl.readyState,
      });
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [isMobile, setCurrentTime, setDuration]);

  if (!isMobile) return null;

  return (
    <>
      <audio ref={audioRef} crossOrigin="use-credentials" />
      
      <div 
        className={`now-playing ${isNowPlayingOpen ? 'open' : ''}`}
        {...swipeHandlers}
      >
        {/* Blurred artwork background */}
        {currentTrack && (
          <div 
            className="now-playing-bg"
            style={{ backgroundImage: `url(${getArtworkUrl(currentTrack.album_cover)})` }}
          />
        )}
        
        <div className="now-playing-header">
          <button className="close-btn" onClick={toggleNowPlaying}>
            <i className="fas fa-chevron-down"></i>
          </button>
          <span className="header-title">Now Playing</span>
          <div className="header-spacer"></div>
        </div>

        {currentTrack && (
          <div className="now-playing-content">
            <div className={`artwork-container ${isPlaying ? 'playing' : 'paused'}`}>
              <img
                className="now-playing-artwork"
                src={getArtworkUrl(currentTrack.album_cover)}
                alt={currentTrack.album}
                onError={(e) => handleImageError(e)}
              />
            </div>

            <div className="track-info">
              <h2 className="track-title truncate">{currentTrack.title}</h2>
              <p 
                className="track-artist truncate clickable"
                onClick={() => {
                  toggleNowPlaying();
                  openArtistDetail(currentTrack.artist);
                }}
              >
                {currentTrack.artist}
              </p>
            </div>

            <div className="controls-container">
              <ProgressBar showTime />
              <Controls size="lg" />
            </div>

            <div className="now-playing-actions">
              <button className="action-btn" onClick={toggleLyrics}>
                <i className="fas fa-quote-right"></i>
                <span>Lyrics</span>
              </button>
              <button className="action-btn" onClick={() => openAddToPlaylist(currentTrack.id)}>
                <i className="fas fa-plus"></i>
                <span>Add to Playlist</span>
              </button>
              <button className="action-btn" onClick={toggleQueue}>
                <i className="fas fa-list"></i>
                <span>Queue</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default NowPlaying;

