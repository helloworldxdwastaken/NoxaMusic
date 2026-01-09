import React from 'react';
import { usePlayerStore } from '../../stores/player';
import { Slider } from '../UI/Slider';
import './VolumeControl.css';

export const VolumeControl: React.FC = () => {
  const { volume, isMuted, setVolume, toggleMute } = usePlayerStore();

  const getVolumeIcon = () => {
    if (isMuted || volume === 0) return 'fa-volume-xmark';
    if (volume < 0.3) return 'fa-volume-off';
    if (volume < 0.7) return 'fa-volume-low';
    return 'fa-volume-high';
  };

  const displayVolume = isMuted ? 0 : volume;

  return (
    <div className="volume-control">
      <button
        className="volume-btn"
        onClick={toggleMute}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        <i className={`fas ${getVolumeIcon()}`}></i>
      </button>
      <Slider
        value={displayVolume}
        min={0}
        max={1}
        step={0.01}
        onChange={setVolume}
        className="slider-volume"
      />
    </div>
  );
};

export default VolumeControl;

