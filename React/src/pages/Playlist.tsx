import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPlaylist, getPlaylistTracks, deletePlaylist, updatePlaylist, reorderPlaylistTracks, removeTrackFromPlaylist } from '../lib/api/playlists';
import type { Playlist as PlaylistType } from '../lib/api/playlists';
import type { Track } from '../lib/api/library';
import { usePlayerStore } from '../lib/stores/player';
import { usePlaylistsStore } from '../lib/stores/playlists';
import { useUIStore } from '../lib/stores/ui';
import { getArtworkUrl, handleImageError } from '../lib/utils/artwork';
import { formatDuration } from '../lib/utils/formatTime';
import { TrackCard } from '../lib/components/Cards/TrackCard';
import { Button } from '../lib/components/UI/Button';
import { SkeletonTrack } from '../lib/components/UI/Skeleton';
import './Playlist.css';

export const Playlist: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { playQueue } = usePlayerStore();
  const { fetchPlaylists } = usePlaylistsStore();
  const { showToast } = useUIStore();
  
  const [playlist, setPlaylist] = useState<PlaylistType | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Edit mode states
  const [isEditMode, setIsEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  
  // Drag state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  
  // Check if this is a generated (non-editable) playlist
  const isGenerated = playlist?.is_generated || (id && id.includes('-'));

  useEffect(() => {
    if (id) {
      loadPlaylist(id);
    }
  }, [id]);

  const loadPlaylist = async (playlistId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const [playlistData, tracksData] = await Promise.all([
        getPlaylist(playlistId),
        getPlaylistTracks(playlistId),
      ]);
      setPlaylist(playlistData);
      setTracks(Array.isArray(tracksData) ? tracksData : []);
    } catch (err) {
      console.error('Failed to load playlist:', err);
      setError(err instanceof Error ? err.message : 'Failed to load playlist');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      playQueue(tracks);
    }
  };

  const handleShufflePlay = () => {
    if (tracks.length > 0) {
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      playQueue(shuffled);
    }
  };

  const handleDelete = async () => {
    if (!playlist || !window.confirm('Are you sure you want to delete this playlist?')) {
      return;
    }

    setIsDeleting(true);
    try {
      await deletePlaylist(playlist.id);
      await fetchPlaylists();
      navigate('/library');
    } catch (error) {
      console.error('Failed to delete playlist:', error);
      setIsDeleting(false);
    }
  };

  // Edit mode handlers
  const startEdit = () => {
    if (!playlist || isGenerated) return;
    setEditName(playlist.name);
    setEditDescription(playlist.description || '');
    setIsEditMode(true);
    setTimeout(() => nameInputRef.current?.focus(), 100);
  };

  const cancelEdit = () => {
    setIsEditMode(false);
    setEditName('');
    setEditDescription('');
  };

  const saveEdit = async () => {
    if (!playlist || !editName.trim()) return;
    
    setIsSaving(true);
    try {
      const updated = await updatePlaylist(playlist.id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      setPlaylist({ ...playlist, ...updated, name: editName.trim(), description: editDescription.trim() || null });
      setIsEditMode(false);
      showToast('Playlist updated', 'success');
      fetchPlaylists();
    } catch (err) {
      console.error('Failed to update playlist:', err);
      showToast('Failed to update playlist', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Track removal - works anytime for non-generated playlists
  const handleRemoveTrack = async (trackId: number) => {
    if (!playlist || isGenerated) return;
    
    try {
      await removeTrackFromPlaylist(playlist.id, trackId);
      setTracks(tracks.filter(t => t.id !== trackId));
      showToast('Track removed', 'success');
    } catch (err) {
      console.error('Failed to remove track:', err);
      showToast('Failed to remove track', 'error');
    }
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    if (!isEditMode) return;
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (!isEditMode) return;
    setDragOverIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedIndex === null || dragOverIndex === null || draggedIndex === dragOverIndex || !isEditMode) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Reorder locally first
    const newTracks = [...tracks];
    const [draggedTrack] = newTracks.splice(draggedIndex, 1);
    newTracks.splice(dragOverIndex, 0, draggedTrack);
    setTracks(newTracks);

    // Save to backend
    try {
      await reorderPlaylistTracks(playlist!.id, newTracks.map(t => t.id));
      showToast('Playlist reordered', 'success');
    } catch (err) {
      console.error('Failed to reorder:', err);
      // Revert on error
      if (id) loadPlaylist(id);
      showToast('Failed to reorder playlist', 'error');
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const totalDuration = tracks.reduce((sum, track) => sum + (track.duration || 0), 0);

  if (isLoading) {
    return (
      <div className="playlist-page animate-fade-in">
        <div className="playlist-header playlist-header-loading">
          <div className="playlist-artwork-container skeleton"></div>
          <div className="playlist-info">
            <div className="skeleton" style={{ width: 80, height: 12, borderRadius: 4 }}></div>
            <div className="skeleton" style={{ width: 200, height: 32, borderRadius: 4, marginTop: 8 }}></div>
            <div className="skeleton" style={{ width: 120, height: 14, borderRadius: 4, marginTop: 8 }}></div>
          </div>
        </div>
        <div className="playlist-actions-skeleton">
          <div className="skeleton" style={{ width: 100, height: 44, borderRadius: 22 }}></div>
          <div className="skeleton" style={{ width: 100, height: 44, borderRadius: 22 }}></div>
        </div>
        <div className="track-list">
          {[...Array(5)].map((_, i) => (
            <SkeletonTrack key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !playlist) {
    return (
      <div className="playlist-page">
        <div className="empty-state">
          <i className="fas fa-exclamation-circle"></i>
          <h3>{error ? 'Error loading playlist' : 'Playlist not found'}</h3>
          <p>{error || 'This playlist may have been deleted or moved.'}</p>
          <Button onClick={() => navigate('/library')}>Go to Library</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="playlist-page animate-fade-in">
      <div className="playlist-header">
        <div className="playlist-artwork-container">
          <img
            className="playlist-cover-image"
            src={getArtworkUrl(playlist.artwork || tracks[0]?.album_cover)}
            alt={playlist.name}
            onError={(e) => handleImageError(e)}
          />
        </div>
        <div className="playlist-info">
          <span className="playlist-type">{isGenerated ? 'Made for you' : 'Playlist'}</span>
          
          {isEditMode ? (
            <div className="playlist-edit-form">
              <input
                ref={nameInputRef}
                type="text"
                className="playlist-name-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Playlist name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit();
                  if (e.key === 'Escape') cancelEdit();
                }}
              />
              <input
                type="text"
                className="playlist-description-input"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Add a description (optional)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit();
                  if (e.key === 'Escape') cancelEdit();
                }}
              />
              <div className="playlist-edit-actions">
                <Button size="sm" onClick={saveEdit} isLoading={isSaving}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelEdit}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="playlist-name">{playlist.name}</h1>
              {playlist.description && (
                <p className="playlist-description">{playlist.description}</p>
              )}
            </>
          )}
          
          <div className="playlist-meta">
            <span>{tracks.length} tracks</span>
            <span className="separator">•</span>
            <span>{formatDuration(totalDuration)}</span>
          </div>
        </div>
      </div>

      <div className="playlist-actions">
        <Button
          size="lg"
          onClick={handlePlayAll}
          disabled={tracks.length === 0}
          icon={<i className="fas fa-play" />}
        >
          Play
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={handleShufflePlay}
          disabled={tracks.length === 0}
          icon={<i className="fas fa-shuffle" />}
        >
          Shuffle
        </Button>
        {!isGenerated && (
          <>
            <Button
              variant="ghost"
              size="lg"
              onClick={startEdit}
              icon={<i className="fas fa-pen" />}
              title="Edit playlist"
            />
            <Button
              variant="ghost"
              size="lg"
              onClick={handleDelete}
              isLoading={isDeleting}
              icon={<i className="fas fa-trash" />}
              title="Delete playlist"
            />
          </>
        )}
      </div>

      <div className="playlist-tracks">
        {tracks.length > 0 ? (
          <div className={`track-list ${isEditMode ? 'editable' : ''}`}>
            {tracks.map((track, index) => (
              <div
                key={track.id}
                className={`track-item-wrapper ${draggedIndex === index ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`}
                draggable={isEditMode}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
              >
                {isEditMode && (
                  <div className="drag-handle">
                    <i className="fas fa-grip-vertical"></i>
                  </div>
                )}
                <TrackCard
                  track={track}
                  index={index}
                  showIndex
                  queue={tracks}
                  onRemove={!isGenerated ? () => handleRemoveTrack(track.id) : undefined}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <i className="fas fa-music"></i>
            <h3>This playlist is empty</h3>
            <p>Add some tracks to get started</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Playlist;

