import * as THREE from 'three';
import { GameConfig } from '../engine/types';

export class TrailRenderer {
  private instancedMesh: THREE.InstancedMesh;
  private segmentGeometry: THREE.BoxGeometry;
  private segmentMaterial: THREE.MeshBasicMaterial;
  private segmentCount = 0;
  private maxSegments: number;
  private segmentQueue: { matrix: THREE.Matrix4; age: number }[] = [];
  private tempMatrix = new THREE.Matrix4();
  private tempPosition = new THREE.Vector3();
  private tempQuaternion = new THREE.Quaternion();
  private tempScale = new THREE.Vector3();

  constructor(private scene: THREE.Scene, private config: GameConfig) {
    // Calculate max segments for shorter, more precise trail  
    // At 0.065 speed with segments every 0.3 units: 0.065 * 7200 / 0.3 = ~1560 segments needed
    const bikeSpeed = 0.065;
    const segmentDistance = 0.3; // Dense segments for smooth trail
    const maxDistance = bikeSpeed * this.config.trailMaxFrames;
    this.maxSegments = Math.ceil(maxDistance / segmentDistance) + 50; // Smaller buffer for shorter trail
    
    console.log(`TrailRenderer initialized: maxSegments=${this.maxSegments}, trailMaxFrames=${this.config.trailMaxFrames}, expectedDistance=${maxDistance}`);
    
    // Create shared geometry for all trail segments
    this.segmentGeometry = new THREE.BoxGeometry(
      this.config.trailWidth, 
      this.config.trailHeight, 
      1.0 // Base length, will be scaled per instance
    );
    
    // Create efficient material
    this.segmentMaterial = new THREE.MeshBasicMaterial({
      color: 0x3a7bd5,
      transparent: true,
      opacity: 0.5, // Good visibility
      depthWrite: true,
      side: THREE.DoubleSide
    });
    
    // Create instanced mesh for ultra-performance
    this.instancedMesh = new THREE.InstancedMesh(
      this.segmentGeometry, 
      this.segmentMaterial, 
      this.maxSegments
    );
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instancedMesh.count = 0; // Start with 0 visible instances
    this.instancedMesh.frustumCulled = false; // Disable frustum culling for better performance
    
    this.scene.add(this.instancedMesh);
  }

  public updateTrailGeometry(): void {
    // This method is called for compatibility but we handle trail updates differently now
    // The actual trail rendering is handled by createTrailSegment calls
  }

  public createTrailSegment(start: THREE.Vector3, end: THREE.Vector3): void {
    if (this.segmentCount >= this.maxSegments) {
      // Remove oldest segment first
      console.warn(`TrailRenderer: Max segments (${this.maxSegments}) reached! Force removing oldest.`);
      this.removeOldestTrailSegment();
    }

    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();

    if (length < 0.1) return;

    // Calculate segment position and orientation
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    
    // Create transformation matrix
    this.tempPosition.copy(midpoint);
    this.tempQuaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
    this.tempScale.set(1, 1, length); // Scale Z to match segment length
    
    this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
    
    // Add to queue and set matrix
    this.segmentQueue.push({ matrix: this.tempMatrix.clone(), age: 0 });
    this.instancedMesh.setMatrixAt(this.segmentCount, this.tempMatrix);
    
    this.segmentCount++;
    this.instancedMesh.count = this.segmentCount;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  public removeOldestTrailSegment(): void {
    if (this.segmentCount <= 0) {
      console.warn('TrailRenderer: Attempted to remove segment but count is 0');
      return;
    }
    
    console.log(`TrailRenderer: Removing oldest segment. Current count: ${this.segmentCount}`);
    
    // Remove from queue
    if (this.segmentQueue.length > 0) {
      this.segmentQueue.shift();
    }
    
    // Shift all matrices down by one
    for (let i = 0; i < this.segmentCount - 1; i++) {
      this.instancedMesh.getMatrixAt(i + 1, this.tempMatrix);
      this.instancedMesh.setMatrixAt(i, this.tempMatrix);
    }
    
    this.segmentCount--;
    this.instancedMesh.count = this.segmentCount;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    
    console.log(`TrailRenderer: Removed segment. New count: ${this.segmentCount}`);
  }

  public trimTrail(maxSegments: number): void {
    while (this.segmentCount > maxSegments) {
      this.removeOldestTrailSegment();
    }
  }

  public clearAll(): void {
    this.segmentCount = 0;
    this.instancedMesh.count = 0;
    this.segmentQueue = [];
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  public reset(): void {
    this.clearAll();
  }

  public getTrailMeshCount(): number {
    return this.segmentCount;
  }

  public dispose(): void {
    this.scene.remove(this.instancedMesh);
    this.segmentGeometry.dispose();
    this.segmentMaterial.dispose();
  }
}
