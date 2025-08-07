import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { MultiplayerGameEngine } from '../engine/MultiplayerGameEngine';
import { DEFAULT_CONFIG } from '../engine/config';
import { GameState, GameConfig } from '../engine/types';
import { BikeRenderer } from '../renderer/BikeRenderer';
import { TrailRenderer } from '../renderer/TrailRenderer';
import { ArenaRenderer } from '../renderer/ArenaRenderer';
import { CameraController } from '../renderer/CameraController';
import { DebugRenderer } from '../renderer/DebugRenderer';

// Extended bike renderer with color support
class ColoredBikeRenderer extends BikeRenderer {
  constructor(scene: THREE.Scene, color: number = 0x00ffff) {
    super(scene);
    // Override the bike color
    const bikeGroup = this.getBikeGroup();
    bikeGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        if (child.geometry instanceof THREE.BoxGeometry) {
          // Main body color
          child.material = child.material.clone();
          child.material.color = new THREE.Color(color);
          child.material.emissive = new THREE.Color(color);
          child.material.emissiveIntensity = 0.6; // Brighter emissive for bot-like appearance
        }
      }
    });
  }
}

// Color support is now built into TrailRenderer, no need for separate class

interface PracticeGame3DProps {
  onSettings?: () => void;
  onGameOver?: (winner: 'player' | 'ai') => void;
  onResume?: () => void;
  shouldResume?: boolean;
  isPaused?: boolean;
  visualSettings?: {
    fov: number;
    showGrid: boolean;
    cameraTurnSpeed: number;
  };
}

