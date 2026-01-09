import React from 'react';
import { NavLink } from 'react-router-dom';
import { useUIStore } from '../../stores/ui';
import './BottomNav.css';

export const BottomNav: React.FC = () => {
  const { isMobile } = useUIStore();

  // Only render on mobile
  if (!isMobile) return null;

  return (
    <nav className="bottom-nav">
      <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <i className="fas fa-home"></i>
        <span>Home</span>
      </NavLink>
      
      <NavLink to="/search" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <i className="fas fa-search"></i>
        <span>Search</span>
      </NavLink>
      
      <NavLink to="/library" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <i className="fas fa-book"></i>
        <span>Library</span>
      </NavLink>
      
      <NavLink to="/downloads" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <i className="fas fa-download"></i>
        <span>Downloads</span>
      </NavLink>
    </nav>
  );
};

export default BottomNav;

