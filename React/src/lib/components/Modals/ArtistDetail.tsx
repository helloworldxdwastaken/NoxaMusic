import React, { useEffect, useState } from 'react';
import { useUIStore } from '../../stores/ui';
import { usePlayerStore } from '../../stores/player';
import { getArtistDetail, type ArtistDetail as ArtistDetailType } from '../../api/library';
import { getArtistImageUrl, handleImageError } from '../../utils/artwork';
import { AlbumCard } from '../Cards/AlbumCard';
import { Button } from '../UI/Button';
import './ArtistDetail.css';

export const ArtistDetail: React.FC = () => {
  const { artistDetailModal, closeArtistDetail, openAlbumDetail } = useUIStore();
  const { playQueue } = usePlayerStore();
  const [data, setData] = useState<ArtistDetailType | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const artistName = artistDetailModal.data?.artistName;

  useEffect(() => {
    if (!artistDetailModal.isOpen || !artistName) return;
    
    let cancelled = false;
    
    const loadArtist = async () => {
      setIsLoading(true);
      try {
        const result = await getArtistDetail(artistName);
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
    
    loadArtist();
    
    return () => {
      cancelled = true;
    };
  }, [artistDetailModal.isOpen, artistName]);

  // Reset data when modal closes
  useEffect(() => {
    if (!artistDetailModal.isOpen) {
      setData(null);
    }
  }, [artistDetailModal.isOpen]);

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

  if (!artistDetailModal.isOpen) return null;

  return (
    <div className="modal-overlay" onClick={closeArtistDetail}>
      <div className="artist-detail-modal glass-elevated" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={closeArtistDetail}>
          <i className="fas fa-times"></i>
        </button>

        {isLoading ? (
          <div className="artist-loading">
            <div className="artist-header">
              <div className="artist-image-container skeleton"></div>
              <div className="artist-info">
                <div className="skeleton" style={{ width: 50, height: 12, borderRadius: 4 }}></div>
                <div className="skeleton" style={{ width: '70%', height: 32, borderRadius: 4, marginTop: 8 }}></div>
                <div className="skeleton" style={{ width: 120, height: 14, borderRadius: 4, marginTop: 12 }}></div>
              </div>
            </div>
            <div className="artist-actions">
              <div className="skeleton" style={{ width: 110, height: 44, borderRadius: 22 }}></div>
              <div className="skeleton" style={{ width: 100, height: 44, borderRadius: 22 }}></div>
            </div>
            <div className="artist-section">
              <div className="skeleton" style={{ width: 80, height: 20, borderRadius: 4, marginBottom: 16 }}></div>
              <div className="albums-grid">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="skeleton-album">
                    <div className="skeleton" style={{ paddingBottom: '100%', borderRadius: 8 }}></div>
                    <div className="skeleton" style={{ width: '80%', height: 14, borderRadius: 4, marginTop: 12 }}></div>
                    <div className="skeleton" style={{ width: '50%', height: 12, borderRadius: 4, marginTop: 6 }}></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : data ? (
          <>
            <div className="artist-header">
              <div className="artist-image-container">
                <img
                  className="artist-image"
                  src={getArtistImageUrl(
                    data.tracks[0]?.artist_image || 
                    data.albums[0]?.cover || 
                    data.tracks[0]?.album_cover
                  )}
                  alt={data.artist}
                  onError={(e) => handleImageError(e, 'artist')}
                />
              </div>
              <div className="artist-info">
                <span className="artist-type">Artist</span>
                <h1 className="artist-name">{data.artist}</h1>
                <div className="artist-meta">
                  <span>{data.tracks.length} tracks</span>
                  <span className="separator">•</span>
                  <span>{data.albums.length} albums</span>
                </div>
              </div>
            </div>

            <div className="artist-actions">
              <Button 
                size="lg"
                onClick={handlePlayAll} 
                icon={<i className="fas fa-play" />}
                disabled={data.tracks.length === 0}
              >
                Play All
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

            {data.albums.length > 0 && (
              <section className="artist-section">
                <h2>Albums ({data.albums.length})</h2>
                <div className="albums-grid">
                  {data.albums.map((album) => (
                    <AlbumCard
                      key={album.name}
                      album={album}
                      hideArtist
                      onClick={() => {
                        closeArtistDetail();
                        openAlbumDetail(album.name, data.artist);
                      }}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <div className="modal-empty">
            <i className="fas fa-user-music"></i>
            <h3>Artist not found</h3>
            <p>This artist may have been removed from the library</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ArtistDetail;
