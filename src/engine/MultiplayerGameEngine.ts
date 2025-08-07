import * as THREE from 'three';
import { BikeState, GameConfig, DamageType, TurnDirection, DebugState, CollisionCheck } from './types';
import { BikePhysics } from './bike';
import { Arena } from './arena';
import { AIController } from './AIController';

export interface BikeData {
  state: BikeState;
  physics: BikePhysics;
  turnQueue: TurnDirection[];
  lastHitFrame: number;
  lastDamageType: DamageType;
  outsideRingFrames: number;
  trailFrames: number[];
  newTrailSegments: { start: THREE.Vector3; end: THREE.Vector3 }[];
  segmentsToRemove: number;
  isAI: boolean;
  color: string;
  positionHistory: THREE.Vector3[];

  // Respawn system
  spawnPosition: THREE.Vector3;
  initialRotation: number;
}

export class MultiplayerGameEngine {
  private bikes: Map<string, BikeData> = new Map();
  private arena: Arena;
  private frameCount = 0;
  private aiController: AIController;

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
  
  private lastCollisionStates: Map<string, boolean> = new Map();
  private nearbyWallSegments: { start: THREE.Vector3; end: THREE.Vector3 }[] = [];
  private debugCollisionBoxes: Map<string, THREE.Vector3[]> = new Map();
  private debugGrindZones: Map<string, THREE.Vector3[]> = new Map();

  constructor(private config: GameConfig) {
    this.arena = new Arena(config);
    this.aiController = new AIController(config);
  }

  public addPlayerBike(id: string = 'player'): void {
    const bikeData: BikeData = {
      state: this.createInitialBikeState(new THREE.Vector3(0, 0, 10)),
      physics: new BikePhysics(this.config),
      turnQueue: [],
      lastHitFrame: 0,
      lastDamageType: null,
      outsideRingFrames: 0,
      trailFrames: [],
      newTrailSegments: [],
      segmentsToRemove: 0,
      isAI: false,
      color: '#00ffff', // Cyan for player
      positionHistory: [],
      spawnPosition: new THREE.Vector3(0, 0, 10),
      initialRotation: 0
    };
    this.bikes.set(id, bikeData);
  }

  public addAIBike(id: string = 'ai'): void {
    const bikeData: BikeData = {
      state: this.createInitialBikeState(new THREE.Vector3(0, 0, -10), Math.PI),
      physics: new BikePhysics(this.config),
      turnQueue: [],
      lastHitFrame: 0,
      lastDamageType: null,
      outsideRingFrames: 0,
      trailFrames: [],
      newTrailSegments: [],
      segmentsToRemove: 0,
      isAI: true,
      color: '#ff0000', // Red for AI
      positionHistory: [],
      spawnPosition: new THREE.Vector3(0, 0, -10),
      initialRotation: Math.PI
    };
    bikeData.state.rotation = Math.PI; // Face opposite direction
    this.bikes.set(id, bikeData);
  }

