import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlaylistsStore } from '../lib/stores/playlists';
import { PlaylistCard } from '../lib/components/Cards/PlaylistCard';
import { SkeletonCard } from '../lib/components/UI/Skeleton';
import { getArtworkUrl, handleImageError } from '../lib/utils/artwork';
import './Library.css';

type ViewMode = 'grid' | 'list';

export const Library: React.FC = () => {
  const navigate = useNavigate();
  const {
    playlists,
    isLoading,
    fetchPlaylists,
  } = usePlaylistsStore();

  // Load saved view preference
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('library_view_mode');
    return (saved as ViewMode) || 'grid';
  });

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  // Save view preference
  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('library_view_mode', mode);
  };

  return (
    <div className="library-page animate-fade-in">
      <header className="library-header">
        <div className="header-left">
          <h1>Your Playlists</h1>
          <span className="playlist-count">{playlists.length} playlists</span>
        </div>
        <div className="view-toggle">
          <button
            className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => handleViewChange('grid')}
            title="Grid view"
          >
            <i className="fas fa-th-large"></i>
          </button>
          <button
            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => handleViewChange('list')}
            title="List view"
          >
            <i className="fas fa-list"></i>
          </button>
        </div>
      </header>

      <div className="library-content">
        {isLoading ? (
          <div className={viewMode === 'grid' ? 'card-grid' : 'playlist-list'}>
            {[...Array(9)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : playlists.length > 0 ? (
          viewMode === 'grid' ? (
            <div className="card-grid">
              {playlists.map((playlist) => (
                <PlaylistCard key={playlist.id} playlist={playlist} />
              ))}
            </div>
          ) : (
            <div className="playlist-list">
              {playlists.map((playlist) => (
                <div 
                  key={playlist.id} 
                  className="playlist-list-item"
                  onClick={() => navigate(`/playlist/${playlist.id}`)}
                >
                  <img
                    src={getArtworkUrl(playlist.artwork)}
                    alt={playlist.name}
                    onError={handleImageError}
                    className="list-artwork"
                  />
                  <div className="list-info">
                    <span className="list-name">{playlist.name}</span>
                    <span className="list-meta">
                      {playlist.track_count || 0} tracks
                      {playlist.description && ` • ${playlist.description}`}
                    </span>
                  </div>
                  <button className="list-play-btn">
                    <i className="fas fa-play"></i>
                  </button>
                </div>
              ))}
            </div>
          )
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
