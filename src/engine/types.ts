import * as THREE from 'three';

export interface BikeState {
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
  graceFramesRemaining: number; // Grace period protection
  brakeEnergy: number; // Brake energy (0-100)
  brakeRechargeDelay: number; // Frames to wait before recharging
  isBraking: boolean; // Currently braking
}

export interface GameConfig {
  // Bike constants
  bikeSpeed: number;
  turnDelayFrames: number;
  boundaryLimit: number;
  regenDelayFrames: number;
  
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
}

export interface CollisionResult {
  hit: boolean;
  normal: THREE.Vector3 | null;
  corrected: THREE.Vector3;
}

export type GameState = 'waiting' | 'playing' | 'gameOver';
export type DamageType = 'collision' | 'zone' | null;
export type TurnDirection = 'left' | 'right';
