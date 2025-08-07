import * as THREE from 'three';
import { BikeState, CollisionResult, GameConfig } from './types';

export class BikePhysics {
  private grindDepthMap: { [key: string]: number } = {};
  
  constructor(private config: GameConfig) {}

  public clampToBoundary(pos: THREE.Vector3): THREE.Vector3 {
    const limit = this.config.boundaryLimit - 0.08; // Reduced from 0.15 for smaller hitbox
    return new THREE.Vector3(
      Math.max(-limit, Math.min(limit, pos.x)),
      pos.y,
      Math.max(-limit, Math.min(limit, pos.z))
    );
  }

  public checkCollisions(position: THREE.Vector3, trail: THREE.Vector3[], bikeState: BikeState): CollisionResult {
    return this.checkCollisionsWithSkip(position, trail, bikeState, 2);
  }

  public checkCollisionsWithSkip(position: THREE.Vector3, trail: THREE.Vector3[], bikeState: BikeState, segmentsToSkip: number = 2): CollisionResult {
    const bikeHalfWidth = 0.06; // Reduced further for tighter hitbox
    const safetyMargin = 0.005; // Reduced for much closer contact

    let hit = false;
    let normal: THREE.Vector3 | null = null;
    let correctedX = position.x;
    let correctedZ = position.z;
    let wallKey = '';

    // Check boundary collisions with reduced margins
    const limit = this.config.boundaryLimit - bikeHalfWidth;
    
    if (Math.abs(position.x) > limit) {
      hit = true;
      correctedX = Math.sign(position.x) * limit;
      normal = new THREE.Vector3(-Math.sign(position.x), 0, 0);
      wallKey = `x${Math.sign(position.x)}`;
      
      // Minimal push-back for close contact
      const penetration = Math.abs(position.x) - limit;
      if (penetration > 0) {
        correctedX = Math.sign(position.x) * (limit - Math.max(penetration, 0.02)); // Reduced push-back
      }
    }
    
    if (Math.abs(position.z) > limit) {
      hit = true;
      correctedZ = Math.sign(position.z) * limit;
      normal = new THREE.Vector3(0, 0, -Math.sign(position.z));
      wallKey = `z${Math.sign(position.z)}`;
      
      // Minimal push-back for close contact
      const penetration = Math.abs(position.z) - limit;
      if (penetration > 0) {
        correctedZ = Math.sign(position.z) * (limit - Math.max(penetration, 0.02)); // Reduced push-back
      }
    }

    // Check trail collisions and ignore only the brand-new segment that represents
    // the bike's current forward move. Anything older than that must be solid.
    const maxSegmentsToCheck = Math.max(0, trail.length - segmentsToSkip - 1);
    
    if (maxSegmentsToCheck > 0) {
      for (let i = 0; i < maxSegmentsToCheck; i++) {
        const start = trail[i];
        const end = trail[i + 1];
        
        if (i === trail.length - 1) continue;
        
        const segDir = new THREE.Vector3().subVectors(end, start);
        const segLength = segDir.length();
        
        if (segLength < 0.01) continue;
        
        segDir.normalize();
        
        const toStart = new THREE.Vector3().subVectors(position, start);
        const projLength = THREE.MathUtils.clamp(toStart.dot(segDir), 0, segLength);
        
        const closestPoint = start.clone().add(segDir.clone().multiplyScalar(projLength));
        
        const dist = position.distanceTo(closestPoint);
        const collisionDist = bikeHalfWidth + this.config.trailWidth/2 + safetyMargin;
        
        const isInsideTrail = dist < collisionDist;
        
        // Simplified grinding check with proper thresholds
        let allowPass = false;
        if (wallKey) {
          const grindDepth = this.grindDepthMap[wallKey] || 0;
          if (bikeState.grindOffset > grindDepth + 0.03) { // Reasonable threshold
            allowPass = true;
          }
        }
        
        if (isInsideTrail && !allowPass) {
          hit = true;
          
          const pushDir = new THREE.Vector3().subVectors(position, closestPoint);
          if (pushDir.length() > 0.001) {
            pushDir.normalize();
            
            // Proper push-back to maintain collision integrity
            const penetrationDepth = collisionDist - dist;
            const pushDistance = collisionDist + Math.max(penetrationDepth, 0.02) + 0.01;
            const safePoint = closestPoint.clone().add(pushDir.multiplyScalar(pushDistance));
            
            const currentDist = new THREE.Vector2(correctedX, correctedZ).distanceTo(new THREE.Vector2(position.x, position.z));
            const newDist = new THREE.Vector2(safePoint.x, safePoint.z).distanceTo(new THREE.Vector2(position.x, position.z));
            
            if (newDist > currentDist) {
              correctedX = safePoint.x;
              correctedZ = safePoint.z;
              normal = pushDir;
            }
          }
        }
      }
    }

    return { hit, normal, corrected: new THREE.Vector3(correctedX, position.y, correctedZ) };
  }

  public resetGrindDepthMap(): void {
    this.grindDepthMap = {};
  }
}