  private createInitialBikeState(position: THREE.Vector3, rotation: number = 0): BikeState {
    return {
      position: position.clone(),
      rotation,
      trail: [position.clone()],
      alive: true,
      speed: this.config.bikeSpeed,
      speedTarget: this.config.speedTarget,
      lastTurnFrame: 0,
      health: this.config.maxHealth ?? 156,
      maxHealth: this.config.maxHealth ?? 156,
      grindOffset: 0,
      grindNormal: null,
      graceFramesRemaining: 0,
      isGrinding: false,
      brakeEnergy: this.config.brakeMaxEnergy,
      brakeRechargeDelay: 0,
      isBraking: false,
      
      // Grinding system
      lastX: position.x,
      lastY: position.z,
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

  public getBikeState(id: string): BikeState | null {
    const bike = this.bikes.get(id);
    return bike ? { ...bike.state } : null;
  }

  public getBikeData(id: string): BikeData | null {
    return this.bikes.get(id) || null;
  }

  public getAllBikes(): Map<string, BikeData> {
    return this.bikes;
  }

  public getArena(): Arena {
    return this.arena;
  }

  public getFrameCount(): number {
    return this.frameCount;
  }

  public queueTurn(bikeId: string, direction: TurnDirection): void {
    const bike = this.bikes.get(bikeId);
    if (bike && !bike.isAI) {
      bike.turnQueue.push(direction);
    }
  }

  public setBraking(bikeId: string, isBraking: boolean): void {
    const bike = this.bikes.get(bikeId);
    if (bike && !bike.isAI) {
      bike.state.isBraking = isBraking;
    }
  }

  private updateBrakeSystem(bike: BikeData): void {
    if (bike.state.isBraking && bike.state.brakeEnergy > 0) {
      bike.state.brakeEnergy = Math.max(0, bike.state.brakeEnergy - this.config.brakeDepletionRate);
      bike.state.brakeRechargeDelay = this.config.brakeRechargeDelayFrames;
    } else {
      if (bike.state.brakeEnergy <= 0) {
        bike.state.isBraking = false;
      }
      
      if (bike.state.brakeRechargeDelay > 0) {
        bike.state.brakeRechargeDelay--;
      } else {
        bike.state.brakeEnergy = Math.min(
          this.config.brakeMaxEnergy, 
          bike.state.brakeEnergy + this.config.brakeRechargeRate
        );
      }
    }
  }

  public update(): Map<string, { healthChanged: boolean; newHealth: number }> {
    this.frameCount++;
    
    // Check if game is paused for step-by-step debugging
    if (this.debugState.stepByStep && this.debugState.isPaused) {
      return new Map<string, { healthChanged: boolean; newHealth: number }>();
    }
    
    const healthUpdates = new Map<string, { healthChanged: boolean; newHealth: number }>();
    
    // Update debug geometry
    this.updateDebugGeometry();

    // Update AI decisions
    this.bikes.forEach((bike, bikeId) => {
      if (bike.isAI && bike.state.alive) {
        // Get player state for AI decision making
        const playerBike = this.bikes.get('player');
        if (playerBike) {
          const decision = this.aiController.makeDecision(
            bike.state,
            playerBike.state,
            this.arena,
            this.frameCount
          );

          if (decision.shouldTurn && decision.direction) {
            if (bike.turnQueue.length === 0) {
              bike.turnQueue.push(decision.direction);
            }
          }

          bike.state.isBraking = decision.shouldBrake;
        }
      }
    });

    // Update each bike
    this.bikes.forEach((bike, bikeId) => {
      if (!bike.state.alive) {
        // Should not happen because we instantly respawn, but guard anyway
        return;
      }

      // Update brake system
      this.updateBrakeSystem(bike);

      // Handle turns
      const framesSinceLastTurn = this.frameCount - bike.state.lastTurnFrame;
      const canTurn = framesSinceLastTurn >= this.config.turnDelayFrames;
      
      if (canTurn && bike.turnQueue.length > 0) {
        const turn = bike.turnQueue[0]; // Peek at the turn, don't remove yet
        
        // Calculate new rotation
        let newRotation = bike.state.rotation;
        if (turn === 'left') {
          newRotation += Math.PI / 2;
        } else if (turn === 'right') {
          newRotation -= Math.PI / 2;
        }
        
        const newDirection = new THREE.Vector3(
          Math.sin(newRotation),
          0,
          Math.cos(newRotation)
        );
        
        let turnSafe = true;
        let positionWasReset = false;
        
        // INVISIBLE ANTI-PHASING: Reset position before turning if grinding BUT make it visually smooth
        if ((bike.state.grindOffset > 0 || bike.state.collision) && bike.state.grindNormal) {
          console.log(`🔧 INVISIBLE ANTI-PHASING [${bikeId}]: Grinding detected, performing invisible position reset`);
          
          // Store the original position for smooth trail creation
          const originalPosition = bike.state.position.clone();
          
          // Use smaller safe distance for tighter gameplay but still effective anti-phasing
          const safeDistance = this.config.trailWidth + 0.02;
          const normalizedGrindNormal = bike.state.grindNormal.clone().normalize();
          
          // Push bike away from wall by safe distance BEFORE processing the turn
          const safePosition = originalPosition.clone().add(
            normalizedGrindNormal.multiplyScalar(safeDistance)
          );
          
          // Clamp to boundaries and update position
          bike.state.position = bike.physics.clampToBoundary(safePosition);
          
          // INVISIBLE TRAIL SMOOTHING: Create smooth trail segment from original to reset position
          if (bike.state.trail.length > 0) {
            const lastTrailPoint = bike.state.trail[bike.state.trail.length - 1];
            const resetPosition = bike.state.position.clone();
            
            // Only create smooth segment if there's meaningful distance
            if (lastTrailPoint.distanceTo(resetPosition) > 0.01) {
              // Add intermediate points for ultra-smooth visual transition
              const steps = Math.max(2, Math.ceil(lastTrailPoint.distanceTo(resetPosition) / 0.02));
              for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const intermediatePoint = lastTrailPoint.clone().lerp(resetPosition, t);
                
                bike.newTrailSegments.push({ 
                  start: i === 1 ? lastTrailPoint.clone() : bike.state.trail[bike.state.trail.length - 1].clone(), 
                  end: intermediatePoint.clone() 
                });
                
                if (i === steps) {
                  // Final point is the reset position
                  bike.state.trail.push(resetPosition.clone());
                  bike.trailFrames.push(this.frameCount);
                } else {
                  // Add intermediate trail points for smoothness
                  bike.state.trail.push(intermediatePoint.clone());
                  bike.trailFrames.push(this.frameCount);
                }
              }
              positionWasReset = true;
            }
          }
          
          // Reset grindOffset after position reset to ensure clean state
          bike.state.grindOffset = 0;
          
          console.log(`📍 Invisible position reset [${bikeId}]: (${originalPosition.x.toFixed(3)}, ${originalPosition.z.toFixed(3)}) → (${bike.state.position.x.toFixed(3)}, ${bike.state.position.z.toFixed(3)})`);
        }
        
        // COMPREHENSIVE TURN SAFETY CHECKS (adapted for multiplayer)
        const cornerPoint = bike.state.position.clone();
        const postTurnPos = cornerPoint.clone().add(
          newDirection.multiplyScalar(this.config.bikeSpeed)
        );
        
        // Check corner position using available collision method
        if (turnSafe && this.wouldCollideAtPosition(cornerPoint, bikeId)) {
          turnSafe = false;
          console.log(`🚨 TURN BLOCKED [${bikeId}]: Corner position collision detected`);
        }
        
        // Check multiple points ahead in the new direction
        if (turnSafe) {
          for (let i = 1; i <= 5; i++) { // Increased for stronger validation
            const checkPos = cornerPoint.clone().add(
              newDirection.multiplyScalar(this.config.bikeSpeed * i * 0.3)
            );
            if (this.wouldCollideAtPosition(checkPos, bikeId)) {
              turnSafe = false;
              console.log(`🚨 TURN BLOCKED [${bikeId}]: Future position ${i} collision detected`);
              break;
            }
          }
        }
        
        // REINFORCED ANTI-PHASING: Enhanced turn validation during grinding
        if (turnSafe) {
          // When grinding and turning, do EXTRA validation to prevent any possibility of phasing
          if (bike.state.grindOffset > 0 || bike.state.collision) {
            // Check multiple points around the turn with tighter spacing
            const checkPoints = [
              cornerPoint,
              cornerPoint.clone().add(newDirection.multiplyScalar(this.config.bikeSpeed * 0.2)),
              cornerPoint.clone().add(newDirection.multiplyScalar(this.config.bikeSpeed * 0.4)),
              cornerPoint.clone().add(newDirection.multiplyScalar(this.config.bikeSpeed * 0.6)),
              cornerPoint.clone().add(newDirection.multiplyScalar(this.config.bikeSpeed * 0.8)),
              postTurnPos
            ];
            
            for (let i = 0; i < checkPoints.length; i++) {
              const point = checkPoints[i];
              if (this.wouldCollideAtPosition(point, bikeId)) {
                turnSafe = false;
                console.log(`🚨 GRINDING TURN BLOCKED [${bikeId}]: Turn would cause phasing at check point ${i}`);
                break;
              }
            }
            
            // ADDITIONAL PHASING PREVENTION: Check perpendicular points
            if (turnSafe) {
              const perpendicular = new THREE.Vector3(-newDirection.z, 0, newDirection.x);
              const sideChecks = [
                cornerPoint.clone().add(perpendicular.multiplyScalar(0.1)),
                cornerPoint.clone().add(perpendicular.multiplyScalar(-0.1))
              ];
              
              for (const sidePoint of sideChecks) {
                if (this.wouldCollideAtPosition(sidePoint, bikeId)) {
                  turnSafe = false;
                  console.log(`🚨 GRINDING TURN BLOCKED [${bikeId}]: Side collision detected`);
                  break;
                }
              }
            }
          }
        }
          if (turnSafe) {
          // Turn is safe - execute it
          console.log(`✅ TURN EXECUTED [${bikeId}]: Turn approved and being executed`);
          
          // Create corner trail point only if position wasn't already reset with smooth segments
          if (!positionWasReset && bike.state.trail.length > 0) {
            const lastPoint = bike.state.trail[bike.state.trail.length - 1];
            if (lastPoint.distanceTo(bike.state.position) > 0.01) {
              bike.newTrailSegments.push({ start: lastPoint.clone(), end: bike.state.position.clone() });
              bike.state.trail.push(bike.state.position.clone());
              bike.trailFrames.push(this.frameCount);
            }
          }

          bike.turnQueue.shift(); // Remove the turn from queue
          bike.state.rotation = newRotation;
          bike.state.lastTurnFrame = this.frameCount;
          
          // FINAL ANTI-PHASING VALIDATION: After executing turn, verify we haven't ended up in a collision
          // If we have, immediately reset position again
          if (this.wouldCollideAtPosition(bike.state.position, bikeId)) {
            console.log(`🚨 POST-TURN COLLISION DETECTED [${bikeId}]: Applying emergency position correction`);
            if (bike.state.grindNormal) {
              const emergencyNormal = bike.state.grindNormal.clone().normalize();
              const emergencyDistance = (this.config.trailWidth + 0.1) * 2.0; // Even larger safety margin
              const emergencyPosition = bike.state.position.clone().add(
                emergencyNormal.multiplyScalar(emergencyDistance)
              );
              bike.state.position = bike.physics.clampToBoundary(emergencyPosition);
              console.log(`📍 Emergency position correction applied [${bikeId}]: (${bike.state.position.x.toFixed(3)}, ${bike.state.position.z.toFixed(3)})`);
            }
          }
        }
      }

      // Move bike
      const direction = new THREE.Vector3(
        Math.sin(bike.state.rotation),
        0,
        Math.cos(bike.state.rotation)
      );
      
      let currentSpeed = bike.state.speed;
      if (bike.state.isBraking && bike.state.brakeEnergy > 0) {
        const energyUsed = this.config.brakeMaxEnergy - bike.state.brakeEnergy;
        const brakeProgress = energyUsed / this.config.brakeMaxEnergy;
        const speedMultiplier = 1.0 - (brakeProgress * (1.0 - this.config.brakeSpeedReduction));
        currentSpeed *= speedMultiplier;
      }

      // Slight wall-grind speed boost when near walls (non-invasive, prior to collision check)
      const distanceToWallForAccelPre = this.calculateDistanceToNearestWall(bike.state.position);
      if (distanceToWallForAccelPre < this.config.wallNear && (bike.state.grindOffset > 0 || bike.state.collision)) {
        const wallProximity = Math.max(0, (this.config.wallNear - distanceToWallForAccelPre) / this.config.wallNear);
        const speedBoost = this.config.accelBase * wallProximity;
        currentSpeed += speedBoost;
      }
      
      const potentialPosition = bike.state.position.clone().add(
        direction.multiplyScalar(currentSpeed)
      );

      // ---------- Collision detection (self + opponents separately) ----------
      // 1. Check against self trail (skip last 10 segments handled inside BikePhysics)
      const selfTrail = [...bike.state.trail, potentialPosition];
      let collision = bike.physics.checkCollisions(
        potentialPosition,
        selfTrail,
        bike.state
      );

      // 2. Check against each opponent trail individually to avoid artificial bridging segments
      if (!collision.hit) {
        for (const [otherId, otherBike] of this.bikes.entries()) {
          if (otherId === bikeId) continue;
          if (otherBike.state.trail.length < 2) continue;

          const opponentTrail = [...otherBike.state.trail, potentialPosition];
          // Use stricter collision detection for opponent trails (don't skip recent segments)
          const oppCollision = bike.physics.checkCollisionsWithSkip(
            potentialPosition,
            opponentTrail,
            bike.state,
            0  // Don't skip any segments for opponent trails
          );

          if (oppCollision.hit) {
            collision = oppCollision;
            break;
          }
        }
      }

      let newPosition = collision.corrected.clone();
      newPosition = bike.physics.clampToBoundary(newPosition);
      

      
      // Log collision check for debugging
      const distanceToWall = this.calculateDistanceToNearestWall(bike.state.position);
      this.logCollisionCheck(bikeId, 'movement', collision.hit, bike.state.rubber, bike.state.grindOffset, distanceToWall);

      // Handle collision damage
      let healthChanged = false;
      let headOn = false;
      
      if (collision.hit && collision.normal) {
        const normalizedNormal = collision.normal.clone().normalize();
        const normalizedDirection = direction.clone().normalize();
        const normalizedPush = normalizedDirection.dot(normalizedNormal);
        
        bike.state.collision = true;
        bike.lastHitFrame = this.frameCount;
        bike.lastDamageType = 'collision';
        
        if (normalizedPush < -0.6) {
          // Head-on collision - moderate damage to discourage spam but allow skilled play
          bike.state.grindOffset = Math.min(bike.state.grindOffset + 0.02, 0.3);
          bike.state.health = Math.max(0, bike.state.health - 8);
          healthChanged = true;
        } else {
          // Grinding - no health damage; build up grind offset for positioning
          bike.state.grindOffset = Math.min(bike.state.grindOffset + 0.01, 0.3);
        }
        
        // Store the grind normal for turn checking (CRITICAL for anti-phasing)
        bike.state.grindNormal = normalizedNormal;
        
        // REINFORCED POSITIONING: Apply stronger position adjustment during grinding
        const adjustmentMultiplier = bike.state.grindOffset > 0.15 ? 1.5 : 1.0; // Stronger push when grinding heavily
        newPosition.add(collision.normal.clone().multiplyScalar(-bike.state.grindOffset * adjustmentMultiplier));
      } else {
        // No collision - reset grindOffset and collision state
        bike.state.grindOffset = 0;
        bike.state.collision = false;
        bike.state.grindNormal = null;
      }
      
      // NEW: Manage isGrinding flag based on grindOffset
      if (bike.state.grindOffset > 0) {
        bike.state.isGrinding = true;
      } else {
        bike.state.isGrinding = false;
      }

      // Update position (use collision-corrected position)
      bike.state.position = newPosition;

      // Handle zone damage
      const isOutsideRing = this.arena.isPositionOutsideRing(newPosition);
      if (isOutsideRing) {
        bike.outsideRingFrames++;
        if (bike.outsideRingFrames === 1) {
          console.log(`MP 🚧 ENTERED OUTSIDE RING [${bikeId}] at frame ${this.frameCount}`);
        }
        const before = bike.state.health;
        const zoneDamage = this.arena.getRingDepletionPerFrame();
        bike.state.health = Math.max(0, bike.state.health - zoneDamage);
        bike.lastDamageType = 'zone';
        bike.lastHitFrame = this.frameCount; // Update lastHitFrame to prevent immediate health regen
        healthChanged = true;
        if (this.frameCount % 60 === 0) {
          console.log(`MP 🔴 ZONE DAMAGE [${bikeId}]: ${before.toFixed(3)} -> ${bike.state.health.toFixed(3)} (-${zoneDamage.toFixed(4)})`);
        }
      } else {
        if (bike.outsideRingFrames > 0) {
          console.log(`MP ✅ RE-ENTERED RING [${bikeId}] at frame ${this.frameCount}`);
        }
        bike.outsideRingFrames = 0;
      }

      // Handle health regeneration
      const framesSinceHit = this.frameCount - bike.lastHitFrame;
      
      // COMPREHENSIVE STUCK DETECTION: Prevent corner camping and grinding exploits
      let isStuckInCorner = false;
      
      // PRIMARY DETECTION: Trail-based movement detection
      if (bike.state.trail.length >= 4) {
        const recentPositions = bike.state.trail.slice(-4);
        let maxMovement = 0;
        
        for (let i = 1; i < recentPositions.length; i++) {
          const movement = recentPositions[i].distanceTo(recentPositions[i-1]);
          maxMovement = Math.max(maxMovement, movement);
        }
        
        if (maxMovement < 0.02) {
          const nearWall = this.calculateDistanceToNearestWall(bike.state.position) < 0.25;
          if (nearWall) {
            isStuckInCorner = true;
            bike.state.health = Math.max(0, bike.state.health - 15);
            bike.lastHitFrame = this.frameCount;
            bike.lastDamageType = 'collision';
            healthChanged = true;
            console.log(`🏪 CORNER STUCK [${bikeId}]: Applying damage (15) for being stuck near wall`);
          }
        }
      }
      
      // SECONDARY DETECTION: Position-based stuck detection (more reliable for grinding scenarios)
      if (!isStuckInCorner) {
        const currentPos = bike.state.position;
        
        // Add current position to history
        bike.positionHistory.push(currentPos.clone());
        
        // Keep only last 8 positions (about 0.13 seconds at 60fps)
        if (bike.positionHistory.length > 8) {
          bike.positionHistory.shift();
        }
        
        // Check if we have enough history and are stuck
        if (bike.positionHistory.length >= 6) {
          const oldPos = bike.positionHistory[0];
          const totalDistance = currentPos.distanceTo(oldPos);
          
          // If bike has barely moved over 6 frames AND is colliding
          if (totalDistance < 0.08 && (bike.state.collision || bike.state.grindOffset > 0)) {
            const nearWall = this.calculateDistanceToNearestWall(bike.state.position) < 0.3;
            if (nearWall) {
              isStuckInCorner = true;
              bike.state.health = Math.max(0, bike.state.health - 0.7);
              bike.lastHitFrame = this.frameCount;
              bike.lastDamageType = 'collision';
              healthChanged = true;
              console.log(`🚨 POSITION STUCK [${bikeId}]: Applying damage (0.7) for being stuck while colliding`);
            }
          }
        }
      }
      
      // TERTIARY DETECTION: Wedge detection for tight spaces
      if (!isStuckInCorner && bike.state.trail.length >= 3) {
        const distanceToWall = this.calculateDistanceToNearestWall(bike.state.position);
        
        if (distanceToWall < 0.15) {
          const recentPositions = bike.state.trail.slice(-3);
          let totalMovement = 0;
          
          for (let i = 1; i < recentPositions.length; i++) {
            totalMovement += recentPositions[i].distanceTo(recentPositions[i-1]);
          }
          
          if (totalMovement < 0.04) {
            isStuckInCorner = true;
            bike.state.health = Math.max(0, bike.state.health - 20);
            bike.lastHitFrame = this.frameCount;
            bike.lastDamageType = 'collision';
            healthChanged = true;
            console.log(`🔧 WEDGE DETECTED [${bikeId}]: Applying damage (20) for being wedged in corner`);
          }
        }
      }
      
      // Health regeneration - PREVENT regeneration when stuck in corner
      if (!headOn && !isOutsideRing && !isStuckInCorner && framesSinceHit > this.config.regenDelayFrames && bike.state.health < bike.state.maxHealth) {
        const regenRate = bike.lastDamageType === 'zone' ? this.config.slowRegenRate : this.config.fastRegenRate;
        bike.state.health = Math.min(bike.state.maxHealth, bike.state.health + regenRate);
        healthChanged = true;
      }



      // Add to trail
      const distanceThreshold = 0.1; // Match single-player for tighter trail coverage
      if (bike.state.trail.length === 0 || newPosition.distanceTo(bike.state.trail[bike.state.trail.length - 1]) > distanceThreshold) {
        if (bike.state.trail.length > 0) {
          const lastPoint = bike.state.trail[bike.state.trail.length - 1];
          bike.newTrailSegments.push({ start: lastPoint.clone(), end: newPosition.clone() });
        }
        
        bike.state.trail.push(newPosition.clone());
        bike.trailFrames.push(this.frameCount);
      }

      // Trim old trail segments
      while (bike.trailFrames.length > 0 && this.frameCount - bike.trailFrames[0] > this.config.trailMaxFrames) {
        bike.trailFrames.shift();
        if (bike.state.trail.length > 0) {
          bike.state.trail.shift();
        }
        bike.segmentsToRemove++;
      }

      // Grace period system
      if (bike.state.health <= 0) {
        if (bike.state.graceFramesRemaining <= 0) {
          bike.state.graceFramesRemaining = this.config.graceFrames;
        } else {
          bike.state.graceFramesRemaining--;
          
          if (headOn || isOutsideRing) {
            bike.state.graceFramesRemaining -= 2;
          }
        }
        
        if (bike.state.graceFramesRemaining <= 0) {
          this.respawnBike(bike);
        }
      } else {
        bike.state.graceFramesRemaining = 0;
      }

      bike.state.health = Math.max(-10, bike.state.health);

      healthUpdates.set(bikeId, { healthChanged, newHealth: bike.state.health });
    });

    // Update arena
    this.arena.shrinkRing();
    
    // After step-by-step, pause again if enabled
    if (this.debugState.stepByStep) {
      this.debugState.isPaused = true;
    }

    return healthUpdates;
  }

  public reset(): void {
    this.bikes.clear();
    this.arena.reset();
    this.frameCount = 0;
  }

  public getNewTrailSegments(bikeId: string): { start: THREE.Vector3; end: THREE.Vector3 }[] {
    const bike = this.bikes.get(bikeId);
    if (!bike) return [];
    
    const segments = [...bike.newTrailSegments];
    bike.newTrailSegments = [];
    return segments;
  }

  public getSegmentsToRemove(bikeId: string): number {
    const bike = this.bikes.get(bikeId);
    if (!bike) return 0;
    
    const count = bike.segmentsToRemove;
    bike.segmentsToRemove = 0;
    return count;
  }

  private respawnBike(bike: BikeData): void {
    // Schedule removal of ALL existing trail segments
    bike.segmentsToRemove = 10000; // Large number to clear everything

    // Reset physics map
    bike.physics.resetGrindDepthMap();

    // Clear trail tracking arrays
    bike.trailFrames = [];
    bike.newTrailSegments = [];

    // Recreate bike state
    bike.state = this.createInitialBikeState(bike.spawnPosition.clone(), bike.initialRotation);
  }

  // Debug system methods
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
    const playerBike = this.bikes.get('player');
    if (!playerBike) {
      console.log('No player bike found for debug dump');
      return;
    }

    console.group('🔍 MULTIPLAYER BIKE STATE DUMP');
    console.log('Frame:', this.frameCount);
    console.log('Position:', playerBike.state.position);
    console.log('Rotation:', playerBike.state.rotation);
    console.log('Speed:', playerBike.state.speed);
    console.log('Alive:', playerBike.state.alive);
    console.log('Health:', playerBike.state.health);
    console.log('Collision:', playerBike.state.collision);
    console.log('Rubber:', playerBike.state.rubber);
    console.log('GrindOffset:', playerBike.state.grindOffset);
    console.log('GrindNormal:', playerBike.state.grindNormal);
    console.log('GraceFrames:', playerBike.state.graceFramesRemaining);
    console.log('TurnQueue:', playerBike.turnQueue);
    console.log('Last Turn Frame:', playerBike.state.lastTurnFrame);
    console.log('Brake Energy:', playerBike.state.brakeEnergy);
    console.log('Is Braking:', playerBike.state.isBraking);
    
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
    
    console.group('🚁 ALL BIKES STATUS');
    for (const [id, bike] of this.bikes) {
      console.log(`${id}: Pos(${bike.state.position.x.toFixed(2)}, ${bike.state.position.z.toFixed(2)}) Health: ${bike.state.health.toFixed(1)} Alive: ${bike.state.alive} Collision: ${bike.state.collision}`);
    }
    console.groupEnd();
    
    console.groupEnd();
  }

