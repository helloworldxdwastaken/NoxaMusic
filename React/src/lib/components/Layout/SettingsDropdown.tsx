import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import './SettingsDropdown.css';

export const SettingsDropdown: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { isSettingsOpen, toggleSettings, openImportModal } = useUIStore();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isSettingsOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      
      // Check if click is inside dropdown
      if (dropdownRef.current?.contains(target)) {
        return;
      }
      
      // Check if click is on the toggle button (has user-btn or user-avatar class)
      const targetElement = target as HTMLElement;
      if (
        targetElement.closest?.('.user-btn') ||
        targetElement.closest?.('.settings-trigger')
      ) {
        return; // Let the button handle the toggle
      }
      
      toggleSettings();
    };

    // Use a small delay to prevent immediate close on open
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isSettingsOpen, toggleSettings]);

  const handleLogout = () => {
    logout();
    toggleSettings();
    navigate('/login');
  };

  const handleImport = (type: 'spotify' | 'youtube' | 'url') => {
    toggleSettings();
    openImportModal(type);
  };

  if (!isSettingsOpen) return null;

  return (
    <div className="settings-dropdown glass-elevated" ref={dropdownRef}>
      <div className="dropdown-header">
        <div className="user-info">
          <div className="avatar">
            <i className="fas fa-user"></i>
          </div>
          <div className="details">
            <span className="name">{user?.username || user?.name || 'Guest'}</span>
            <span className="email">{user?.email || ''}</span>
          </div>
        </div>
      </div>

      <div className="dropdown-divider"></div>

      <div className="dropdown-section">
        <span className="section-label">Import Music</span>
        <button className="dropdown-item" onClick={() => handleImport('spotify')}>
          <i className="fab fa-spotify"></i>
          <span>Import from Spotify</span>
        </button>
        <button className="dropdown-item" onClick={() => handleImport('youtube')}>
          <i className="fab fa-youtube"></i>
          <span>Import from YouTube Music</span>
        </button>
        <button className="dropdown-item" onClick={() => handleImport('url')}>
          <i className="fas fa-link"></i>
          <span>Import from URL</span>
        </button>
      </div>

      <div className="dropdown-divider"></div>

      <div className="dropdown-section">
        <span className="section-label">Community</span>
        <a
          href="https://discord.gg/BCFwE6ts3j"
          target="_blank"
          rel="noopener noreferrer"
          className="dropdown-item"
        >
          <i className="fab fa-discord"></i>
          <span>Discord</span>
          <i className="fas fa-external-link-alt external-icon"></i>
        </a>
        <a
          href="https://buymeacoffee.com/tokyohouseparty"
          target="_blank"
          rel="noopener noreferrer"
          className="dropdown-item"
        >
          <i className="fas fa-heart"></i>
          <span>Keep me alive</span>
          <i className="fas fa-external-link-alt external-icon"></i>
        </a>
      </div>

      {user?.is_admin && (
        <>
          <div className="dropdown-divider"></div>
          <div className="dropdown-section">
            <span className="section-label">Admin</span>
            <button
              className="dropdown-item"
              onClick={() => {
                toggleSettings();
                navigate('/admin');
              }}
            >
              <i className="fas fa-cog"></i>
              <span>Admin Console</span>
            </button>
          </div>
        </>
      )}

      <div className="dropdown-divider"></div>

      <button className="dropdown-item logout" onClick={handleLogout}>
        <i className="fas fa-sign-out-alt"></i>
        <span>Log out</span>
      </button>
    </div>
  );
};

export default SettingsDropdown;

