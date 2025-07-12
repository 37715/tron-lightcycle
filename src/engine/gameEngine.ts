import * as THREE from 'three';
import { BikeState, GameConfig, DamageType, TurnDirection } from './types';
import { BikePhysics } from './bike';
import { Arena } from './arena';

export class GameEngine {
  private bikeState: BikeState;
  private bikePhysics: BikePhysics;
  private arena: Arena;
  private frameCount = 0;
  private lastHitFrame = 0;
  private lastDamageType: DamageType = null;
  private outsideRingFrames = 0;
  private trailFrames: number[] = [];
  private newTrailSegments: { start: THREE.Vector3; end: THREE.Vector3 }[] = [];
  private segmentsToRemove = 0;
  
  // Anti-phase: track collision state more aggressively
  private collisionFrameCount = 0;
  private lastCollisionNormal: THREE.Vector3 | null = null;

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
      speedTarget: this.config.speedTarget,
      lastTurnFrame: 0,
      health: 156,
      maxHealth: 156,
      grindOffset: 0,
      grindNormal: null,
      graceFramesRemaining: 0,
      brakeEnergy: this.config.brakeMaxEnergy,
      brakeRechargeDelay: 0,
      isBraking: false,
      
      // Grinding system
      lastX: initialPosition.x,
      lastY: initialPosition.z,
      lastdirX: 0,
      lastdirY: 1,
      checkLast: true,
      
      rubber: 0,
      rubberMax: this.config.rubberMax,
      rubberTime: this.config.rubberTime,
      collision: false,
      collideTime: 999,
      lastSpeed: this.config.bikeSpeed,
      
      distF: 999,
      distL: 999,
      distR: 999,
      minDistF: this.config.rubberMinDist,
      
      turnQueue: [],
      cycleDelay: this.config.turnDelayFrames / 60.0,
      lastTurnTime: 0,
      
