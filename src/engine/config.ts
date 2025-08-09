import { GameConfig } from './types';

export const DEFAULT_CONFIG: GameConfig = {
  // Bike constants - optimized for performance and proper grinding
  bikeSpeed: 0.050,           // Original per-tick speed (paired with 240 Hz sim)
  maxHealth: 122,             // ~30% more than 94 to lengthen TTK consistently across modes
  speedTarget: 0.050,         // Keep consistent with bikeSpeed         
  cycleSpeedDecayBelow: 0.01, 
  cycleSpeedDecayAbove: 0.002,
  turnDelayFrames: 20,        // Balanced responsiveness at 240 Hz sim
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
  
  // Health regeneration - slowed down for more challenging gameplay
  slowRegenRate: 0.01,        // Reduced from 0.03 for slower recovery
  fastRegenRate: 0.05,        // Reduced from 0.2 for slower recovery
  
  // Grace period system
  graceFrames: 45,
  
  // Brake system - optimized
  brakeMaxEnergy: 100,
  brakeDepletionRate: 0.33,   
  brakeRechargeRate: 0.14,    
  brakeRechargeDelayFrames: 60,
  brakeSpeedReduction: 0.5,
  brakeForce: 0.003,          
  
  // Wall acceleration system - enhanced for wall grinding
  accelBase: 0.008,           // Increased for noticeable effect
  rimMult: 0,                 
  selfMult: 0.5,              // Reduced effect on own trail
  teamMult: 1,                
  enemyMult: 1,               
  accelOffset: 0.05,          // Closer to wall for activation
  wallNear: 0.2,              // Smaller activation range
  
  // Explosion system
  explRadius: 2,
  explSpeedMult: 0,
  
  // Wall management - reduced for performance
  maxWallLen: 200,            // Reduced from 400
  
  // Respawn system
  respawnDelayFrames: 0
};
