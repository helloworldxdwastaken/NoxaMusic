import React, { useEffect } from 'react';
import { usePlaylistsStore } from '../lib/stores/playlists';
import { PlaylistCard } from '../lib/components/Cards/PlaylistCard';
import { SkeletonCard } from '../lib/components/UI/Skeleton';
import './Library.css';

export const Library: React.FC = () => {
  const {
    playlists,
    isLoading,
    fetchPlaylists,
  } = usePlaylistsStore();

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  return (
    <div className="library-page animate-fade-in">
      <header className="library-header">
        <h1>Your Playlists</h1>
        <span className="playlist-count">{playlists.length} playlists</span>
      </header>

      <div className="library-content">
        {isLoading ? (
          <div className="card-grid">
            {[...Array(9)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : playlists.length > 0 ? (
          <div className="card-grid">
            {playlists.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <i className="fas fa-list"></i>
            <h3>No playlists yet</h3>
            <p>Create a playlist to get started</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Library;

