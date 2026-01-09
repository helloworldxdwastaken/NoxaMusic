import React from 'react';
import './Skeleton.css';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  className?: string;
  animation?: 'pulse' | 'wave' | 'none';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  variant = 'text',
  className = '',
  animation = 'pulse',
}) => {
  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  return (
    <div
      className={`skeleton skeleton-${variant} skeleton-${animation} ${className}`}
      style={style}
    />
  );
};

// Pre-made skeleton components
export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton-card ${className}`}>
    <Skeleton variant="rounded" width="100%" height={180} />
    <Skeleton variant="text" width="80%" height={16} />
    <Skeleton variant="text" width="60%" height={14} />
  </div>
);

export const SkeletonTrack: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton-track ${className}`}>
    <Skeleton variant="rounded" width={48} height={48} />
    <div className="skeleton-track-info">
      <Skeleton variant="text" width="70%" height={16} />
      <Skeleton variant="text" width="50%" height={14} />
    </div>
    <Skeleton variant="text" width={40} height={14} />
  </div>
);

export const SkeletonPlaylist: React.FC = () => (
  <div className="skeleton-playlist">
    <Skeleton variant="rounded" width="100%" height={200} />
    <Skeleton variant="text" width="60%" height={20} />
    <Skeleton variant="text" width="40%" height={14} />
    <div className="skeleton-playlist-tracks">
      {[...Array(5)].map((_, i) => (
        <SkeletonTrack key={i} />
      ))}
    </div>
  </div>
);

export default Skeleton;

