import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import { SettingsDropdown } from './SettingsDropdown';
import './TopBar.css';

export const TopBar: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { isSettingsOpen, toggleSettings, isMobile } = useUIStore();

  const goBack = () => navigate(-1);
  const goForward = () => navigate(1);

  return (
    <header className={`topbar ${isMobile ? 'mobile' : ''}`}>
      {!isMobile && (
        <div className="topbar-nav">
          <button className="nav-btn" onClick={goBack} title="Go back">
            <i className="fas fa-chevron-left"></i>
          </button>
          <button className="nav-btn" onClick={goForward} title="Go forward">
            <i className="fas fa-chevron-right"></i>
          </button>
        </div>
      )}

      {isMobile && (
        <div className="topbar-logo">
          <h1>Noxa Music</h1>
        </div>
      )}

      <div className="topbar-right">
        <div className="user-menu">
          <button className="user-btn" onClick={toggleSettings}>
            <div className="user-avatar">
              <i className="fas fa-user"></i>
            </div>
            {!isMobile && <span className="user-name">{user?.username || user?.name || 'Guest'}</span>}
            <i className={`fas fa-chevron-${isSettingsOpen ? 'up' : 'down'} dropdown-icon`}></i>
          </button>
          
          <SettingsDropdown />
        </div>
      </div>
    </header>
  );
};

export default TopBar;

