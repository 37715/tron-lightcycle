import React from 'react';

interface MainMenuProps {
  onStartPractice: () => void;
  onTutorial: () => void;
  onSettings: () => void;
}

const MainMenu: React.FC<MainMenuProps> = ({ onStartPractice, onTutorial, onSettings }) => {
  return (
    <div className="main-menu-container">
      {/* Animated Grid Background */}
      <div className="grid-background">
        <div className="grid-lines-horizontal"></div>
        <div className="grid-lines-vertical"></div>
        <div className="grid-glow"></div>
      </div>
      
      {/* Main Content */}
      <div className="menu-content">
        <div className="logo-section">
          <h1 className="main-logo ui-text">hypoxia</h1>
          <p className="main-subtitle ui-text">3D GRID RACING</p>
        </div>
        
        <div className="menu-buttons">
          <button 
            className="menu-button menu-button-primary ui-text"
            onClick={onStartPractice}
          >
            <span className="button-content">
              <span className="button-icon">▶</span>
              <span className="button-text">PRACTICE</span>
            </span>
          </button>
          
          <button 
            className="menu-button menu-button-secondary ui-text"
            disabled
          >
            <span className="button-content">
              <span className="button-icon">🏆</span>
              <span className="button-text">RANKED</span>
            </span>
            <span className="button-coming-soon">COMING SOON</span>
          </button>
          
          <button 
            className="menu-button menu-button-secondary ui-text"
            disabled
          >
            <span className="button-content">
              <span className="button-icon">⚡</span>
              <span className="button-text">CASUAL</span>
            </span>
            <span className="button-coming-soon">COMING SOON</span>
          </button>
          
          <button 
            className="menu-button menu-button-help ui-text"
            onClick={onTutorial}
          >
            <span className="button-content">
              <span className="button-icon">?</span>
              <span className="button-text">TUTORIAL</span>
            </span>
          </button>
          
          <button 
            className="menu-button menu-button-secondary ui-text"
            onClick={onSettings}
          >
            <span className="button-content">
              <span className="button-icon">⚙</span>
              <span className="button-text">SETTINGS</span>
            </span>
          </button>
        </div>
        
        <div className="menu-footer">
          <p className="ui-text">Use Z/← and X/→ to control your bike</p>
          <p className="ui-text version-text">v1.0 • Esports Optimized</p>
        </div>
      </div>
      
      {/* Floating particles for extra effect */}
      <div className="floating-particles">
        <div className="particle particle-1"></div>
        <div className="particle particle-2"></div>
        <div className="particle particle-3"></div>
        <div className="particle particle-4"></div>
      </div>
    </div>
  );
};

export default MainMenu;
