import React from 'react';
import { Link } from 'react-router-dom';
import type { GeneratedPlaylist } from '../../api/playlists';
import { getArtworkUrl, handleImageError } from '../../utils/artwork';
import './FeaturedCard.css';

interface FeaturedCardProps {
  playlist: GeneratedPlaylist;
  onClick?: () => void;
}

// Gradient presets for featured cards (fallback when no artwork)
const gradientPresets: Record<string, [string, string]> = {
  'daily-mix-1': ['#4a148c', '#1a237e'],
  'daily-mix-2': ['#1b5e20', '#004d40'],
  'daily-mix-3': ['#e65100', '#bf360c'],
  'chill': ['#0d47a1', '#006064'],
  'discover': ['#bf360c', '#e65100'],
  'favorites': ['#880e4f', '#4a148c'],
  'recent': ['#1565c0', '#0d47a1'],
  default: ['#1a1a2e', '#16213e'],
};

function getGradient(playlist: GeneratedPlaylist): string {
  if (playlist.gradient) {
    return `linear-gradient(135deg, ${playlist.gradient[0]} 0%, ${playlist.gradient[1]} 100%)`;
  }
  
  const id = playlist.id?.toString().toLowerCase() || '';
  const name = playlist.name.toLowerCase();
  
  for (const [key, gradient] of Object.entries(gradientPresets)) {
    if (id.includes(key) || name.includes(key)) {
      return `linear-gradient(135deg, ${gradient[0]} 0%, ${gradient[1]} 100%)`;
    }
  }
  
  return `linear-gradient(135deg, ${gradientPresets.default[0]} 0%, ${gradientPresets.default[1]} 100%)`;
}

export const FeaturedCard: React.FC<FeaturedCardProps> = ({
  playlist,
  onClick,
}) => {
  const gradient = getGradient(playlist);
  const hasArtwork = !!playlist.artwork;
  const artworkUrl = getArtworkUrl(playlist.artwork);

  const content = (
    <>
      {hasArtwork && (
        <img
          className="featured-artwork"
          src={artworkUrl}
          alt={playlist.name}
          loading="lazy"
          decoding="async"
          onError={(e) => handleImageError(e)}
        />
      )}
      <div className="featured-content">
        <span className="featured-label">
          {playlist.is_generated ? 'Made for you' : 'Playlist'}
        </span>
        <h3 className="featured-title">{playlist.name}</h3>
        {playlist.description && (
          <p className="featured-subtitle line-clamp-2">{playlist.description}</p>
        )}
      </div>
    </>
  );

  const style = hasArtwork ? undefined : { background: gradient };

  if (onClick) {
    return (
      <div
        className={`featured-card ${hasArtwork ? 'has-artwork' : ''}`}
        style={style}
        onClick={onClick}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      to={`/playlist/${playlist.id}`}
      className={`featured-card ${hasArtwork ? 'has-artwork' : ''}`}
      style={style}
    >
      {content}
    </Link>
  );
};

export default FeaturedCard;

