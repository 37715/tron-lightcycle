import React, { useState } from 'react';

interface MainMenuProps {
  onStartPractice: () => void;
  onTutorial: () => void;
  onSettings: () => void;
}

const MainMenu: React.FC<MainMenuProps> = ({ onStartPractice, onTutorial, onSettings }) => {
  const [view, setView] = useState<'main' | 'casual' | 'competitive'>('main');

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

        {/* Main Menu Buttons */}
        {view === 'main' && (
          <div className="menu-buttons">
            <button className="menu-button menu-button-secondary ui-text" onClick={() => setView('casual')}>
              <span className="button-content">
                <span className="button-icon">⚡</span>
                <span className="button-text">CASUAL</span>
              </span>
            </button>
            <button className="menu-button menu-button-secondary ui-text" onClick={() => setView('competitive')}>
              <span className="button-content">
                <span className="button-icon">🏆</span>
                <span className="button-text">COMPETITIVE</span>
              </span>
              <span className="button-coming-soon">RANKED</span>
            </button>
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
        )}

        {/* Submenu for Casual and Competitive */}
        {(view === 'casual' || view === 'competitive') && (
          <div className={`submenu-content ${view}`}>
            <h2 className="menu-title ui-text">
              {view === 'competitive' ? 'COMPETITIVE • RANKED' : 'CASUAL PLAY'}
            </h2>
            <div className="submenu-grid">
              <div className={`submenu-item ${view}-style one-v-one`} onClick={() => console.log('1v1 selected')}>
                <div className="item-icon">⚔️</div>
                <div className="item-title">1v1</div>
                <div className="item-subtitle">DUEL</div>
              </div>
              <div className={`submenu-item ${view}-style two-v-two`} onClick={() => console.log('2v2 selected')}>
                <div className="item-icon">👥</div>
                <div className="item-title">2v2</div>
                <div className="item-subtitle">TEAM</div>
              </div>
              <div className={`submenu-item ${view}-style solo-royale`} onClick={() => console.log('Solo Royale selected')}>
                <div className="item-icon">👑</div>
                <div className="item-title">SOLO</div>
                <div className="item-subtitle">ROYALE</div>
              </div>
              <div className={`submenu-item ${view}-style duo-royale`} onClick={() => console.log('Duo Royale selected')}>
                <div className="item-icon">💎</div>
                <div className="item-title">DUO</div>
                <div className="item-subtitle">ROYALE</div>
              </div>
            </div>
            <button className="menu-button menu-button-secondary ui-text back-button" onClick={() => setView('main')}>
              ← Back
            </button>
          </div>
        )}

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
