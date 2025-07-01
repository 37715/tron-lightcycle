import * as THREE from 'three';
import { BikeState, GameConfig, DamageType, TurnDirection } from './types';
import { BikePhysics } from './bike';
import { Arena } from './arena';

export class GameEngine {
  private bikeState: BikeState;
  private bikePhysics: BikePhysics;
  private arena: Arena;
  private turnQueue: TurnDirection[] = [];
  private frameCount = 0;
  private lastHitFrame = 0;
  private lastDamageType: DamageType = null;
  private outsideRingFrames = 0;
  private trailFrames: number[] = [];
  private newTrailSegments: { start: THREE.Vector3; end: THREE.Vector3 }[] = [];
  private segmentsToRemove = 0;

  constructor(private config: GameConfig) {
    this.bikePhysics = new BikePhysics(config);
    this.arena = new Arena(config);
    this.bikeState = this.createInitialBikeState();
  }

  private createInitialBikeState(): BikeState {
    const initialPosition = new THREE.Vector3(0, 0, 0);
    return {
      position: initialPosition,
      rotation: 0,
      trail: [initialPosition.clone()],
      alive: true,
      speed: this.config.bikeSpeed,
      lastTurnFrame: 0,
      health: 156, // 30% more health (120 * 1.3)
      maxHealth: 156,
      grindOffset: 0,
      grindNormal: null,
      graceFramesRemaining: 0,
      brakeEnergy: this.config.brakeMaxEnergy,
      brakeRechargeDelay: 0,
      isBraking: false
    };
  }

  public getBikeState(): BikeState {
    return { ...this.bikeState };
  }

  public getArena(): Arena {
    return this.arena;
  }

  public getFrameCount(): number {
    return this.frameCount;
  }

  public queueTurn(direction: TurnDirection): void {
    this.turnQueue.push(direction);
  }

  public setBraking(isBraking: boolean): void {
    this.bikeState.isBraking = isBraking;
  }

  private updateBrakeSystem(): void {
    if (this.bikeState.isBraking && this.bikeState.brakeEnergy > 0) {
      // Deplete brake energy while braking
      this.bikeState.brakeEnergy = Math.max(0, this.bikeState.brakeEnergy - this.config.brakeDepletionRate);
      this.bikeState.brakeRechargeDelay = this.config.brakeRechargeDelayFrames;
      
      // Debug log every 60 frames (1 second) while braking
      if (this.frameCount % 60 === 0) {
        const energyUsed = this.config.brakeMaxEnergy - this.bikeState.brakeEnergy;
        const brakeProgress = energyUsed / this.config.brakeMaxEnergy;
        console.log(`Braking: Energy ${this.bikeState.brakeEnergy.toFixed(1)}/100 (${(brakeProgress * 100).toFixed(1)}% used), Progressive braking active`);
      }
    } else {
      // Stop braking if no energy
      if (this.bikeState.brakeEnergy <= 0) {
        this.bikeState.isBraking = false;
      }
      
      // Handle recharge delay
      if (this.bikeState.brakeRechargeDelay > 0) {
        this.bikeState.brakeRechargeDelay--;
      } else {
        // Recharge brake energy
        const oldEnergy = this.bikeState.brakeEnergy;
        this.bikeState.brakeEnergy = Math.min(
          this.config.brakeMaxEnergy, 
          this.bikeState.brakeEnergy + this.config.brakeRechargeRate
        );
        
        // Debug log when recharging starts or when fully recharged
        if (oldEnergy < this.config.brakeMaxEnergy && this.bikeState.brakeEnergy === this.config.brakeMaxEnergy) {
          console.log(`Brake fully recharged: ${this.bikeState.brakeEnergy}%`);
        }
      }
    }
  }