  private logCollisionCheck(bikeId: string, collisionType: string, collision: boolean, rubber: number, grindOffset: number, distanceToWall: number): void {
    if (!this.debugState.enabled) return;
    
    const check: CollisionCheck = {
      frameNumber: this.frameCount,
      position: this.bikes.get(bikeId)?.state.position.clone() || new THREE.Vector3(),
      collision,
      rubber,
      grindOffset,
      distanceToWall,
      collisionType: `${bikeId}:${collisionType}`,
      timestamp: Date.now()
    };
    
    this.debugState.collisionHistory.push(check);
    
    // Keep only last 50 checks for memory efficiency
    if (this.debugState.collisionHistory.length > 50) {
      this.debugState.collisionHistory.shift();
    }
    
    // Log collision state changes
    const lastState = this.lastCollisionStates.get(bikeId) || false;
    if (this.debugState.logCollisionChanges && collision !== lastState) {
      console.log(`🚨 COLLISION STATE CHANGE [${bikeId}]: ${lastState} → ${collision} | Frame: ${this.frameCount} | Type: ${collisionType} | Rubber: ${rubber.toFixed(3)} | GrindOffset: ${grindOffset.toFixed(3)}`);
      this.lastCollisionStates.set(bikeId, collision);
    }
  }

  private updateDebugGeometry(): void {
    if (!this.debugState.enabled) return;
    
    // Update collision boxes and grind zones for all bikes
    for (const [bikeId, bike] of this.bikes) {
      this.updateBikeDebugGeometry(bikeId, bike);
    }
    
    // Update nearby wall segments based on player bike
    const playerBike = this.bikes.get('player');
    if (playerBike) {
      this.updateNearbyWallSegments(playerBike.state.position);
    }
  }

