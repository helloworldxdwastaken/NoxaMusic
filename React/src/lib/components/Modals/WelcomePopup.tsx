import React, { useEffect, useState } from 'react';
import './WelcomePopup.css';

const DISCORD_URL = 'https://discord.gg/BCFwE6ts3j';
const STORAGE_KEY = 'noxa_welcome_dismissed';

export const WelcomePopup: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has dismissed the popup before
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) {
      // Show popup after a short delay
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  if (!isVisible) return null;

  return (
    <>
      <div className="welcome-overlay" onClick={handleClose} />
      <div className="welcome-popup glass-elevated">
        <button className="welcome-close" onClick={handleClose}>
          <i className="fas fa-times"></i>
        </button>

        <div className="welcome-icon">
          <i className="fab fa-discord"></i>
        </div>

        <div className="welcome-content">
          <h3>Stay Connected 📱</h3>
          <p>Join our Discord and download apps for your mobile devices!</p>

          <div className="welcome-apps">
            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
              <i className="fab fa-android"></i>
              <span>Android App</span>
            </a>
            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
              <i className="fab fa-app-store-ios"></i>
              <span>iOS App</span>
            </a>
          </div>
        </div>

        <a 
          href={DISCORD_URL} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="welcome-btn"
          onClick={handleClose}
        >
          Join the Community
        </a>
      </div>
    </>
  );
};

export default WelcomePopup;

