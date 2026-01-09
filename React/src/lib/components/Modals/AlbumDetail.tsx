import React, { useEffect, useState } from 'react';
import { useUIStore } from '../../stores/ui';
import { usePlayerStore } from '../../stores/player';
import { getAlbumDetail, type AlbumDetail as AlbumDetailType, type Track } from '../../api/library';
import { getArtworkUrl, handleImageError } from '../../utils/artwork';
import { formatDuration } from '../../utils/formatTime';
import { TrackCard } from '../Cards/TrackCard';
import { Button } from '../UI/Button';
import './AlbumDetail.css';

export const AlbumDetail: React.FC = () => {
  const { albumDetailModal, closeAlbumDetail, openArtistDetail, goBackFromAlbum } = useUIStore();
  const { playQueue } = usePlayerStore();
  const [data, setData] = useState<AlbumDetailType | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const albumName = albumDetailModal.data?.albumName;
  const fromArtist = albumDetailModal.data?.fromArtist;
  
  const handleClose = () => {
    if (fromArtist) {
      goBackFromAlbum();
    } else {
      closeAlbumDetail();
    }
  };

  useEffect(() => {
    if (!albumDetailModal.isOpen || !albumName) return;
    
    let cancelled = false;
    
    const loadAlbum = async () => {
      setIsLoading(true);
      try {
        const result = await getAlbumDetail(albumName);
        if (!cancelled) {
          setData(result);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    
    loadAlbum();
    
    return () => {
      cancelled = true;
    };
  }, [albumDetailModal.isOpen, albumName]);

  // Reset data when modal closes
  useEffect(() => {
    if (!albumDetailModal.isOpen) {
      setData(null);
    }
  }, [albumDetailModal.isOpen]);

  const handlePlayAll = () => {
    if (data?.tracks) {
      playQueue(data.tracks);
    }
  };

  const handleShufflePlay = () => {
    if (data?.tracks) {
      const shuffled = [...data.tracks].sort(() => Math.random() - 0.5);
      playQueue(shuffled);
    }
  };

  const handleArtistClick = () => {
    if (data?.artist) {
      closeAlbumDetail();
      openArtistDetail(data.artist);
    }
  };

  const totalDuration = data?.tracks.reduce((sum, track) => sum + (track.duration || 0), 0) || 0;

  if (!albumDetailModal.isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="album-detail-modal glass-elevated" onClick={(e) => e.stopPropagation()}>
        {fromArtist ? (
          <button className="modal-back" onClick={goBackFromAlbum}>
            <i className="fas fa-arrow-left"></i>
          </button>
        ) : null}
        <button className="modal-close" onClick={closeAlbumDetail}>
          <i className="fas fa-times"></i>
        </button>

        {isLoading ? (
          <div className="album-loading">
            <div className="album-header">
              <div className="album-artwork-container skeleton"></div>
              <div className="album-info">
                <div className="skeleton" style={{ width: 60, height: 12, borderRadius: 4 }}></div>
                <div className="skeleton" style={{ width: '80%', height: 28, borderRadius: 4, marginTop: 8 }}></div>
                <div className="skeleton" style={{ width: 150, height: 14, borderRadius: 4, marginTop: 12 }}></div>
              </div>
            </div>
            <div className="album-actions">
              <div className="skeleton" style={{ width: 100, height: 44, borderRadius: 22 }}></div>
              <div className="skeleton" style={{ width: 100, height: 44, borderRadius: 22 }}></div>
            </div>
            <div className="album-tracks">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton-track">
                  <div className="skeleton" style={{ width: 24, height: 24, borderRadius: 4 }}></div>
                  <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 6 }}></div>
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ width: '60%', height: 14, borderRadius: 4 }}></div>
                    <div className="skeleton" style={{ width: '40%', height: 12, borderRadius: 4, marginTop: 6 }}></div>
                  </div>
                  <div className="skeleton" style={{ width: 40, height: 12, borderRadius: 4 }}></div>
                </div>
              ))}
            </div>
          </div>
        ) : data ? (
          <>
            <div className="album-header">
              <div className="album-artwork-container">
                <img
                  className="album-artwork"
                  src={getArtworkUrl(data.album_cover)}
                  alt={data.album}
                  onError={(e) => handleImageError(e)}
                />
              </div>
              <div className="album-info">
                <span className="album-type">Album</span>
                <h1 className="album-title">{data.album}</h1>
                <div className="album-meta">
                  <span className="artist-link" onClick={handleArtistClick}>
                    {data.artist}
                  </span>
                  <span className="separator">•</span>
                  <span>{data.tracks.length} tracks</span>
                  <span className="separator">•</span>
                  <span>{formatDuration(totalDuration)}</span>
                </div>
              </div>
            </div>

            <div className="album-actions">
              <Button 
                size="lg"
                onClick={handlePlayAll} 
                icon={<i className="fas fa-play" />}
                disabled={data.tracks.length === 0}
              >
                Play
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={handleShufflePlay}
                icon={<i className="fas fa-shuffle" />}
                disabled={data.tracks.length === 0}
              >
                Shuffle
              </Button>
            </div>

            <div className="album-tracks">
              {data.tracks.length > 0 ? (
                <div className="track-list">
                  {data.tracks.map((track: Track, index: number) => (
                    <TrackCard
                      key={track.id}
                      track={track}
                      index={index}
                      showIndex
                      queue={data.tracks}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state compact">
                  <i className="fas fa-music"></i>
                  <p>No tracks found</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="modal-empty">
            <i className="fas fa-compact-disc"></i>
            <h3>Album not found</h3>
            <p>This album may have been removed from the library</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AlbumDetail;
