import React from 'react';
import { usePlayerStore } from '../../stores/player';
import { formatTime } from '../../utils/formatTime';
import { Slider } from '../UI/Slider';
import './ProgressBar.css';

interface ProgressBarProps {
  showTime?: boolean;
  compact?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  showTime = true,
  compact = false,
}) => {
  const { currentTime, duration, seek } = usePlayerStore();

  const handleChange = (value: number) => {
    seek(value);
  };

  return (
    <div className={`progress-bar ${compact ? 'compact' : ''}`}>
      {showTime && <span className="time current">{formatTime(currentTime)}</span>}
      <Slider
        value={currentTime}
        min={0}
        max={duration || 100}
        step={0.1}
        onChange={handleChange}
        className="slider-progress"
        showTooltip={!compact}
        formatTooltip={formatTime}
      />
      {showTime && <span className="time duration">{formatTime(duration)}</span>}
    </div>
  );
};

export default ProgressBar;

