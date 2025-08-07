import * as THREE from 'three';
import { BikeState, GameConfig, DamageType, TurnDirection, DebugState, CollisionCheck } from './types';
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
  
  // Anti-phasing additions
  private positionHistory: THREE.Vector3[] = [];

  // Debug system
  private debugState: DebugState = {
    enabled: false,
    showCollisionBox: true,
    showWallSegments: true,
    showTextOverlay: true,
    showGrindZone: true,
    logCollisionChanges: true,
    stepByStep: false,
    isPaused: false,
    collisionHistory: []
  };
  
  private lastCollisionState = false;
  private nearbyWallSegments: { start: THREE.Vector3; end: THREE.Vector3 }[] = [];
  private debugCollisionBox: THREE.Vector3[] = [];
  private debugGrindZone: THREE.Vector3[] = [];

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
      health: this.config.maxHealth ?? 94,
      maxHealth: this.config.maxHealth ?? 94,
      grindOffset: 0,
      grindNormal: null,
      graceFramesRemaining: 0,
      isGrinding: false,
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
    // ANTI-PHASING FIX 1: Limit turn queue to 1 turn
    if (this.bikeState.turnQueue.length >= 1) {
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

  // ANTI-PHASING FIX 3: Enhanced collision detection at specific positions

  private checkCollisionAtPosition(position: THREE.Vector3, skipRecent: number = 5): boolean {
    // Check boundary collision
    const limit = this.config.boundaryLimit - 0.08;
    if (Math.abs(position.x) > limit || Math.abs(position.z) > limit) {
      return true;
    }
    
    // Check trail collision with proper buffer for safety
    const safeDistance = this.config.trailWidth + 0.06; // Proper safety buffer
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

  public update(): { healthChanged: boolean; newHealth: number } {
    this.frameCount++;
    
    // Check if game is paused for step-by-step debugging
    if (this.debugState.stepByStep && this.debugState.isPaused) {
      return { healthChanged: false, newHealth: this.bikeState.health };
    }
    
    if (!this.bikeState.alive) {
      return { healthChanged: false, newHealth: this.bikeState.health };
    }

    // Update brake system
    this.updateBrakeSystem();
    
    // Update debug geometry
    this.updateDebugGeometry();

    // Calculate direction and movement
    let direction = new THREE.Vector3(
      Math.sin(this.bikeState.rotation),
      0,
      Math.cos(this.bikeState.rotation)
    );
    
    let currentSpeed = this.bikeState.speed;
    
    // Wall acceleration - speed up when near walls/trails
    const wallDistance = this.calculateDistanceToNearestWall();
    if (wallDistance < this.config.wallNear) {
      const wallProximity = Math.max(0, (this.config.wallNear - wallDistance) / this.config.wallNear);
      const speedBoost = this.config.accelBase * wallProximity;
      currentSpeed += speedBoost;
    }
    
    if (this.bikeState.isBraking && this.bikeState.brakeEnergy > 0) {
      const energyUsed = this.config.brakeMaxEnergy - this.bikeState.brakeEnergy;
      const brakeProgress = energyUsed / this.config.brakeMaxEnergy;
      const speedMultiplier = 1.0 - (brakeProgress * (1.0 - this.config.brakeSpeedReduction));
      currentSpeed *= speedMultiplier;
    }
    
    // Track rotation changes
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
      
      // ANTI-PHASING FIX 4: Instant turn validation
      // For lightcycles, turns are instant 90-degree rotations
      // We need to check the entire path from current position to post-turn position
      
      const newDirection = new THREE.Vector3(
        Math.sin(newRotation),
        0,
        Math.cos(newRotation)
      );
      
      // Create corner point EXACTLY at current position before turn
      const cornerPoint = this.bikeState.position.clone();
      
      // Post-turn position
      const postTurnPos = cornerPoint.clone().add(
        newDirection.multiplyScalar(currentSpeed)
      );
      
      // ANTI-PHASING FIX 5: Check rectangular sweep for the turn
      // This checks the entire area the bike would occupy during the turn
      let turnSafe = true;
      
      // INVISIBLE ANTI-PHASING FIX: Reset position when grinding + turning BUT make it visually smooth
      // When the bike attempts to turn while grinding, reset the bike position to be exactly 
      // trailWidth + 0.02 units away from the wall BEFORE processing the turn.
      let positionWasReset = false;
      if ((this.bikeState.grindOffset > 0 || this.bikeState.collision) && this.bikeState.grindNormal) {
        console.log(`🔧 INVISIBLE ANTI-PHASING: Grinding detected, performing invisible position reset`);
        
        // Store the original position for smooth trail creation
        const originalPosition = this.bikeState.position.clone();
        
        // Use smaller safe distance for tighter gameplay but still effective anti-phasing
        const safeDistance = this.config.trailWidth + 0.02;
        const normalizedGrindNormal = this.bikeState.grindNormal.clone().normalize();
        
        // Push bike away from wall by safe distance BEFORE processing the turn
        const safePosition = originalPosition.clone().add(
          normalizedGrindNormal.multiplyScalar(safeDistance)
        );
        
        // Clamp to boundaries and update position
        this.bikeState.position = this.bikePhysics.clampToBoundary(safePosition);
        
        // INVISIBLE TRAIL SMOOTHING: Create smooth trail segment from original to reset position
        if (this.bikeState.trail.length > 0) {
          const lastTrailPoint = this.bikeState.trail[this.bikeState.trail.length - 1];
          const resetPosition = this.bikeState.position.clone();
          
          // Only create smooth segment if there's meaningful distance AND the reset is invisible to player
          if (lastTrailPoint.distanceTo(resetPosition) > 0.01) {
            // Add intermediate points for ultra-smooth visual transition
            const steps = Math.max(2, Math.ceil(lastTrailPoint.distanceTo(resetPosition) / 0.02));
            for (let i = 1; i <= steps; i++) {
              const t = i / steps;
              const intermediatePoint = lastTrailPoint.clone().lerp(resetPosition, t);
              
              this.newTrailSegments.push({ 
                start: i === 1 ? lastTrailPoint.clone() : this.bikeState.trail[this.bikeState.trail.length - 1].clone(), 
                end: intermediatePoint.clone() 
              });
              
              if (i === steps) {
                // Final point is the reset position
                this.bikeState.trail.push(resetPosition.clone());
                this.trailFrames.push(this.frameCount);
              } else {
                // Add intermediate trail points for smoothness
                this.bikeState.trail.push(intermediatePoint.clone());
                this.trailFrames.push(this.frameCount);
              }
            }
            positionWasReset = true;
          }
        }
        
        // Update corner point to new safe position
        cornerPoint.copy(this.bikeState.position);
        
        console.log(`📍 Invisible position reset: (${originalPosition.x.toFixed(3)}, ${originalPosition.z.toFixed(3)}) → (${this.bikeState.position.x.toFixed(3)}, ${this.bikeState.position.z.toFixed(3)})`);
      }
      
      // SIMPLE TURN SAFETY CHECKS
      // Check if we can place a trail segment at the corner
      if (turnSafe && this.checkCollisionAtPosition(cornerPoint, 2)) {
        turnSafe = false;
        console.log(`🚨 TURN BLOCKED: Corner position collision detected`);
      }

      // Check the movement after turn
      if (turnSafe && this.checkCollisionAtPosition(postTurnPos, 2)) {
        turnSafe = false;
        console.log(`🚨 TURN BLOCKED: Post-turn position collision detected`);
      }
      
      if (turnSafe) {
        // Turn is safe - execute it
        console.log(`✅ TURN EXECUTED: Turn approved and being executed`);
        
        // Create corner trail point only if position wasn't already reset
        if (!positionWasReset && this.bikeState.trail.length > 0) {
          const lastPoint = this.bikeState.trail[this.bikeState.trail.length - 1];
          
          if (lastPoint.distanceTo(cornerPoint) > 0.01) {
            this.newTrailSegments.push({ start: lastPoint.clone(), end: cornerPoint.clone() });
            this.bikeState.trail.push(cornerPoint.clone());
            this.trailFrames.push(this.frameCount);
          }
        }
        
        // Update rotation and direction
        this.bikeState.rotation = newRotation;
        direction = newDirection;
        this.bikeState.turnQueue.shift();
        this.bikeState.lastTurnFrame = this.frameCount;
      } else {
        // Turn would cause collision - just don't turn, but don't block future turns
        console.log(`🚨 TURN BLOCKED: Turn would cause collision, but bike remains responsive`);
      }
    }

    // Calculate potential position
    const potentialPosition = this.bikeState.position.clone().add(
      direction.multiplyScalar(currentSpeed)
    );

    // Use collision system for final position
    const collision = this.bikePhysics.checkCollisions(
      potentialPosition,
      [...this.bikeState.trail, potentialPosition],
      this.bikeState
    );

    let newPosition = collision.corrected.clone();
    newPosition = this.bikePhysics.clampToBoundary(newPosition);
    
    // Log collision check for debugging
    const distanceToWall = this.calculateDistanceToNearestWall();
    this.logCollisionCheck('movement', collision.hit, this.bikeState.rubber, this.bikeState.grindOffset, distanceToWall);
    
    let healthChanged = false;
    
    // Handle collision mechanics and grindOffset (matching multiplayer engine)
    if (collision.hit && collision.normal) {
      const normalizedNormal = collision.normal.clone().normalize();
      const normalizedDirection = direction.clone().normalize();
      const normalizedPush = normalizedDirection.dot(normalizedNormal);
      
      this.bikeState.collision = true;
      this.lastHitFrame = this.frameCount;
      this.lastDamageType = 'collision';
      
      if (normalizedPush < -0.6) {
        // Head-on collision - moderate damage to discourage spam but allow skilled play
        this.bikeState.grindOffset = Math.min(this.bikeState.grindOffset + 0.02, 0.3);
        this.bikeState.health = Math.max(0, this.bikeState.health - 8);
        healthChanged = true;
      } else {
        // Grinding - no damage (back to original behavior)
        this.bikeState.grindOffset = Math.min(this.bikeState.grindOffset + 0.01, 0.3);
      }
      
      // Store the grind normal for turn checking
      this.bikeState.grindNormal = normalizedNormal;
      
      // Apply position adjustment based on grindOffset
      newPosition.add(collision.normal.clone().multiplyScalar(-this.bikeState.grindOffset));
    } else {
      // No collision - reset grindOffset and collision state
      this.bikeState.grindOffset = 0;
      this.bikeState.collision = false;
      this.bikeState.grindNormal = null;
    }
    
    // CORNER STUCK DETECTION: If bike hasn't moved much and is near walls, apply damage
    // This ensures health always depletes when truly stuck, preventing corner camping and phasing exploits
    let isStuckInCorner = false;
    
    // PRIMARY DETECTION: Trail-based movement detection
    if (this.bikeState.trail.length >= 4) {
      const recentPositions = this.bikeState.trail.slice(-4);
      let maxMovement = 0;
      
      for (let i = 1; i < recentPositions.length; i++) {
        const movement = recentPositions[i].distanceTo(recentPositions[i-1]);
        maxMovement = Math.max(maxMovement, movement);
      }
      
      // If bike hasn't moved much (stuck) and is near walls/trails
      if (maxMovement < 0.02) {
        const nearWall = this.calculateDistanceToNearestWall() < 0.25;
                  if (nearWall) {
            isStuckInCorner = true;
            this.bikeState.health = Math.max(0, this.bikeState.health - 15);
            this.lastHitFrame = this.frameCount;
            this.lastDamageType = 'collision';
            healthChanged = true;
          console.log(`🏪 CORNER STUCK: Applying damage (15) for being stuck near wall`);
        }
      }
    }
    
    // SECONDARY DETECTION: Position-based stuck detection (more reliable)
    if (!isStuckInCorner) {
      // Track actual position changes over time, not trail segments
      const currentPos = this.bikeState.position;
      
      // Add current position to history
      this.positionHistory.push(currentPos.clone());
      
      // Keep only last 8 positions (about 0.13 seconds at 60fps)
      if (this.positionHistory.length > 8) {
        this.positionHistory.shift();
      }
      
      // Check if we have enough history and are stuck
      if (this.positionHistory.length >= 6) {
        const oldPos = this.positionHistory[0];
        const totalDistance = currentPos.distanceTo(oldPos);
        
        // If bike has barely moved over 6 frames AND is colliding
        if (totalDistance < 0.08 && (this.bikeState.collision || this.bikeState.grindOffset > 0)) {
          const nearWall = this.calculateDistanceToNearestWall() < 0.3;
          if (nearWall) {
            isStuckInCorner = true;
            this.bikeState.health = Math.max(0, this.bikeState.health - 0.7);
            this.lastHitFrame = this.frameCount;
            this.lastDamageType = 'collision';
            healthChanged = true;
            console.log(`🚨 POSITION STUCK: Applying damage (0.7) for being stuck while colliding`);
          }
        }
      }
    }
    
    // ADDITIONAL CORNER WEDGE DETECTION: Check if bike is wedged between multiple walls
    if (!isStuckInCorner && this.bikeState.trail.length >= 3) {
      const distanceToWall = this.calculateDistanceToNearestWall();
      
      // If very close to walls and barely moving
      if (distanceToWall < 0.15) {
        const recentPositions = this.bikeState.trail.slice(-3);
        let totalMovement = 0;
        
        for (let i = 1; i < recentPositions.length; i++) {
          totalMovement += recentPositions[i].distanceTo(recentPositions[i-1]);
        }
        
        // If total movement over last 3 positions is very small
        if (totalMovement < 0.04) {
          isStuckInCorner = true;
                      this.bikeState.health = Math.max(0, this.bikeState.health - 20);
            this.lastHitFrame = this.frameCount;
            this.lastDamageType = 'collision';
            healthChanged = true;
          console.log(`🔧 WEDGE DETECTED: Applying damage (20) for being wedged in corner`);
        }
      }
    }
    
    // Set isGrinding based on grindOffset
    if (this.bikeState.grindOffset > 0) {
      this.bikeState.isGrinding = true;
    } else {
      this.bikeState.isGrinding = false;
    }

    // ENHANCED FINAL SAFETY: Ensure we never end up inside a collision
    if (this.checkCollisionAtPosition(newPosition, 3)) {
      // Revert to current position
      newPosition = this.bikeState.position.clone();
      console.log(`� COLLISION DETECTED: Preventing movement into wall`);
    }

    // Update position
    this.bikeState.position = newPosition;
    
    // After step-by-step, pause again if enabled
    if (this.debugState.stepByStep) {
      this.debugState.isPaused = true;
    }

    // Handle zone damage
    const isOutsideRing = this.arena.isPositionOutsideRing(this.bikeState.position);
    const ringRadius = this.arena.getCurrentRingRadius();
    const distanceFromCenter = Math.sqrt(this.bikeState.position.x * this.bikeState.position.x + this.bikeState.position.z * this.bikeState.position.z);
    
    // Debug zone detection periodically
    if (this.frameCount % 60 === 0) { // Every second
      console.log(`🔵 ZONE CHECK: position(${this.bikeState.position.x.toFixed(2)}, ${this.bikeState.position.z.toFixed(2)}), distance: ${distanceFromCenter.toFixed(2)}, ringRadius: ${ringRadius.toFixed(2)}, isOutside: ${isOutsideRing}`);
    }
    
    if (isOutsideRing) {
      this.outsideRingFrames++;
      const zoneDamage = this.arena.getRingDepletionPerFrame();
      const healthBefore = this.bikeState.health;
      
      // ZONE DAMAGE FIX: Always apply zone damage regardless of initial state
      // This ensures damage applies even when bike is at full health initially
      console.log(`🔍 PRE-DAMAGE: health=${healthBefore}, maxHealth=${this.bikeState.maxHealth}, zoneDamage=${zoneDamage}, isFullHealth=${healthBefore >= this.bikeState.maxHealth}`);
      
      this.bikeState.health = Math.max(0, this.bikeState.health - zoneDamage);
      this.lastDamageType = 'zone';
      this.lastHitFrame = this.frameCount; // Update lastHitFrame to prevent immediate health regen
      healthChanged = true;
      
      // Enhanced debugging for zone damage investigation
      console.log(`🔴 ZONE DAMAGE: health ${healthBefore.toFixed(6)} -> ${this.bikeState.health.toFixed(6)} (damage: ${zoneDamage.toFixed(6)}, frames outside: ${this.outsideRingFrames})`);
      console.log(`🔍 POST-DAMAGE: frameCount=${this.frameCount}, lastHitFrame=${this.lastHitFrame}, healthChanged=${healthChanged}, healthDiff=${(healthBefore - this.bikeState.health).toFixed(6)}`);
    } else {
      this.outsideRingFrames = 0;
    }

    // Health regeneration - PREVENT regeneration when stuck in corner
    const framesSinceHit = this.frameCount - this.lastHitFrame;
    if (!this.bikeState.collision && !isOutsideRing && !isStuckInCorner && framesSinceHit > this.config.regenDelayFrames && this.bikeState.health < this.bikeState.maxHealth) {
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
    this.positionHistory = [];
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

  public getDebugState(): DebugState {
    return this.debugState;
  }

  public setDebugEnabled(enabled: boolean): void {
    this.debugState.enabled = enabled;
    console.log(`Debug mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  public toggleDebugFeature(feature: keyof DebugState): void {
    if (feature in this.debugState && typeof this.debugState[feature] === 'boolean') {
      (this.debugState[feature] as boolean) = !(this.debugState[feature] as boolean);
      console.log(`Debug ${feature}: ${this.debugState[feature]}`);
    }
  }

  public stepFrame(): void {
    if (this.debugState.stepByStep && this.debugState.isPaused) {
      this.debugState.isPaused = false;
      console.log(`Stepping frame ${this.frameCount + 1}`);
    }
  }

  public pauseGame(): void {
    this.debugState.isPaused = !this.debugState.isPaused;
    console.log(`Game ${this.debugState.isPaused ? 'PAUSED' : 'RESUMED'}`);
  }

  public dumpDebugInfo(): void {
    console.group('🔍 COMPLETE BIKE STATE DUMP');
    console.log('Frame:', this.frameCount);
    console.log('Position:', this.bikeState.position);
    console.log('Rotation:', this.bikeState.rotation);
    console.log('Speed:', this.bikeState.speed);
    console.log('Alive:', this.bikeState.alive);
    console.log('Health:', this.bikeState.health);
    console.log('Collision:', this.bikeState.collision);
    console.log('Rubber:', this.bikeState.rubber);
    console.log('GrindOffset:', this.bikeState.grindOffset);
    console.log('GrindNormal:', this.bikeState.grindNormal);
    console.log('GraceFrames:', this.bikeState.graceFramesRemaining);
    console.log('TurnQueue:', this.bikeState.turnQueue);
    console.log('Last Turn Frame:', this.bikeState.lastTurnFrame);
    console.log('Brake Energy:', this.bikeState.brakeEnergy);
    console.log('Is Braking:', this.bikeState.isBraking);
    
    console.group('📊 COLLISION HISTORY (Last 10)');
    const recent = this.debugState.collisionHistory.slice(-10);
    recent.forEach((check, i) => {
      console.log(`${i + 1}. Frame ${check.frameNumber}: ${check.collisionType} - Collision: ${check.collision}, Rubber: ${check.rubber.toFixed(3)}, GrindOffset: ${check.grindOffset.toFixed(3)}, DistToWall: ${check.distanceToWall.toFixed(3)}`);
    });
    console.groupEnd();
    
    console.group('🎯 NEARBY WALL SEGMENTS');
    this.nearbyWallSegments.forEach((segment, i) => {
      console.log(`${i + 1}. Start: (${segment.start.x.toFixed(2)}, ${segment.start.z.toFixed(2)}) End: (${segment.end.x.toFixed(2)}, ${segment.end.z.toFixed(2)})`);
    });
    console.groupEnd();
    
    console.groupEnd();
  }

  private logCollisionCheck(collisionType: string, collision: boolean, rubber: number, grindOffset: number, distanceToWall: number): void {
    if (!this.debugState.enabled) return;
    
    const check: CollisionCheck = {
      frameNumber: this.frameCount,
      position: this.bikeState.position.clone(),
      collision,
      rubber,
      grindOffset,
      distanceToWall,
      collisionType,
      timestamp: Date.now()
    };
    
    this.debugState.collisionHistory.push(check);
    
    // Keep only last 50 checks for memory efficiency
    if (this.debugState.collisionHistory.length > 50) {
      this.debugState.collisionHistory.shift();
    }
    
    // Log collision state changes
    if (this.debugState.logCollisionChanges && collision !== this.lastCollisionState) {
      console.log(`🚨 COLLISION STATE CHANGE: ${this.lastCollisionState} → ${collision} | Frame: ${this.frameCount} | Type: ${collisionType} | Rubber: ${rubber.toFixed(3)} | GrindOffset: ${grindOffset.toFixed(3)}`);
      this.lastCollisionState = collision;
    }
  }

  private updateDebugGeometry(): void {
    if (!this.debugState.enabled) return;
    
    // Update collision box (bike bounds)
    const bikeWidth = 0.12; // Reduced for tighter hitbox
    const bikeLength = 0.16; // Also reduced slightly
    const pos = this.bikeState.position;
    const rot = this.bikeState.rotation;
    
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    
    // Calculate the 4 corners of the bike collision box
    this.debugCollisionBox = [
      new THREE.Vector3(
        pos.x + (-bikeLength/2 * cos - -bikeWidth/2 * sin),
        pos.y,
        pos.z + (-bikeLength/2 * sin + -bikeWidth/2 * cos)
      ),
      new THREE.Vector3(
        pos.x + (bikeLength/2 * cos - -bikeWidth/2 * sin),
        pos.y,
        pos.z + (bikeLength/2 * sin + -bikeWidth/2 * cos)
      ),
      new THREE.Vector3(
        pos.x + (bikeLength/2 * cos - bikeWidth/2 * sin),
        pos.y,
        pos.z + (bikeLength/2 * sin + bikeWidth/2 * cos)
      ),
      new THREE.Vector3(
        pos.x + (-bikeLength/2 * cos - bikeWidth/2 * sin),
        pos.y,
        pos.z + (-bikeLength/2 * sin + bikeWidth/2 * cos)
      )
    ];
    
    // Update nearby wall segments (arena boundaries and recent trail)
    this.nearbyWallSegments = [];
    const limit = this.config.boundaryLimit;
    const searchRadius = 2.0;
    
    // Add arena boundary segments near the bike
    if (Math.abs(pos.x + limit) < searchRadius) {
      this.nearbyWallSegments.push({
        start: new THREE.Vector3(-limit, 0, -limit),
        end: new THREE.Vector3(-limit, 0, limit)
      });
    }
    if (Math.abs(pos.x - limit) < searchRadius) {
      this.nearbyWallSegments.push({
        start: new THREE.Vector3(limit, 0, -limit),
        end: new THREE.Vector3(limit, 0, limit)
      });
    }
    if (Math.abs(pos.z + limit) < searchRadius) {
      this.nearbyWallSegments.push({
        start: new THREE.Vector3(-limit, 0, -limit),
        end: new THREE.Vector3(limit, 0, -limit)
      });
    }
    if (Math.abs(pos.z - limit) < searchRadius) {
      this.nearbyWallSegments.push({
        start: new THREE.Vector3(-limit, 0, limit),
        end: new THREE.Vector3(limit, 0, limit)
      });
    }
    
    // Add nearby trail segments
    for (let i = 0; i < this.bikeState.trail.length - 1; i++) {
      const segStart = this.bikeState.trail[i];
      const segEnd = this.bikeState.trail[i + 1];
      
      if (segStart.distanceTo(pos) < searchRadius || segEnd.distanceTo(pos) < searchRadius) {
        this.nearbyWallSegments.push({
          start: segStart.clone(),
          end: segEnd.clone()
        });
      }
    }
    
    // Update grind zone (if grinding)
    this.debugGrindZone = [];
    if (this.bikeState.collision && this.bikeState.grindNormal) {
      const grindNormal = this.bikeState.grindNormal.clone().normalize();
      const penetrationDistance = 0.1; // Allowed penetration zone
      
      // Create a box showing the allowed penetration zone
      const perpendicular = new THREE.Vector3(-grindNormal.z, 0, grindNormal.x);
      const boxWidth = 0.3;
      const boxDepth = penetrationDistance;
      
      for (let i = -1; i <= 1; i += 2) {
        for (let j = 0; j <= 1; j++) {
          this.debugGrindZone.push(new THREE.Vector3(
            pos.x + perpendicular.x * boxWidth * i + grindNormal.x * boxDepth * j,
            pos.y,
            pos.z + perpendicular.z * boxWidth * i + grindNormal.z * boxDepth * j
          ));
        }
      }
    }
  }

  public getDebugCollisionBox(): THREE.Vector3[] {
    return this.debugCollisionBox;
  }

  public getNearbyWallSegments(): { start: THREE.Vector3; end: THREE.Vector3 }[] {
    return this.nearbyWallSegments;
  }

  public getDebugGrindZone(): THREE.Vector3[] {
    return this.debugGrindZone;
  }

  public getDebugTextInfo(): string {
    if (!this.debugState.enabled || !this.debugState.showTextOverlay) return '';
    
    const distanceToWall = this.calculateDistanceToNearestWall();
    
    return `Frame: ${this.frameCount}
Position: (${this.bikeState.position.x.toFixed(2)}, ${this.bikeState.position.z.toFixed(2)})
GrindOffset: ${this.bikeState.grindOffset.toFixed(3)}
IsGrinding: ${this.bikeState.isGrinding}
Rubber: ${this.bikeState.rubber.toFixed(3)}
Collision: ${this.bikeState.collision}
Distance to Wall: ${distanceToWall.toFixed(3)}
Health: ${this.bikeState.health.toFixed(1)}
Grace Frames: ${this.bikeState.graceFramesRemaining}`;
  }

  private calculateDistanceToNearestWall(): number {
    let minDistance = Infinity;
    const pos = this.bikeState.position;
    
    // Check distance to arena boundaries
    const limit = this.config.boundaryLimit;
    minDistance = Math.min(minDistance, limit - Math.abs(pos.x));
    minDistance = Math.min(minDistance, limit - Math.abs(pos.z));
    
    // Check distance to trail segments
    for (let i = 0; i < this.bikeState.trail.length - 1; i++) {
      const segStart = this.bikeState.trail[i];
      const segEnd = this.bikeState.trail[i + 1];
      
      const segDir = new THREE.Vector3().subVectors(segEnd, segStart);
      const segLength = segDir.length();
      if (segLength < 0.01) continue;
      
      segDir.normalize();
      const toStart = new THREE.Vector3().subVectors(pos, segStart);
      const projLength = THREE.MathUtils.clamp(toStart.dot(segDir), 0, segLength);
      const closestPoint = segStart.clone().add(segDir.clone().multiplyScalar(projLength));
      const distance = pos.distanceTo(closestPoint);
      
      minDistance = Math.min(minDistance, distance);
    }
    
    return minDistance;
  }
}