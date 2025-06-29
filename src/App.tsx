import { useState } from 'react';
import MainMenu from './components/MainMenu';
import Tutorial from './components/Tutorial';
import Settings from './components/Settings';
import Game3D from './components/Game3D';

type AppState = 'menu' | 'tutorial' | 'settings' | 'practice' | 'inGameSettings' | 'gameOverSettings';

function App() {
  const [currentState, setCurrentState] = useState<AppState>('menu');

  const handleStartPractice = () => {
    setCurrentState('practice');
  };

  const handleShowTutorial = () => {
    setCurrentState('tutorial');
  };

  const handleShowSettings = () => {
    setCurrentState('settings');
  };

  const handleShowInGameSettings = () => {
    setCurrentState('inGameSettings');
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

  return (
    <div className="app-container">
      {currentState === 'menu' && (
        <MainMenu 
          onStartPractice={handleStartPractice}
          onTutorial={handleShowTutorial}
          onSettings={handleShowSettings}
        />
      )}
      
      {currentState === 'tutorial' && (
        <Tutorial onBack={handleBackToMenu} />
      )}
      
      {currentState === 'settings' && (
        <Settings onBack={handleBackToMenu} />
      )}
      
      {currentState === 'inGameSettings' && (
        <div className="relative w-full h-screen">
          {/* Game background */}
          <Game3D 
            onSettings={handleShowInGameSettings}
          />
          {/* Semi-transparent settings overlay */}
          <div className="absolute inset-0 bg-black bg-opacity-40 z-30">
            <Settings 
              onBack={handleBackToPractice} 
              onLeaveGame={handleBackToMenu}
              isInGame={true} 
            />
          </div>
        </div>
      )}

      {currentState === 'gameOverSettings' && (
        <div className="relative w-full h-screen">
          {/* Game background */}
          <Game3D 
            onSettings={handleShowGameOverSettings}
            onGameOver={handleShowGameOverSettings}
          />
          {/* Semi-transparent settings overlay */}
          <div className="absolute inset-0 bg-black bg-opacity-60 z-30">
            <Settings 
              onBack={handleBackToPractice} 
              onLeaveGame={handleBackToMenu}
              onRestartGame={handleRestartGame}
              isInGame={true}
              isGameOver={true}
            />
          </div>
        </div>
      )}

      {currentState === 'practice' && (
        <Game3D 
          onSettings={handleShowInGameSettings}
          onGameOver={handleShowGameOverSettings}
          onResume={handleBackToPractice}
        />
      )}
    </div>
  );
}

export default App;