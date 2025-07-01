import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GameEngine } from '../engine/gameEngine';
import { DEFAULT_CONFIG } from '../engine/config';
import { GameState } from '../engine/types';
import { BikeRenderer } from '../renderer/BikeRenderer';
import { TrailRenderer } from '../renderer/TrailRenderer';
import { ArenaRenderer } from '../renderer/ArenaRenderer';
import { CameraController } from '../renderer/CameraController';

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
  
  const [gameState, setGameState] = useState<GameState>('playing'); // Start directly in playing state
  const [bikeHealth, setBikeHealth] = useState(100);
  const [brakeEnergy, setBrakeEnergy] = useState(100);
  const [countdown, setCountdown] = useState<number | null>(null);

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

    // Initialize game systems
    gameEngineRef.current = new GameEngine(DEFAULT_CONFIG);
    bikeRendererRef.current = new BikeRenderer(scene);
    trailRendererRef.current = new TrailRenderer(scene, DEFAULT_CONFIG);
    arenaRendererRef.current = new ArenaRenderer(scene, DEFAULT_CONFIG);
    cameraControllerRef.current = new CameraController(camera);
    
    // Set initial visual settings
    arenaRendererRef.current.setGridVisible(visualSettings.showGrid);
    cameraControllerRef.current.setTurnSpeed(visualSettings.cameraTurnSpeed);
  }, [visualSettings]);

  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    if (!gameEngineRef.current || !bikeRendererRef.current || !trailRendererRef.current || 
        !arenaRendererRef.current || !cameraControllerRef.current) return;

    // Use prop isPaused instead of local state
    if (gameState === 'playing' && !isPaused && countdown === null) {
      const { newHealth } = gameEngineRef.current.update();
      if (newHealth <= 0) {
        onGameOver?.();
      }
      
      // Always sync health bar to actual health (fix synchronization)
      const actualHealth = Math.max(0, Math.min(156, newHealth));
      const healthPercentage = (actualHealth / 156) * 100;
      if (Math.abs(bikeHealth - healthPercentage) > 0.1) {
        setBikeHealth(healthPercentage);
      }
      
      // Also sync brake energy - update more frequently for smooth UI
      const actualBrakeEnergy = gameEngineRef.current.getBikeState().brakeEnergy;
      if (Math.abs(brakeEnergy - actualBrakeEnergy) > 0.05) {
        setBrakeEnergy(actualBrakeEnergy);
      }

      const bikeState = gameEngineRef.current.getBikeState();
      const arena = gameEngineRef.current.getArena();

      // Update visual components
      const cameraController = cameraControllerRef.current;
      cameraController.update(bikeState.position, bikeState.rotation);
      
      bikeRendererRef.current.updatePosition(
        cameraController.getVisualPosition(),
        cameraController.getVisualRotation()
      );

      // Trail rendering is now optimized with instanced mesh
      trailRendererRef.current.updateTrailGeometry();

      // Handle new trail segments efficiently
      const newSegments = gameEngineRef.current.getNewTrailSegments();
      if (newSegments.length > 0) {
        console.log(`Game3D: Adding ${newSegments.length} new trail segments`);
      }
      newSegments.forEach(segment => {
        if (trailRendererRef.current) {
          trailRendererRef.current.createTrailSegment(segment.start, segment.end);
        }
      });

      // Remove old trail segments efficiently
      const segmentsToRemove = gameEngineRef.current.getSegmentsToRemove();
      if (segmentsToRemove > 0) {
        console.log(`Game3D: Removing ${segmentsToRemove} trail segments`);
      }
      for (let i = 0; i < segmentsToRemove; i++) {
        if (trailRendererRef.current) {
          trailRendererRef.current.removeOldestTrailSegment();
        }
      }

      // Ring updates are now optimized to run every 4 frames
      const isOutsideRing = arena.isPositionOutsideRing(bikeState.position);
      arenaRendererRef.current.updateRings(
        arena.getRingScale(),
        gameEngineRef.current.getFrameCount(),
        isOutsideRing
      );

      // Check if bike died
      if (!bikeState.alive && gameState === 'playing') {
        setGameState('gameOver');
        if (onGameOver) {
          onGameOver();
        }
      }
    }

    rendererRef.current.render(sceneRef.current, cameraRef.current);
    animationIdRef.current = requestAnimationFrame(animate);
  }, [gameState, bikeHealth, brakeEnergy, isPaused, countdown, onGameOver]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!gameEngineRef.current) return;
    
    const key = event.key.toLowerCase();
    console.log('Key pressed:', key, 'code:', event.code); // Debug all key presses
    
    // Load keybinds from localStorage
    let keyBinds = {
      turnLeft: ['z', 'arrowleft'],
      turnRight: ['x', 'arrowright'],
      brake: ['space']
    };
    
    try {
      const saved = localStorage.getItem('hypoxia-keybinds');
      if (saved) {
        const parsedBinds = JSON.parse(saved);
        // Ensure brake property exists (for backward compatibility)
        keyBinds = {
          turnLeft: parsedBinds.turnLeft || ['z', 'arrowleft'],
          turnRight: parsedBinds.turnRight || ['x', 'arrowright'],
          brake: parsedBinds.brake || ['space']
        };
      }
    } catch {
      // Use defaults
    }
    
    if (key === 'escape' && onSettings) {
      // Instead of setting local isPaused, just call onSettings
      onSettings();
      event.preventDefault();
    } else if (keyBinds.turnLeft.includes(key) && !isPaused && countdown === null) {
      gameEngineRef.current.queueTurn('left');
      event.preventDefault();
    } else if (keyBinds.turnRight.includes(key) && !isPaused && countdown === null) {
      gameEngineRef.current.queueTurn('right');
      event.preventDefault();
    } else if (keyBinds.brake.includes(key === ' ' ? 'space' : key) && !isPaused && countdown === null) {
      console.log('Brake key pressed:', key, 'mapped to:', key === ' ' ? 'space' : key, 'Brake binds:', keyBinds.brake, 'Current brake energy:', gameEngineRef.current?.getBikeState().brakeEnergy);
      gameEngineRef.current.setBraking(true);
      event.preventDefault();
    }
  }, [onSettings, isPaused, countdown]);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    if (!gameEngineRef.current) return;
    
    const key = event.key.toLowerCase();
    
    // Load keybinds from localStorage
    let keyBinds = {
      turnLeft: ['z', 'arrowleft'],
      turnRight: ['x', 'arrowright'],
      brake: ['space']
    };
    
    try {
      const saved = localStorage.getItem('hypoxia-keybinds');
      if (saved) {
        const parsedBinds = JSON.parse(saved);
        // Ensure brake property exists (for backward compatibility)
        keyBinds = {
          turnLeft: parsedBinds.turnLeft || ['z', 'arrowleft'],
          turnRight: parsedBinds.turnRight || ['x', 'arrowright'],
          brake: parsedBinds.brake || ['space']
        };
      }
    } catch {
      // Use defaults
    }
    
    if (keyBinds.turnLeft.includes(key) || keyBinds.turnRight.includes(key) || 
        keyBinds.brake.includes(key === ' ' ? 'space' : key)) {
      event.preventDefault();
      
      // Stop braking on key release
      if (keyBinds.brake.includes(key === ' ' ? 'space' : key)) {
        console.log('Brake key released:', key, 'mapped to:', key === ' ' ? 'space' : key, 'Current brake energy:', gameEngineRef.current?.getBikeState().brakeEnergy);
        gameEngineRef.current.setBraking(false);
      }
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

  useEffect(() => {
    initScene();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('resize', handleResize);

    // Capture the current mount ref value for cleanup
    const currentMount = mountRef.current;

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      
      if (rendererRef.current && currentMount && currentMount.contains(rendererRef.current.domElement)) {
        currentMount.removeChild(rendererRef.current.domElement);
      }

      // Dispose of renderer resources
      if (trailRendererRef.current) {
        trailRendererRef.current.dispose();
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, [initScene, handleKeyDown, handleKeyUp, handleResize]);

  useEffect(() => {
    if (gameState === 'playing') {
      animationIdRef.current = requestAnimationFrame(animate);
    } else if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
    }

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [gameState, animate]);

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
        <h1 className="text-2xl font-bold text-blue-400 mb-2 ui-text">hypoxia</h1>
        <div className="text-sm text-gray-300 ui-text">
          <p>Z/← Turn Left | X/→ Turn Right | Space Brake</p>
          <p>Avoid walls and your own trail!</p>
          <p className="text-xs opacity-50 mt-1">Press ESC to open menu</p>
          {gameEngineRef.current?.getBikeState().isBraking && (
            <p className="text-yellow-400 font-bold">🛑 BRAKING ACTIVE</p>
          )}
          {gameState === 'playing' && gameEngineRef.current && trailRendererRef.current && (
            <div className="mt-2 text-xs opacity-60">
              <p>Trail Points: {gameEngineRef.current.getTrailLength()}</p>
              <p>Rendered Segments: {trailRendererRef.current.getTrailMeshCount()}</p>
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