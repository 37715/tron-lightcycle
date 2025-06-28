import { GameConfig } from './types';

export const DEFAULT_CONFIG: GameConfig = {
  // Bike constants
  bikeSpeed: 0.065,
  turnDelayFrames: 20,
  boundaryLimit: 44.975,
  regenDelayFrames: 60,
  
  // Trail constants
  trailWidth: 0.05,
  trailHeight: 0.5,
  trailMaxFrames: 50 * 60, // 50 seconds at 60fps
  
  // Ring/zone constants
  ringInitialRadius: 25,
  ringMinRadius: 3,
  ringShrinkTime: 270 * 60, // 4.5 minutes at 60fps
  ringDepletionFrames: 30 * 60, // 30 seconds at 60fps
  ringSpinSpeed: 0.0005,
  
  // Health regeneration
  slowRegenRate: 0.03, // Slow regen after zone damage (1.8% per second)
  fastRegenRate: 0.2,  // Very fast regen after collision damage (12% per second)
};
