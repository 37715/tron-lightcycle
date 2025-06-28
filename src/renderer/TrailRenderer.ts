import * as THREE from 'three';
import { GameConfig } from '../engine/types';

export class TrailRenderer {
  private trailMeshes: THREE.Mesh[] = [];
  private lastTrailPoint: THREE.Vector3 | null = null;

  constructor(private scene: THREE.Scene, private config: GameConfig) {
    // We'll use 3D mesh segments for proper trail walls
  }

  public updateTrailGeometry(trail: THREE.Vector3[]): void {
    // Create 3D trail segments when new points are added
    if (trail.length >= 2) {
      const currentPoint = trail[trail.length - 1];
      const previousPoint = trail[trail.length - 2];
      
      // Only create a new segment if we haven't created one for this segment yet
      if (!this.lastTrailPoint || !this.lastTrailPoint.equals(currentPoint)) {
        this.createTrailSegment(previousPoint, currentPoint);
        this.lastTrailPoint = currentPoint.clone();
      }
    }
  }

  public createTrailSegment(start: THREE.Vector3, end: THREE.Vector3): void {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();

    if (length < 0.1) return;

    // Extend slightly so segments overlap at corners
    const extension = this.config.trailWidth;
    const geometryLength = length + extension * 2;
    const geometry = new THREE.BoxGeometry(this.config.trailWidth, this.config.trailHeight, geometryLength);

    const material = new THREE.MeshBasicMaterial({
      color: 0x3a7bd5,
      transparent: true,
      opacity: 0.4,
      depthWrite: true,
      side: THREE.DoubleSide
    });

    const trailMesh = new THREE.Mesh(geometry, material);
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    trailMesh.position.copy(midpoint);
    trailMesh.lookAt(end);

    this.scene.add(trailMesh);
    this.trailMeshes.push(trailMesh);
  }

  public removeOldestTrailSegment(): void {
    const oldMesh = this.trailMeshes.shift();
    if (oldMesh) {
      this.scene.remove(oldMesh);
      if (oldMesh.geometry) {
        oldMesh.geometry.dispose();
      }
      // Handle material disposal
      const material = oldMesh.material;
      if (Array.isArray(material)) {
        material.forEach(mat => mat.dispose());
      } else if (material) {
        material.dispose();
      }
    }
  }

  public trimTrail(maxSegments: number): void {
    while (this.trailMeshes.length > maxSegments) {
      this.removeOldestTrailSegment();
    }
  }

  public clearAll(): void {
    this.trailMeshes.forEach(mesh => {
      this.scene.remove(mesh);
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      // Handle material disposal
      const material = mesh.material;
      if (Array.isArray(material)) {
        material.forEach(mat => mat.dispose());
      } else if (material) {
        material.dispose();
      }
    });
    this.trailMeshes = [];
    this.lastTrailPoint = null;
  }

  public reset(): void {
    this.clearAll();
  }

  public getTrailMeshCount(): number {
    return this.trailMeshes.length;
  }
}
