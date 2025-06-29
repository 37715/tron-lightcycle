import { GameConfig } from './types';

export const DEFAULT_CONFIG: GameConfig = {
  // Bike constants
  bikeSpeed: 0.065,
  turnDelayFrames: 20,
  boundaryLimit: 44.975,
  regenDelayFrames: 60,
  
  // Trail constants - optimized for precision and moderate length
  trailWidth: 0.03,   // Even thinner for maximum precision in tight mazes
  trailHeight: 0.45,   // Slightly taller for better visibility
  trailMaxFrames: 120 * 60, // 2 minutes - half again for better performance
  
  // Ring/zone constants
  ringInitialRadius: 25,
  ringMinRadius: 3,
  ringShrinkTime: 270 * 60, // 4.5 minutes at 60fps
  ringDepletionFrames: 30 * 60, // 30 seconds at 60fps
  ringSpinSpeed: 0.0005,
  
  // Health regeneration
  slowRegenRate: 0.03, // Slow regen after zone damage (1.8% per second)
  fastRegenRate: 0.2,  // Very fast regen after collision damage (12% per second)
  
  // Grace period system (like ping rubber) - prevents instant death on brief wall contact
  graceFrames: 45, // ~750ms grace period at 60fps (simulates moderate ping protection)
};
