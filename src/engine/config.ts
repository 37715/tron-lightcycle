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
  
  // Brake system
  brakeMaxEnergy: 100,
  brakeDepletionRate: 0.33, // Energy lost per frame while braking (about 5 seconds of use at 60fps)
  brakeRechargeRate: 0.165, // Energy gained per frame while recharging (about 10 seconds to fully recharge)
  brakeRechargeDelayFrames: 60, // 1 second delay before recharge starts
  brakeSpeedReduction: 0.5, // Maximum speed multiplier when braking (50% of normal speed when fully depleted)
};