      accelBase: this.config.accelBase,
      wallNear: this.config.wallNear
    };
  }

  public getBikeState(): BikeState {
    return this.bikeState;
  }

  public getArena(): Arena {
    return this.arena;
  }

  public getFrameCount(): number {
    return this.frameCount;
  }

  public queueTurn(direction: TurnDirection): void {
    // ANTI-PHASE: Don't even queue turns during active collision
    if (this.collisionFrameCount > 0 || this.bikeState.rubber > 0.5) {
      return;
    }
    this.bikeState.turnQueue.push(direction);
  }

  public setBraking(isBraking: boolean): void {
    this.bikeState.isBraking = isBraking;
  }

  private updateBrakeSystem(): void {
    if (this.bikeState.isBraking && this.bikeState.brakeEnergy > 0) {
      this.bikeState.brakeEnergy = Math.max(0, this.bikeState.brakeEnergy - this.config.brakeDepletionRate);
      this.bikeState.brakeRechargeDelay = this.config.brakeRechargeDelayFrames;
    } else {
      if (this.bikeState.brakeEnergy <= 0) {
        this.bikeState.isBraking = false;
      }
      
      if (this.bikeState.brakeRechargeDelay > 0) {
        this.bikeState.brakeRechargeDelay--;
      } else {
        this.bikeState.brakeEnergy = Math.min(
          this.config.brakeMaxEnergy, 
          this.bikeState.brakeEnergy + this.config.brakeRechargeRate
        );
      }
    }
  }

  private checkCollisionAtPosition(position: THREE.Vector3, skipRecent: number = 5): boolean {
    // Check boundary collision
    const limit = this.config.boundaryLimit - 0.08;
    if (Math.abs(position.x) > limit || Math.abs(position.z) > limit) {
      return true;
    }
    
    // Check trail collision - only consider trail segments that are old enough to be rendered
    const safeDistance = this.config.trailWidth + 0.03; // Reduced margin for stricter detection
    const maxCheckIndex = Math.max(0, this.bikeState.trail.length - skipRecent);
    
    // Use line segment collision detection for better accuracy
    for (let i = 0; i < maxCheckIndex - 1; i++) {
      const segmentStart = this.bikeState.trail[i];
      const segmentEnd = this.bikeState.trail[i + 1];
      
      // Skip very short segments
      if (segmentStart.distanceTo(segmentEnd) < 0.01) continue;
      
      // Check distance to line segment
      const segmentDir = new THREE.Vector3().subVectors(segmentEnd, segmentStart);
      const segmentLength = segmentDir.length();
      segmentDir.normalize();
      
      const toStart = new THREE.Vector3().subVectors(position, segmentStart);
      const projLength = THREE.MathUtils.clamp(toStart.dot(segmentDir), 0, segmentLength);
      
      const closestPoint = segmentStart.clone().add(segmentDir.clone().multiplyScalar(projLength));
      const distance = position.distanceTo(closestPoint);
      
      if (distance < safeDistance) {
        return true;
      }
    }
    
    return false;
  }

  public update(): { healthChanged: boolean; newHealth: number } {
    this.frameCount++;
    
    if (!this.bikeState.alive) {
      return { healthChanged: false, newHealth: this.bikeState.health };
    }

    // Update brake system
    this.updateBrakeSystem();

    // Calculate direction and movement
    const direction = new THREE.Vector3(
      Math.sin(this.bikeState.rotation),
      0,
      Math.cos(this.bikeState.rotation)
    );
    
    let currentSpeed = this.bikeState.speed;
    if (this.bikeState.isBraking && this.bikeState.brakeEnergy > 0) {
      const energyUsed = this.config.brakeMaxEnergy - this.bikeState.brakeEnergy;
      const brakeProgress = energyUsed / this.config.brakeMaxEnergy;
      const speedMultiplier = 1.0 - (brakeProgress * (1.0 - this.config.brakeSpeedReduction));
      currentSpeed *= speedMultiplier;
    }
    
    // ANTI-PHASE: Block ALL turns during collision recovery
    const framesSinceLastTurn = this.frameCount - this.bikeState.lastTurnFrame;
    const canTurn = framesSinceLastTurn >= this.config.turnDelayFrames && 
                   this.collisionFrameCount === 0 && 
                   this.bikeState.rubber < 0.1;
    
    if (canTurn && this.bikeState.turnQueue.length > 0) {
      const turn = this.bikeState.turnQueue[0];
      
      // Calculate new rotation
      let newRotation = this.bikeState.rotation;
      if (turn === 'left') {
        newRotation += Math.PI / 2;
      } else if (turn === 'right') {
        newRotation -= Math.PI / 2;
      }
      
      // STRICT validation: Check if we're near any collision
      const testPositions = [];
      const newDir = new THREE.Vector3(Math.sin(newRotation), 0, Math.cos(newRotation));
      
      // Check current position and multiple future positions
      testPositions.push(this.bikeState.position);
      for (let dist = 0.05; dist <= currentSpeed * 2; dist += 0.05) {
        testPositions.push(this.bikeState.position.clone().add(direction.clone().multiplyScalar(dist)));
        testPositions.push(this.bikeState.position.clone().add(newDir.clone().multiplyScalar(dist)));
      }
      
      let turnSafe = true;
      for (const testPos of testPositions) {
        if (this.checkCollisionAtPosition(testPos, 3)) {
          turnSafe = false;
          break;
        }
      }
      
      if (turnSafe) {
        // Create trail segment at turn point
        if (this.bikeState.trail.length > 0) {
          const lastPoint = this.bikeState.trail[this.bikeState.trail.length - 1];
          if (lastPoint.distanceTo(this.bikeState.position) > 0.05) {
            this.newTrailSegments.push({ start: lastPoint.clone(), end: this.bikeState.position.clone() });
          }
        }
        
        this.bikeState.trail.push(this.bikeState.position.clone());
        this.trailFrames.push(this.frameCount);
        
        this.bikeState.rotation = newRotation;
        this.bikeState.turnQueue.shift();
        this.bikeState.lastTurnFrame = this.frameCount;
      } else {
        // Clear queue on failed turn
        this.bikeState.turnQueue = [];
      }
    }
    
    // Clear turn queue if we're in collision
    if (this.collisionFrameCount > 0 || this.bikeState.rubber > 0.1) {
      this.bikeState.turnQueue = [];
    }

    // MOVEMENT: Check for collisions
    const potentialPosition = this.bikeState.position.clone().add(
      direction.multiplyScalar(currentSpeed)
    );

    // Use collision system
    const collision = this.bikePhysics.checkCollisions(
      potentialPosition,
      [...this.bikeState.trail, potentialPosition],
      this.bikeState
    );

    let newPosition = collision.corrected.clone();
    newPosition = this.bikePhysics.clampToBoundary(newPosition);
    let healthChanged = false;
    
    // GRINDING MECHANICS - restored
    if (collision.hit && collision.normal) {
      const normalizedNormal = collision.normal.clone().normalize();
      const normalizedDirection = direction.clone().normalize();
      const dotProduct = normalizedDirection.dot(normalizedNormal);
      
      this.bikeState.collision = true;
      this.lastHitFrame = this.frameCount;
      this.lastDamageType = 'collision';
      this.lastCollisionNormal = normalizedNormal.clone();
      
      // Increment collision frame count
      this.collisionFrameCount = 10; // Stay in collision state for 10 frames
      
      // Head-on collision: accumulate damage
      if (dotProduct < -0.5) {
        this.bikeState.rubber += currentSpeed * 1.5;
        
        // Die if too much rubber accumulated
        if (this.bikeState.rubber > this.bikeState.rubberMax) {
          this.bikeState.alive = false;
          return { healthChanged: true, newHealth: 0 };
        }
        
        // ANTI-PHASE: For head-on collisions, stop movement entirely
        newPosition = this.bikeState.position.clone();
      } 
      // Grinding: try to slide along wall
      else if (Math.abs(dotProduct) < 0.5) {
        const slideDirection = direction.clone().sub(
          normalizedNormal.clone().multiplyScalar(dotProduct)
        ).normalize();
        
        const slideMovement = slideDirection.multiplyScalar(currentSpeed * 0.7);
        const slidePosition = this.bikeState.position.clone().add(slideMovement);
        
        // Validate slide position
        if (!this.checkCollisionAtPosition(slidePosition, 3)) {
          newPosition = slidePosition;
          newPosition = this.bikePhysics.clampToBoundary(newPosition);
        } else {
          // Can't slide, stay put
          newPosition = this.bikeState.position.clone();
        }
        
        // Gradual rubber decay while grinding
        if (this.bikeState.rubber > 0) {
          this.bikeState.rubber -= this.bikeState.rubber * 0.03;
        }
      }
    } else {
      // No collision - decay rubber and collision state
      this.bikeState.collision = false;
      if (this.collisionFrameCount > 0) {
        this.collisionFrameCount--;
      }
      if (this.bikeState.rubber > 0) {
        this.bikeState.rubber -= this.bikeState.rubber * 0.08;
        if (this.bikeState.rubber < 0.001) {
          this.bikeState.rubber = 0;
        }
      }
    }

    // FINAL SAFETY CHECK: Never allow position inside collision
    if (this.checkCollisionAtPosition(newPosition, 3)) {
      // Revert to current position
      newPosition = this.bikeState.position.clone();
      this.collisionFrameCount = 10;
      this.bikeState.rubber = Math.min(this.bikeState.rubberMax, this.bikeState.rubber + 1);
    }

    // Update position
    this.bikeState.position = newPosition;

    // Handle zone damage
    const isOutsideRing = this.arena.isPositionOutsideRing(this.bikeState.position);
    
    if (isOutsideRing) {
      this.outsideRingFrames++;
      this.bikeState.health = Math.max(0, this.bikeState.health - this.arena.getRingDepletionPerFrame());
      this.lastDamageType = 'zone';
      healthChanged = true;
    } else {
      this.outsideRingFrames = 0;
    }

    // Health regeneration
    const framesSinceHit = this.frameCount - this.lastHitFrame;
    if (!this.bikeState.collision && !isOutsideRing && framesSinceHit > this.config.regenDelayFrames && this.bikeState.health < this.bikeState.maxHealth) {
      const regenRate = this.lastDamageType === 'zone' ? this.config.slowRegenRate : this.config.fastRegenRate;
      this.bikeState.health = Math.min(this.bikeState.maxHealth, this.bikeState.health + regenRate);
      healthChanged = true;
    }

    // Update arena
    this.arena.shrinkRing();

    // Add to trail
    const distanceThreshold = 0.3;
    if (this.bikeState.trail.length === 0 || this.bikeState.position.distanceTo(this.bikeState.trail[this.bikeState.trail.length - 1]) > distanceThreshold) {
      if (this.bikeState.trail.length > 0) {
        const lastPoint = this.bikeState.trail[this.bikeState.trail.length - 1];
        this.newTrailSegments.push({ start: lastPoint.clone(), end: this.bikeState.position.clone() });
      }
      
      this.bikeState.trail.push(this.bikeState.position.clone());
      this.trailFrames.push(this.frameCount);
    }

    // Trail cleanup
    let segmentsRemoved = 0;
    const maxFrames = this.config.trailMaxFrames;
    
    if (this.frameCount % 10 === 0) {
      const frameThreshold = this.frameCount - maxFrames;
      
      while (this.trailFrames.length > 1 && this.trailFrames[0] < frameThreshold) {
        this.trailFrames.shift();
        if (this.bikeState.trail.length > 1) {
          this.bikeState.trail.shift();
          segmentsRemoved++;
        }
      }
      
      const maxTrailLength = 300;
      while (this.bikeState.trail.length > maxTrailLength) {
        this.bikeState.trail.shift();
        this.trailFrames.shift();
        segmentsRemoved++;
      }
    }
    
    this.segmentsToRemove = segmentsRemoved;

    // Grace period system
    if (this.bikeState.health <= 0) {
      if (this.bikeState.graceFramesRemaining <= 0) {
        this.bikeState.graceFramesRemaining = this.config.graceFrames;
      } else {
        this.bikeState.graceFramesRemaining--;
        
        if (this.bikeState.collision || isOutsideRing) {
          this.bikeState.graceFramesRemaining -= 2;
        }
      }
      
      if (this.bikeState.graceFramesRemaining <= 0) {
        this.bikeState.alive = false;
      }
    } else {
      this.bikeState.graceFramesRemaining = 0;
    }

    this.bikeState.health = Math.max(-10, this.bikeState.health);

    return { healthChanged, newHealth: this.bikeState.health };
  }

  public reset(): void {
    this.bikeState = this.createInitialBikeState();
    this.bikePhysics.resetGrindDepthMap();
    this.arena.reset();
    this.frameCount = 0;
    this.lastHitFrame = 0;
    this.lastDamageType = null;
    this.outsideRingFrames = 0;
    this.trailFrames = [0];
    this.newTrailSegments = [];
    this.segmentsToRemove = 0;
    this.collisionFrameCount = 0;
    this.lastCollisionNormal = null;
  }

  public getTrailFrames(): number[] {
    return [...this.trailFrames];
  }

  public getNewTrailSegments(): { start: THREE.Vector3; end: THREE.Vector3 }[] {
    const segments = [...this.newTrailSegments];
    this.newTrailSegments = [];
    return segments;
  }

  public getSegmentsToRemove(): number {
    const count = this.segmentsToRemove;
    this.segmentsToRemove = 0;
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
    return Math.max(0, this.bikeState.trail.length - 10);
  }

  public getGraceFramesRemaining(): number {
    return this.bikeState.graceFramesRemaining;
  }
}