  private updateBikeDebugGeometry(bikeId: string, bike: BikeData): void {
    // Update collision box (bike bounds)
    const bikeWidth = 0.16;
    const bikeLength = 0.2;
    const pos = bike.state.position;
    const rot = bike.state.rotation;
    
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    
    // Calculate the 4 corners of the bike collision box
    this.debugCollisionBoxes.set(bikeId, [
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
    ]);
    
    // Update grind zone (if grinding)
    const grindZone: THREE.Vector3[] = [];
    if (bike.state.collision && bike.state.grindNormal) {
      const grindNormal = bike.state.grindNormal.clone().normalize();
      const penetrationDistance = 0.1; // Allowed penetration zone
      
      // Create a box showing the allowed penetration zone
      const perpendicular = new THREE.Vector3(-grindNormal.z, 0, grindNormal.x);
      const boxWidth = 0.3;
      const boxDepth = penetrationDistance;
      
      for (let i = -1; i <= 1; i += 2) {
        for (let j = 0; j <= 1; j++) {
          grindZone.push(new THREE.Vector3(
            pos.x + perpendicular.x * boxWidth * i + grindNormal.x * boxDepth * j,
            pos.y,
            pos.z + perpendicular.z * boxWidth * i + grindNormal.z * boxDepth * j
          ));
        }
      }
    }
    this.debugGrindZones.set(bikeId, grindZone);
  }

