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
    
    // Check trail collision
    const safeDistance = this.config.trailWidth + 0.03;
    const maxCheckIndex = Math.max(0, this.bikeState.trail.length - skipRecent);
    
    for (let i = 0; i < maxCheckIndex - 1; i++) {
      const segmentStart = this.bikeState.trail[i];
      const segmentEnd = this.bikeState.trail[i + 1];
      
      if (segmentStart.distanceTo(segmentEnd) < 0.01) continue;
      
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

  // NEW: Check if a line segment intersects with any trail or boundary
  private checkLineCollision(start: THREE.Vector3, end: THREE.Vector3, skipRecent: number = 5): boolean {
    // Check if line segment crosses boundary
    const limit = this.config.boundaryLimit - 0.08;
    
    // Check each boundary wall
    if ((start.x <= -limit && end.x >= -limit) || (start.x >= -limit && end.x <= -limit) ||
        (start.x <= limit && end.x >= limit) || (start.x >= limit && end.x <= limit) ||
        (start.z <= -limit && end.z >= -limit) || (start.z >= -limit && end.z <= -limit) ||
        (start.z <= limit && end.z >= limit) || (start.z >= limit && end.z <= limit)) {
      return true;
    }
    
    // Check trail intersections
    const maxCheckIndex = Math.max(0, this.bikeState.trail.length - skipRecent);
    
    for (let i = 0; i < maxCheckIndex - 1; i++) {
      const trailStart = this.bikeState.trail[i];
      const trailEnd = this.bikeState.trail[i + 1];
      
      if (this.lineSegmentsIntersect(start, end, trailStart, trailEnd)) {
        return true;
      }
    }
    
    return false;
  }

  // Check if two line segments intersect
  private lineSegmentsIntersect(p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, p4: THREE.Vector3): boolean {
    const d1 = new THREE.Vector3().subVectors(p2, p1);
    const d2 = new THREE.Vector3().subVectors(p4, p3);
    const d3 = new THREE.Vector3().subVectors(p1, p3);
    
    const denominator = d1.x * d2.z - d1.z * d2.x;
    
    if (Math.abs(denominator) < 0.0001) return false;
    
    const t1 = (d3.x * d2.z - d3.z * d2.x) / denominator;
    const t2 = (d3.x * d1.z - d3.z * d1.x) / denominator;
    
    return t1 >= 0 && t1 <= 1 && t2 >= 0 && t2 <= 1;
  }

  public update(): { healthChanged: boolean; newHealth: number } {
    this.frameCount++;
    
    if (!this.bikeState.alive) {
      return { healthChanged: false, newHealth: this.bikeState.health };
    }

    // Update brake system
    this.updateBrakeSystem();

    // Store initial state
    const startPosition = this.bikeState.position.clone();
    const startRotation = this.bikeState.rotation;

    // Calculate direction and movement
    let direction = new THREE.Vector3(
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
    
    // Track if we execute a turn this frame
    let turnExecuted = false;
    let newRotation = this.bikeState.rotation;
    
    // Handle turns
    const framesSinceLastTurn = this.frameCount - this.bikeState.lastTurnFrame;
    const canTurn = framesSinceLastTurn >= this.config.turnDelayFrames;
    
    if (canTurn && this.bikeState.turnQueue.length > 0) {
      const turn = this.bikeState.turnQueue[0];
      
      // Calculate new rotation
      if (turn === 'left') {
        newRotation += Math.PI / 2;
      } else if (turn === 'right') {
        newRotation -= Math.PI / 2;
      }
      
      // NEW: Simulate the turn and check if it would cause collision
      const turnCenter = startPosition.clone();
      const newDirection = new THREE.Vector3(
        Math.sin(newRotation),
        0,
        Math.cos(newRotation)
      );
      
      // Check multiple points along the turn arc
      let turnSafe = true;
      const arcSteps = 8;
      let previousPos = startPosition.clone();
      
      for (let i = 1; i <= arcSteps; i++) {
        const t = i / arcSteps;
        const interpolatedAngle = startRotation + (newRotation - startRotation) * t;
        const interpolatedDir = new THREE.Vector3(
          Math.sin(interpolatedAngle),
          0,
          Math.cos(interpolatedAngle)
        );
        
        const arcPos = turnCenter.clone().add(
          interpolatedDir.multiplyScalar(currentSpeed * t)
        );
        
        // Check if this segment of the arc would pass through anything
        if (this.checkLineCollision(previousPos, arcPos, 2)) {
          turnSafe = false;
          break;
        }
        
        // Also check the position itself
        if (this.checkCollisionAtPosition(arcPos, 2)) {
          turnSafe = false;
          break;
        }
        
        previousPos = arcPos.clone();
      }
      
      // Final check: would the position after the turn be valid?
      const postTurnPos = startPosition.clone().add(
        newDirection.multiplyScalar(currentSpeed)
      );
      
      if (turnSafe && !this.checkCollisionAtPosition(postTurnPos, 2)) {
        // Turn is safe - execute it
        turnExecuted = true;
        this.bikeState.rotation = newRotation;
        direction = newDirection;
        this.bikeState.turnQueue.shift();
        this.bikeState.lastTurnFrame = this.frameCount;
        
        // Add trail point at turn
        if (this.bikeState.trail.length > 0) {
          const lastPoint = this.bikeState.trail[this.bikeState.trail.length - 1];
          if (lastPoint.distanceTo(this.bikeState.position) > 0.05) {
            this.newTrailSegments.push({ start: lastPoint.clone(), end: this.bikeState.position.clone() });
          }
        }
        
        this.bikeState.trail.push(this.bikeState.position.clone());
        this.trailFrames.push(this.frameCount);
      } else {
        // Turn would cause collision - clear queue
        this.bikeState.turnQueue = [];
      }
    }

    // Calculate potential position
    const potentialPosition = this.bikeState.position.clone().add(
      direction.multiplyScalar(currentSpeed)
    );

    // NEW: Check if movement would pass through anything
    let movementSafe = !this.checkLineCollision(this.bikeState.position, potentialPosition, 3);
    
    // Use collision system for final position
    const collision = this.bikePhysics.checkCollisions(
      potentialPosition,
      [...this.bikeState.trail, potentialPosition],
      this.bikeState
    );

    let newPosition = collision.corrected.clone();
    newPosition = this.bikePhysics.clampToBoundary(newPosition);
    
    // If movement would pass through something, don't move at all
    if (!movementSafe) {
      newPosition = this.bikeState.position.clone();
      collision.hit = true;
    }
    
    let healthChanged = false;
    
    // Handle collision mechanics
    if (collision.hit && collision.normal) {
      const normalizedNormal = collision.normal.clone().normalize();
      const normalizedDirection = direction.clone().normalize();
      const dotProduct = normalizedDirection.dot(normalizedNormal);
      
      this.bikeState.collision = true;
      this.lastHitFrame = this.frameCount;
      this.lastDamageType = 'collision';
      
      // Head-on collision
      if (dotProduct < -0.5) {
        this.bikeState.rubber += currentSpeed * 1.5;
        
        if (this.bikeState.rubber > this.bikeState.rubberMax) {
          this.bikeState.alive = false;
          return { healthChanged: true, newHealth: 0 };
        }
        
        // Don't move on head-on collision
        newPosition = this.bikeState.position.clone();
      } 
      // Grinding
      else if (Math.abs(dotProduct) < 0.5) {
        const slideDirection = direction.clone().sub(
          normalizedNormal.clone().multiplyScalar(dotProduct)
        ).normalize();
        
        const slideMovement = slideDirection.multiplyScalar(currentSpeed * 0.7);
        const slidePosition = this.bikeState.position.clone().add(slideMovement);
        
        // Check if slide is safe
        if (!this.checkLineCollision(this.bikeState.position, slidePosition, 3) &&
            !this.checkCollisionAtPosition(slidePosition, 3)) {
          newPosition = slidePosition;
          newPosition = this.bikePhysics.clampToBoundary(newPosition);
        } else {
          // Can't slide safely
          newPosition = this.bikeState.position.clone();
        }
        
        // Decay rubber while grinding
        if (this.bikeState.rubber > 0) {
          this.bikeState.rubber -= this.bikeState.rubber * 0.03;
        }
      }
    } else {
      // No collision - decay rubber
      this.bikeState.collision = false;
      if (this.bikeState.rubber > 0) {
        this.bikeState.rubber -= this.bikeState.rubber * 0.08;
        if (this.bikeState.rubber < 0.001) {
          this.bikeState.rubber = 0;
        }
      }
    }

    // FINAL SAFETY: Ensure we never end up inside a collision
    if (this.checkCollisionAtPosition(newPosition, 3)) {
      // Revert to current position
      newPosition = this.bikeState.position.clone();
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

    // Add to trail (only if we moved)
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