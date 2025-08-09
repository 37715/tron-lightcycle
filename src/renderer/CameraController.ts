import * as THREE from 'three';

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private visualPosition = new THREE.Vector3(0, 0, 0);
  private visualRotation = 0;
  private cameraRotation = 0;
  private turnSpeed = 0.5; // Default medium speed (0 = snappy, 1 = smooth)

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  public setTurnSpeed(speed: number): void {
    // Clamp speed between 0 and 1
    this.turnSpeed = Math.max(0, Math.min(1, speed));
  }

  public update(bikePosition: THREE.Vector3, bikeRotation: number): void {
    // Smoothly interpolate visual position to follow actual bike position
    this.visualPosition.lerp(bikePosition, 0.15);
    
    // Calculate camera turn speed based on turnSpeed setting
    // turnSpeed: 0 = snappy (high values), 1 = smooth (low values)
    const cameraLerpSpeed = 0.01 + (1 - this.turnSpeed) * 0.09;   // Range: 0.01 (smooth) to 0.10 (snappy)
    
    // Bike visual rotation should always be instant/snappy - don't apply turn speed here
    let rotationDiff = bikeRotation - this.visualRotation;
    if (Math.abs(rotationDiff) > Math.PI) {
      rotationDiff = rotationDiff > 0 ? rotationDiff - 2 * Math.PI : rotationDiff + 2 * Math.PI;
    }
    this.visualRotation += rotationDiff * 0.15; // Fixed fast rotation for bike visual
    
    const cameraDistance = 18;
    const cameraHeight = 14;
    
    // Camera follows visual position - this is where turn speed applies
    const cameraRotationDiff = this.visualRotation - this.cameraRotation;
    let adjustedCameraDiff = cameraRotationDiff;
    if (Math.abs(cameraRotationDiff) > Math.PI) {
      adjustedCameraDiff = cameraRotationDiff > 0 ? cameraRotationDiff - 2 * Math.PI : cameraRotationDiff + 2 * Math.PI;
    }
    
    // Apply turn speed only to camera rotation
    this.cameraRotation += adjustedCameraDiff * cameraLerpSpeed;
    
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
