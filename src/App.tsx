import { useState, useEffect } from 'react';
import MainMenu from './components/MainMenu';
import Tutorial from './components/Tutorial';
import Settings from './components/Settings';
import Game3D from './components/Game3D';

type AppState = 'menu' | 'tutorial' | 'settings' | 'practice' | 'paused' | 'gameOverSettings';

interface VisualSettings {
  fov: number;
  showGrid: boolean;
  cameraTurnSpeed: number;
}

function App() {
  const [currentState, setCurrentState] = useState<AppState>('menu');
  const [visualSettings, setVisualSettings] = useState<VisualSettings>({
    fov: 75,
    showGrid: true,
    cameraTurnSpeed: 0.5
  });

  useEffect(() => {
    try {
      const savedVisuals = localStorage.getItem('hypoxia-visual-settings');
      if (savedVisuals) {
        const parsed = JSON.parse(savedVisuals);
        setVisualSettings({
          fov: parsed.fov ?? 75,
          showGrid: parsed.showGrid ?? true,
          cameraTurnSpeed: parsed.cameraTurnSpeed ?? 0.5,
        });
      }
    } catch {
      // ignore corrupted storage
    }
  }, []);

  const handleStartPractice = () => {
    setCurrentState('practice');
  };

  const handleShowTutorial = () => {
    setCurrentState('tutorial');
  };

  const handleShowSettings = () => {
    setCurrentState('settings');
  };

  const handleShowGameOverSettings = () => {
    setCurrentState('gameOverSettings');
  };

  const handleBackToPractice = () => {
    setCurrentState('practice');
  };

  const handleRestartGame = () => {
    // Force a complete restart by cycling through menu briefly
    setCurrentState('menu');
    setTimeout(() => setCurrentState('practice'), 50);
  };

  const handleBackToMenu = () => {
    setCurrentState('menu');
  };

  const handlePauseOverlay = () => {
    setCurrentState('paused');
  };

  return (
    <div className="app-container">
      {/* Main Menu */}
      {currentState === 'menu' && (
        <MainMenu 
          onStartPractice={handleStartPractice}
          onTutorial={handleShowTutorial}
          onSettings={handleShowSettings}
        />
      )}

      {/* Tutorial */}
      {currentState === 'tutorial' && (
        <Tutorial onBack={handleBackToMenu} />
      )}

      {/* Settings (Global) */}
      {currentState === 'settings' && (
        <Settings 
          onBack={handleBackToMenu} 
          onVisualSettingsChange={setVisualSettings}
        />
      )}

      {/* Game Practice + Pause Overlay (no separate 'inGameSettings' state) */}
      {(currentState === 'practice' || currentState === 'paused' || currentState === 'gameOverSettings') && (
        <div className="relative w-full h-screen">
          {/* Game3D is always mounted, we just pass isPaused if we're showing an overlay */}
          <Game3D
            onSettings={handlePauseOverlay} // ESC just toggles local pause now
            onGameOver={handleShowGameOverSettings}
            onResume={handleBackToPractice}
            // Pause the game only when we're in "paused" or "gameOverSettings"
            isPaused={currentState === 'paused' || currentState === 'gameOverSettings'}
            visualSettings={visualSettings}
          />

          {/* If we're in paused, show the overlay */}
          {currentState === 'paused' && (
            <div className="absolute inset-0 bg-black bg-opacity-60 z-30">
              <Settings
                onBack={handleBackToPractice}
                onLeaveGame={handleBackToMenu}
                onRestartGame={handleRestartGame}
                isInGame={true}
                isGameOver={false}
                onVisualSettingsChange={setVisualSettings}
              />
            </div>
          )}

          {/* If we're in gameOverSettings, show the overlay */}
          {currentState === 'gameOverSettings' && (
            <div className="absolute inset-0 bg-black bg-opacity-60 z-30">
              <Settings
                onBack={handleBackToPractice}
                onLeaveGame={handleBackToMenu}
                onRestartGame={handleRestartGame}
                isInGame={true}
                isGameOver={true}
                onVisualSettingsChange={setVisualSettings}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;