import React, { useState } from 'react';
import { useUIStore } from '../../stores/ui';
import {
  importSpotifyPlaylist,
  importYouTubeMusicPlaylist,
  downloadFromUrl,
  downloadFromSpotifyUrl,
  getSpotifyUrlType,
} from '../../api/import';
import { Input } from '../UI/Input';
import { Button } from '../UI/Button';
import './ImportModal.css';

type ImportType = 'spotify' | 'youtube' | 'url';

const importConfig: Record<
  ImportType,
  { title: string; icon: string; placeholder: string; label: string }
> = {
  spotify: {
    title: 'Import from Spotify',
    icon: 'fab fa-spotify',
    placeholder: 'https://open.spotify.com/track/... or /album/... or /playlist/...',
    label: 'Spotify URL (Track, Album, or Playlist)',
  },
  youtube: {
    title: 'Import from YouTube Music',
    icon: 'fab fa-youtube',
    placeholder: 'https://music.youtube.com/playlist?list=...',
    label: 'YouTube Music Playlist URL',
  },
  url: {
    title: 'Download from URL',
    icon: 'fas fa-link',
    placeholder: 'https://example.com/song.mp3',
    label: 'Song URL',
  },
};

export const ImportModal: React.FC = () => {
  const { importModal, closeImportModal } = useUIStore();
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const type = importModal.data?.type || 'url';
  const config = importConfig[type];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let result;
      
      switch (type) {
        case 'spotify':
          // Detect if it's a track/album vs playlist
          const spotifyType = getSpotifyUrlType(url);
          if (spotifyType === 'track' || spotifyType === 'album') {
            // Use the new direct download endpoint
            result = await downloadFromSpotifyUrl(url);
          } else if (spotifyType === 'playlist') {
            result = await importSpotifyPlaylist(url);
          } else {
            setError('Invalid Spotify URL. Please enter a track, album, or playlist link.');
            setIsLoading(false);
            return;
          }
          break;
        case 'youtube':
          result = await importYouTubeMusicPlaylist(url);
          break;
        case 'url':
          result = await downloadFromUrl(url);
          break;
      }

      if (result.success) {
        setSuccess(result.message || 'Import started successfully!');
        setUrl('');
        setTimeout(() => {
          closeImportModal();
          setSuccess(null);
        }, 2000);
      } else {
        setError(result.message || 'Import failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (!importModal.isOpen) return null;

  return (
    <div className="modal-overlay" onClick={closeImportModal}>
      <div className="import-modal glass-elevated" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={closeImportModal}>
          <i className="fas fa-times"></i>
        </button>

        <div className="import-header">
          <div className="import-icon">
            <i className={config.icon}></i>
          </div>
          <h2>{config.title}</h2>
        </div>

        <form onSubmit={handleSubmit} className="import-form">
          <Input
            label={config.label}
            placeholder={config.placeholder}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            fullWidth
            disabled={isLoading}
          />

          {error && (
            <div className="import-message error">
              <i className="fas fa-exclamation-circle"></i>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="import-message success">
              <i className="fas fa-check-circle"></i>
              <span>{success}</span>
            </div>
          )}

          <div className="import-actions">
            <Button variant="secondary" type="button" onClick={closeImportModal}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isLoading}>
              {type === 'url' ? 'Download' : 'Import'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ImportModal;

