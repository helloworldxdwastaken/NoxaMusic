import React, { useState } from 'react';
import { useUIStore } from '../../stores/ui';
import { usePlaylistsStore } from '../../stores/playlists';
import { getArtworkUrl, handleImageError } from '../../utils/artwork';
import { Button } from '../UI/Button';
import './AddToPlaylist.css';

export const AddToPlaylist: React.FC = () => {
  const { addToPlaylistModal, closeAddToPlaylist, openCreatePlaylist, showToast } = useUIStore();
  const { playlists, addTrackToPlaylist } = usePlaylistsStore();
  const [isLoading, setIsLoading] = useState<number | null>(null);
  const [success, setSuccess] = useState<number | null>(null);

  const trackId = addToPlaylistModal.data?.trackId;

  const handleAddToPlaylist = async (playlistId: number) => {
    if (!trackId) return;

    const playlist = playlists.find(p => p.id === playlistId);
    setIsLoading(playlistId);
    
    try {
      const added = await addTrackToPlaylist(playlistId, trackId);
      if (added) {
        setSuccess(playlistId);
        showToast(`Added to "${playlist?.name || 'playlist'}"`, 'success');
        setTimeout(() => {
          closeAddToPlaylist();
          setSuccess(null);
        }, 800);
      } else {
        showToast('Song already in playlist', 'warning');
      }
    } catch {
      showToast('Failed to add to playlist', 'error');
    } finally {
      setIsLoading(null);
    }
  };

  const handleCreateNew = () => {
    closeAddToPlaylist();
    openCreatePlaylist();
  };

  if (!addToPlaylistModal.isOpen) return null;

  return (
    <div className="modal-overlay" onClick={closeAddToPlaylist}>
      <div className="add-to-playlist-modal glass-elevated" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={closeAddToPlaylist}>
          <i className="fas fa-times"></i>
        </button>

        <h2>Add to Playlist</h2>

        <div className="playlists-list">
          <button className="playlist-option new" onClick={handleCreateNew}>
            <div className="playlist-icon">
              <i className="fas fa-plus"></i>
            </div>
            <span>Create new playlist</span>
          </button>

          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              className={`playlist-option ${success === playlist.id ? 'success' : ''}`}
              onClick={() => handleAddToPlaylist(playlist.id)}
              disabled={isLoading !== null}
            >
              <img
                src={getArtworkUrl(playlist.artwork)}
                alt={playlist.name}
                onError={(e) => handleImageError(e)}
              />
              <div className="playlist-details">
                <span className="playlist-name">{playlist.name}</span>
                <span className="playlist-count">{playlist.track_count} tracks</span>
              </div>
              {isLoading === playlist.id && <div className="spinner"></div>}
              {success === playlist.id && (
                <i className="fas fa-check success-icon"></i>
              )}
            </button>
          ))}
        </div>

        {playlists.length === 0 && (
          <div className="no-playlists">
            <p>No playlists yet</p>
            <Button onClick={handleCreateNew}>Create your first playlist</Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddToPlaylist;

