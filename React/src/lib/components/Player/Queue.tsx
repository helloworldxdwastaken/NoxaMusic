import React, { useState } from 'react';
import { usePlayerStore } from '../../stores/player';
import { useUIStore } from '../../stores/ui';
import { getArtworkUrl, handleImageError } from '../../utils/artwork';
import { formatTime } from '../../utils/formatTime';
import './Queue.css';

type QueueTab = 'queue' | 'recently-played';

export const Queue: React.FC = () => {
  const [activeTab, setActiveTab] = useState<QueueTab>('queue');
  const { 
    queue, 
    queueIndex, 
    currentTrack, 
    recentlyPlayed,
    playTrack, 
    removeFromQueue, 
    clearQueue,
    clearRecentlyPlayed 
  } = usePlayerStore();
  const { isQueueOpen, toggleQueue } = useUIStore();

  const upcomingTracks = queue.slice(queueIndex + 1);

  if (!isQueueOpen) return null;

  return (
    <div className="queue-panel glass-elevated">
      <div className="queue-header">
        <div className="queue-tabs">
          <button 
            className={`queue-tab ${activeTab === 'queue' ? 'active' : ''}`}
            onClick={() => setActiveTab('queue')}
          >
            Queue
          </button>
          <button 
            className={`queue-tab ${activeTab === 'recently-played' ? 'active' : ''}`}
            onClick={() => setActiveTab('recently-played')}
          >
            Recently Played
          </button>
        </div>
        <div className="queue-actions">
          {activeTab === 'queue' && upcomingTracks.length > 0 && (
            <button className="clear-btn" onClick={clearQueue}>
              Clear
            </button>
          )}
          {activeTab === 'recently-played' && recentlyPlayed.length > 0 && (
            <button className="clear-btn" onClick={clearRecentlyPlayed}>
              Clear
            </button>
          )}
          <button className="close-btn" onClick={toggleQueue}>
            <i className="fas fa-times"></i>
          </button>
        </div>
      </div>

      <div className="queue-content">
        {/* Queue Tab */}
        {activeTab === 'queue' && (
          <>
            {currentTrack && (
              <div className="queue-section">
                <h4>Now Playing</h4>
                <div className="queue-track current">
                  <img
                    src={getArtworkUrl(currentTrack.album_cover)}
                    alt={currentTrack.album}
                    onError={(e) => handleImageError(e)}
                  />
                  <div className="track-info">
                    <span className="title">{currentTrack.title}</span>
                    <span className="artist">{currentTrack.artist}</span>
                  </div>
                  <span className="duration">{formatTime(currentTrack.duration)}</span>
                </div>
              </div>
            )}

            {upcomingTracks.length > 0 && (
              <div className="queue-section">
                <h4>Next Up</h4>
                <div className="queue-list">
                  {upcomingTracks.map((track, index) => (
                    <div
                      key={`${track.id}-${index}`}
                      className="queue-track"
                      onClick={() => playTrack(track, queue, queueIndex + 1 + index)}
                    >
                      <img
                        src={getArtworkUrl(track.album_cover)}
                        alt={track.album}
                        onError={(e) => handleImageError(e)}
                      />
                      <div className="track-info">
                        <span className="title">{track.title}</span>
                        <span className="artist">{track.artist}</span>
                      </div>
                      <button
                        className="remove-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromQueue(queueIndex + 1 + index);
                        }}
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!currentTrack && upcomingTracks.length === 0 && (
              <div className="queue-empty">
                <i className="fas fa-list"></i>
                <p>Queue is empty</p>
                <span>Add songs to your queue to see them here</span>
              </div>
            )}
          </>
        )}

        {/* Recently Played Tab */}
        {activeTab === 'recently-played' && (
          <>
            {recentlyPlayed.length > 0 ? (
              <div className="queue-section">
                <h4>Recently Played</h4>
                <div className="queue-list">
                  {recentlyPlayed.map((track, index) => (
                    <div
                      key={`recently-${track.id}-${index}`}
                      className="queue-track"
                      onClick={() => playTrack(track, [track], 0)}
                    >
                      <img
                        src={getArtworkUrl(track.album_cover)}
                        alt={track.album}
                        onError={(e) => handleImageError(e)}
                      />
                      <div className="track-info">
                        <span className="title">{track.title}</span>
                        <span className="artist">{track.artist}</span>
                      </div>
                      <span className="duration">{formatTime(track.duration)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="queue-empty">
                <i className="fas fa-history"></i>
                <p>No recently played</p>
                <span>Songs you listen to will appear here</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Queue;