  private updateNearbyWallSegments(playerPos: THREE.Vector3): void {
    this.nearbyWallSegments = [];
    const limit = this.config.boundaryLimit;
    const searchRadius = 2.0;
    
    // Add arena boundary segments near the player
    if (Math.abs(playerPos.x + limit) < searchRadius) {
      this.nearbyWallSegments.push({
        start: new THREE.Vector3(-limit, 0, -limit),
        end: new THREE.Vector3(-limit, 0, limit)
      });
    }
    if (Math.abs(playerPos.x - limit) < searchRadius) {
      this.nearbyWallSegments.push({
        start: new THREE.Vector3(limit, 0, -limit),
        end: new THREE.Vector3(limit, 0, limit)
      });
    }
    if (Math.abs(playerPos.z + limit) < searchRadius) {
      this.nearbyWallSegments.push({
        start: new THREE.Vector3(-limit, 0, -limit),
        end: new THREE.Vector3(limit, 0, -limit)
      });
    }
    if (Math.abs(playerPos.z - limit) < searchRadius) {
      this.nearbyWallSegments.push({
        start: new THREE.Vector3(-limit, 0, limit),
        end: new THREE.Vector3(limit, 0, limit)
      });
    }
    
    // Add nearby trail segments from all bikes
    for (const [_, bike] of this.bikes) {
      for (let i = 0; i < bike.state.trail.length - 1; i++) {
        const segStart = bike.state.trail[i];
        const segEnd = bike.state.trail[i + 1];
        
        if (segStart.distanceTo(playerPos) < searchRadius || segEnd.distanceTo(playerPos) < searchRadius) {
          this.nearbyWallSegments.push({
            start: segStart.clone(),
            end: segEnd.clone()
          });
        }
      }
    }
  }

