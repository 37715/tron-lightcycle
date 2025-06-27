import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

interface BikeState {
  position: THREE.Vector3;
  rotation: number;
  trail: THREE.Vector3[];
  alive: boolean;
  speed: number;
  lastTurnFrame: number;
  health: number;
  maxHealth: number;
}

// Tunable gameplay constants
const BIKE_SPEED = 0.12; // slightly slower default speed
const TURN_DELAY_FRAMES = 20; // minimum frames between consecutive turns

const Game3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const bikeRef = useRef<THREE.Mesh>();
  const trailMeshesRef = useRef<THREE.Mesh[]>([]);
  const animationIdRef = useRef<number>();
  const frameCountRef = useRef<number>(0);
  const cameraRotationRef = useRef<number>(0);
  
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'gameOver'>('waiting');
  const [bikeHealth, setBikeHealth] = useState(100);
  
  // Use a ref for bike state so animation loop always has latest value
  const bikeStateRef = useRef<BikeState>({
    position: new THREE.Vector3(0, 0, 0),
    rotation: 0,
    trail: [],
    alive: true,
    speed: BIKE_SPEED,
    lastTurnFrame: 0,
    health: 100,
    maxHealth: 100
  });

  const keysPressed = useRef<Set<string>>(new Set());

  const initScene = useCallback(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 30, 150);
    sceneRef.current = scene;

    // Camera setup - third person following camera
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 8, 10);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000);
    renderer.shadowMap.enabled = false;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Grid floor - more subtle and modern
    const gridSize = 200;
    const gridDivisions = 50;
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x111111, 0x0a0a0a);
    gridHelper.position.y = -0.5;
    scene.add(gridHelper);

    // Bike geometry - sleeker, more modern design
    const bikeGeometry = new THREE.BoxGeometry(0.3, 0.2, 0.8);
    const bikeMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x00ff88,
      transparent: true,
      opacity: 0.95
    });
    const bikeMesh = new THREE.Mesh(bikeGeometry, bikeMaterial);
    bikeMesh.position.set(0, 0, 0);
    scene.add(bikeMesh);
    bikeRef.current = bikeMesh;

    // Lighting - minimal for performance
    const ambientLight = new THREE.AmbientLight(0x202020, 0.8);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(10, 10, 5);
    scene.add(directionalLight);

    // Boundary walls - thinner and more minimal
    const wallHeight = 1.5;
    const wallThickness = 0.05;
    const boundarySize = 45;
    
    const wallMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x666666, 
      opacity: 0.3, 
      transparent: true 
    });
    
    // Create boundary walls
    const walls = [
      { pos: [0, wallHeight/2, boundarySize] as [number, number, number], size: [boundarySize*2, wallHeight, wallThickness] as [number, number, number] },
      { pos: [0, wallHeight/2, -boundarySize] as [number, number, number], size: [boundarySize*2, wallHeight, wallThickness] as [number, number, number] },
      { pos: [boundarySize, wallHeight/2, 0] as [number, number, number], size: [wallThickness, wallHeight, boundarySize*2] as [number, number, number] },
      { pos: [-boundarySize, wallHeight/2, 0] as [number, number, number], size: [wallThickness, wallHeight, boundarySize*2] as [number, number, number] }
    ];

    walls.forEach(wall => {
      const geometry = new THREE.BoxGeometry(...wall.size);
      const mesh = new THREE.Mesh(geometry, wallMaterial);
      mesh.position.set(...wall.pos);
      scene.add(mesh);
    });

  }, []);

  const createTrailSegment = useCallback((start: THREE.Vector3, end: THREE.Vector3) => {
    if (!sceneRef.current) return;

    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    
    if (length < 0.1) return;

    const geometry = new THREE.BoxGeometry(0.02, 0.8, length);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0x00ffff,
      transparent: true,
      opacity: 0.6
    });
    
    const trailMesh = new THREE.Mesh(geometry, material);
    
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    trailMesh.position.copy(midpoint);
    
    trailMesh.lookAt(end);
    
    sceneRef.current.add(trailMesh);
    trailMeshesRef.current.push(trailMesh);
  }, []);

  const checkCollisions = useCallback((position: THREE.Vector3, trail: THREE.Vector3[]): boolean => {
    // Check boundary collisions with tight hitbox
    const boundary = 44.5;
    const bikeHalfWidth = 0.15;
    if (Math.abs(position.x) + bikeHalfWidth > boundary || Math.abs(position.z) + bikeHalfWidth > boundary) {
      return true;
    }

    // Check trail collisions with precise hitbox
    if (trail.length > 10) {
      for (let i = 0; i < trail.length - 5; i++) {
        const trailPoint = trail[i];
        const distance = position.distanceTo(trailPoint);
        if (distance < 0.3) {
          return true;
        }
      }
    }

    return false;
  }, []);

  const updateBike = useCallback(() => {
    if (gameState !== 'playing') return;

    frameCountRef.current++;

    const bike = bikeStateRef.current;
    if (!bike.alive) return;

    let newRotation = bike.rotation;
    let newLastTurnFrame = bike.lastTurnFrame;
    
    // Simple delay to keep consecutive turns slightly apart
    const framesSinceLastTurn = frameCountRef.current - bike.lastTurnFrame;
    const canTurn = framesSinceLastTurn >= TURN_DELAY_FRAMES;
    
    if (canTurn) {
      // Check for left turn
      if (keysPressed.current.has('z') || keysPressed.current.has('arrowleft')) {
        console.log('Turning left!');
        newRotation += Math.PI / 2;
        newLastTurnFrame = frameCountRef.current;
        // Clear ONLY the keys that were used for this turn
        keysPressed.current.delete('z');
        keysPressed.current.delete('arrowleft');
      } 
      // Check for right turn
      else if (keysPressed.current.has('x') || keysPressed.current.has('arrowright')) {
        console.log('Turning right!');
        newRotation -= Math.PI / 2;
        newLastTurnFrame = frameCountRef.current;
        // Clear ONLY the keys that were used for this turn
        keysPressed.current.delete('x');
        keysPressed.current.delete('arrowright');
      }
    }

    // Move forward based on current rotation
    const direction = new THREE.Vector3(
      Math.sin(newRotation),
      0,
      Math.cos(newRotation)
    );
    
    const potentialPosition = bike.position.clone().add(direction.multiplyScalar(bike.speed));
    
    // Check collisions BEFORE moving
    let currentHealth = bike.health;
    let newPosition = potentialPosition;
    
    if (checkCollisions(potentialPosition, bike.trail)) {
      // Collision detected - don't move into the wall
      newPosition = bike.position.clone();
      // Take damage
      currentHealth = Math.max(0, bike.health - 1.5);
      setBikeHealth(currentHealth);
    } else {
      // No collision - safe to move
      if (bike.health < bike.maxHealth) {
        // Regenerate health when not colliding
        currentHealth = Math.min(bike.maxHealth, bike.health + 2);
        setBikeHealth(currentHealth);
      }
    }

    // Add to trail every certain distance
    const newTrail = [...bike.trail];
    if (newTrail.length === 0 || newPosition.distanceTo(newTrail[newTrail.length - 1]) > 0.5) {
      if (newTrail.length > 0) {
        createTrailSegment(newTrail[newTrail.length - 1], newPosition);
      }
      newTrail.push(newPosition.clone());
    }

    // Update the bike state ref
    bikeStateRef.current = {
      ...bike,
      position: newPosition,
      rotation: newRotation,
      trail: newTrail,
      lastTurnFrame: newLastTurnFrame,
      health: currentHealth,
      maxHealth: bike.maxHealth,
      alive: currentHealth > 0
    };
  }, [gameState, checkCollisions, createTrailSegment]);

  const updateCamera = useCallback(() => {
    if (!cameraRef.current) return;

    const bike = bikeStateRef.current;
    if (!bike.alive) return;

    const camera = cameraRef.current;
    
    // Camera follows behind the bike with very slow rotation
    const cameraDistance = 20;
    const cameraHeight = 15;
    
    // Smoothly interpolate camera rotation
    const rotationDiff = bike.rotation - cameraRotationRef.current;
    
    // Handle rotation wrapping for shortest path
    let adjustedDiff = rotationDiff;
    if (Math.abs(rotationDiff) > Math.PI) {
      adjustedDiff = rotationDiff > 0 ? rotationDiff - 2 * Math.PI : rotationDiff + 2 * Math.PI;
    }
    
    // VERY slow rotation following (0.02 = 2% per frame)
    cameraRotationRef.current += adjustedDiff * 0.04;
    
    // Calculate camera position behind the bike based on smoothed rotation
    const cameraOffset = new THREE.Vector3(
      -Math.sin(cameraRotationRef.current) * cameraDistance,
      cameraHeight,
      -Math.cos(cameraRotationRef.current) * cameraDistance
    );

    const targetCameraPosition = bike.position.clone().add(cameraOffset);
    
    // Smooth camera position movement
    camera.position.lerp(targetCameraPosition, 0.06);
    
    // Look at the bike
    camera.lookAt(bike.position);
  }, []);

  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    updateBike();

    const bike = bikeStateRef.current;

    // Update bike mesh position and rotation
    if (bikeRef.current) {
      bikeRef.current.position.copy(bike.position);
      bikeRef.current.rotation.y = bike.rotation;
    }

    updateCamera();

    // Check if bike died
    if (!bike.alive && gameState === 'playing') {
      setGameState('gameOver');
    }

    rendererRef.current.render(sceneRef.current, cameraRef.current);
    animationIdRef.current = requestAnimationFrame(animate);
  }, [updateBike, updateCamera, gameState]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    console.log('Key down:', key);
    
    if (key === 'z' || key === 'arrowleft' || key === 'x' || key === 'arrowright') {
      keysPressed.current.add(key);
      event.preventDefault();
    }
  }, []);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    console.log('Key up:', key);
    keysPressed.current.delete(key);
  }, []);

  const startGame = useCallback(() => {
    // Clear existing trail meshes
    trailMeshesRef.current.forEach(mesh => {
      if (sceneRef.current) {
        sceneRef.current.remove(mesh);
      }
    });
    trailMeshesRef.current = [];

    // Reset bike state
    const initialPosition = new THREE.Vector3(0, 0, 0);
    bikeStateRef.current = {
      position: initialPosition,
      rotation: 0,
      trail: [initialPosition.clone()],
      alive: true,
      speed: BIKE_SPEED,
      lastTurnFrame: 0,
      health: 100,
      maxHealth: 100
    };

    // Reset bike mesh position
    if (bikeRef.current) {
      bikeRef.current.position.copy(initialPosition);
      bikeRef.current.rotation.y = 0;
    }

    // Clear any pressed keys
    keysPressed.current.clear();
    frameCountRef.current = 0;
    cameraRotationRef.current = 0;

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

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      
      if (rendererRef.current && mountRef.current && mountRef.current.contains(rendererRef.current.domElement)) {
        mountRef.current.removeChild(rendererRef.current.domElement);
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
        <h1 className="text-2xl font-bold text-green-400 mb-2">3D TRON BIKE</h1>
        <div className="text-sm text-gray-400">
          <p>Z/← Turn Left | X/→ Turn Right</p>
          <p>Avoid walls and your own trail!</p>
        </div>
      </div>

      {/* Health Bar */}
      {gameState === 'playing' && (
        <div className="absolute top-4 right-4 z-10">
          <div className="w-64 h-6 bg-gray-800 rounded-full overflow-hidden border border-gray-600">
            <div 
              className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-200"
              style={{ width: `${bikeHealth}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1 text-right">
            Health: {Math.round(bikeHealth)}%
          </p>
        </div>
      )}

      {gameState === 'waiting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-80 z-20">
          <div className="text-center text-white">
            <h2 className="text-3xl font-bold mb-4 text-green-400">READY TO RACE?</h2>
            <p className="mb-6 text-gray-300">Navigate the 3D grid. Make 90° turns only.</p>
            <button
              onClick={startGame}
              className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded transition-colors"
            >
              START GAME
            </button>
          </div>
        </div>
      )}

      {gameState === 'gameOver' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-90 z-20">
          <div className="text-center text-white">
            <h2 className="text-3xl font-bold mb-4 text-red-400">GAME OVER</h2>
            <p className="mb-6 text-gray-300">You crashed into a wall or trail!</p>
            <button
              onClick={startGame}
              className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded transition-colors"
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