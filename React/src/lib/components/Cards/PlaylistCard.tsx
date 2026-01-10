import React from 'react';
import { Link } from 'react-router-dom';
import type { Playlist } from '../../api/playlists';
import { getPlaylistTracks } from '../../api/playlists';
import { usePlayerStore } from '../../stores/player';
import { getArtworkUrl, handleImageError } from '../../utils/artwork';
import './PlaylistCard.css';

interface PlaylistCardProps {
  playlist: Playlist;
  onClick?: () => void;
}

export const PlaylistCard: React.FC<PlaylistCardProps> = ({
  playlist,
  onClick,
}) => {
  const { playQueue } = usePlayerStore();

  const handlePlay = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      const tracks = await getPlaylistTracks(playlist.id);
      if (tracks.length > 0) {
        playQueue(tracks);
      }
    } catch (error) {
      console.error('Failed to play playlist:', error);
    }
  };

  const content = (
    <>
      <div className="playlist-artwork">
        <img
          src={getArtworkUrl(playlist.artwork)}
          alt={playlist.name}
          onError={(e) => handleImageError(e)}
          loading="lazy"
          crossOrigin="anonymous"
        />
        <button className="play-btn" onClick={handlePlay}>
          <i className="fas fa-play"></i>
        </button>
      </div>
      <h3 className="playlist-name truncate">{playlist.name}</h3>
      <p className="playlist-meta line-clamp-2">
        {playlist.description || `${playlist.track_count} tracks`}
      </p>
    </>
  );

  if (onClick) {
    return (
      <div className="playlist-card" onClick={onClick}>
        {content}
      </div>
    );
  }

  return (
    <Link to={`/playlist/${playlist.id}`} className="playlist-card">
      {content}
    </Link>
  );
};

export default PlaylistCard;
