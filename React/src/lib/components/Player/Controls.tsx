import React from 'react';
import { usePlayerStore } from '../../stores/player';
import './Controls.css';

interface ControlsProps {
  size?: 'sm' | 'md' | 'lg';
  showShuffle?: boolean;
  showRepeat?: boolean;
}

export const Controls: React.FC<ControlsProps> = ({
  size = 'md',
  showShuffle = true,
  showRepeat = true,
}) => {
  const {
    isPlaying,
    isShuffled,
    repeatMode,
    togglePlay,
    next,
    previous,
    toggleShuffle,
    cycleRepeat,
    currentTrack,
  } = usePlayerStore();

  const getRepeatIcon = () => {
    if (repeatMode === 'one') return 'fa-repeat fa-1';
    return 'fa-repeat';
  };

  return (
    <div className={`controls controls-${size}`}>
      {showShuffle && (
        <button
          className={`control-btn ${isShuffled ? 'active' : ''}`}
          onClick={toggleShuffle}
          title="Shuffle"
          disabled={!currentTrack}
        >
          <i className="fas fa-shuffle"></i>
        </button>
      )}

      <button
        className="control-btn"
        onClick={previous}
        title="Previous"
        disabled={!currentTrack}
      >
        <i className="fas fa-backward-step"></i>
      </button>

      <button
        className="control-btn play-btn"
        onClick={togglePlay}
        title={isPlaying ? 'Pause' : 'Play'}
        disabled={!currentTrack}
      >
        <i className={`fas fa-${isPlaying ? 'pause' : 'play'}`}></i>
      </button>

      <button
        className="control-btn"
        onClick={next}
        title="Next"
        disabled={!currentTrack}
      >
        <i className="fas fa-forward-step"></i>
      </button>

      {showRepeat && (
        <button
          className={`control-btn ${repeatMode !== 'off' ? 'active' : ''}`}
          onClick={cycleRepeat}
          title={`Repeat: ${repeatMode}`}
          disabled={!currentTrack}
        >
          <i className={`fas ${getRepeatIcon()}`}></i>
          {repeatMode === 'one' && <span className="repeat-one-badge">1</span>}
        </button>
      )}
    </div>
  );
};

export default Controls;

