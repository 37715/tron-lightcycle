import { useState, useEffect } from 'react';
import MainMenu from './components/MainMenu';
import Tutorial from './components/Tutorial';
import Settings from './components/Settings';
import Game3D from './components/Game3D';
import PracticeGame3D from './components/PracticeGame3D';

type AppState = 'menu' | 'tutorial' | 'settings' | 'practice' | 'practiceAI' | 'paused' | 'pausedAI' | 'gameOverSettings' | 'gameOverSettingsAI';

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
      const savedVisuals = localStorage.getItem('cathexis-visual-settings');
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
    // For now, go directly to AI practice mode
    setCurrentState('practiceAI');
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
    if (currentState === 'pausedAI' || currentState === 'gameOverSettingsAI') {
      setCurrentState('practiceAI');
    } else {
      setCurrentState('practice');
    }
  };

  const handleRestartGame = () => {
    // Force a complete restart by cycling through menu briefly
    const targetState = (currentState === 'pausedAI' || currentState === 'gameOverSettingsAI') ? 'practiceAI' : 'practice';
    setCurrentState('menu');
    setTimeout(() => setCurrentState(targetState), 50);
  };

  const handleBackToMenu = () => {
    setCurrentState('menu');
  };

  const handlePauseOverlay = () => {
    if (currentState === 'practiceAI') {
      setCurrentState('pausedAI');
    } else {
      setCurrentState('paused');
    }
  };

  const handleGameOver = (winner?: 'player' | 'ai') => {
    if (currentState === 'practiceAI') {
      setCurrentState('gameOverSettingsAI');
    } else {
      setCurrentState('gameOverSettings');
    }
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

      {/* Solo Practice + Pause Overlay */}
      {(currentState === 'practice' || currentState === 'paused' || currentState === 'gameOverSettings') && (
        <div className="relative w-full h-screen">
          <Game3D
            onSettings={handlePauseOverlay}
            onGameOver={() => handleGameOver()}
            onResume={handleBackToPractice}
            isPaused={currentState === 'paused' || currentState === 'gameOverSettings'}
            visualSettings={visualSettings}
          />

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

      {/* AI Practice + Pause Overlay */}
      {(currentState === 'practiceAI' || currentState === 'pausedAI' || currentState === 'gameOverSettingsAI') && (
        <div className="relative w-full h-screen">
          <PracticeGame3D
            onSettings={handlePauseOverlay}
            onGameOver={handleGameOver}
            onResume={handleBackToPractice}
            isPaused={currentState === 'pausedAI' || currentState === 'gameOverSettingsAI'}
            visualSettings={visualSettings}
          />

          {currentState === 'pausedAI' && (
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

          {currentState === 'gameOverSettingsAI' && (
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