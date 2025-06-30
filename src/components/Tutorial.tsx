import React from 'react';

interface TutorialProps {
  onBack: () => void;
}

const Tutorial: React.FC<TutorialProps> = ({ onBack }) => {
  return (
    <div className="tutorial-container">
      {/* Same grid background */}
      <div className="grid-background">
        <div className="grid-lines-horizontal"></div>
        <div className="grid-lines-vertical"></div>
        <div className="grid-glow"></div>
      </div>
      
      <div className="tutorial-content">
        <div className="tutorial-header">
          <h1 className="tutorial-title ui-text">TUTORIAL</h1>
          <button 
            className="menu-button menu-button-secondary ui-text"
            onClick={onBack}
            style={{ width: '120px', height: '50px' }}
          >
            <span className="button-content">
              <span className="button-icon">←</span>
              <span className="button-text">BACK</span>
            </span>
          </button>
        </div>
        
        <div className="tutorial-sections">
          <div className="tutorial-section">
            <h2 className="section-title ui-text">CONTROLS</h2>
            <div className="control-grid">
              <div className="control-item">
                <div className="key-display ui-text">Z</div>
                <div className="key-display ui-text">←</div>
                <span className="control-desc ui-text">Turn Left</span>
              </div>
              <div className="control-item">
                <div className="key-display ui-text">X</div>
                <div className="key-display ui-text">→</div>
                <span className="control-desc ui-text">Turn Right</span>
              </div>
            </div>
          </div>
          
          <div className="tutorial-section">
            <h2 className="section-title ui-text">OBJECTIVE</h2>
            <div className="objective-list">
              <div className="objective-item ui-text">
                <span className="objective-icon">🎯</span>
                Avoid crashing into walls and your own trail
              </div>
              <div className="objective-item ui-text">
                <span className="objective-icon">⚡</span>
                Stay inside the shrinking zone to avoid damage
              </div>
              <div className="objective-item ui-text">
                <span className="objective-icon">🏃</span>
                Survive as long as possible while creating complex patterns
              </div>
            </div>
          </div>
          
          <div className="tutorial-section">
            <h2 className="section-title ui-text">MECHANICS</h2>
            <div className="mechanics-grid">
              <div className="mechanic-item">
                <h3 className="mechanic-title ui-text">HEALTH SYSTEM</h3>
                <p className="mechanic-desc ui-text">
                  Your health decreases when hitting walls or staying outside the zone. 
                  Health regenerates when you're safe.
                </p>
              </div>
              <div className="mechanic-item">
                <h3 className="mechanic-title ui-text">GRACE PERIOD</h3>
                <p className="mechanic-desc ui-text">
                  When health reaches 0%, you get a brief grace period to escape danger.
                  Don't rely on it too much!
                </p>
              </div>
              <div className="mechanic-item">
                <h3 className="mechanic-title ui-text">TRAIL SYSTEM</h3>
                <p className="mechanic-desc ui-text">
                  Your trail disappears after 2 minutes. Use this to create complex mazes
                  and escape routes.
                </p>
              </div>
              <div className="mechanic-item">
                <h3 className="mechanic-title ui-text">SHRINKING ZONE</h3>
                <p className="mechanic-desc ui-text">
                  The playable area shrinks over time. Stay inside the glowing rings
                  to avoid taking damage.
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="tutorial-footer">
          <button 
            className="menu-button menu-button-primary ui-text"
            onClick={onBack}
          >
            <span className="button-content">
              <span className="button-icon">✓</span>
              <span className="button-text">GOT IT</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Tutorial;
