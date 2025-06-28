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
      health: 100,
      maxHealth: 100,
      grindOffset: 0,
      grindNormal: null
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

  public update(): { healthChanged: boolean; newHealth: number } {
    this.frameCount++;
    
    if (!this.bikeState.alive) {
      return { healthChanged: false, newHealth: this.bikeState.health };
    }

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
    const potentialPosition = this.bikeState.position.clone().add(
      direction.multiplyScalar(this.bikeState.speed)
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

    // Add to trail
    if (this.bikeState.trail.length === 0 || newPosition.distanceTo(this.bikeState.trail[this.bikeState.trail.length - 1]) > 0.5) {
      // Create trail segment if we have a previous point
      if (this.bikeState.trail.length > 0) {
        const lastPoint = this.bikeState.trail[this.bikeState.trail.length - 1];
        this.newTrailSegments.push({ start: lastPoint.clone(), end: newPosition.clone() });
      }
      
      this.bikeState.trail.push(newPosition.clone());
      this.trailFrames.push(this.frameCount);
    }

    // Trim old trail segments
    while (this.trailFrames.length > 0 && this.frameCount - this.trailFrames[0] > this.config.trailMaxFrames) {
      this.trailFrames.shift();
      if (this.bikeState.trail.length > 0) {
        this.bikeState.trail.shift();
      }
      this.segmentsToRemove++;
    }

    // Check if bike died
    this.bikeState.alive = this.bikeState.health > 0;

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
}
