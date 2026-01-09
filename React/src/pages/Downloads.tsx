import React, { useEffect, useState } from 'react';
import { getDownloadQueue, cancelDownload, cleanupDownloads, type ImportStatus } from '../lib/api/import';
import { useUIStore } from '../lib/stores/ui';
import { Button } from '../lib/components/UI/Button';
import './Downloads.css';

export const Downloads: React.FC = () => {
  const { openImportModal, showToast } = useUIStore();
  const [downloads, setDownloads] = useState<ImportStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCleaning, setIsCleaning] = useState(false);

  // Only poll if there are active downloads
  const hasActiveDownloads = downloads.some(d => d.status === 'pending' || d.status === 'downloading');
  
  useEffect(() => {
    fetchDownloads();
  }, []);
  
  // Poll only when there are active downloads
  useEffect(() => {
    if (!hasActiveDownloads) return;
    
    const interval = setInterval(fetchDownloads, 5000);
    return () => clearInterval(interval);
  }, [hasActiveDownloads]);

  const fetchDownloads = async () => {
    try {
      const data = await getDownloadQueue();
      setDownloads(data);
    } catch (error) {
      console.error('Failed to fetch downloads:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelDownload(id);
      setDownloads((prev) => prev.filter((d) => d.id !== id));
      showToast('Download cancelled', 'info');
    } catch (error) {
      console.error('Failed to cancel download:', error);
      showToast('Failed to cancel download', 'error');
    }
  };

  const handleCleanup = async () => {
    setIsCleaning(true);
    try {
      const result = await cleanupDownloads();
      if (result.success) {
        showToast(`Cleanup complete: ${result.removed} downloads removed`, 'success');
        await fetchDownloads();
      }
    } catch (error) {
      console.error('Failed to cleanup downloads:', error);
      showToast('Failed to cleanup downloads', 'error');
    } finally {
      setIsCleaning(false);
    }
  };

  // Count completed/failed downloads for cleanup button
  const cleanableCount = downloads.filter(d => d.status === 'completed' || d.status === 'failed').length;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return 'fa-clock';
      case 'searching':
        return 'fa-search fa-pulse';
      case 'downloading':
        return 'fa-spinner fa-spin';
      case 'completed':
        return 'fa-check-circle';
      case 'failed':
        return 'fa-exclamation-circle';
      default:
        return 'fa-spinner fa-spin';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'var(--accent-green)';
      case 'failed':
        return 'var(--accent-red)';
      case 'downloading':
      case 'searching':
        return 'var(--accent-blue)';
      default:
        return 'var(--text-subdued)';
    }
  };

  return (
    <div className="downloads-page animate-fade-in">
      <header className="downloads-header">
        <div>
          <h1>Downloads</h1>
          <p>Manage your download queue · {downloads.length} items</p>
        </div>
        <div className="downloads-actions">
          <Button
            onClick={() => openImportModal('spotify')}
            icon={<i className="fab fa-spotify" />}
          >
            Import Playlist
          </Button>
          {cleanableCount > 0 && (
            <Button
              variant="secondary"
              onClick={handleCleanup}
              disabled={isCleaning}
              icon={<i className={`fas ${isCleaning ? 'fa-spinner fa-spin' : 'fa-broom'}`} />}
            >
              {isCleaning ? 'Cleaning...' : `Cleanup (${cleanableCount})`}
            </Button>
          )}
        </div>
      </header>

      <div className="downloads-content">
        {isLoading ? (
          <div className="downloads-loading">
            <div className="spinner spinner-lg"></div>
          </div>
        ) : downloads.length > 0 ? (
          <div className="downloads-list">
            {downloads.map((download) => (
              <div key={download.id} className={`download-item status-${download.status}`}>
                <div className="download-icon" style={{ color: getStatusColor(download.status) }}>
                  <i className={`fas ${getStatusIcon(download.status)}`}></i>
                </div>

                <div className="download-info">
                  <span className="download-title">
                    {download.title && download.title !== 'Extracting...' 
                      ? `${download.artist} - ${download.title}` 
                      : download.message || `Download ${download.status}`}
                  </span>
                  {download.progress !== undefined && download.status === 'downloading' && (
                    <div className="download-progress">
                      <div
                        className="download-progress-bar"
                        style={{ width: `${download.progress}%` }}
                      ></div>
                    </div>
                  )}
                </div>

                {(download.status === 'pending' || download.status === 'downloading') && (
                  <button className="cancel-btn" onClick={() => handleCancel(download.id)}>
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="downloads-empty">
            <i className="fas fa-download"></i>
            <h3>No downloads</h3>
            <p>Search online to find and download music</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Downloads;

