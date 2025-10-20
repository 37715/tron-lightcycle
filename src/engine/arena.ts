import * as THREE from 'three';
import { GameConfig } from './types';

export class Arena {
  private currentRingRadius: number;
  private ringShrinkPerFrame: number;
  private ringDepletionPerFrame: number;

  constructor(private config: GameConfig) {
    this.currentRingRadius = config.ringInitialRadius;
    this.ringShrinkPerFrame = (config.ringInitialRadius - config.ringMinRadius) / config.ringShrinkTime;
    this.ringDepletionPerFrame = 100 / config.ringDepletionFrames;
  }

  public getCurrentRingRadius(): number {
    return this.currentRingRadius;
  }

  public isPositionOutsideRing(position: THREE.Vector3): boolean {
    const distanceFromCenter = Math.sqrt(position.x * position.x + position.z * position.z);
    return distanceFromCenter > this.currentRingRadius;
  }

  public shrinkRing(): void {
    if (this.currentRingRadius > this.config.ringMinRadius) {
      this.currentRingRadius = Math.max(
        this.config.ringMinRadius,
        this.currentRingRadius - this.ringShrinkPerFrame
      );
    }
  }

  public getRingScale(): number {
    return this.currentRingRadius / this.config.ringInitialRadius;
  }

  public getRingDepletionPerFrame(): number {
    return this.ringDepletionPerFrame;
  }

  public reset(): void {
    this.currentRingRadius = this.config.ringInitialRadius;
  }
}
