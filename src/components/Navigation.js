import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navigation.css';

const Navigation = () => {
  const location = useLocation();
  
  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <nav className="navigation">
      <div className="nav-container">
        <h1 className="nav-title">🎵 音楽づくりアプリ</h1>
        <div className="nav-links">
          <Link 
            to="/collection" 
            className={`nav-link ${isActive('/collection') || isActive('/') ? 'active' : ''}`}
          >
            🎤 音あつめ
          </Link>
          <Link 
            to="/library" 
            className={`nav-link ${isActive('/library') ? 'active' : ''}`}
          >
            📚 音ライブラリ
          </Link>
          <Link 
            to="/daw" 
            className={`nav-link ${isActive('/daw') ? 'active' : ''}`}
          >
            🎹 音楽づくり
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
