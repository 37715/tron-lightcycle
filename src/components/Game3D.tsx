import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GameEngine } from '../engine/gameEngine';
import { DEFAULT_CONFIG } from '../engine/config';
import { GameState } from '../engine/types';
import { BikeRenderer } from '../renderer/BikeRenderer';
import { TrailRenderer } from '../renderer/TrailRenderer';
import { ArenaRenderer } from '../renderer/ArenaRenderer';
import { CameraController } from '../renderer/CameraController';
import { DebugRenderer } from '../renderer/DebugRenderer';

interface Game3DProps {
  onSettings?: () => void;
  onGameOver?: () => void;
  onResume?: () => void;
  shouldResume?: boolean;
  isPaused?: boolean;
  visualSettings?: {
    fov: number;
    showGrid: boolean;
    cameraTurnSpeed: number;
  };
}

const Game3D: React.FC<Game3DProps> = ({
  onSettings,
  onGameOver,
  onResume,
  shouldResume,
  isPaused = false,
  visualSettings = { fov: 75, showGrid: true, cameraTurnSpeed: 0.5 }
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const animationIdRef = useRef<number>();
  
  // Game engine and renderers
  const gameEngineRef = useRef<GameEngine>();
  const bikeRendererRef = useRef<BikeRenderer>();
  const trailRendererRef = useRef<TrailRenderer>();
  const arenaRendererRef = useRef<ArenaRenderer>();
  const cameraControllerRef = useRef<CameraController>();
  const debugRendererRef = useRef<DebugRenderer>();
  
  const [gameState, setGameState] = useState<GameState>('playing'); // Start directly in playing state
  const [bikeHealth, setBikeHealth] = useState(100);
  const [brakeEnergy, setBrakeEnergy] = useState(100);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Refs for mutable values accessed in animation loop
  const gameStateRef = useRef<GameState>(gameState);
  const isPausedRef = useRef<boolean>(isPaused);
  const countdownRef = useRef<number | null>(countdown);
  const onGameOverRef = useRef<typeof onGameOver>(onGameOver);
  
  // Frame rate limiting for better performance
  const lastFrameTimeRef = useRef<number>(0);
  const targetFPS = 60;
  const frameInterval = 1000 / targetFPS;

  // Sync refs when corresponding state/props change
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { countdownRef.current = countdown; }, [countdown]);
  useEffect(() => { onGameOverRef.current = onGameOver; }, [onGameOver]);

  // Only create initScene once on mount
  const initScene = useCallback(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0a0a, 40, 180);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      visualSettings.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 8, 10);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0xf0f0f0);
    renderer.shadowMap.enabled = false;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    // Load customization
    let custom = { bikeColor: 0x00ffff, trailColor: 0x00ffff } as { bikeColor: number; trailColor: number };
    try {
      const raw = localStorage.getItem('cathexis-customization');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.bikeColor) custom.bikeColor = Number(parsed.bikeColor.replace('#','0x'));
        if (parsed.trailColor) custom.trailColor = Number(parsed.trailColor.replace('#','0x'));
      }
    } catch {}

    // Initialize game systems
    gameEngineRef.current = new GameEngine(DEFAULT_CONFIG);
    bikeRendererRef.current = new BikeRenderer(scene, custom.bikeColor);
    trailRendererRef.current = new TrailRenderer(scene, DEFAULT_CONFIG, custom.trailColor);
    arenaRendererRef.current = new ArenaRenderer(scene, DEFAULT_CONFIG);
    cameraControllerRef.current = new CameraController(camera);
    debugRendererRef.current = new DebugRenderer(scene);

    cameraControllerRef.current.setTurnSpeed(visualSettings.cameraTurnSpeed);
    arenaRendererRef.current.setGridVisible(visualSettings.showGrid);
  }, []); // <-- Remove visualSettings from dependency array

  // Stable animation loop with frame rate limiting
  const animate = useCallback((currentTime: number) => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    if (!gameEngineRef.current || !bikeRendererRef.current || !trailRendererRef.current ||
        !arenaRendererRef.current || !cameraControllerRef.current) return;

    // Frame rate limiting
    const deltaTime = currentTime - lastFrameTimeRef.current;
    if (deltaTime < frameInterval) {
      animationIdRef.current = requestAnimationFrame(animate);
      return;
    }
    lastFrameTimeRef.current = currentTime;

    // Only update game when playing and not paused / counting down
    if (gameStateRef.current === 'playing' && !isPausedRef.current && countdownRef.current === null) {
      const { newHealth } = gameEngineRef.current.update();
      if (newHealth <= 0) {
        onGameOverRef.current?.();
      }

      // Health sync (respect runtime max health)
      const maxH = gameEngineRef.current.getBikeState().maxHealth;
      const actualHealth = Math.max(0, Math.min(maxH, newHealth));
      const healthPercentage = (actualHealth / maxH) * 100;
      // Lower threshold so small zone damage steps are reflected immediately
      setBikeHealth(prev => (Math.abs(prev - healthPercentage) > 0.01 ? healthPercentage : prev));

      // Brake energy sync – always set
      setBrakeEnergy(gameEngineRef.current.getBikeState().brakeEnergy);

      // Update visual components
      const bikeState = gameEngineRef.current.getBikeState();
      const arena = gameEngineRef.current.getArena();
      const cameraController = cameraControllerRef.current;
      cameraController.update(bikeState.position, bikeState.rotation);

      bikeRendererRef.current.updatePosition(
        cameraController.getVisualPosition(),
        cameraController.getVisualRotation()
      );

      // Handle trail updates in the correct order: remove first, then add, then update
      // 1. Remove old segments first
      const pendingRemovals = gameEngineRef.current.getSegmentsToRemove();
      if (pendingRemovals > 0) {
        const availableSegments = trailRendererRef.current?.getTrailMeshCount() || 0;
        const removals = Math.min(pendingRemovals, availableSegments);
        
        for (let i = 0; i < removals; i++) {
          trailRendererRef.current?.removeOldestTrailSegment();
        }
      }

      // 2. Add new segments
      const newSegments = gameEngineRef.current.getNewTrailSegments();
      newSegments.forEach(segment => {
        trailRendererRef.current?.createTrailSegment(segment.start, segment.end);
      });

      // 3. Update trail geometry last
      trailRendererRef.current?.updateTrailGeometry();

      const isOutsideRing = arena.isPositionOutsideRing(bikeState.position);
      arenaRendererRef.current.updateRings(
        arena.getRingScale(),
        gameEngineRef.current.getFrameCount(),
        isOutsideRing
      );
      
      // Update debug rendering
      if (debugRendererRef.current) {
        const debugState = gameEngineRef.current.getDebugState();
        debugRendererRef.current.setVisible(debugState.enabled);
        
        if (debugState.enabled) {
          // Update collision box for the bike
          const collisionBox = gameEngineRef.current.getDebugCollisionBox();
          if (collisionBox.length > 0) {
            debugRendererRef.current.updateCollisionBox('player', collisionBox, '#00ff00');
          }
          
          // Update grind zone
          const grindZone = gameEngineRef.current.getDebugGrindZone();
          debugRendererRef.current.updateGrindZone('player', grindZone);
          
          // Update wall segments
          const wallSegments = gameEngineRef.current.getNearbyWallSegments();
          debugRendererRef.current.updateWallSegments(wallSegments);
          
          // Update text overlay
          const debugText = gameEngineRef.current.getDebugTextInfo();
          debugRendererRef.current.updateTextOverlay(debugText);
        }
      }
    }

    rendererRef.current.render(sceneRef.current, cameraRef.current);
    animationIdRef.current = requestAnimationFrame(animate);
  }, []); // empty deps => stable

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!gameEngineRef.current) return;

    const key = event.key.toLowerCase();

    // Dynamic read of keybinds each press (from localStorage)
    let keyBinds = {
      turnLeft: ['z', 'arrowleft'],
      turnRight: ['x', 'arrowright'],
      brake: ['space']
    };
    try {
      const saved = localStorage.getItem('cathexis-keybinds');
      if (saved) {
        const parsed = JSON.parse(saved);
        keyBinds = {
          turnLeft: parsed.turnLeft || ['z', 'arrowleft'],
          turnRight: parsed.turnRight || ['x', 'arrowright'],
          brake: parsed.brake || ['space']
        };
      }
    } catch {/* ignore */}

    // Debug shortcuts
    if (key === 'd' && event.shiftKey) {
      // Shift+D: Toggle debug mode
      const currentDebugState = gameEngineRef.current.getDebugState();
      gameEngineRef.current.setDebugEnabled(!currentDebugState.enabled);
      event.preventDefault();
      return;
    } else if (key === 'd' && !event.shiftKey && gameEngineRef.current.getDebugState().enabled) {
      // D: Dump debug info
      gameEngineRef.current.dumpDebugInfo();
      event.preventDefault();
      return;
    } else if (key === 'g' && gameEngineRef.current.getDebugState().enabled) {
      // G: Toggle step-by-step mode and step frame
      if (gameEngineRef.current.getDebugState().stepByStep) {
        gameEngineRef.current.stepFrame();
      } else {
        gameEngineRef.current.toggleDebugFeature('stepByStep');
        gameEngineRef.current.pauseGame();
      }
      event.preventDefault();
      return;
    }

    if (key === 'escape' && onSettings) {
      onSettings();
      event.preventDefault();
    } else if (keyBinds.turnLeft.includes(key) && !isPausedRef.current && countdownRef.current === null) {
      gameEngineRef.current.queueTurn('left');
      event.preventDefault();
    } else if (keyBinds.turnRight.includes(key) && !isPausedRef.current && countdownRef.current === null) {
      gameEngineRef.current.queueTurn('right');
      event.preventDefault();
    } else if (keyBinds.brake.includes(key === ' ' ? 'space' : key) && !isPausedRef.current && countdownRef.current === null) {
      gameEngineRef.current.setBraking(true);
      event.preventDefault();
    }
  }, []);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    if (!gameEngineRef.current) return;
    const key = event.key.toLowerCase();

    let keyBinds = {
      turnLeft: ['z', 'arrowleft'],
      turnRight: ['x', 'arrowright'],
      brake: ['space']
    };
    try {
      const saved = localStorage.getItem('cathexis-keybinds');
      if (saved) {
        const parsed = JSON.parse(saved);
        keyBinds = {
          turnLeft: parsed.turnLeft || ['z', 'arrowleft'],
          turnRight: parsed.turnRight || ['x', 'arrowright'],
          brake: parsed.brake || ['space']
        };
      }
    } catch {/* ignore */}

    if (keyBinds.brake.includes(key === ' ' ? 'space' : key)) {
      gameEngineRef.current.setBraking(false);
      event.preventDefault();
    }
  }, []);

  const resumeGame = useCallback(() => {
    if (onResume) {
      onResume();
    }
  }, [onResume]);

  const handleResize = useCallback(() => {
    if (!cameraRef.current || !rendererRef.current) return;

    cameraRef.current.aspect = window.innerWidth / window.innerHeight;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(window.innerWidth, window.innerHeight);
  }, []);

  // Init + listeners effect (runs once)
  useEffect(() => {
    initScene();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('resize', handleResize);

    const currentMount = mountRef.current;

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      if (rendererRef.current && currentMount && currentMount.contains(rendererRef.current.domElement)) {
        currentMount.removeChild(rendererRef.current.domElement);
      }
      trailRendererRef.current?.dispose();
      debugRendererRef.current?.cleanup();
      rendererRef.current?.dispose();
    };
  }, []); // <-- empty dependencies so initScene runs ONCE

  // Kick off animation loop once on mount
  useEffect(() => {
    animationIdRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
    };
  }, [animate]);

  // Handle resume from parent
  useEffect(() => {
    if (shouldResume) {
      resumeGame();
    }
  }, [shouldResume, resumeGame]);

  // Update camera FOV when visual settings change
  useEffect(() => {
    if (cameraRef.current && visualSettings) {
      cameraRef.current.fov = visualSettings.fov;
      cameraRef.current.updateProjectionMatrix();
    }
  }, [visualSettings]);

  // Update grid visibility when visual settings change
  useEffect(() => {
    if (arenaRendererRef.current && visualSettings) {
      arenaRendererRef.current.setGridVisible(visualSettings.showGrid);
    }
  }, [visualSettings]);

  // Update camera turn speed when visual settings change
  useEffect(() => {
    if (cameraControllerRef.current && visualSettings) {
      cameraControllerRef.current.setTurnSpeed(visualSettings.cameraTurnSpeed);
    }
  }, [visualSettings]);

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <div ref={mountRef} className="w-full h-full" />
      
      {/* UI Overlay */}
      <div className="absolute top-4 left-4 text-white z-10">
        <h1 className="text-2xl text-blue-400 mb-2 main-title">cathexis</h1>
        <div className="text-sm text-gray-300 ui-text-descriptive">
          <p>Z/← Turn Left | X/→ Turn Right | Space Brake</p>
          <p>Avoid walls and your own trail!</p>
          <p className="text-xs opacity-50 mt-1">Press ESC to open menu</p>
          {gameEngineRef.current?.getBikeState().isBraking && (
            <p className="text-yellow-400 font-bold">�� BRAKING ACTIVE</p>
          )}
          {gameState === 'playing' && gameEngineRef.current && trailRendererRef.current && (
            <div className="mt-2 text-xs opacity-60 ui-text-tech">
              <p>Trail Points: {gameEngineRef.current.getTrailLength()}</p>
              <p>Rendered Segments: {trailRendererRef.current?.getTrailMeshCount() || 0}</p>
              <p>Trail Age: {Math.floor(gameEngineRef.current.getActiveTrailFrameSpan() / 60)}s</p>
              {gameEngineRef.current.getBikeState().graceFramesRemaining > 0 && (
                <p className="text-yellow-400 font-bold">
                  GRACE: {Math.ceil(gameEngineRef.current.getBikeState().graceFramesRemaining / 60 * 1000)}ms
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Health Bar and Brake Meter */}
      {gameState === 'playing' && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10">
          {/* Brake Meter */}
          <div className="brake-meter-container">
            <div
              className={`brake-meter-fill brake-meter-width ${
                brakeEnergy <= 0 ? 'brake-depleted' :
                (gameEngineRef.current?.getBikeState().brakeRechargeDelay || 0) > 0 ? 'brake-recharging' : 'brake-available'
              }`}
               style={{ width: `${Math.max(brakeEnergy, 0)}%` }}
             />
          </div>
          <div className="brake-meter-text text-center">
            BRAKE
          </div>
          
          {/* Health Bar */}
          <div className="health-bar-container">
            <div
              className={`health-bar-fill health-bar-width ${
                (gameEngineRef.current && gameEngineRef.current.getBikeState().graceFramesRemaining > 0) ? 'health-grace' :
                bikeHealth > 60 ? 'health-high' : 
                bikeHealth > 30 ? 'health-medium' : 
                bikeHealth > 15 ? 'health-low' : 'health-critical'
              }`}
              style={{ '--health-width': `${Math.max(bikeHealth, 0)}%` } as React.CSSProperties}
            />
          </div>
          <div className="health-bar-text text-center">
            {(gameEngineRef.current && gameEngineRef.current.getBikeState().graceFramesRemaining > 0) ? (
              <>GRACE PERIOD</>
            ) : (
              <>HEALTH</>
            )}
          </div>
        </div>
      )}

      {/* Countdown Display */}
      {countdown !== null && (
        <div className="absolute inset-0 flex items-center justify-center z-30">
          <div className="countdown-display">
            <div className={`countdown-number countdown-${countdown}`}>
              {countdown}
            </div>
          </div>
        </div>
      )}

      {/* Performance indicator */}
      <div className="absolute bottom-4 right-4 text-xs text-gray-500 z-10">
        <p>Instanced Rendering • Esports Optimized</p>
        <p>Trail: {trailRendererRef.current?.getTrailMeshCount() || 0} segments • 60+ FPS</p>
      </div>
    </div>
  );
};

export default Game3D;