import * as THREE from 'three';
import { BikeState, GameConfig, DamageType, TurnDirection } from './types';
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
}

export class MultiplayerGameEngine {
  private bikes: Map<string, BikeData> = new Map();
  private arena: Arena;
  private frameCount = 0;
  private aiController: AIController;

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
      color: '#00ffff' // Cyan for player
    };
    this.bikes.set(id, bikeData);
  }

  public addAIBike(id: string = 'ai'): void {
    const bikeData: BikeData = {
      state: this.createInitialBikeState(new THREE.Vector3(0, 0, -10)),
      physics: new BikePhysics(this.config),
      turnQueue: [],
      lastHitFrame: 0,
      lastDamageType: null,
      outsideRingFrames: 0,
      trailFrames: [],
      newTrailSegments: [],
      segmentsToRemove: 0,
      isAI: true,
      color: '#ff0000' // Red for AI
    };
    bikeData.state.rotation = Math.PI; // Face opposite direction
    this.bikes.set(id, bikeData);
  }

  private createInitialBikeState(position: THREE.Vector3): BikeState {
    return {
      position: position.clone(),
      rotation: 0,
      trail: [position.clone()],
      alive: true,
      speed: this.config.bikeSpeed,
      lastTurnFrame: 0,
      health: 156,
      maxHealth: 156,
      grindOffset: 0,
      grindNormal: null,
      graceFramesRemaining: 0,
      brakeEnergy: this.config.brakeMaxEnergy,
      brakeRechargeDelay: 0,
      isBraking: false
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
    const healthUpdates = new Map<string, { healthChanged: boolean; newHealth: number }>();

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
        healthUpdates.set(bikeId, { healthChanged: false, newHealth: bike.state.health });
        return;
      }

      // Update brake system
      this.updateBrakeSystem(bike);

      // Handle turns
      const framesSinceLastTurn = this.frameCount - bike.state.lastTurnFrame;
      const canTurn = framesSinceLastTurn >= this.config.turnDelayFrames;
      
      if (canTurn && bike.turnQueue.length > 0) {
        if (bike.state.trail.length > 0) {
          const lastPoint = bike.state.trail[bike.state.trail.length - 1];
          bike.newTrailSegments.push({ start: lastPoint.clone(), end: bike.state.position.clone() });
        }
        
        bike.state.trail.push(bike.state.position.clone());
        bike.trailFrames.push(this.frameCount);
        
        const turn = bike.turnQueue.shift()!;
        if (turn === 'left') {
          bike.state.rotation += Math.PI / 2;
        } else if (turn === 'right') {
          bike.state.rotation -= Math.PI / 2;
        }
        bike.state.lastTurnFrame = this.frameCount;
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
          const oppCollision = bike.physics.checkCollisions(
            potentialPosition,
            opponentTrail,
            bike.state
          );

          if (oppCollision.hit) {
            collision = oppCollision;
            break;
          }
        }
      }

      let newPosition = collision.corrected.clone();
      newPosition = bike.physics.clampToBoundary(newPosition);

      // Handle collision damage
      let healthChanged = false;
      let headOn = false;
      
      if (collision.hit && collision.normal) {
        const normalizedNormal = collision.normal.clone().normalize();
        const normalizedDirection = direction.clone().normalize();
        const normalizedPush = normalizedDirection.dot(normalizedNormal);
        
        if (normalizedPush < -0.6) {
          headOn = true;
          bike.state.grindOffset = Math.min(bike.state.grindOffset + 0.02, 0.3);
          bike.state.health = Math.max(0, bike.state.health - 1.2);
          bike.lastHitFrame = this.frameCount;
          bike.lastDamageType = 'collision';
          healthChanged = true;
        } else {
          bike.state.grindOffset = Math.min(bike.state.grindOffset + 0.01, 0.3);
        }
        newPosition.add(collision.normal.clone().multiplyScalar(-bike.state.grindOffset));
      } else {
        bike.state.grindOffset = 0;
      }

      // Update position
      bike.state.position = newPosition;

      // Handle zone damage
      const isOutsideRing = this.arena.isPositionOutsideRing(newPosition);
      
      if (isOutsideRing) {
        bike.outsideRingFrames++;
        bike.state.health = Math.max(0, bike.state.health - this.arena.getRingDepletionPerFrame());
        bike.lastDamageType = 'zone';
        healthChanged = true;
      } else {
        bike.outsideRingFrames = 0;
      }

      // Handle health regeneration
      const framesSinceHit = this.frameCount - bike.lastHitFrame;
      if (!headOn && !isOutsideRing && framesSinceHit > this.config.regenDelayFrames && bike.state.health < bike.state.maxHealth) {
        const regenRate = bike.lastDamageType === 'zone' ? this.config.slowRegenRate : this.config.fastRegenRate;
        bike.state.health = Math.min(bike.state.maxHealth, bike.state.health + regenRate);
        healthChanged = true;
      }

      // Add to trail
      const distanceThreshold = 0.3;
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
          bike.state.alive = false;
        }
      } else {
        bike.state.graceFramesRemaining = 0;
      }

      bike.state.health = Math.max(-10, bike.state.health);

      healthUpdates.set(bikeId, { healthChanged, newHealth: bike.state.health });
    });

    // Update arena
    this.arena.shrinkRing();

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
} 