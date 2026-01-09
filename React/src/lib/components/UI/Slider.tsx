import React, { useCallback, useRef, useEffect, useState } from 'react';
import './Slider.css';

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  className?: string;
  disabled?: boolean;
  showTooltip?: boolean;
  formatTooltip?: (value: number) => string;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  onChangeEnd,
  className = '',
  disabled = false,
  showTooltip = false,
  formatTooltip,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [tooltipValue, setTooltipValue] = useState(value);

  const percentage = ((value - min) / (max - min)) * 100;

  const calculateValue = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return value;

      const rect = trackRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const rawValue = min + percent * (max - min);
      const steppedValue = Math.round(rawValue / step) * step;

      return Math.max(min, Math.min(max, steppedValue));
    },
    [min, max, step, value]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;

      e.preventDefault();
      setIsDragging(true);

      const newValue = calculateValue(e.clientX);
      setTooltipValue(newValue);
      onChange?.(newValue);
    },
    [disabled, calculateValue, onChange]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;

      setIsDragging(true);

      const touch = e.touches[0];
      const newValue = calculateValue(touch.clientX);
      setTooltipValue(newValue);
      onChange?.(newValue);
    },
    [disabled, calculateValue, onChange]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newValue = calculateValue(e.clientX);
      setTooltipValue(newValue);
      onChange?.(newValue);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const newValue = calculateValue(touch.clientX);
      setTooltipValue(newValue);
      onChange?.(newValue);
    };

    const handleEnd = () => {
      setIsDragging(false);
      onChangeEnd?.(tooltipValue);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleEnd);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, calculateValue, onChange, onChangeEnd, tooltipValue]);

  return (
    <div
      className={`slider ${disabled ? 'slider-disabled' : ''} ${className}`}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      <div className="slider-track" ref={trackRef}>
        <div
          className="slider-fill"
          style={{ width: `${percentage}%` }}
        />
        <div
          className="slider-thumb"
          style={{ left: `${percentage}%` }}
        >
          {showTooltip && isDragging && (
            <div className="slider-tooltip">
              {formatTooltip ? formatTooltip(tooltipValue) : tooltipValue}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Slider;