const PracticeGame3D: React.FC<PracticeGame3DProps> = ({
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
  const gameEngineRef = useRef<MultiplayerGameEngine>();
  const bikeRenderersRef = useRef<Map<string, BikeRenderer>>(new Map());
  const trailRenderersRef = useRef<Map<string, TrailRenderer>>(new Map());
  const arenaRendererRef = useRef<ArenaRenderer>();
  const cameraControllerRef = useRef<CameraController>();
  const debugRendererRef = useRef<DebugRenderer>();
  
  const [gameState, setGameState] = useState<GameState>('playing');
  const [playerHealth, setPlayerHealth] = useState(100);
  const [aiHealth, setAIHealth] = useState(100);
  const [brakeEnergy, setBrakeEnergy] = useState(100);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Refs for mutable values
  const gameStateRef = useRef<GameState>(gameState);
  const isPausedRef = useRef<boolean>(isPaused);
  const countdownRef = useRef<number | null>(countdown);
  const onGameOverRef = useRef<typeof onGameOver>(onGameOver);

  // Sync refs
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

     // Initialize multiplayer game engine
     gameEngineRef.current = new MultiplayerGameEngine(DEFAULT_CONFIG);
     
     // Add player and AI bikes
     gameEngineRef.current.addPlayerBike('player');
     gameEngineRef.current.addAIBike('ai');

     // Create renderers for each bike
     const playerBikeRenderer = new BikeRenderer(scene); // Default player bike (no color change)
     const aiBikeRenderer = new ColoredBikeRenderer(scene, 0xff3030); // Bright red for AI
     bikeRenderersRef.current.set('player', playerBikeRenderer);
     bikeRenderersRef.current.set('ai', aiBikeRenderer);

     const playerTrailRenderer = new TrailRenderer(scene, DEFAULT_CONFIG, 0x00ffff); // Blue trail
     const aiTrailRenderer = new TrailRenderer(scene, DEFAULT_CONFIG, 0xff3030); // Bright red trails
     trailRenderersRef.current.set('player', playerTrailRenderer);
     trailRenderersRef.current.set('ai', aiTrailRenderer);

     arenaRendererRef.current = new ArenaRenderer(scene, DEFAULT_CONFIG);
     cameraControllerRef.current = new CameraController(camera);
     debugRendererRef.current = new DebugRenderer(scene);

     cameraControllerRef.current.setTurnSpeed(visualSettings.cameraTurnSpeed);
     arenaRendererRef.current.setGridVisible(visualSettings.showGrid);
  }, []); // <-- Remove visualSettings from dependency array

  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    if (!gameEngineRef.current || !arenaRendererRef.current || !cameraControllerRef.current) return;

    // Only update game when playing and not paused
    if (gameStateRef.current === 'playing' && !isPausedRef.current && countdownRef.current === null) {
      const healthUpdates = gameEngineRef.current.update();
      // Debug: log zone state for player on spawn to diagnose no-damage issue
      const arena = gameEngineRef.current.getArena();
      const playerStateDbg = gameEngineRef.current.getBikeState('player');
      if (playerStateDbg) {
        const dist = Math.hypot(playerStateDbg.position.x, playerStateDbg.position.z).toFixed(2);
        const ring = arena.getCurrentRingRadius().toFixed(2);
        const outside = arena.isPositionOutsideRing(playerStateDbg.position);
        if (gameEngineRef.current.getFrameCount() % 60 === 0) {
          console.log(`MP 🔵 ZONE CHECK: dist=${dist}, ring=${ring}, outside=${outside}`);
        }
      }
      
      const playerBike = gameEngineRef.current.getBikeState('player');
      const aiBike = gameEngineRef.current.getBikeState('ai');
      
      // Update health displays
      healthUpdates.forEach((update, bikeId) => {
        const maxH = gameEngineRef.current!.getBikeState(bikeId)?.maxHealth ?? DEFAULT_CONFIG.maxHealth ?? 100;
        const actualHealth = Math.max(0, Math.min(maxH, update.newHealth));
        const healthPercentage = (actualHealth / maxH) * 100;
        
        if (bikeId === 'player') {
          setPlayerHealth(prev => (Math.abs(prev - healthPercentage) > 0.01 ? healthPercentage : prev));
          const playerState = gameEngineRef.current!.getBikeState('player');
          setBrakeEnergy(playerState?.brakeEnergy || 0);
        } else if (bikeId === 'ai') {
          setAIHealth(prev => (Math.abs(prev - healthPercentage) > 0.01 ? healthPercentage : prev));
        }
      });

      // Update visual components for each bike
      gameEngineRef.current!.getAllBikes().forEach((bikeData, bikeId) => {
        const bikeRenderer = bikeRenderersRef.current.get(bikeId);
        const trailRenderer = trailRenderersRef.current.get(bikeId);
        
        if (bikeRenderer && trailRenderer) {
          // Update bike position
          if (bikeId === 'player' && playerBike) {
            // Camera follows player
            const cameraController = cameraControllerRef.current!;
            cameraController.update(bikeData.state.position, bikeData.state.rotation);
            bikeRenderer.updatePosition(
              cameraController.getVisualPosition(),
              cameraController.getVisualRotation()
            );
          } else {
            // AI bike just updates position
            bikeRenderer.updatePosition(bikeData.state.position, bikeData.state.rotation);
          }

          // Update trail
          trailRenderer.updateTrailGeometry();

          // Handle new segments
          gameEngineRef.current!.getNewTrailSegments(bikeId).forEach(segment => {
            trailRenderer.createTrailSegment(segment.start, segment.end);
          });

          // Remove old segments
          const removals = gameEngineRef.current!.getSegmentsToRemove(bikeId);
          const available = trailRenderer.getTrailMeshCount();
          const toRemove = Math.min(removals, available);
          for (let i = 0; i < toRemove; i++) {
            trailRenderer.removeOldestTrailSegment();
          }
        }
      });

      // Update arena
      const playerState = gameEngineRef.current.getBikeState('player');
      const isOutsideRing = playerState ? arena.isPositionOutsideRing(playerState.position) : false;
      
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
          // Update collision boxes for all bikes
          for (const [bikeId] of bikeRenderersRef.current) {
            const collisionBox = gameEngineRef.current.getDebugCollisionBox(bikeId);
            if (collisionBox.length > 0) {
              const color = bikeId === 'player' ? '#00ff00' : '#ff8000';
              debugRendererRef.current.updateCollisionBox(bikeId, collisionBox, color);
            }
            
            const grindZone = gameEngineRef.current.getDebugGrindZone(bikeId);
            debugRendererRef.current.updateGrindZone(bikeId, grindZone);
          }
          
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
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!gameEngineRef.current) return;

    const key = event.key.toLowerCase();

    // Get keybinds
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
      gameEngineRef.current.queueTurn('player', 'left');
      event.preventDefault();
    } else if (keyBinds.turnRight.includes(key) && !isPausedRef.current && countdownRef.current === null) {
      gameEngineRef.current.queueTurn('player', 'right');
      event.preventDefault();
    } else if (keyBinds.brake.includes(key === ' ' ? 'space' : key) && !isPausedRef.current && countdownRef.current === null) {
      gameEngineRef.current.setBraking('player', true);
      event.preventDefault();
    }
  }, [onSettings]);

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
      gameEngineRef.current.setBraking('player', false);
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
      trailRenderersRef.current.forEach(renderer => renderer.dispose());
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

  // Update visual settings - only update properties, don't reinitialize
  useEffect(() => {
    if (cameraRef.current && visualSettings) {
      cameraRef.current.fov = visualSettings.fov;
      cameraRef.current.updateProjectionMatrix();
    }
  }, [visualSettings]);

  useEffect(() => {
    if (arenaRendererRef.current && visualSettings) {
      arenaRendererRef.current.setGridVisible(visualSettings.showGrid);
    }
  }, [visualSettings]);

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
      </div>

      {/* Health Bars */}
      {gameState === 'playing' && (
        <>
          {/* Player Health Bar */}
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10">
            <div className="brake-meter-container">
              <div
                className={`brake-meter-fill brake-meter-width ${
                  brakeEnergy <= 0 ? 'brake-depleted' :
                  (gameEngineRef.current?.getBikeState('player')?.brakeRechargeDelay || 0) > 0 ? 'brake-recharging' : 'brake-available'
                }`}
                style={{ width: `${Math.max(brakeEnergy, 0)}%` }}
              />
            </div>
            <div className="brake-meter-text text-center">BRAKE</div>
            
            <div className="health-bar-container">
              <div
                className={`health-bar-fill health-bar-width ${
                  playerHealth > 60 ? 'health-high' : 
                  playerHealth > 30 ? 'health-medium' : 
                  playerHealth > 15 ? 'health-low' : 'health-critical'
                }`}
                style={{ '--health-width': `${Math.max(playerHealth, 0)}%` } as React.CSSProperties}
              />
            </div>
            <div className="health-bar-text text-center">HEALTH</div>
          </div>
        </>
      )}

      {/* Performance indicator */}
      <div className="absolute bottom-4 right-4 text-xs text-gray-500 z-10">
        <p>Practice Mode • AI Opponent</p>
      </div>
    </div>
  );
};

export default PracticeGame3D; 