  public getDebugCollisionBox(bikeId: string = 'player'): THREE.Vector3[] {
    return this.debugCollisionBoxes.get(bikeId) || [];
  }

  public getNearbyWallSegments(): { start: THREE.Vector3; end: THREE.Vector3 }[] {
    return this.nearbyWallSegments;
  }

  public getDebugGrindZone(bikeId: string = 'player'): THREE.Vector3[] {
    return this.debugGrindZones.get(bikeId) || [];
  }

  public getDebugTextInfo(): string {
    if (!this.debugState.enabled || !this.debugState.showTextOverlay) return '';
    
    const playerBike = this.bikes.get('player');
    if (!playerBike) return 'No player bike found';
    
    const distanceToWall = this.calculateDistanceToNearestWall(playerBike.state.position);
    
    return `Frame: ${this.frameCount}
Position: (${playerBike.state.position.x.toFixed(2)}, ${playerBike.state.position.z.toFixed(2)})
GrindOffset: ${playerBike.state.grindOffset.toFixed(3)}
IsGrinding: ${playerBike.state.isGrinding}
Rubber: ${playerBike.state.rubber.toFixed(3)}
Collision: ${playerBike.state.collision}
Distance to Wall: ${distanceToWall.toFixed(3)}
Health: ${playerBike.state.health.toFixed(1)}
Grace Frames: ${playerBike.state.graceFramesRemaining}`;
  }

