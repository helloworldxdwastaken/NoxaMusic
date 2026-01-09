import React, { useRef } from 'react';
import { usePlayerStore } from '../../stores/player';
import { useUIStore } from '../../stores/ui';
import { getArtworkUrl, handleImageError } from '../../utils/artwork';
import './MiniPlayer.css';

export const MiniPlayer: React.FC = () => {
  const { currentTrack, isPlaying, togglePlay, next, previous } = usePlayerStore();
  const { toggleNowPlaying } = useUIStore();
  
  // Track touch for swipe vs tap detection
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  if (!currentTrack) return null;

  const handlePlayClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    togglePlay();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const deltaTime = Date.now() - touchStartRef.current.time;
    
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    
    // Swipe detection (threshold: 40px, max time: 300ms for swipe)
    if (deltaTime < 300) {
      if (absX > 40 && absX > absY) {
        // Horizontal swipe
        if (deltaX > 0) {
          previous();
        } else {
          next();
        }
      } else if (absY > 40 && absY > absX && deltaY < 0) {
        // Swipe up
        toggleNowPlaying();
      } else if (absX < 10 && absY < 10) {
        // Tap (minimal movement)
        toggleNowPlaying();
      }
    } else if (absX < 10 && absY < 10) {
      // Long press that didn't move - still treat as tap
      toggleNowPlaying();
    }

    touchStartRef.current = null;
  };

  return (
    <div 
      className="mini-player glass-card" 
      onClick={toggleNowPlaying}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <img
        className="mini-player-artwork"
        src={getArtworkUrl(currentTrack.album_cover)}
        alt={currentTrack.album}
        onError={(e) => handleImageError(e)}
      />
      
      <div className="mini-player-info">
        <span className="mini-player-title">{currentTrack.title}</span>
        <span className="mini-player-artist">{currentTrack.artist}</span>
      </div>

      <div className="mini-player-controls">
        <button 
          className="control-btn" 
          onClick={handlePlayClick}
          onTouchEnd={(e) => {
            e.stopPropagation();
            handlePlayClick(e);
          }}
        >
          <i className={`fas fa-${isPlaying ? 'pause' : 'play'}`}></i>
        </button>
      </div>
    </div>
  );
};

export default MiniPlayer;

