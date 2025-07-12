import { GameConfig } from './types';

export const DEFAULT_CONFIG: GameConfig = {
  // Bike constants - optimized for performance and proper grinding
  bikeSpeed: 0.061,           
  speedTarget: 0.061,         
  cycleSpeedDecayBelow: 0.01, 
  cycleSpeedDecayAbove: 0.002,
  turnDelayFrames: 20,        
  boundaryLimit: 44.975,
  regenDelayFrames: 60,
  
  // Rubber system - proper head-on collision depth tracking
  rubberMax: 0.2,             // Lower max for faster death on head-on collisions
  rubberTime: 8,              // Faster decay when not colliding
  rubberMinDist: 0.002,       // Very small for close contact
  rubberMinAdj: 0.003,        
  
  // Trail constants - optimized for performance and no gaps
  trailWidth: 0.025,          // Slightly thicker to prevent gaps
  trailHeight: 0.45,
  trailMaxFrames: 30 * 60,    // Reduced from 48*60 for performance
  
  // Ring/zone constants
  ringInitialRadius: 25,
  ringMinRadius: 3,
  ringShrinkTime: 270 * 60,
  ringDepletionFrames: 25 * 60,
  ringSpinSpeed: 0.0005,
  
  // Health regeneration
  slowRegenRate: 0.03,
  fastRegenRate: 0.2,
  
  // Grace period system
  graceFrames: 45,
  
  // Brake system - optimized
  brakeMaxEnergy: 100,
  brakeDepletionRate: 0.33,   
  brakeRechargeRate: 0.14,    
  brakeRechargeDelayFrames: 60,
  brakeSpeedReduction: 0.5,
  brakeForce: 0.003,          
  
  // Wall acceleration system - minimal for performance
  accelBase: 0.001,           // Very small
  rimMult: 0,                 
  selfMult: 1,                
  teamMult: 1,                
  enemyMult: 1,               
  accelOffset: 0.1,           
  wallNear: 0.3,              // Smaller range
  
  // Explosion system
  explRadius: 2,
  explSpeedMult: 0,
  
  // Wall management - reduced for performance
  maxWallLen: 200,            // Reduced from 400
  
  // Respawn system
  respawnDelayFrames: 0
};