  public update(): { healthChanged: boolean; newHealth: number } {
    this.frameCount++;
    
    if (!this.bikeState.alive) {
      return { healthChanged: false, newHealth: this.bikeState.health };
    }

    // Update brake system
    this.updateBrakeSystem();

    // Handle turns
    const framesSinceLastTurn = this.frameCount - this.bikeState.lastTurnFrame;
    const canTurn = framesSinceLastTurn >= this.config.turnDelayFrames;
    
    if (canTurn && this.turnQueue.length > 0) {
      // Create trail segment from previous position to current position
      if (this.bikeState.trail.length > 0) {
        const lastPoint = this.bikeState.trail[this.bikeState.trail.length - 1];
        this.newTrailSegments.push({ start: lastPoint.clone(), end: this.bikeState.position.clone() });
      }
      
      this.bikeState.trail.push(this.bikeState.position.clone());
      this.trailFrames.push(this.frameCount);
      
      const turn = this.turnQueue.shift()!;
      if (turn === 'left') {
        this.bikeState.rotation += Math.PI / 2;
      } else if (turn === 'right') {
        this.bikeState.rotation -= Math.PI / 2;
      }
      this.bikeState.lastTurnFrame = this.frameCount;
    }

    // Move bike
    const direction = new THREE.Vector3(
      Math.sin(this.bikeState.rotation),
      0,
      Math.cos(this.bikeState.rotation)
    );
    
    // Apply progressive brake speed reduction if braking
    let currentSpeed = this.bikeState.speed;
    if (this.bikeState.isBraking && this.bikeState.brakeEnergy > 0) {
      // Progressive braking: speed reduction is proportional to energy used
      const energyUsed = this.config.brakeMaxEnergy - this.bikeState.brakeEnergy;
      const brakeProgress = energyUsed / this.config.brakeMaxEnergy; // 0 to 1
      
      // Speed reduction goes from 1.0 (no reduction) to brakeSpeedReduction (max reduction)
      const speedMultiplier = 1.0 - (brakeProgress * (1.0 - this.config.brakeSpeedReduction));
      currentSpeed *= speedMultiplier;
      
      // Debug log speed reduction every 30 frames while braking
      if (this.frameCount % 30 === 0) {
        console.log(`Progressive braking: Energy ${this.bikeState.brakeEnergy.toFixed(1)}/100, Progress ${(brakeProgress * 100).toFixed(1)}%, Speed ${(speedMultiplier * 100).toFixed(1)}%`);
      }
    }
    
    const potentialPosition = this.bikeState.position.clone().add(
      direction.multiplyScalar(currentSpeed)
    );

    // Check collisions
    const collision = this.bikePhysics.checkCollisions(
      potentialPosition,
      [...this.bikeState.trail, potentialPosition],
      this.bikeState
    );

    let newPosition = collision.corrected.clone();
    newPosition = this.bikePhysics.clampToBoundary(newPosition);

    // Handle collision damage
    let healthChanged = false;
    let headOn = false;
    
    if (collision.hit && collision.normal) {
      const push = direction.dot(collision.normal);
      if (push < 0) {
        // Head-on collision
        headOn = true;
        this.bikeState.grindOffset = Math.min(this.bikeState.grindOffset + 0.02, 0.3);
        this.bikeState.health = Math.max(0, this.bikeState.health - 1.2);
        this.lastHitFrame = this.frameCount;
        this.lastDamageType = 'collision';
        healthChanged = true;
      } else {
        // Grinding parallel to wall, no damage
        this.bikeState.grindOffset = Math.min(this.bikeState.grindOffset + 0.01, 0.3);
      }
      newPosition.add(collision.normal.clone().multiplyScalar(-this.bikeState.grindOffset));
    } else {
      this.bikeState.grindOffset = 0;
    }

    // Update position
    this.bikeState.position = newPosition;

    // Handle zone damage
    const isOutsideRing = this.arena.isPositionOutsideRing(newPosition);
    
    if (isOutsideRing) {
      this.outsideRingFrames++;
      this.bikeState.health = Math.max(0, this.bikeState.health - this.arena.getRingDepletionPerFrame());
      this.lastDamageType = 'zone';
      healthChanged = true;
    } else {
      this.outsideRingFrames = 0;
    }

    // Handle health regeneration
    const framesSinceHit = this.frameCount - this.lastHitFrame;
    if (!headOn && !isOutsideRing && framesSinceHit > this.config.regenDelayFrames && this.bikeState.health < this.bikeState.maxHealth) {
      const regenRate = this.lastDamageType === 'zone' ? this.config.slowRegenRate : this.config.fastRegenRate;
      this.bikeState.health = Math.min(this.bikeState.maxHealth, this.bikeState.health + regenRate);
      healthChanged = true;
    }

    // Update arena
    this.arena.shrinkRing();

    // Add to trail - denser segments for much longer visible trails
    const distanceThreshold = 0.3; // Denser segments = longer visible trail
    if (this.bikeState.trail.length === 0 || newPosition.distanceTo(this.bikeState.trail[this.bikeState.trail.length - 1]) > distanceThreshold) {
      // Create trail segment if we have a previous point
      if (this.bikeState.trail.length > 0) {
        const lastPoint = this.bikeState.trail[this.bikeState.trail.length - 1];
        this.newTrailSegments.push({ start: lastPoint.clone(), end: newPosition.clone() });
      }
      
      this.bikeState.trail.push(newPosition.clone());
      this.trailFrames.push(this.frameCount);
    }

    // Trim old trail segments - ensure collision and rendering stay in sync
    let trimmedCount = 0;
    const initialTrailLength = this.bikeState.trail.length;
    while (this.trailFrames.length > 0 && this.frameCount - this.trailFrames[0] > this.config.trailMaxFrames) {
      this.trailFrames.shift();
      if (this.bikeState.trail.length > 0) {
        this.bikeState.trail.shift();
      }
      this.segmentsToRemove++;
      trimmedCount++;
    }
    
    // Extra safeguard: if trail gets too long due to any sync issues, trim it
    const maxAllowedTrailLength = Math.ceil(this.config.trailMaxFrames / 60) * 4; // Very generous limit
    while (this.bikeState.trail.length > maxAllowedTrailLength) {
      this.bikeState.trail.shift();
      if (this.trailFrames.length > 0) {
        this.trailFrames.shift();
      }
      this.segmentsToRemove++;
      trimmedCount++;
    }
    
    // Debug logging to track trail management
    if (this.frameCount % 300 === 0) { // Log every 5 seconds
      console.log(`Trail Status: Length=${this.bikeState.trail.length}, Frames=${this.trailFrames.length}, MaxAge=${this.frameCount - (this.trailFrames[0] || this.frameCount)}, Segments to remove: ${this.segmentsToRemove}`);
    }
    if (trimmedCount > 0) {
      console.log(`Trimmed ${trimmedCount} trail segments. Length: ${initialTrailLength} -> ${this.bikeState.trail.length}`);
    }

    // Grace period system - handle death protection
    if (this.bikeState.health <= 0) {
      if (this.bikeState.graceFramesRemaining <= 0) {
        // Start grace period when health hits 0
        this.bikeState.graceFramesRemaining = this.config.graceFrames;
        console.log(`Grace period started: ${this.config.graceFrames} frames protection`);
      } else {
        // Count down grace frames
        this.bikeState.graceFramesRemaining--;
        
        // If still taking damage during grace period, reduce grace time faster
        if (headOn || isOutsideRing) {
          this.bikeState.graceFramesRemaining -= 2; // Faster countdown if still hitting things
        }
      }
      
      // Only die if grace period expired
      if (this.bikeState.graceFramesRemaining <= 0) {
        this.bikeState.alive = false;
      }
    } else {
      // Reset grace period if health is above 0
      this.bikeState.graceFramesRemaining = 0;
    }

    // Ensure health doesn't go below -10 (prevent infinite grace abuse)
    this.bikeState.health = Math.max(-10, this.bikeState.health);

    return { healthChanged, newHealth: this.bikeState.health };
  }

