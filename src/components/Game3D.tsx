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
  grindOffset: number;
  grindNormal: THREE.Vector3 | null;
}

// Tunable gameplay constants
const BIKE_SPEED = 0.1; // moderate default speed
const TURN_DELAY_FRAMES = 20; // minimum frames between consecutive turns
const BOUNDARY_LIMIT = 44.975; // nearly flush with the wall
const TRAIL_HIT_DISTANCE = 0.2; // tighter trail hitbox
const REGEN_DELAY_FRAMES = 60; // start regenerating after ~1s
const DAMAGE_RATE = 0.8; // health lost per frame while pushing into a wall

const TRAIL_START_HEIGHT = 0.2; // height near the bike
const TRAIL_END_HEIGHT = 0.5;   // final wall height
const TAPER_DISTANCE = 1;       // distance over which to reach full height

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
  const lastHitFrameRef = useRef<number>(0);
  const distanceSinceTurnRef = useRef<number>(0);
  
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
    maxHealth: 100,
    grindOffset: 0,
    grindNormal: null
  });

  const turnQueueRef = useRef<string[]>([]);

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

  const createTrailSegment = useCallback((start: THREE.Vector3, end: THREE.Vector3, startDistance: number) => {
    if (!sceneRef.current) return;

    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();

    if (length < 0.1) return;

    const geometry = new THREE.BoxGeometry(0.02, TRAIL_END_HEIGHT, length, 1, 1, 1);

    // Taper only within the first meter after a turn
    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const z = posAttr.getZ(i); // -length/2 to length/2
      const t = (z + length / 2) / length; // 0 at start, 1 at end
      const dist = startDistance + t * length;
      const progress = Math.min(dist / TAPER_DISTANCE, 1);
      const height = THREE.MathUtils.lerp(TRAIL_START_HEIGHT, TRAIL_END_HEIGHT, progress);
      const scale = height / TRAIL_END_HEIGHT;
      posAttr.setY(i, posAttr.getY(i) * scale);
    }
    posAttr.needsUpdate = true;

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

  const checkCollisions = useCallback((position: THREE.Vector3, trail: THREE.Vector3[]): { hit: boolean; normal: THREE.Vector3 | null } => {
    const bikeHalfWidth = 0.15;
    const limit = BOUNDARY_LIMIT - 0.001;
    // Treat being exactly at the boundary as a hit so grinding remains stable
    if (Math.abs(position.x) + bikeHalfWidth >= limit) {
      return { hit: true, normal: new THREE.Vector3(Math.sign(position.x), 0, 0) };
    }
    if (Math.abs(position.z) + bikeHalfWidth >= limit) {
      return { hit: true, normal: new THREE.Vector3(0, 0, Math.sign(position.z)) };
    }

    // Check trail collisions with precise hitbox
    if (trail.length > 2) {
      for (let i = 0; i < trail.length - 2; i++) {
        const start = trail[i];
        const end = trail[i + 1];
        const segDir = new THREE.Vector3().subVectors(end, start);
        const segLength = segDir.length();
        if (segLength === 0) continue;
        const segNorm = segDir.clone().normalize();
        const toPoint = new THREE.Vector3().subVectors(position, start);
        const proj = THREE.MathUtils.clamp(toPoint.dot(segNorm), 0, segLength);
        const closest = start.clone().add(segNorm.multiplyScalar(proj));
        const dist = closest.distanceTo(position);
        if (dist < TRAIL_HIT_DISTANCE) {
          const normal = position.clone().sub(closest).normalize();
          return { hit: true, normal };
        }
      }
    }

    return { hit: false, normal: null };
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
    
    if (canTurn && turnQueueRef.current.length > 0) {
      const turn = turnQueueRef.current.shift();
      if (turn === 'left') {
        newRotation += Math.PI / 2;
      } else if (turn === 'right') {
        newRotation -= Math.PI / 2;
      }
      newLastTurnFrame = frameCountRef.current;
      distanceSinceTurnRef.current = 0;
    }

    // Move forward based on current rotation
    const direction = new THREE.Vector3(
      Math.sin(newRotation),
      0,
      Math.cos(newRotation)
    );
    
    const delta = direction.clone().multiplyScalar(bike.speed);
    let newPosition = bike.position.clone().add(delta);

    // Collision handling and grinding logic
    let currentHealth = bike.health;
    let newGrindOffset = bike.grindOffset;
    let newGrindNormal = bike.grindNormal;

    const collision = checkCollisions(newPosition, bike.trail);
    if (collision.hit && collision.normal) {
      const push = delta.dot(collision.normal);
      if (push > 0) {
        // Slide along the surface and accumulate grind offset
        newPosition.addScaledVector(collision.normal, -push);
        newGrindOffset = Math.min(bike.grindOffset + push, 0.3);
        currentHealth = Math.max(0, bike.health - DAMAGE_RATE);
        setBikeHealth(currentHealth);
        lastHitFrameRef.current = frameCountRef.current;
      }
      newGrindNormal = collision.normal.clone();
    } else if (bike.grindNormal) {
      // Maintain previous grind state when staying close to the wall
      const nearX = Math.abs(newPosition.x) + 0.15 >= BOUNDARY_LIMIT - 0.05;
      const nearZ = Math.abs(newPosition.z) + 0.15 >= BOUNDARY_LIMIT - 0.05;
      if (!(nearX || nearZ)) {
        newGrindNormal = null;
        newGrindOffset = 0;
      }
    }

    // Regenerate health if enough time passed since last hit
    const framesSinceHit = frameCountRef.current - lastHitFrameRef.current;
    if (framesSinceHit > REGEN_DELAY_FRAMES && currentHealth < bike.maxHealth) {
      currentHealth = Math.min(bike.maxHealth, currentHealth + 0.5);
      setBikeHealth(currentHealth);
    }

    // Add to trail every certain distance
    const newTrail = [...bike.trail];
    if (newTrail.length === 0 || newPosition.distanceTo(newTrail[newTrail.length - 1]) > 0.5) {
      if (newTrail.length > 0) {
        createTrailSegment(newTrail[newTrail.length - 1], newPosition, distanceSinceTurnRef.current);
        distanceSinceTurnRef.current += newPosition.distanceTo(newTrail[newTrail.length - 1]);
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
      grindOffset: newGrindOffset,
      grindNormal: newGrindNormal,
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
    if (key === 'z' || key === 'arrowleft') {
      turnQueueRef.current.push('left');
      event.preventDefault();
    } else if (key === 'x' || key === 'arrowright') {
      turnQueueRef.current.push('right');
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
      maxHealth: 100,
      grindOffset: 0,
      grindNormal: null
    };

    // Reset bike mesh position
    if (bikeRef.current) {
      bikeRef.current.position.copy(initialPosition);
      bikeRef.current.rotation.y = 0;
    }

    // Clear any queued turns
    turnQueueRef.current = [];
    frameCountRef.current = 0;
    cameraRotationRef.current = 0;
    lastHitFrameRef.current = 0;
    distanceSinceTurnRef.current = 0;

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
              className="h-full transition-all duration-200"
              style={{
                width: `${bikeHealth}%`,
                backgroundColor: `hsl(${(bikeHealth / 100) * 120}, 100%, 50%)`
              }}
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