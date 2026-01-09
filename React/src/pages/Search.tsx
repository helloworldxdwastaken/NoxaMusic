import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLibraryStore } from '../lib/stores/library';
import { useUIStore } from '../lib/stores/ui';
import { 
  smartSearchOnline, 
  downloadOnlineTrack, 
  getOnlineArtist,
  getOnlineAlbum,
  downloadOnlineAlbum,
  checkExistsInLibrary,
  type OnlineTrack, 
  type OnlineArtist, 
  type OnlineAlbum,
  type OnlineArtistDetail,
  type OnlineAlbumDetail
} from '../lib/api/music';
import { TrackCard } from '../lib/components/Cards/TrackCard';
import { Input } from '../lib/components/UI/Input';
import { Button } from '../lib/components/UI/Button';
import { SkeletonTrack } from '../lib/components/UI/Skeleton';
import { getArtworkUrl, handleImageError } from '../lib/utils/artwork';
import { formatTime } from '../lib/utils/formatTime';
import './Search.css';

type SearchMode = 'local' | 'online';
type SearchFilter = 'all' | 'songs' | 'artists' | 'albums';

export const Search: React.FC = () => {
  const { searchQuery, searchResults, searchArtists, searchAlbums, isSearching, search, clearSearch } = useLibraryStore();
  const { showToast, openArtistDetail, openAlbumDetail } = useUIStore();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [searchMode, setSearchMode] = useState<SearchMode>('local');
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('all');
  
  // Online search results
  const [onlineTracks, setOnlineTracks] = useState<OnlineTrack[]>([]);
  const [onlineArtists, setOnlineArtists] = useState<OnlineArtist[]>([]);
  const [onlineAlbums, setOnlineAlbums] = useState<OnlineAlbum[]>([]);
  const [isOnlineSearching, setIsOnlineSearching] = useState(false);
  
  // Online detail modals
  const [selectedOnlineArtist, setSelectedOnlineArtist] = useState<OnlineArtistDetail | null>(null);
  const [selectedOnlineAlbum, setSelectedOnlineAlbum] = useState<OnlineAlbumDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  
  const [downloadingTracks, setDownloadingTracks] = useState<Set<string>>(new Set());
  const [downloadingAlbums, setDownloadingAlbums] = useState<Set<string>>(new Set());
  
  // Track which items already exist in library
  const [existsInLibrary, setExistsInLibrary] = useState<{
    tracks: Record<string, boolean>;
    albums: Record<string, boolean>;
  }>({ tracks: {}, albums: {} });
  
  const debounceRef = useRef<number>();

  // Debounced local search
  const debouncedLocalSearch = useCallback(
    (query: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = window.setTimeout(() => {
        search(query);
      }, 300);
    },
    [search]
  );

  // Debounced online search with retry - now uses smart search
  const debouncedOnlineSearch = useCallback(
    (query: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (!query.trim()) {
        setOnlineTracks([]);
        setOnlineArtists([]);
        setOnlineAlbums([]);
        setExistsInLibrary({ tracks: {}, albums: {} });
        setIsOnlineSearching(false);
        return;
      }

      setIsOnlineSearching(true);
      debounceRef.current = window.setTimeout(async () => {
        const maxRetries = 2;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            const result = await smartSearchOnline(query);
            setOnlineTracks(result.tracks || []);
            setOnlineArtists(result.artists || []);
            setOnlineAlbums(result.albums || []);
            setIsOnlineSearching(false);
            
            // Check which items already exist in library (in background)
            if (result.tracks.length > 0 || result.albums.length > 0) {
              checkExistsInLibrary(
                result.tracks.map(t => ({ id: t.id, title: t.title, artist: t.artist })),
                result.albums.map(a => ({ id: a.id, title: a.title, artist: a.artist }))
              ).then(exists => {
                setExistsInLibrary(exists);
              }).catch(err => {
                console.warn('Failed to check library:', err);
              });
            }
            
            return;
          } catch (error) {
            console.warn(`Online search attempt ${attempt + 1} failed:`, error);
            if (attempt < maxRetries - 1) {
              await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
            }
          }
        }
        
        console.error('Online search failed after retries');
        setOnlineTracks([]);
        setOnlineArtists([]);
        setOnlineAlbums([]);
        setExistsInLibrary({ tracks: {}, albums: {} });
        setIsOnlineSearching(false);
      }, 500);
    },
    []
  );

  useEffect(() => {
    if (searchMode === 'local') {
      debouncedLocalSearch(localQuery);
    } else {
      debouncedOnlineSearch(localQuery);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [localQuery, searchMode, debouncedLocalSearch, debouncedOnlineSearch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSearch();
    };
  }, [clearSearch]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalQuery(e.target.value);
  };

  const handleClear = () => {
    setLocalQuery('');
    clearSearch();
    setOnlineTracks([]);
    setOnlineArtists([]);
    setOnlineAlbums([]);
    setExistsInLibrary({ tracks: {}, albums: {} });
  };

  const handleModeChange = (mode: SearchMode) => {
    setSearchMode(mode);
    setSearchFilter('all'); // Reset filter when switching modes
    // Clear results when switching modes
    if (mode === 'local') {
      setOnlineTracks([]);
      setOnlineArtists([]);
      setOnlineAlbums([]);
      setSelectedOnlineArtist(null);
      setSelectedOnlineAlbum(null);
      if (localQuery) {
        search(localQuery);
      }
    } else {
      clearSearch();
      if (localQuery) {
        debouncedOnlineSearch(localQuery);
      }
    }
  };

  const handleDownload = async (track: OnlineTrack) => {
    // Check if already in library BEFORE downloading
    try {
      const checkResult = await checkExistsInLibrary(
        [{ id: track.id, title: track.title, artist: track.artist }],
        []
      );
      
      if (checkResult.tracks[track.id]) {
        showToast(`"${track.title}" is already in your library!`, 'info');
        // Update the exists state so UI shows the badge
        setExistsInLibrary(prev => ({
          ...prev,
          tracks: { ...prev.tracks, [track.id]: true }
        }));
        return;
      }
    } catch (err) {
      console.warn('Pre-download check failed:', err);
      // Continue with download if check fails
    }
    
    setDownloadingTracks(prev => new Set([...prev, track.id]));
    showToast(`Downloading "${track.title}"...`, 'info', 2000);
    
    try {
      await downloadOnlineTrack(track);
      showToast(`"${track.title}" queued for download`, 'success');
    } catch (error) {
      console.error('Download failed:', error);
      showToast(`Failed to download "${track.title}"`, 'error');
    } finally {
      setDownloadingTracks(prev => {
        const next = new Set(prev);
        next.delete(track.id);
        return next;
      });
    }
  };

  const handleOnlineArtistClick = async (artist: OnlineArtist) => {
    setIsLoadingDetail(true);
    try {
      const detail = await getOnlineArtist(artist.id);
      setSelectedOnlineArtist(detail);
    } catch (error) {
      console.error('Failed to load artist:', error);
      showToast('Failed to load artist details', 'error');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleOnlineAlbumClick = async (album: OnlineAlbum) => {
    setIsLoadingDetail(true);
    try {
      const detail = await getOnlineAlbum(album.id);
      setSelectedOnlineAlbum(detail);
    } catch (error) {
      console.error('Failed to load album:', error);
      showToast('Failed to load album details', 'error');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleDownloadAlbum = async (album: OnlineAlbumDetail) => {
    setDownloadingAlbums(prev => new Set([...prev, album.id]));
    
    // Check which tracks already exist
    let tracksToDownload = album.tracks;
    let skippedCount = 0;
    
    try {
      const checkResult = await checkExistsInLibrary(
        album.tracks.map(t => ({ id: t.id, title: t.title, artist: t.artist })),
        []
      );
      
      // Filter out tracks that already exist
      tracksToDownload = album.tracks.filter(t => !checkResult.tracks[t.id]);
      skippedCount = album.tracks.length - tracksToDownload.length;
      
      // Update exists state for UI
      setExistsInLibrary(prev => ({
        ...prev,
        tracks: { ...prev.tracks, ...checkResult.tracks }
      }));
      
      if (tracksToDownload.length === 0) {
        showToast(`All ${album.tracks.length} tracks already in your library!`, 'info');
        setDownloadingAlbums(prev => {
          const next = new Set(prev);
          next.delete(album.id);
          return next;
        });
        return;
      }
      
      if (skippedCount > 0) {
        showToast(`Skipping ${skippedCount} tracks already in library, downloading ${tracksToDownload.length}...`, 'info', 3000);
      } else {
        showToast(`Downloading ${tracksToDownload.length} tracks from "${album.title}"...`, 'info', 2000);
      }
    } catch (err) {
      console.warn('Pre-download check failed:', err);
      showToast(`Downloading album "${album.title}"...`, 'info', 2000);
    }
    
    try {
      // Download only the tracks that don't exist
      const albumToDownload = { ...album, tracks: tracksToDownload };
      const result = await downloadOnlineAlbum(albumToDownload);
      
      if (skippedCount > 0) {
        showToast(`Downloaded ${tracksToDownload.length} new tracks (${skippedCount} already in library)`, 'success');
      } else {
        showToast(result.message, result.success ? 'success' : 'error');
      }
    } catch (error) {
      console.error('Album download failed:', error);
      showToast(`Failed to download album "${album.title}"`, 'error');
    } finally {
      setDownloadingAlbums(prev => {
        const next = new Set(prev);
        next.delete(album.id);
        return next;
      });
    }
  };

  const currentlySearching = searchMode === 'local' ? isSearching : isOnlineSearching;
  const hasLocalResults = searchResults.length > 0 || searchArtists.length > 0 || searchAlbums.length > 0;
  const hasOnlineResults = onlineTracks.length > 0 || onlineArtists.length > 0 || onlineAlbums.length > 0;
  const hasResults = searchMode === 'local' ? hasLocalResults : hasOnlineResults;

  return (
    <div className="search-page animate-fade-in">
      <div className="search-header">
        <h1>Search</h1>
        <div className="search-input-container">
          <Input
            placeholder={searchMode === 'local' ? "Search your library..." : "Search online for music..."}
            value={localQuery}
            onChange={handleInputChange}
            icon={<i className="fas fa-search"></i>}
            iconPosition="left"
            fullWidth
            className="search-input"
            autoFocus
          />
          {localQuery && (
            <button className="clear-search" onClick={handleClear}>
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>
        
        {/* Search Mode Toggle */}
        <div className="search-mode-toggle">
          <button 
            className={`mode-btn ${searchMode === 'local' ? 'active' : ''}`}
            onClick={() => handleModeChange('local')}
          >
            <i className="fas fa-hard-drive"></i>
            <span>Local</span>
          </button>
          <button 
            className={`mode-btn ${searchMode === 'online' ? 'active' : ''}`}
            onClick={() => handleModeChange('online')}
          >
            <i className="fas fa-globe"></i>
            <span>Online</span>
          </button>
        </div>

        {/* Search Filters - for both local and online */}
        {localQuery && hasResults && (
          <div className="search-filters">
            <button 
              className={`filter-btn ${searchFilter === 'all' ? 'active' : ''}`}
              onClick={() => setSearchFilter('all')}
            >
              All
            </button>
            <button 
              className={`filter-btn ${searchFilter === 'songs' ? 'active' : ''}`}
              onClick={() => setSearchFilter('songs')}
            >
              <i className="fas fa-music"></i>
              Songs {searchMode === 'local' 
                ? (searchResults.length > 0 && `(${searchResults.length})`)
                : (onlineTracks.length > 0 && `(${onlineTracks.length})`)}
            </button>
            <button 
              className={`filter-btn ${searchFilter === 'artists' ? 'active' : ''}`}
              onClick={() => setSearchFilter('artists')}
            >
              <i className="fas fa-user"></i>
              Artists {searchMode === 'local'
                ? (searchArtists.length > 0 && `(${searchArtists.length})`)
                : (onlineArtists.length > 0 && `(${onlineArtists.length})`)}
            </button>
            <button 
              className={`filter-btn ${searchFilter === 'albums' ? 'active' : ''}`}
              onClick={() => setSearchFilter('albums')}
            >
              <i className="fas fa-compact-disc"></i>
              Albums {searchMode === 'local'
                ? (searchAlbums.length > 0 && `(${searchAlbums.length})`)
                : (onlineAlbums.length > 0 && `(${onlineAlbums.length})`)}
            </button>
          </div>
        )}
      </div>

      <div className="search-content">
        {currentlySearching ? (
          <div className="search-loading">
            {[...Array(5)].map((_, i) => (
              <SkeletonTrack key={i} />
            ))}
          </div>
        ) : hasResults ? (
          <>
            <div className="results-header">
              <span className="results-count">
                {searchMode === 'local' 
                  ? `${searchResults.length + searchArtists.length + searchAlbums.length} results`
                  : `${onlineTracks.length + onlineArtists.length + onlineAlbums.length} results`
                }
                {localQuery && ` for "${localQuery}"`}
                {searchMode === 'online' && ' (Online)'}
              </span>
            </div>
            
            {searchMode === 'local' ? (
              <div className="search-results-container">
                {/* Local Songs */}
                {(searchFilter === 'all' || searchFilter === 'songs') && searchResults.length > 0 && (
                  <div className="results-section">
                    {searchFilter === 'all' && <h3 className="section-title">Songs</h3>}
                    <div className="track-list">
                      {(searchResults || []).slice(0, searchFilter === 'all' ? 5 : undefined).map((track, index) => (
                        <TrackCard
                          key={track.id}
                          track={track}
                          index={index}
                          queue={searchResults || []}
                          compact
                        />
                      ))}
                    </div>
                    {searchFilter === 'all' && searchResults.length > 5 && (
                      <button className="show-more-btn" onClick={() => setSearchFilter('songs')}>
                        Show all {searchResults.length} songs
                      </button>
                    )}
                  </div>
                )}

                {/* Local Artists */}
                {(searchFilter === 'all' || searchFilter === 'artists') && searchArtists.length > 0 && (
                  <div className="results-section">
                    {searchFilter === 'all' && <h3 className="section-title">Artists</h3>}
                    <div className="artists-grid">
                      {searchArtists.slice(0, searchFilter === 'all' ? 5 : undefined).map((artist) => (
                        <div 
                          key={artist.artist} 
                          className="artist-card"
                          onClick={() => openArtistDetail(artist.artist)}
                        >
                          <img 
                            src={artist.artist_image ? getArtworkUrl(artist.artist_image) : getArtworkUrl(null)}
                            alt={artist.artist}
                            onError={handleImageError}
                            className="artist-image"
                          />
                          <span className="artist-name">{artist.artist}</span>
                          <span className="track-count">{artist.track_count} songs</span>
                        </div>
                      ))}
                    </div>
                    {searchFilter === 'all' && searchArtists.length > 5 && (
                      <button className="show-more-btn" onClick={() => setSearchFilter('artists')}>
                        Show all {searchArtists.length} artists
                      </button>
                    )}
                  </div>
                )}

                {/* Local Albums */}
                {(searchFilter === 'all' || searchFilter === 'albums') && searchAlbums.length > 0 && (
                  <div className="results-section">
                    {searchFilter === 'all' && <h3 className="section-title">Albums</h3>}
                    <div className="albums-grid">
                      {searchAlbums.slice(0, searchFilter === 'all' ? 5 : undefined).map((album) => (
                        <div 
                          key={`${album.album}-${album.artist}`} 
                          className="album-card"
                          onClick={() => openAlbumDetail(album.album, album.artist)}
                        >
                          <img 
                            src={album.album_cover ? getArtworkUrl(album.album_cover) : getArtworkUrl(null)}
                            alt={album.album}
                            onError={handleImageError}
                            className="album-cover"
                          />
                          <span className="album-name">{album.album}</span>
                          <span className="album-artist">{album.artist}</span>
                        </div>
                      ))}
                    </div>
                    {searchFilter === 'all' && searchAlbums.length > 5 && (
                      <button className="show-more-btn" onClick={() => setSearchFilter('albums')}>
                        Show all {searchAlbums.length} albums
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="search-results-container">
                {/* Online Songs */}
                {(searchFilter === 'all' || searchFilter === 'songs') && onlineTracks.length > 0 && (
                  <div className="results-section">
                    {searchFilter === 'all' && <h3 className="section-title">Songs</h3>}
                    <div className="online-results">
                      {onlineTracks.slice(0, searchFilter === 'all' ? 5 : undefined).map((track) => (
                        <div key={track.id} className={`online-track ${existsInLibrary.tracks[track.id] ? 'in-library' : ''}`}>
                          <img 
                            src={track.artwork || getArtworkUrl(null)} 
                            alt={track.album}
                            onError={handleImageError}
                          />
                          <div className="track-info">
                            <span className="title">{track.title}</span>
                            <span className="artist">{track.artist}</span>
                            <span className="album">{track.album}</span>
                          </div>
                          <span className="duration">{formatTime(track.duration)}</span>
                          {existsInLibrary.tracks[track.id] ? (
                            <span className="in-library-badge">
                              <i className="fas fa-check"></i> In Library
                            </span>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleDownload(track)}
                              disabled={downloadingTracks.has(track.id)}
                              icon={
                                downloadingTracks.has(track.id) 
                                  ? <i className="fas fa-spinner fa-spin"></i>
                                  : <i className="fas fa-download"></i>
                              }
                            >
                              {downloadingTracks.has(track.id) ? 'Adding...' : 'Add'}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    {searchFilter === 'all' && onlineTracks.length > 5 && (
                      <button className="show-more-btn" onClick={() => setSearchFilter('songs')}>
                        Show all {onlineTracks.length} songs
                      </button>
                    )}
                  </div>
                )}

                {/* Online Artists */}
                {(searchFilter === 'all' || searchFilter === 'artists') && onlineArtists.length > 0 && (
                  <div className="results-section">
                    {searchFilter === 'all' && <h3 className="section-title">Artists</h3>}
                    <div className="artists-grid">
                      {onlineArtists.slice(0, searchFilter === 'all' ? 5 : undefined).map((artist) => (
                        <div 
                          key={artist.id} 
                          className="artist-card online"
                          onClick={() => handleOnlineArtistClick(artist)}
                        >
                          <img 
                            src={artist.image || getArtworkUrl(null)}
                            alt={artist.name}
                            onError={handleImageError}
                            className="artist-image"
                          />
                          <span className="artist-name">{artist.name}</span>
                          {artist.fans && <span className="track-count">{(artist.fans / 1000).toFixed(0)}K fans</span>}
                        </div>
                      ))}
                    </div>
                    {searchFilter === 'all' && onlineArtists.length > 5 && (
                      <button className="show-more-btn" onClick={() => setSearchFilter('artists')}>
                        Show all {onlineArtists.length} artists
                      </button>
                    )}
                  </div>
                )}

                {/* Online Albums */}
                {(searchFilter === 'all' || searchFilter === 'albums') && onlineAlbums.length > 0 && (
                  <div className="results-section">
                    {searchFilter === 'all' && <h3 className="section-title">Albums</h3>}
                    <div className="albums-grid">
                      {onlineAlbums.slice(0, searchFilter === 'all' ? 5 : undefined).map((album) => (
                        <div 
                          key={album.id} 
                          className={`album-card online ${existsInLibrary.albums[album.id] ? 'in-library' : ''}`}
                          onClick={() => handleOnlineAlbumClick(album)}
                        >
                          {existsInLibrary.albums[album.id] && (
                            <span className="in-library-badge-small">
                              <i className="fas fa-check"></i>
                            </span>
                          )}
                          <img 
                            src={album.image || getArtworkUrl(null)}
                            alt={album.title}
                            onError={handleImageError}
                            className="album-cover"
                          />
                          <span className="album-name">{album.title}</span>
                          <span className="album-artist">{album.artist}</span>
                        </div>
                      ))}
                    </div>
                    {searchFilter === 'all' && onlineAlbums.length > 5 && (
                      <button className="show-more-btn" onClick={() => setSearchFilter('albums')}>
                        Show all {onlineAlbums.length} albums
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        ) : localQuery ? (
          <div className="search-empty">
            <i className="fas fa-search"></i>
            <h3>No results found</h3>
            <p>
              {searchMode === 'local' 
                ? 'Try different keywords or search online' 
                : 'Try different keywords'}
            </p>
            {searchMode === 'local' && (
              <Button 
                variant="secondary" 
                onClick={() => handleModeChange('online')}
                icon={<i className="fas fa-globe"></i>}
              >
                Search Online
              </Button>
            )}
          </div>
        ) : (
          <div className="search-empty">
            <i className={searchMode === 'local' ? 'fas fa-search' : 'fas fa-globe'}></i>
            <h3>{searchMode === 'local' ? 'Search your library' : 'Search online'}</h3>
            <p>
              {searchMode === 'local' 
                ? 'Find songs, artists, and albums in your collection' 
                : 'Find and download new music to add to your library'}
            </p>
          </div>
        )}
      </div>

      {/* Loading Overlay */}
      {isLoadingDetail && (
        <div className="modal-overlay">
          <div className="loading-modal">
            <div className="spinner spinner-lg"></div>
            <p>Loading...</p>
          </div>
        </div>
      )}

      {/* Online Artist Detail Modal */}
      {selectedOnlineArtist && (
        <div className="modal-overlay" onClick={() => setSelectedOnlineArtist(null)}>
          <div className="online-detail-modal glass-elevated" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedOnlineArtist(null)}>
              <i className="fas fa-times"></i>
            </button>
            
            <div className="modal-header">
              <img 
                src={selectedOnlineArtist.image || getArtworkUrl(null)} 
                alt={selectedOnlineArtist.name}
                onError={handleImageError}
                className="modal-image artist"
              />
              <div className="modal-info">
                <h2>{selectedOnlineArtist.name}</h2>
                <p className="modal-subtitle">
                  {selectedOnlineArtist.albums.length} albums
                  {selectedOnlineArtist.fans && ` · ${(selectedOnlineArtist.fans / 1000).toFixed(0)}K fans`}
                </p>
              </div>
            </div>

            <div className="modal-content">
              <h3>Albums</h3>
              <div className="albums-grid modal-grid">
                {selectedOnlineArtist.albums.map((album) => (
                  <div 
                    key={album.id} 
                    className="album-card online"
                    onClick={() => {
                      setSelectedOnlineArtist(null);
                      handleOnlineAlbumClick(album);
                    }}
                  >
                    <img 
                      src={album.image || getArtworkUrl(null)}
                      alt={album.title}
                      onError={handleImageError}
                      className="album-cover"
                    />
                    <span className="album-name">{album.title}</span>
                    {album.releaseDate && <span className="album-year">{album.releaseDate.split('-')[0]}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Online Album Detail Modal */}
      {selectedOnlineAlbum && (
        <div className="modal-overlay" onClick={() => setSelectedOnlineAlbum(null)}>
          <div className="online-detail-modal glass-elevated" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedOnlineAlbum(null)}>
              <i className="fas fa-times"></i>
            </button>
            
            <div className="modal-header">
              <img 
                src={selectedOnlineAlbum.image || getArtworkUrl(null)} 
                alt={selectedOnlineAlbum.title}
                onError={handleImageError}
                className="modal-image album"
              />
              <div className="modal-info">
                <h2>{selectedOnlineAlbum.title}</h2>
                <p className="modal-subtitle">
                  {selectedOnlineAlbum.artist}
                  {selectedOnlineAlbum.releaseDate && ` · ${selectedOnlineAlbum.releaseDate.split('-')[0]}`}
                </p>
                <p className="modal-meta">
                  {selectedOnlineAlbum.trackCount} tracks
                  {selectedOnlineAlbum.duration && ` · ${Math.floor(selectedOnlineAlbum.duration / 60)} min`}
                </p>
                <Button
                  onClick={() => handleDownloadAlbum(selectedOnlineAlbum)}
                  disabled={downloadingAlbums.has(selectedOnlineAlbum.id)}
                  icon={
                    downloadingAlbums.has(selectedOnlineAlbum.id)
                      ? <i className="fas fa-spinner fa-spin"></i>
                      : <i className="fas fa-download"></i>
                  }
                >
                  {downloadingAlbums.has(selectedOnlineAlbum.id) ? 'Downloading...' : 'Download Album'}
                </Button>
              </div>
            </div>

            <div className="modal-content">
              <h3>Tracks</h3>
              <div className="album-tracks">
                {selectedOnlineAlbum.tracks.map((track, index) => (
                  <div key={track.id} className="album-track">
                    <span className="track-number">{track.trackNumber || index + 1}</span>
                    <div className="track-info">
                      <span className="title">{track.title}</span>
                      <span className="duration">{formatTime(track.duration)}</span>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleDownload(track)}
                      disabled={downloadingTracks.has(track.id)}
                      icon={
                        downloadingTracks.has(track.id)
                          ? <i className="fas fa-spinner fa-spin"></i>
                          : <i className="fas fa-plus"></i>
                      }
                    >
                      {downloadingTracks.has(track.id) ? '' : 'Add'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Search;