  public reset(): void {
    this.bikeState = this.createInitialBikeState();
    this.bikePhysics.resetGrindDepthMap();
    this.arena.reset();
    this.turnQueue = [];
    this.frameCount = 0;
    this.lastHitFrame = 0;
    this.lastDamageType = null;
    this.outsideRingFrames = 0;
    this.trailFrames = [0];
    this.newTrailSegments = [];
    this.segmentsToRemove = 0;
  }

  public getTrailFrames(): number[] {
    return [...this.trailFrames];
  }

  public getNewTrailSegments(): { start: THREE.Vector3; end: THREE.Vector3 }[] {
    const segments = [...this.newTrailSegments];
    this.newTrailSegments = []; // Clear after returning
    return segments;
  }

  public getSegmentsToRemove(): number {
    const count = this.segmentsToRemove;
    this.segmentsToRemove = 0; // Reset after returning
    return count;
  }

  public getTrailLength(): number {
    return this.bikeState.trail.length;
  }

  public getActiveTrailFrameSpan(): number {
    if (this.trailFrames.length === 0) return 0;
    return this.frameCount - this.trailFrames[0];
  }

  public getCollisionSafeTrailLength(): number {
    // Return the number of trail segments that are safe to check for collision
    // This should match the number of segments in the renderer
    return Math.max(0, this.bikeState.trail.length - 10); // Skip recent segments
  }

  public getGraceFramesRemaining(): number {
    return this.bikeState.graceFramesRemaining;
  }
}
