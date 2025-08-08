import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';

const CustomiseMenu = lazy(() => import('./CustomiseMenu'));

interface MainMenuProps {
  onStartPractice: () => void;
  onTutorial: () => void;
  onSettings: () => void;
}

type MenuView = 'main' | 'casual' | 'competitive' | 'customise';

const COLOR_OPTIONS = [
  { name: 'cyan', hex: '#00ffff' },
  { name: 'red', hex: '#ff3030' },
  { name: 'gold', hex: '#ffd700' },
  { name: 'violet', hex: '#7c4dff' },
  { name: 'green', hex: '#00e676' },
  { name: 'black', hex: '#111111' }
];

const MainMenu: React.FC<MainMenuProps> = ({ onStartPractice, onTutorial, onSettings }) => {
  const [view, setView] = useState<MenuView>('main');
  const buttonsRef = useRef<HTMLButtonElement[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [bikeColor, setBikeColor] = useState<string>('#00ffff');
  const [trailColor, setTrailColor] = useState<string>('#00ffff');

  useEffect(() => {
    // Collect focusable buttons in current view
    const container = document.querySelector('.menu-content');
    if (!container) return;
    const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
    buttonsRef.current = buttons.filter(b => !b.disabled);
    if (buttonsRef.current.length > 0) {
      setFocusedIndex(0);
      buttonsRef.current[0].focus();
    }
  }, [view]);

  useEffect(() => {
    // Load saved customization
    try {
      const saved = localStorage.getItem('cathexis-customization');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.bikeColor) setBikeColor(parsed.bikeColor);
        if (parsed.trailColor) setTrailColor(parsed.trailColor);
        // ignore legacy trailVariant
      }
    } catch {}
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!buttonsRef.current.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        const next = (focusedIndex + 1) % buttonsRef.current.length;
        setFocusedIndex(next);
        buttonsRef.current[next]?.focus();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = (focusedIndex - 1 + buttonsRef.current.length) % buttonsRef.current.length;
        setFocusedIndex(prev);
        buttonsRef.current[prev]?.focus();
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        buttonsRef.current[focusedIndex]?.click();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusedIndex]);

  const persistCustomization = (nextBike: string, nextTrail: string) => {
    setBikeColor(nextBike);
    setTrailColor(nextTrail);
    try {
      localStorage.setItem('cathexis-customization', JSON.stringify({ bikeColor: nextBike, trailColor: nextTrail }));
    } catch {}
  };

  const handlePickBike = (hex: string) => {
    persistCustomization(hex, trailColor);
  };

  const handlePickTrail = (hex: string) => {
    persistCustomization(bikeColor, hex);
  };

  // no-op legacy handler removed

  return (
    <div className="main-menu-container">
      {/* Animated Grid Background */}
      <div className="grid-background">
        <div className="grid-lines-horizontal"></div>
        <div className="grid-lines-vertical"></div>
        <div className="grid-glow"></div>
      </div>
      
      {/* Leaderboard Button - Only show on main view */}
      {view === 'main' && (
        <div className="leaderboard-corner-button">
          <button className="leaderboard-button ui-text" disabled title="Competitive Leaderboard - Coming Soon">
            <span className="leaderboard-icon">📊</span>
            <span className="leaderboard-text">LEADERBOARD</span>
            <span className="leaderboard-coming-soon">COMING SOON</span>
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="menu-content">
        <div className="logo-section">
          <h1 className="main-logo">cathexis</h1>
          <p className="main-subtitle">3D GRID RACING</p>
        </div>

        {/* Main Menu Buttons */}
        {view === 'main' && (
          <div className="menu-buttons">
            <button className="menu-button menu-button-casual ui-text" onClick={() => setView('casual')}>
              <span className="button-content">
                <span className="button-icon">⚡</span>
                <span className="button-text">CASUAL</span>
              </span>
            </button>
            <button className="menu-button menu-button-competitive ui-text" disabled>
              <span className="button-content">
                <span className="button-icon">🏆</span>
                <span className="button-text">COMPETITIVE</span>
                <span className="button-coming-soon">COMING SOON</span>
              </span>
            </button>
            <button 
              className="menu-button menu-button-secondary ui-text"
              onClick={() => setView('customise')}
            >
              <span className="button-content">
                <span className="button-icon">🎨</span>
                <span className="button-text">CUSTOMISE</span>
              </span>
            </button>
            <button 
              className="menu-button menu-button-primary ui-text"
              onClick={onStartPractice}
            >
              <span className="button-content">
                <span className="button-icon">▶</span>
                <span className="button-text">PRACTICE vs AI</span>
              </span>
            </button>
            
            {/* Single Player button removed */}
            
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

        {/* Customisation View */}
        {view === 'customise' && (
          <Suspense fallback={
            <div className="customise-loading">
              <div className="loading-spinner"></div>
              <p className="ui-text">Loading customization...</p>
            </div>
          }>
            <CustomiseMenu
              bikeColor={bikeColor}
              trailColor={trailColor}
              onBikeColorChange={handlePickBike}
              onTrailColorChange={handlePickTrail}
              onBack={() => setView('main')}
            />
          </Suspense>
        )}

        {/* Submenu for Casual and Competitive */}
        {(view === 'casual' || view === 'competitive') && (
          <div className={`submenu-content ${view}`}>
            <h2 className="submenu-title">
              {view === 'competitive' ? 'competitive • ranked' : 'casual play'}
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
           <p className="ui-text version-text">v1.0</p>
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
