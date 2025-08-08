import * as THREE from 'three';
import { GameConfig } from '../engine/types';

export class TrailRenderer {
  protected mesh!: THREE.InstancedMesh;
  private segmentCount: number = 0;
  private maxSegments: number = 1000;
  private segmentQueue: { matrix: THREE.Matrix4; age: number }[] = [];
  private tempMatrix = new THREE.Matrix4();
  private tempPosition = new THREE.Vector3();
  private tempQuaternion = new THREE.Quaternion();
  private tempScale = new THREE.Vector3();
  
  // Allow very short segments to avoid visible corner gaps
  private minRenderLength: number = 0.005;
  private bikeHeight: number = 0.22; // Will be set to full height to avoid post-lay growth wiggle
  
  private frameUpdateCount = 0;

  constructor(scene: THREE.Scene, private config: GameConfig, private color: number = 0x00ffff) {
    // Start slightly shorter than full height for a quick grow-in effect
    this.bikeHeight = Math.min(this.bikeHeight, this.config.trailHeight * 0.5);
    this.createTrailMesh(scene);
  }

  private createTrailMesh(scene: THREE.Scene): void {
    const geometry = new THREE.BoxGeometry(1, this.config.trailHeight, 1);
    
    const material = new THREE.MeshStandardMaterial({
      color: this.color,
      metalness: 0.25,
      roughness: 0.55,
      emissive: new THREE.Color(this.color),
      emissiveIntensity: 0.5,
      transparent: false,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, this.maxSegments);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    
    // Initialize all matrices to zero scale to prevent phantom geometry
    for (let i = 0; i < this.maxSegments; i++) {
      this.tempMatrix.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.tempMatrix);
    }
    
    scene.add(this.mesh);
  }

  public createTrailSegment(start: THREE.Vector3, end: THREE.Vector3): void {
    if (this.segmentCount >= this.maxSegments) {
      return;
    }

    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    
    if (length < this.minRenderLength) {
      return;
    }

    // Slightly extend segments to ensure tiny overlaps and remove hairline gaps
    const overlapEpsilon = 0.01;
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

    // Simplified growing height - start at bike height
    const currentHeight = this.bikeHeight;
    
    this.tempPosition.copy(midpoint);
    this.tempPosition.y = currentHeight / 2;

    let finalLength = length;
    if (length > 0) {
      finalLength = length + overlapEpsilon;
    }
    this.tempScale.set(
      this.config.trailWidth,
      currentHeight / this.config.trailHeight,
      finalLength
    );

    if (length > 0.001) {
      direction.normalize();
      // Shift midpoint along direction by half of the overlap to center the extended segment
      this.tempPosition.add(direction.clone().multiplyScalar(overlapEpsilon * 0.5));
      this.tempQuaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    } else {
      this.tempQuaternion.set(0, 0, 0, 1);
    }

    this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
    
    // Strict validation
    if (this.isValidMatrix(this.tempMatrix)) {
      this.mesh.setMatrixAt(this.segmentCount, this.tempMatrix);
      
      this.segmentQueue.push({
        matrix: this.tempMatrix.clone(),
        age: 0
      });
      
      this.segmentCount++;
      this.mesh.count = this.segmentCount;
    }
  }

  public removeOldestTrailSegment(): void {
    if (this.segmentCount <= 0) return;

    // Remove from queue
    this.segmentQueue.shift();
    
    // Shift all matrices down
    for (let i = 0; i < this.segmentCount - 1; i++) {
      this.mesh.getMatrixAt(i + 1, this.tempMatrix);
      this.mesh.setMatrixAt(i, this.tempMatrix);
    }
    
    // Clear the last position with zero scale
    this.tempMatrix.makeScale(0, 0, 0);
    this.mesh.setMatrixAt(this.segmentCount - 1, this.tempMatrix);
    
    this.segmentCount--;
    this.mesh.count = this.segmentCount;
  }

  public updateTrailGeometry(): void {
    this.frameUpdateCount++;
    
    // Update matrices less frequently
    if (this.frameUpdateCount % 2 === 0) {
      if (this.mesh.instanceMatrix) {
        this.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    
    // Grow segments to full height quickly for nice visual without lateral reshaping
    if (this.frameUpdateCount % 5 === 0) {
      let needsUpdate = false;
      
      this.segmentQueue.forEach((segment, index) => {
        segment.age++;
        
        // Grow height over 7 frames
        if (segment.age <= 7) {
          const growthProgress = segment.age / 7;
          const targetHeight = this.bikeHeight + (this.config.trailHeight - this.bikeHeight) * growthProgress;
          
          // Decompose and update only Y components to avoid any lateral wiggle
          segment.matrix.decompose(this.tempPosition, this.tempQuaternion, this.tempScale);
          this.tempPosition.y = targetHeight / 2;
          this.tempScale.y = targetHeight / this.config.trailHeight;
          
          // Validate before updating
          this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
          
          if (this.isValidMatrix(this.tempMatrix)) {
            segment.matrix.copy(this.tempMatrix);
            
            if (index < this.segmentCount) {
              this.mesh.setMatrixAt(index, this.tempMatrix);
              needsUpdate = true;
            }
          }
        }
      });
      
      if (needsUpdate && this.mesh.instanceMatrix) {
        this.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  public getTrailMeshCount(): number {
    return this.segmentCount;
  }

  public clearAllTrails(): void {
    this.segmentCount = 0;
    this.mesh.count = 0;
    this.segmentQueue = [];
    
    // Clear all matrices to prevent phantom geometry
    for (let i = 0; i < this.maxSegments; i++) {
      this.tempMatrix.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.tempMatrix);
    }
    
    if (this.mesh.instanceMatrix) {
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  public dispose(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      if (this.mesh.material instanceof THREE.Material) {
        this.mesh.material.dispose();
      }
      this.mesh.parent?.remove(this.mesh);
    }
    
    this.segmentQueue = [];
    this.segmentCount = 0;
  }

  private isValidMatrix(matrix: THREE.Matrix4): boolean {
    const elements = matrix.elements;
    
    // Check all matrix elements
    for (let i = 0; i < elements.length; i++) {
      if (!isFinite(elements[i]) || isNaN(elements[i])) {
        return false;
      }
    }
    
    // Decompose and validate components
    matrix.decompose(this.tempPosition, this.tempQuaternion, this.tempScale);
    
    // Strict validation
    return (
      isFinite(this.tempPosition.x) && isFinite(this.tempPosition.y) && isFinite(this.tempPosition.z) &&
      isFinite(this.tempQuaternion.x) && isFinite(this.tempQuaternion.y) && isFinite(this.tempQuaternion.z) && isFinite(this.tempQuaternion.w) &&
      isFinite(this.tempScale.x) && isFinite(this.tempScale.y) && isFinite(this.tempScale.z) &&
      Math.abs(this.tempPosition.x) < 100 && Math.abs(this.tempPosition.y) < 100 && Math.abs(this.tempPosition.z) < 100 &&
      this.tempScale.x > 0.001 && this.tempScale.y > 0.001 && this.tempScale.z > 0.001 &&
      this.tempScale.x < 50 && this.tempScale.y < 50 && this.tempScale.z < 50
    );
  }
}

