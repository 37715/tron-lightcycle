import React, { useState, useEffect } from 'react';

interface SettingsProps {
  onBack: () => void;
  onLeaveGame?: () => void;
  onRestartGame?: () => void;
  isInGame?: boolean;
  isGameOver?: boolean;
}

type SettingsView = 'main' | 'binds' | 'visuals';

interface KeyBinds {
  turnLeft: string[];
  turnRight: string[];
  brake: string[];
}

const Settings: React.FC<SettingsProps> = ({ onBack, onLeaveGame, onRestartGame, isInGame = false, isGameOver = false }) => {
  const [currentView, setCurrentView] = useState<SettingsView>('main');
  const [keyBinds, setKeyBinds] = useState<KeyBinds>({
    turnLeft: ['z', 'arrowleft'],
    turnRight: ['x', 'arrowright'],
    brake: ['space']
  });
  const [selectedBind, setSelectedBind] = useState<'turnLeft' | 'turnRight' | 'brake' | null>(null);

  // Load saved keybinds from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('hypoxia-keybinds');
    if (saved) {
      try {
        const parsedBinds = JSON.parse(saved);
        // Ensure brake property exists (for backward compatibility)
        const completeBinds = {
          turnLeft: parsedBinds.turnLeft || ['z', 'arrowleft'],
          turnRight: parsedBinds.turnRight || ['x', 'arrowright'],
          brake: parsedBinds.brake || ['space']
        };
        setKeyBinds(completeBinds);
      } catch {
        console.warn('Failed to load saved keybinds');
      }
    }
  }, []);

  // Save keybinds to localStorage
  const saveKeyBinds = (newBinds: KeyBinds) => {
    setKeyBinds(newBinds);
    localStorage.setItem('hypoxia-keybinds', JSON.stringify(newBinds));
  };

  // Handle key press for binding
  useEffect(() => {
    if (!selectedBind) return;

    const handleKeyPress = (event: KeyboardEvent) => {
      event.preventDefault();
      let key = event.key.toLowerCase();
      
      // Convert space character to 'space' string
      if (key === ' ') {
        key = 'space';
      }
      
      // Don't allow escape
      if (key === 'escape') {
        setSelectedBind(null);
        return;
      }

      const newBinds = { ...keyBinds };
      
      // Check if key is already bound to this action
      if (newBinds[selectedBind].includes(key)) {
        // Remove the key
        newBinds[selectedBind] = newBinds[selectedBind].filter(k => k !== key);
      } else {
        // Add the key
        newBinds[selectedBind] = [...newBinds[selectedBind], key];
      }
      
      saveKeyBinds(newBinds);
      setSelectedBind(null);
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedBind, keyBinds]);

  const renderMainSettings = () => (
    <div className="settings-content">
      <div className="settings-header">
        <h1 className="settings-title ui-text">SETTINGS</h1>
      </div>
      
      <div className="settings-buttons">
        {isInGame && !isGameOver && (
          <button 
            className="menu-button menu-button-help ui-text"
            onClick={onBack}
          >
            <span className="button-content">
              <span className="button-icon">←</span>
              <span className="button-text">BACK TO GAME</span>
            </span>
          </button>
        )}
        
        {isGameOver && (
          <>
            <div className="game-over-message">
              <h2 className="text-3xl font-bold mb-4 text-red-400 ui-text">GAME OVER</h2>
              <p className="mb-6 text-gray-300 ui-text">You crashed into a wall or trail!</p>
            </div>
            <button 
              className="menu-button menu-button-primary ui-text"
              onClick={onRestartGame}
            >
              <span className="button-content">
                <span className="button-icon">🔄</span>
                <span className="button-text">PLAY AGAIN</span>
              </span>
            </button>
          </>
        )}
        
        {!isGameOver && (
          <>
            <button 
              className="menu-button menu-button-primary ui-text"
              onClick={() => setCurrentView('binds')}
            >
              <span className="button-content">
                <span className="button-icon">⌨</span>
                <span className="button-text">KEY BINDS</span>
              </span>
            </button>
            
            <button 
              className="menu-button menu-button-secondary ui-text"
              onClick={() => setCurrentView('visuals')}
            >
              <span className="button-content">
                <span className="button-icon">👁</span>
                <span className="button-text">VISUALS</span>
              </span>
              <span className="button-coming-soon">COMING SOON</span>
            </button>
          </>
        )}
        
        {!isInGame && !isGameOver && (
          <button 
            className="menu-button menu-button-help ui-text"
            onClick={onBack}
          >
            <span className="button-content">
              <span className="button-icon">←</span>
              <span className="button-text">BACK</span>
            </span>
          </button>
        )}
        
        {isInGame && onLeaveGame && (
          <button 
            className="menu-button menu-button-danger ui-text"
            onClick={onLeaveGame}
          >
            <span className="button-content">
              <span className="button-icon">🚪</span>
              <span className="button-text">LEAVE GAME</span>
            </span>
          </button>
        )}
      </div>
    </div>
  );

  const renderKeyBinds = () => (
    <div className="keybinds-content">
      <div className="keybinds-header">
        <h1 className="settings-title ui-text">KEY BINDS</h1>
        <button 
          className="menu-button menu-button-secondary menu-button-small ui-text"
          onClick={() => setCurrentView('main')}
        >
          <span className="button-content">
            <span className="button-icon">←</span>
            <span className="button-text">BACK</span>
          </span>
        </button>
      </div>
      
      <div className="keybind-boxes">
        <div 
          className={`keybind-box ${selectedBind === 'turnLeft' ? 'keybind-selected' : ''}`}
          onClick={() => setSelectedBind('turnLeft')}
        >
          <div className="keybind-label ui-text">TURN LEFT</div>
          <div className="keybind-keys">
            {keyBinds.turnLeft.map((key, index) => (
              <div key={index} className="keybind-key ui-text">
                {key.toUpperCase()}
              </div>
            ))}
          </div>
          {selectedBind === 'turnLeft' && (
            <div className="keybind-prompt ui-text">Press a key to bind or remove...</div>
          )}
        </div>
        
        <div 
          className={`keybind-box ${selectedBind === 'turnRight' ? 'keybind-selected' : ''}`}
          onClick={() => setSelectedBind('turnRight')}
        >
          <div className="keybind-label ui-text">TURN RIGHT</div>
          <div className="keybind-keys">
            {keyBinds.turnRight.map((key, index) => (
              <div key={index} className="keybind-key ui-text">
                {key.toUpperCase()}
              </div>
            ))}
          </div>
          {selectedBind === 'turnRight' && (
            <div className="keybind-prompt ui-text">Press a key to bind or remove...</div>
          )}
        </div>
        
        <div 
          className={`keybind-box ${selectedBind === 'brake' ? 'keybind-selected' : ''}`}
          onClick={() => setSelectedBind('brake')}
        >
          <div className="keybind-label ui-text">BRAKE</div>
          <div className="keybind-keys">
            {keyBinds.brake.map((key, index) => (
              <div key={index} className="keybind-key ui-text">
                {key === 'space' ? 'SPACE' : key.toUpperCase()}
              </div>
            ))}
          </div>
          {selectedBind === 'brake' && (
            <div className="keybind-prompt ui-text">Press a key to bind or remove...</div>
          )}
        </div>
      </div>
      
      <div className="keybind-instructions ui-text">
        <p>Click a box to select it, then press a key to bind or remove it</p>
        <p>Press ESC to cancel selection</p>
      </div>
    </div>
  );

  const renderVisuals = () => (
    <div className="settings-content">
      <div className="settings-header">
        <h1 className="settings-title ui-text">VISUALS</h1>
        <button 
          className="menu-button menu-button-secondary menu-button-small ui-text"
          onClick={() => setCurrentView('main')}
        >
          <span className="button-content">
            <span className="button-icon">←</span>
            <span className="button-text">BACK</span>
          </span>
        </button>
      </div>
      
      <div className="coming-soon-message">
        <h2 className="ui-text">Visual settings coming soon!</h2>
        <p className="ui-text">Trail colors, UI themes, and more...</p>
      </div>
    </div>
  );

  return (
    <div className={`settings-container ${isInGame ? 'in-game-overlay' : ''}`}>
      {/* Same grid background */}
      <div className="grid-background">
        <div className="grid-lines-horizontal"></div>
        <div className="grid-lines-vertical"></div>
        <div className="grid-glow"></div>
      </div>
      
      {currentView === 'main' && renderMainSettings()}
      {currentView === 'binds' && renderKeyBinds()}
      {currentView === 'visuals' && renderVisuals()}
    </div>
  );
};

export default Settings;
