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
const BIKE_SPEED = 0.065; // slightly slower default speed
const TURN_DELAY_FRAMES = 20; // minimum frames between consecutive turns
const BOUNDARY_LIMIT = 44.975; // nearly flush with the wall
const TRAIL_HIT_DISTANCE = 0.2; // tighter trail hitbox
const REGEN_DELAY_FRAMES = 60; // start regenerating after ~1s

const TRAIL_WIDTH = 0.05; // consistent trail thickness
const TRAIL_HEIGHT = 0.5; // shorter trail wall
const TRAIL_MAX_FRAMES = 50 * 60; // trail lasts about 50 seconds

const Game3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const bikeRef = useRef<THREE.Group>();
  const trailMeshesRef = useRef<THREE.Mesh[]>([]);
  const trailFramesRef = useRef<number[]>([]);
  const animationIdRef = useRef<number>();
  const frameCountRef = useRef<number>(0);
  const cameraRotationRef = useRef<number>(0);
  const lastHitFrameRef = useRef<number>(0);
  
  // Visual position for smooth camera following
  const bikeVisualPositionRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const bikeVisualRotationRef = useRef<number>(0);
  
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
    scene.fog = new THREE.Fog(0x0a0a0a, 40, 180);
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
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Light mode background
    renderer.setClearColor(0xf0f0f0);
    renderer.shadowMap.enabled = false;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Grid floor - modern dark grid for better contrast
    const gridSize = 200;
    const gridDivisions = 40;
    const gridHelper = new THREE.GridHelper(
      gridSize, gridDivisions,
      0x444444, // center line color - darker
      0x222222  // grid color - much darker for contrast
    );
    gridHelper.position.y = -0.5;
    scene.add(gridHelper);

    // Bike geometry - modern minimalist design with body and wheels
    const bikeGroup = new THREE.Group();

    // Main body
    const bodyGeometry = new THREE.BoxGeometry(0.3, 0.15, 0.8);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.2,
      roughness: 0.6
    });
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.position.y = 0.2;
    bikeGroup.add(bodyMesh);

    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.08, 16);
    wheelGeometry.rotateZ(Math.PI / 2);
    const wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.1,
      roughness: 0.8
    });
    
    const frontWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    frontWheel.position.set(0, 0.15, 0.35);
    bikeGroup.add(frontWheel);

    const backWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    backWheel.position.set(0, 0.15, -0.35);
    bikeGroup.add(backWheel);

    bikeGroup.position.set(0, 0, 0);
    scene.add(bikeGroup);
    bikeRef.current = bikeGroup;

    // Lighting - bright and modern
    const ambientLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    // Initialize trail line for performance
    const trailGeom = new THREE.BufferGeometry();
    // Empty initial positions
    trailGeom.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    const trailMat = new THREE.LineBasicMaterial({ color: 0x3a7bd5, linewidth: 4 });
    const trailLine = new THREE.LineSegments(trailGeom, trailMat);
    trailLine.frustumCulled = false; // always render
    scene.add(trailLine);
    trailGeometryRef.current = trailGeom;
    trailMeshRef.current = trailLine;

    // Boundary walls - thinner and more minimal
    const wallHeight = 1.5;
    const wallThickness = 0.05;
    const boundarySize = 45;
    
    const wallMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x2a2a2a, 
      opacity: 0.2, 
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

  // --- Trail Performance Optimization ---
  // Instead of many meshes, use a single BufferGeometry for the trail
  const trailGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const trailMeshRef = useRef<THREE.Object3D | null>(null);

  // Helper to update the trail geometry efficiently
  const updateTrailGeometry = useCallback((trail: THREE.Vector3[]) => {
    if (!trailGeometryRef.current) return;
    const geometry = trailGeometryRef.current;
    if (trail.length < 2) {
      geometry.setDrawRange(0, 0);
      geometry.attributes.position.needsUpdate = true;
      return;
    }
    const positions: number[] = [];
    for (let i = 1; i < trail.length; i++) {
      const start = trail[i - 1];
      const end = trail[i];
      positions.push(start.x, start.y, start.z);
      positions.push(end.x, end.y, end.z);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setDrawRange(0, positions.length / 3);
    geometry.attributes.position.needsUpdate = true;
  }, []);

  const createTrailSegment = useCallback((start: THREE.Vector3, end: THREE.Vector3) => {
    if (!sceneRef.current) return;

    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();

    if (length < 0.1) return;

    // Extend slightly so segments overlap at corners
    const extension = TRAIL_WIDTH;
    const geometryLength = length + extension * 2;
    const geometry = new THREE.BoxGeometry(TRAIL_WIDTH, TRAIL_HEIGHT, geometryLength);

    const material = new THREE.MeshBasicMaterial({
      color: 0x3a7bd5,
      transparent: true,
      opacity: 0.4,
      depthWrite: true,
      side: THREE.DoubleSide
    });

    const trailMesh = new THREE.Mesh(geometry, material);

    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    trailMesh.position.copy(midpoint);

    trailMesh.lookAt(end);

    sceneRef.current.add(trailMesh);
    trailMeshesRef.current.push(trailMesh);
  }, []);

  // --- Grinding Depth Map ---
  // Key: wall (string), Value: max grind depth achieved
  const grindDepthMapRef = useRef<{ [key: string]: number }>({});

  // Helper: Clamp position to boundary after all movement
  function clampToBoundary(pos: THREE.Vector3) {
    const limit = BOUNDARY_LIMIT - 0.15; // bikeHalfWidth
    return new THREE.Vector3(
      Math.max(-limit, Math.min(limit, pos.x)),
      pos.y,
      Math.max(-limit, Math.min(limit, pos.z))
    );
  }

  // --- Trail collision: check grind depth ---
  const checkCollisions = (
    position: THREE.Vector3,
    trail: THREE.Vector3[]
  ): { hit: boolean; normal: THREE.Vector3 | null; corrected: THREE.Vector3 } => {
    const bikeHalfWidth = 0.15;
    const safetyMargin = 0.02; // Extra margin to prevent phasing

    let hit = false;
    let normal: THREE.Vector3 | null = null;
    let correctedX = position.x;
    let correctedZ = position.z;
    let wallKey = '';

    // Check boundary collisions
    const limit = BOUNDARY_LIMIT - bikeHalfWidth;
    
    if (Math.abs(position.x) > limit) {
      hit = true;
      correctedX = Math.sign(position.x) * limit;
      normal = new THREE.Vector3(-Math.sign(position.x), 0, 0);
      wallKey = `x${Math.sign(position.x)}`;
    }
    
    if (Math.abs(position.z) > limit) {
      hit = true;
      correctedZ = Math.sign(position.z) * limit;
      normal = new THREE.Vector3(0, 0, -Math.sign(position.z));
      wallKey = `z${Math.sign(position.z)}`;
    }

    // Check trail collisions - line segments not points
    if (trail.length > 10) {  // Skip recent trail segments
      for (let i = 0; i < trail.length - 8; i++) {
        const start = trail[i];
        const end = trail[i + 1];
        
        // Skip if we're checking against ourselves
        if (i === trail.length - 1) continue;
        
        // Get the direction vector of the segment
        const segDir = new THREE.Vector3().subVectors(end, start);
        const segLength = segDir.length();
        
        if (segLength < 0.01) continue; // Skip zero-length segments
        
        segDir.normalize();
        
        // Project bike position onto the line segment
        const toStart = new THREE.Vector3().subVectors(position, start);
        const projLength = THREE.MathUtils.clamp(toStart.dot(segDir), 0, segLength);
        
        // Find closest point on segment
        const closestPoint = start.clone().add(segDir.clone().multiplyScalar(projLength));
        
        // Check distance to segment
        const dist = position.distanceTo(closestPoint);
        const collisionDist = bikeHalfWidth + TRAIL_WIDTH/2 + safetyMargin;
        
        // --- Grinding depth check ---
        let allowPass = false;
        if (wallKey) {
          const grindDepth = grindDepthMapRef.current[wallKey] || 0;
          // If our grind offset is deeper than the previous grind, allow pass
          if (bikeStateRef.current.grindOffset > grindDepth + 0.01) {
            allowPass = true;
          }
        }
        if (dist < collisionDist && !allowPass) {
          hit = true;
          
          // Calculate push-out direction
          const pushDir = new THREE.Vector3().subVectors(position, closestPoint);
          if (pushDir.length() > 0.001) {
            pushDir.normalize();
            
            // Push the bike out to safe distance with extra margin
            const safePoint = closestPoint.clone().add(pushDir.multiplyScalar(collisionDist + 0.01));
            
            // Only update if this collision pushes us further out
            const currentDist = new THREE.Vector2(correctedX, correctedZ).distanceTo(new THREE.Vector2(position.x, position.z));
            const newDist = new THREE.Vector2(safePoint.x, safePoint.z).distanceTo(new THREE.Vector2(position.x, position.z));
            
            if (newDist > currentDist) {
              correctedX = safePoint.x;
              correctedZ = safePoint.z;
              normal = pushDir;
            }
          }
        }
      }
    }

    return { hit, normal, corrected: new THREE.Vector3(correctedX, position.y, correctedZ) };
  };

  // --- Bike update logic ---
  const updateBike = useCallback(() => {
    if (gameState !== 'playing') return;
    frameCountRef.current++;
    const bike = bikeStateRef.current;
    if (!bike.alive) return;
    let newRotation = bike.rotation;
    let newLastTurnFrame = bike.lastTurnFrame;
    const newTrail = [...bike.trail];
    const newTrailFrames = [...trailFramesRef.current];
    const framesSinceLastTurn = frameCountRef.current - bike.lastTurnFrame;
    const canTurn = framesSinceLastTurn >= TURN_DELAY_FRAMES;
    if (canTurn && turnQueueRef.current.length > 0) {
      if (newTrail.length > 0) {
        const lastPoint = newTrail[newTrail.length - 1];
        createTrailSegment(lastPoint, bike.position.clone());
      }
      newTrail.push(bike.position.clone());
      newTrailFrames.push(frameCountRef.current);
      const turn = turnQueueRef.current.shift();
      if (turn === 'left') {
        newRotation += Math.PI / 2;
      } else if (turn === 'right') {
        newRotation -= Math.PI / 2;
      }
      newLastTurnFrame = frameCountRef.current;
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
    let newPosition = potentialPosition.clone();
    let newGrindOffset = bike.grindOffset;
    let newGrindNormal = bike.grindNormal;
    const collision = checkCollisions(
      potentialPosition,
      [...newTrail, potentialPosition]
    );
    newPosition.copy(collision.corrected);
    newPosition = clampToBoundary(newPosition);

    // --- Health/damage logic ---
    let headOn = false;
    if (collision.hit && collision.normal) {
      const push = direction.dot(collision.normal);
      if (push < 0) {
        // Head-on collision
        headOn = true;
        newGrindOffset = Math.min(bike.grindOffset + 0.02, 0.3);
        currentHealth = Math.max(0, bike.health - 1.2);
        setBikeHealth(currentHealth);
        lastHitFrameRef.current = frameCountRef.current;
      } else {
        // Grinding parallel to wall, no damage
        newGrindOffset = Math.min(bike.grindOffset + 0.01, 0.3);
      }
      newPosition.add(collision.normal.clone().multiplyScalar(-newGrindOffset));
    } else {
      // No collision
      newGrindOffset = 0;
    }

    // Regenerate health if not taking head-on damage and enough time passed
    const framesSinceHit = frameCountRef.current - lastHitFrameRef.current;
    if (!headOn && framesSinceHit > REGEN_DELAY_FRAMES && currentHealth < bike.maxHealth) {
      currentHealth = Math.min(bike.maxHealth, currentHealth + 0.5);
      setBikeHealth(currentHealth);
    }

    // Add to trail every certain distance
    if (newTrail.length === 0 || newPosition.distanceTo(newTrail[newTrail.length - 1]) > 0.5) {
      if (newTrail.length > 0) {
        createTrailSegment(newTrail[newTrail.length - 1], newPosition);
      }
      newTrail.push(newPosition.clone());
      newTrailFrames.push(frameCountRef.current);
    }
    // Trim old trail segments so trail length stays within limit
    while (newTrailFrames.length > 0 && frameCountRef.current - newTrailFrames[0] > TRAIL_MAX_FRAMES) {
      newTrailFrames.shift();
      if (newTrail.length > 0) {
        newTrail.shift();
      }
      const oldMesh = trailMeshesRef.current.shift();
      if (oldMesh && sceneRef.current) {
        sceneRef.current.remove(oldMesh);
      }
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
    trailFramesRef.current = newTrailFrames;
    updateTrailGeometry(newTrail);
  }, [gameState, checkCollisions, createTrailSegment, updateTrailGeometry]);

  // --- Camera: Smooth visual following with physics separation ---
  const updateCamera = useCallback(() => {
    if (!cameraRef.current) return;
    const bike = bikeStateRef.current;
    if (!bike.alive) return;
    
    // Smoothly interpolate visual position to follow actual bike position
    const visualPos = bikeVisualPositionRef.current;
    const targetPos = bike.position;
    visualPos.lerp(targetPos, 0.15); // Smooth visual following
    
    // Smoothly interpolate visual rotation
    let rotationDiff = bike.rotation - bikeVisualRotationRef.current;
    if (Math.abs(rotationDiff) > Math.PI) {
      rotationDiff = rotationDiff > 0 ? rotationDiff - 2 * Math.PI : rotationDiff + 2 * Math.PI;
    }
    bikeVisualRotationRef.current += rotationDiff * 0.08; // Smooth but responsive (reduced from 0.12)
    
    const camera = cameraRef.current;
    const cameraDistance = 18; // further back for better lookahead
    const cameraHeight = 14;   // moderate height
    
    // Camera follows visual position (smooth) rather than actual position (jerky)
    const cameraRotationDiff = bikeVisualRotationRef.current - cameraRotationRef.current;
    let adjustedCameraDiff = cameraRotationDiff;
    if (Math.abs(cameraRotationDiff) > Math.PI) {
      adjustedCameraDiff = cameraRotationDiff > 0 ? cameraRotationDiff - 2 * Math.PI : cameraRotationDiff + 2 * Math.PI;
    }
    // Smooth but responsive camera rotation
    cameraRotationRef.current += adjustedCameraDiff * 0.04; // Slower camera rotation (reduced from 0.06)
    
    const cameraOffset = new THREE.Vector3(
      -Math.sin(cameraRotationRef.current) * cameraDistance,
      cameraHeight,
      -Math.cos(cameraRotationRef.current) * cameraDistance
    );
    const targetCameraPosition = visualPos.clone().add(cameraOffset);
    // Smooth camera position following
    camera.position.lerp(targetCameraPosition, 0.08);
    camera.lookAt(visualPos);
  }, []);

  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    updateBike();

    const bike = bikeStateRef.current;

    // Update bike mesh position and rotation using visual position for smooth rendering
    if (bikeRef.current) {
      bikeRef.current.position.copy(bikeVisualPositionRef.current);
      bikeRef.current.rotation.y = bikeVisualRotationRef.current;
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
    trailFramesRef.current = [0];

    // Reset bike mesh position
    if (bikeRef.current) {
      bikeRef.current.position.copy(initialPosition);
      bikeRef.current.rotation.y = 0;
    }

    // Reset visual position
    bikeVisualPositionRef.current.copy(initialPosition);
    bikeVisualRotationRef.current = 0;

    // Remove old trail mesh
    if (trailMeshRef.current && sceneRef.current) {
      sceneRef.current.remove(trailMeshRef.current);
      trailMeshRef.current = null;
    }
    if (trailGeometryRef.current) {
      trailGeometryRef.current.dispose();
      trailGeometryRef.current = null;
    }

    // Clear any queued turns
    turnQueueRef.current = [];
    frameCountRef.current = 0;
    cameraRotationRef.current = 0;
    lastHitFrameRef.current = 0;

    // --- Reset grind depth map ---
    grindDepthMapRef.current = {};

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
        <h1 className="text-2xl font-bold text-blue-400 mb-2">3D TRON BIKE</h1>
        <div className="text-sm text-gray-300">
          <p>Z/← Turn Left | X/→ Turn Right</p>
          <p>Avoid walls and your own trail!</p>
        </div>
      </div>

      {/* Health Bar */}
      {gameState === 'playing' && (
        <div className="absolute top-4 right-4 z-10">
          <div className="w-64 h-6 bg-gray-900 rounded-full overflow-hidden border border-gray-700">
            <div
              className="h-full transition-all duration-200"
              style={{
                width: `${bikeHealth}%`,
                backgroundColor: bikeHealth > 60 ? '#3a7bd5' : bikeHealth > 30 ? '#f39c12' : '#e74c3c',
                boxShadow: 'inset 0 0 10px rgba(0,0,0,0.3)'
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
            <h2 className="text-3xl font-bold mb-4 text-blue-400">READY TO RACE?</h2>
            <p className="mb-6 text-gray-300">Navigate the 3D grid. Make 90° turns only.</p>
            <button
              onClick={startGame}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded transition-colors"
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