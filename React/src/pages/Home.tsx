import React, { useEffect, useMemo } from 'react';
import { useLibraryStore } from '../lib/stores/library';
import { usePlaylistsStore } from '../lib/stores/playlists';
import { usePlayerStore } from '../lib/stores/player';
import { FeaturedCard } from '../lib/components/Cards/FeaturedCard';
import { PlaylistCard } from '../lib/components/Cards/PlaylistCard';
import { TrackCard } from '../lib/components/Cards/TrackCard';
import { SkeletonCard } from '../lib/components/UI/Skeleton';
import { HorizontalScroll } from '../lib/components/UI/HorizontalScroll';
import './Home.css';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export const Home: React.FC = () => {
  const { tracks, isLoading: libraryLoading, fetchLibrary } = useLibraryStore();
  const {
    playlists,
    generatedPlaylists,
    isLoading: playlistsLoading,
    fetchPlaylists,
    fetchGeneratedPlaylists,
  } = usePlaylistsStore();
  const { playQueue } = usePlayerStore();

  useEffect(() => {
    fetchLibrary();
    fetchPlaylists();
    fetchGeneratedPlaylists();
  }, [fetchLibrary, fetchPlaylists, fetchGeneratedPlaylists]);

  // Get recent tracks (last 10 by ID - assuming higher ID = more recent)
  const recentTracks = useMemo(() => 
    [...tracks].sort((a, b) => b.id - a.id).slice(0, 10),
    [tracks]
  );

  // Get recommended tracks (every 6th track for variety, deterministic)
  const recommendedTracks = useMemo(() => 
    tracks.filter((_, index) => index % Math.max(1, Math.floor(tracks.length / 6)) === 0).slice(0, 6),
    [tracks]
  );

  const isLoading = libraryLoading || playlistsLoading;

  return (
    <div className="home-page animate-fade-in">
      <header className="home-header">
        <h1>{getGreeting()}</h1>
      </header>

      {/* Featured / Generated Playlists */}
      <section className="home-section">
        <div className="section-header">
          <h2 className="section-title">Made for you</h2>
        </div>
        {playlistsLoading && generatedPlaylists.length === 0 ? (
          <HorizontalScroll>
            {[...Array(4)].map((_, i) => (
              <SkeletonCard key={i} className="featured-skeleton" />
            ))}
          </HorizontalScroll>
        ) : generatedPlaylists.length > 0 ? (
          <HorizontalScroll>
            {generatedPlaylists.map((playlist) => (
              <FeaturedCard key={playlist.id} playlist={playlist} />
            ))}
          </HorizontalScroll>
        ) : (
          <div className="empty-state compact">
            <i className="fas fa-wand-magic-sparkles"></i>
            <p>Loading personalized playlists...</p>
          </div>
        )}
      </section>

      {/* Your Playlists */}
      <section className="home-section">
        <div className="section-header">
          <h2 className="section-title">Your Playlists</h2>
        </div>
        {isLoading ? (
          <div className="card-grid">
            {[...Array(4)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : playlists.length > 0 ? (
          <div className="card-grid">
            {playlists.slice(0, 6).map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <i className="fas fa-music"></i>
            <h3>No playlists yet</h3>
            <p>Create your first playlist to get started</p>
          </div>
        )}
      </section>

      {/* Recommended */}
      <section className="home-section">
        <div className="section-header">
          <h2 className="section-title">Recommended for you</h2>
          {recommendedTracks.length > 0 && (
            <button
              className="section-link"
              onClick={() => playQueue(recommendedTracks)}
            >
              Play all
            </button>
          )}
        </div>
        {recommendedTracks.length > 0 ? (
          <div className="track-list">
            {recommendedTracks.map((track, index) => (
              <TrackCard
                key={track.id}
                track={track}
                index={index}
                queue={recommendedTracks}
                compact
              />
            ))}
          </div>
        ) : (
          <div className="empty-state compact">
            <i className="fas fa-sparkles"></i>
            <h3>Discover new music</h3>
            <p>Search online to find and add songs to your library</p>
          </div>
        )}
      </section>

      {/* Recently Added */}
      {recentTracks.length > 0 && (
        <section className="home-section">
          <div className="section-header">
            <h2 className="section-title">Recently Added</h2>
          </div>
          <div className="track-list">
            {recentTracks.slice(0, 5).map((track, index) => (
              <TrackCard
                key={track.id}
                track={track}
                index={index}
                queue={recentTracks}
                compact
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default Home;