  private calculateDistanceToNearestWall(pos: THREE.Vector3): number {
    let minDistance = Infinity;
    
    // Check distance to arena boundaries
    const limit = this.config.boundaryLimit;
    minDistance = Math.min(minDistance, limit - Math.abs(pos.x));
    minDistance = Math.min(minDistance, limit - Math.abs(pos.z));
    
    // Check distance to all trail segments from all bikes
    for (const [_, bike] of this.bikes) {
      for (let i = 0; i < bike.state.trail.length - 1; i++) {
        const segStart = bike.state.trail[i];
        const segEnd = bike.state.trail[i + 1];
        
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
    }
    
    return minDistance;
  }

  public wouldCollideAtPosition(position: THREE.Vector3, excludeBikeId: string): boolean {
    // Check boundary collision
    const limit = this.config.boundaryLimit - 0.08;
    if (Math.abs(position.x) > limit || Math.abs(position.z) > limit) {
      return true;
    }
    
    // Check trail collision with all bikes
    const safeDistance = this.config.trailWidth + 0.06;
    
    for (const [bikeId, bike] of this.bikes) {
      // Skip recent segments for the bike being checked (to avoid self-collision on recent trail)
      const skipRecent = bikeId === excludeBikeId ? 5 : 0;
      const maxCheckIndex = Math.max(0, bike.state.trail.length - skipRecent);
      
      for (let i = 0; i < maxCheckIndex - 1; i++) {
        const segmentStart = bike.state.trail[i];
        const segmentEnd = bike.state.trail[i + 1];
        
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
    }
    
    return false;
  }
} 