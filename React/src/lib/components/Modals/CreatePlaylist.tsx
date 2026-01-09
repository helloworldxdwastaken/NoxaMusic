import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../stores/ui';
import { usePlaylistsStore } from '../../stores/playlists';
import { Input } from '../UI/Input';
import { Button } from '../UI/Button';
import './CreatePlaylist.css';

export const CreatePlaylist: React.FC = () => {
  const navigate = useNavigate();
  const { createPlaylistModal, closeCreatePlaylist, showToast } = useUIStore();
  const { createPlaylist } = usePlaylistsStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Please enter a playlist name');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const playlist = await createPlaylist(name.trim(), description.trim() || undefined);
      
      if (playlist) {
        setName('');
        setDescription('');
        closeCreatePlaylist();
        showToast(`Playlist "${playlist.name}" created`, 'success');
        navigate(`/playlist/${playlist.id}`);
      } else {
        setError('Failed to create playlist');
        showToast('Failed to create playlist', 'error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create playlist');
      showToast('Failed to create playlist', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setError(null);
    closeCreatePlaylist();
  };

  if (!createPlaylistModal.isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="create-playlist-modal glass-elevated" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose}>
          <i className="fas fa-times"></i>
        </button>

        <h2>Create Playlist</h2>

        <form onSubmit={handleSubmit} className="create-form">
          <Input
            label="Name"
            placeholder="My awesome playlist"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            disabled={isLoading}
            autoFocus
          />

          <div className="input-wrapper input-full-width">
            <label className="input-label">Description (optional)</label>
            <textarea
              className="textarea"
              placeholder="What's this playlist about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              rows={3}
            />
          </div>

          {error && (
            <div className="create-error">
              <i className="fas fa-exclamation-circle"></i>
              <span>{error}</span>
            </div>
          )}

          <div className="create-actions">
            <Button variant="secondary" type="button" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isLoading}>
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreatePlaylist;

