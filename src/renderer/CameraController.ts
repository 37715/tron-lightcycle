import * as THREE from 'three';

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private visualPosition = new THREE.Vector3(0, 0, 0);
  private visualRotation = 0;
  private cameraRotation = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  public update(bikePosition: THREE.Vector3, bikeRotation: number): void {
    // Smoothly interpolate visual position to follow actual bike position
    this.visualPosition.lerp(bikePosition, 0.15);
    
    // Smoothly interpolate visual rotation
    let rotationDiff = bikeRotation - this.visualRotation;
    if (Math.abs(rotationDiff) > Math.PI) {
      rotationDiff = rotationDiff > 0 ? rotationDiff - 2 * Math.PI : rotationDiff + 2 * Math.PI;
    }
    this.visualRotation += rotationDiff * 0.08;
    
    const cameraDistance = 18;
    const cameraHeight = 14;
    
    // Camera follows visual position rather than actual position for smoothness
    const cameraRotationDiff = this.visualRotation - this.cameraRotation;
    let adjustedCameraDiff = cameraRotationDiff;
    if (Math.abs(cameraRotationDiff) > Math.PI) {
      adjustedCameraDiff = cameraRotationDiff > 0 ? cameraRotationDiff - 2 * Math.PI : cameraRotationDiff + 2 * Math.PI;
    }
    
    // Smooth camera rotation
    this.cameraRotation += adjustedCameraDiff * 0.04;
    
    const cameraOffset = new THREE.Vector3(
      -Math.sin(this.cameraRotation) * cameraDistance,
      cameraHeight,
      -Math.cos(this.cameraRotation) * cameraDistance
    );
    
    const targetCameraPosition = this.visualPosition.clone().add(cameraOffset);
    
    // Smooth camera position following
    this.camera.position.lerp(targetCameraPosition, 0.08);
    this.camera.lookAt(this.visualPosition);
  }

  public getVisualPosition(): THREE.Vector3 {
    return this.visualPosition.clone();
  }

  public getVisualRotation(): number {
    return this.visualRotation;
  }

  public reset(): void {
    this.visualPosition.set(0, 0, 0);
    this.visualRotation = 0;
    this.cameraRotation = 0;
  }
}
