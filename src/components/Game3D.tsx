import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GameEngine } from '../engine/gameEngine';
import { DEFAULT_CONFIG } from '../engine/config';
import { GameState } from '../engine/types';
import { BikeRenderer } from '../renderer/BikeRenderer';
import { TrailRenderer } from '../renderer/TrailRenderer';
import { ArenaRenderer } from '../renderer/ArenaRenderer';
import { CameraController } from '../renderer/CameraController';

const Game3D: React.FC = () => {
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
  
  const [gameState, setGameState] = useState<GameState>('waiting');
  const [bikeHealth, setBikeHealth] = useState(100);

  const initScene = useCallback(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0a0a, 40, 180);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
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
  }, []);

  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    if (!gameEngineRef.current || !bikeRendererRef.current || !trailRendererRef.current || 
        !arenaRendererRef.current || !cameraControllerRef.current) return;

    if (gameState === 'playing') {
      // Update game logic
      const { healthChanged, newHealth } = gameEngineRef.current.update();
      if (healthChanged) {
        setBikeHealth(newHealth);
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

      trailRendererRef.current.updateTrailGeometry(bikeState.trail);

      // Handle new trail segments
      const newSegments = gameEngineRef.current.getNewTrailSegments();
      newSegments.forEach(segment => {
        if (trailRendererRef.current) {
          trailRendererRef.current.createTrailSegment(segment.start, segment.end);
        }
      });

      // Remove old trail segments
      const segmentsToRemove = gameEngineRef.current.getSegmentsToRemove();
      for (let i = 0; i < segmentsToRemove; i++) {
        if (trailRendererRef.current) {
          trailRendererRef.current.removeOldestTrailSegment();
        }
      }

      const isOutsideRing = arena.isPositionOutsideRing(bikeState.position);
      arenaRendererRef.current.updateRings(
        arena.getRingScale(),
        gameEngineRef.current.getFrameCount(),
        isOutsideRing
      );

      // Check if bike died
      if (!bikeState.alive && gameState === 'playing') {
        setGameState('gameOver');
      }
    }

    rendererRef.current.render(sceneRef.current, cameraRef.current);
    animationIdRef.current = requestAnimationFrame(animate);
  }, [gameState]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!gameEngineRef.current) return;
    
    const key = event.key.toLowerCase();
    if (key === 'z' || key === 'arrowleft') {
      gameEngineRef.current.queueTurn('left');
      event.preventDefault();
    } else if (key === 'x' || key === 'arrowright') {
      gameEngineRef.current.queueTurn('right');
      event.preventDefault();
    }
  }, []);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (key === 'z' || key === 'arrowleft' || key === 'x' || key === 'arrowright') {
      event.preventDefault();
    }
  }, []);

  const startGame = useCallback(() => {
    if (!gameEngineRef.current || !trailRendererRef.current || 
        !arenaRendererRef.current || !cameraControllerRef.current) return;

    // Reset all systems
    gameEngineRef.current.reset();
    trailRendererRef.current.reset();
    arenaRendererRef.current.reset();
    cameraControllerRef.current.reset();

    setBikeHealth(100);
    setGameState('playing');
  }, []);

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

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <div ref={mountRef} className="w-full h-full" />
      
      {/* UI Overlay */}
      <div className="absolute top-4 left-4 text-white z-10">
        <h1 className="text-2xl font-bold text-blue-400 mb-2 ui-text">hypoxia</h1>
        <div className="text-sm text-gray-300 ui-text">
          <p>Z/← Turn Left | X/→ Turn Right</p>
          <p>Avoid walls and your own trail!</p>
        </div>
      </div>

      {/* Health Bar */}
      {gameState === 'playing' && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10">
          <div className="health-bar-container">
            <div
              className={`health-bar-fill ${
                bikeHealth > 60 ? 'health-high' : 
                bikeHealth > 30 ? 'health-medium' : 
                bikeHealth > 15 ? 'health-low' : 'health-critical'
              }`}
              style={{ width: `${bikeHealth}%` }}
            />
          </div>
          <div className="health-bar-text text-center">
            HEALTH {Math.round(bikeHealth)}%
          </div>
        </div>
      )}

      {gameState === 'waiting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-80 z-20">
          <div className="text-center text-white ui-text">
            <h2 className="text-3xl font-bold mb-4 text-blue-400">READY TO RACE?</h2>
            <p className="mb-6 text-gray-300">Navigate the 3D grid. Make 90° turns only.</p>
            <button
              onClick={startGame}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded transition-colors ui-text"
            >
              START GAME
            </button>
          </div>
        </div>
      )}

      {gameState === 'gameOver' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-90 z-20">
          <div className="text-center text-white ui-text">
            <h2 className="text-3xl font-bold mb-4 text-red-400">GAME OVER</h2>
            <p className="mb-6 text-gray-300">You crashed into a wall or trail!</p>
            <button
              onClick={startGame}
              className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded transition-colors ui-text"
            >
              PLAY AGAIN
            </button>
          </div>
        </div>
      )}

      {/* Performance indicator */}
      <div className="absolute bottom-4 right-4 text-xs text-gray-500 z-10">
        <p>Optimized for maximum performance</p>
        <p>Minimal graphics • 60+ FPS target</p>
      </div>
    </div>
  );
};

export default Game3D;