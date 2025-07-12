import * as THREE from 'three';

export interface BikeState {
  position: THREE.Vector3;
  rotation: number;
  trail: THREE.Vector3[];
  alive: boolean;
  speed: number;
  speedTarget: number;
  lastTurnFrame: number;
  health: number;
  maxHealth: number;
  grindOffset: number; // Keep for compatibility, but rubber is the main system now
  grindNormal: THREE.Vector3 | null;
  graceFramesRemaining: number;
  brakeEnergy: number;
  brakeRechargeDelay: number;
  isBraking: boolean;
  
  // Armagetron grinding mechanics - position tracking
  lastX: number;         // Last X position
  lastY: number;         // Last Y position  
  lastdirX: number;      // Last X direction
  lastdirY: number;      // Last Y direction
  checkLast: boolean;    // Enable last position checking for grinding
  
  // Armagetron rubber system
  rubber: number;        // Current rubber amount
  rubberMax: number;     // Maximum rubber (default 5)
  rubberTime: number;    // Time to fully regenerate rubber (default 10)
  collision: boolean;    // Currently in collision
  collideTime: number;   // Predicted collision time
  lastSpeed: number;     // Speed from previous frame
  
  // Sensor system for wall distances
  distF: number;         // Forward distance to wall
  distL: number;         // Left distance to wall  
  distR: number;         // Right distance to wall
  minDistF: number;      // Minimum allowed forward distance (grinding depth)
  
  // Turn system
  turnQueue: TurnDirection[];
  cycleDelay: number;    // Delay between turns
  lastTurnTime: number;  // When last turn happened
  
  // Acceleration system
  accelBase: number;     // Base wall acceleration
  wallNear: number;      // Distance threshold for wall acceleration
}

export interface GameConfig {
  // Bike constants
  bikeSpeed: number;
  speedTarget: number;
  cycleSpeedDecayBelow: number;
  cycleSpeedDecayAbove: number;
  turnDelayFrames: number;
  boundaryLimit: number;
  regenDelayFrames: number;
  
  // Rubber system
  rubberMax: number;
  rubberTime: number;
  rubberMinDist: number;
  rubberMinAdj: number;
  
  // Trail constants
  trailWidth: number;
  trailHeight: number;
  trailMaxFrames: number;
  
  // Ring/zone constants
  ringInitialRadius: number;
  ringMinRadius: number;
  ringShrinkTime: number;
  ringDepletionFrames: number;
  ringSpinSpeed: number;
  
  // Health regeneration
  slowRegenRate: number;
  fastRegenRate: number;
  
  // Grace period system
  graceFrames: number;
  
  // Brake system
  brakeMaxEnergy: number;
  brakeDepletionRate: number;
  brakeRechargeRate: number;
  brakeRechargeDelayFrames: number;
  brakeSpeedReduction: number;
  brakeForce: number;
  
  // Wall acceleration system
  accelBase: number;
  rimMult: number;
  selfMult: number;
  teamMult: number;
  enemyMult: number;
  accelOffset: number;
  wallNear: number;
  
  // Explosion system
  explRadius: number;
  explSpeedMult: number;
  
  // Wall management
  maxWallLen: number;
  
  // Respawn system
  respawnDelayFrames: number;
}

export interface CollisionResult {
  hit: boolean;
  normal: THREE.Vector3 | null;
  corrected: THREE.Vector3;
}

export type GameState = 'waiting' | 'playing' | 'gameOver';
export type DamageType = 'collision' | 'zone' | null;
export type TurnDirection = 'left' | 'right';
