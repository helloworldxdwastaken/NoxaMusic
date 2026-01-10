import React from 'react';
import type { Track } from '../../api/library';
import { getArtworkUrl, handleImageError } from '../../utils/artwork';
import { formatTime } from '../../utils/formatTime';
import { usePlayerStore } from '../../stores/player';
import { useUIStore } from '../../stores/ui';
import './TrackCard.css';

interface TrackCardProps {
  track: Track;
  index?: number;
  showIndex?: boolean;
  queue?: Track[];
  isPlaying?: boolean;
  isActive?: boolean;
  onPlay?: () => void;
  onAddToPlaylist?: () => void;
  onRemove?: () => void;
  compact?: boolean;
}

export const TrackCard: React.FC<TrackCardProps> = ({
  track,
  index,
  showIndex = false,
  queue,
  isPlaying: isPlayingProp,
  isActive: isActiveProp,
  onPlay,
  onAddToPlaylist,
  onRemove,
  compact = false,
}) => {
  const { currentTrack, isPlaying, playTrack, togglePlay } = usePlayerStore();
  const { openAddToPlaylist, openArtistDetail, isNowPlayingOpen, toggleNowPlaying } = useUIStore();

  const isCurrentTrack = currentTrack?.id === track.id;
  const isActive = isActiveProp ?? isCurrentTrack;
  const isTrackPlaying = isPlayingProp ?? (isCurrentTrack && isPlaying);

  const handleClick = () => {
    if (onPlay) {
      onPlay();
    } else if (isCurrentTrack) {
      togglePlay();
    } else {
      playTrack(track, queue, index);
    }
  };

  const handleAddToPlaylist = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAddToPlaylist) {
      onAddToPlaylist();
    } else {
      openAddToPlaylist(track.id);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemove) {
      onRemove();
    }
  };

  const handleArtistClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (track.artist) {
      // Close Now Playing on mobile before opening Artist modal
      if (isNowPlayingOpen) {
        toggleNowPlaying();
      }
      openArtistDetail(track.artist);
    }
  };

  return (
    <div
      className={`track-card ${isActive ? 'active' : ''} ${compact ? 'compact' : ''}`}
      onClick={handleClick}
    >
      {showIndex && (
        <div className="track-index">
          {isTrackPlaying ? (
            <div className="playing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          ) : (
            <span className="index-number">{(index ?? 0) + 1}</span>
          )}
          <button className="play-btn">
            <i className={`fas fa-${isTrackPlaying ? 'pause' : 'play'}`}></i>
          </button>
        </div>
      )}

      <div className="track-artwork">
        <img
          src={getArtworkUrl(track.album_cover)}
          alt={track.album}
          onError={(e) => handleImageError(e)}
          loading="lazy"
          crossOrigin="anonymous"
        />
        {!showIndex && (
          <button className="artwork-play-btn">
            <i className={`fas fa-${isTrackPlaying ? 'pause' : 'play'}`}></i>
          </button>
        )}
      </div>

      <div className="track-info">
        <span className={`track-title ${isActive ? 'active' : ''}`}>
          {track.title}
        </span>
        <span className="track-artist" onClick={handleArtistClick}>{track.artist}</span>
      </div>

      {!compact && <span className="track-album truncate">{track.album}</span>}

      <div className="track-actions">
        <button
          className="action-btn"
          onClick={handleAddToPlaylist}
          title="Add to playlist"
        >
          <i className="fas fa-plus"></i>
        </button>
        {onRemove && (
          <button
            className="action-btn remove-btn"
            onClick={handleRemove}
            title="Remove from playlist"
          >
            <i className="fas fa-trash"></i>
          </button>
        )}
      </div>

      <span className="track-duration">{formatTime(track.duration)}</span>
    </div>
  );
};

export default TrackCard;
