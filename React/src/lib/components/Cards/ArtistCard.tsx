import React from 'react';
import type { Artist } from '../../api/library';
import { getArtistImageUrl, handleImageError } from '../../utils/artwork';
import { useUIStore } from '../../stores/ui';
import './ArtistCard.css';

interface ArtistCardProps {
  artist: Artist;
  onClick?: () => void;
}

export const ArtistCard: React.FC<ArtistCardProps> = ({ artist, onClick }) => {
  const { openArtistDetail } = useUIStore();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      openArtistDetail(artist.name);
    }
  };

  return (
    <div className="artist-card" onClick={handleClick}>
      <div className="artist-image">
        <img
          src={getArtistImageUrl(artist.image)}
          alt={artist.name}
          onError={(e) => handleImageError(e, 'artist')}
          loading="lazy"
          crossOrigin="anonymous"
        />
        <button className="play-btn">
          <i className="fas fa-play"></i>
        </button>
      </div>
      <h3 className="artist-name truncate">{artist.name}</h3>
      <p className="artist-meta">Artist</p>
    </div>
  );
};

export default ArtistCard;

