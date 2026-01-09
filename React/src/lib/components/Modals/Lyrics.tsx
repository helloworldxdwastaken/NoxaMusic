import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../stores/player';
import { useLyricsStore } from '../../stores/lyrics';
import { useUIStore } from '../../stores/ui';
import { getArtworkUrl, handleImageError } from '../../utils/artwork';
import './Lyrics.css';

export const Lyrics: React.FC = () => {
  const { currentTrack, seek, play, isPlaying } = usePlayerStore();
  const {
    lyrics,
    currentLineIndex,
    isLoading,
    isSynced,
    loadLyrics,
    seekToLine,
  } = useLyricsStore();
  const { isLyricsOpen, toggleLyrics } = useUIStore();
  const containerRef = useRef<HTMLDivElement>(null);

  // Load lyrics when track changes
  useEffect(() => {
    if (currentTrack && isLyricsOpen) {
      loadLyrics(currentTrack);
    }
  }, [currentTrack, isLyricsOpen, loadLyrics]);

  // Auto-scroll to current line
  useEffect(() => {
    if (!isSynced || currentLineIndex < 0) return;

    const line = containerRef.current?.querySelector(
      `[data-index="${currentLineIndex}"]`
    );
    if (line) {
      line.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentLineIndex, isSynced]);

  const handleLineClick = (index: number) => {
    if (!isSynced) return;
    
    const time = seekToLine(index);
    if (time !== null) {
      seek(time);
      // Ensure playback continues after seeking
      if (!isPlaying) {
        play();
      }
    }
  };

  if (!isLyricsOpen) return null;

  return (
    <div className="lyrics-modal">
      <div className="lyrics-header">
        {currentTrack && (
          <>
            <img
              className="lyrics-artwork"
              src={getArtworkUrl(currentTrack.album_cover)}
              alt={currentTrack.album}
              onError={(e) => handleImageError(e)}
            />
            <div className="lyrics-track-info">
              <h2>{currentTrack.title}</h2>
              <p>{currentTrack.artist}</p>
            </div>
          </>
        )}
        <button className="close-btn" onClick={toggleLyrics}>
          <i className="fas fa-times"></i>
        </button>
      </div>

      <div className="lyrics-content" ref={containerRef}>
        {isLoading ? (
          <div className="lyrics-loading">
            <div className="spinner"></div>
            <span>Loading lyrics...</span>
          </div>
        ) : (
          lyrics.map((line, i) => (
            <div
              key={i}
              className={`lyrics-line ${i === currentLineIndex ? 'active' : ''} ${
                isSynced ? 'synced' : ''
              }`}
              data-index={i}
              onClick={() => handleLineClick(i)}
            >
              {line.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Lyrics;

