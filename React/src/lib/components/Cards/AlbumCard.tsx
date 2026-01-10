import React from 'react';
import type { Album } from '../../api/library';
import { getAlbumCoverUrl, handleImageError } from '../../utils/artwork';
import { getAlbumDetail } from '../../api/library';
import { useUIStore } from '../../stores/ui';
import { usePlayerStore } from '../../stores/player';
import './AlbumCard.css';

interface AlbumCardProps {
  album: Album;
  onClick?: () => void;
  hideArtist?: boolean;
}

export const AlbumCard: React.FC<AlbumCardProps> = ({ album, onClick, hideArtist = false }) => {
  const { openAlbumDetail } = useUIStore();
  const { playQueue } = usePlayerStore();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      openAlbumDetail(album.name);
    }
  };

  const handlePlayClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const albumDetail = await getAlbumDetail(album.name);
      if (albumDetail?.tracks && albumDetail.tracks.length > 0) {
        playQueue(albumDetail.tracks);
      }
    } catch (error) {
      console.error('Failed to play album:', error);
    }
  };

  return (
    <div className="album-card" onClick={handleClick}>
      <div className="album-artwork">
        <img
          src={getAlbumCoverUrl(album.cover, album.artist, album.name)}
          alt={album.name}
          onError={(e) => handleImageError(e)}
          loading="lazy"
          crossOrigin="anonymous"
        />
        <button className="play-btn" onClick={handlePlayClick}>
          <i className="fas fa-play"></i>
        </button>
      </div>
      <h3 className="album-name">{album.name}</h3>
      {!hideArtist && <p className="album-artist truncate">{album.artist}</p>}
    </div>
  );
};

export default AlbumCard;

