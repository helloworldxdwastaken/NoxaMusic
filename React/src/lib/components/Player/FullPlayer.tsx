import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../stores/player';
import { useUIStore } from '../../stores/ui';
import { useLyricsStore } from '../../stores/lyrics';
import { getArtworkUrl, handleImageError } from '../../utils/artwork';
import { Controls } from './Controls';
import { ProgressBar } from './ProgressBar';
import { VolumeControl } from './VolumeControl';
import './FullPlayer.css';

export const FullPlayer: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const {
    currentTrack,
    setAudioRef,
    setCurrentTime,
    setDuration,
    next,
    repeatMode,
  } = usePlayerStore();
  const { isMobile, toggleQueue, toggleLyrics, isQueueOpen, isLyricsOpen, openAddToPlaylist, openArtistDetail } = useUIStore();
  const updateCurrentLine = useLyricsStore((state) => state.updateCurrentLine);
  
  // Keep stable refs for callbacks
  const updateCurrentLineRef = useRef(updateCurrentLine);
  const nextRef = useRef(next);
  const repeatModeRef = useRef(repeatMode);
  
  useEffect(() => {
    updateCurrentLineRef.current = updateCurrentLine;
    nextRef.current = next;
    repeatModeRef.current = repeatMode;
  }, [updateCurrentLine, next, repeatMode]);

  // Set audio ref on mount
  useEffect(() => {
    if (audioRef.current) {
      setAudioRef(audioRef.current);
    }
    return () => setAudioRef(null);
  }, [setAudioRef]);

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

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
      console.error('❌ Audio error event:', {
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
  }, [setCurrentTime, setDuration]);

  // Don't render on mobile (use NowPlaying instead)
  if (isMobile) {
    return <audio ref={audioRef} />;
  }

  return (
    <>
      <audio ref={audioRef} />
      
      <div className="full-player">
        {/* Track Info */}
        <div className="player-track">
          {currentTrack ? (
            <>
              <img
                className="player-artwork"
                src={getArtworkUrl(currentTrack.album_cover)}
                alt={currentTrack.album}
                onError={(e) => handleImageError(e)}
              />
              <div className="player-info">
                <span className="player-title truncate">{currentTrack.title}</span>
                <span 
                  className="player-artist truncate clickable"
                  onClick={() => openArtistDetail(currentTrack.artist)}
                >
                  {currentTrack.artist}
                </span>
              </div>
            </>
          ) : (
            <div className="player-empty">
              <span>No track playing</span>
            </div>
          )}
        </div>

        {/* Main Controls */}
        <div className="player-center">
          <Controls />
          <ProgressBar />
        </div>

        {/* Extra Controls */}
        <div className="player-right">
          <button
            className={`player-btn ${isLyricsOpen ? 'active' : ''}`}
            onClick={toggleLyrics}
            title="Lyrics"
            disabled={!currentTrack}
          >
            <i className="fas fa-quote-right"></i>
          </button>
          
          <button
            className="player-btn"
            onClick={() => currentTrack && openAddToPlaylist(currentTrack.id)}
            title="Add to Playlist"
            disabled={!currentTrack}
          >
            <i className="fas fa-plus"></i>
          </button>
          
          <button
            className={`player-btn ${isQueueOpen ? 'active' : ''}`}
            onClick={toggleQueue}
            title="Queue"
          >
            <i className="fas fa-list"></i>
          </button>
          
          <VolumeControl />
        </div>
      </div>
    </>
  );
};

export default FullPlayer;

