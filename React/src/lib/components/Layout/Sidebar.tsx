import React from 'react';
import { NavLink } from 'react-router-dom';
import { usePlaylistsStore } from '../../stores/playlists';
import { useUIStore } from '../../stores/ui';
import { getArtworkUrl, handleImageError } from '../../utils/artwork';
import './Sidebar.css';

export const Sidebar: React.FC = () => {
  const { playlists } = usePlaylistsStore();
  const { openCreatePlaylist, isMobile } = useUIStore();

  // Don't render on mobile
  if (isMobile) return null;

  return (
    <aside className="sidebar glass-card">
      <div className="sidebar-logo">
        <h1>Noxa Music</h1>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <i className="fas fa-home"></i>
          <span>Home</span>
        </NavLink>
        <NavLink to="/search" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <i className="fas fa-search"></i>
          <span>Search</span>
        </NavLink>
        <NavLink to="/library" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <i className="fas fa-book"></i>
          <span>Your Library</span>
        </NavLink>
        <NavLink to="/downloads" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <i className="fas fa-download"></i>
          <span>Downloads</span>
        </NavLink>
      </nav>

      <div className="sidebar-divider"></div>

      <div className="sidebar-section">
        <div className="section-header">
          <h3>Playlists</h3>
          <button className="add-btn" onClick={openCreatePlaylist} title="Create playlist">
            <i className="fas fa-plus"></i>
          </button>
        </div>

        <div className="playlists-list">
          {playlists.map((playlist) => (
            <NavLink
              key={playlist.id}
              to={`/playlist/${playlist.id}`}
              className={({ isActive }) => `playlist-item ${isActive ? 'active' : ''}`}
            >
              <img
                src={getArtworkUrl(playlist.artwork)}
                alt={playlist.name}
                onError={(e) => handleImageError(e)}
              />
              <div className="playlist-info">
                <span className="name truncate">{playlist.name}</span>
                <span className="count">{playlist.track_count} tracks</span>
              </div>
            </NavLink>
          ))}

          {playlists.length === 0 && (
            <div className="empty-playlists">
              <p>No playlists yet</p>
              <button onClick={openCreatePlaylist}>Create your first playlist</button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

