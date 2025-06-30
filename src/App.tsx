import { useState, useEffect } from 'react';
import MainMenu from './components/MainMenu';
import Tutorial from './components/Tutorial';
import Settings from './components/Settings';
import Game3D from './components/Game3D';

type AppState = 'menu' | 'tutorial' | 'settings' | 'practice' | 'paused' | 'gameOverSettings';

function App() {
  const [currentState, setCurrentState] = useState<AppState>('menu');
  const [keyBinds, setKeyBinds] = useState<{ turnLeft: string[]; turnRight: string[] }>({
    turnLeft: ['z', 'arrowleft'],
    turnRight: ['x', 'arrowright']
  });

  // Load keybinds from localStorage on mount and when Settings changes them
  useEffect(() => {
    const saved = localStorage.getItem('hypoxia-keybinds');
    if (saved) {
      try {
        setKeyBinds(JSON.parse(saved));
      } catch {
        // ignore
      }
    }
  }, [currentState === 'settings' || currentState === 'paused' || currentState === 'gameOverSettings']); // reload when menu open/close

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
        <Settings onBack={handleBackToMenu} />
      )}

      {/* Game Practice + Pause Overlay (no separate 'inGameSettings' state) */}
      {(currentState === 'practice' || currentState === 'paused' || currentState === 'gameOverSettings') && (
        <div className="relative w-full h-screen">
          <Game3D
            onSettings={handlePauseOverlay} // ESC just toggles local pause now
            onGameOver={handleShowGameOverSettings}
            onResume={handleBackToPractice}
            // Pause the game only when we're in "paused" or "gameOverSettings"
            isPaused={currentState === 'paused' || currentState === 'gameOverSettings'}
            keyBinds={keyBinds}
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
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;