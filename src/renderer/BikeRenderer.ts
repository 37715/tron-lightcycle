import * as THREE from 'three';

export class BikeRenderer {
  private rootGroup: THREE.Group; // pivot at bike front
  private bikeGroup: THREE.Group; // visual meshes, offset so front aligns with pivot
  private bodyMaterial: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, color: number = 0x00ffff) {
    // Root pivot at the bike's front axle
    this.rootGroup = new THREE.Group();
    this.bikeGroup = this.createBike(color);
    this.rootGroup.add(this.bikeGroup);
    scene.add(this.rootGroup);
  }

  private createBike(color: number): THREE.Group {
    const bikeGroup = new THREE.Group();

    // Main body - made shorter and less bulky
    const bodyGeometry = new THREE.BoxGeometry(0.25, 0.12, 0.6);
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.4,
      roughness: 0.5,
      emissive: color,
      emissiveIntensity: 0.2
    });
    const bodyMesh = new THREE.Mesh(bodyGeometry, this.bodyMaterial);
    bodyMesh.position.y = 0.18;
    bikeGroup.add(bodyMesh);

    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16);
    wheelGeometry.rotateZ(Math.PI / 2);
    const wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.1,
      roughness: 0.8
    });
    
    const frontWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    frontWheel.position.set(0, 0.12, 0.25);
    bikeGroup.add(frontWheel);

    const backWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    backWheel.position.set(0, 0.12, -0.25);
    bikeGroup.add(backWheel);

    // Offset the visual group so that the bike's FRONT sits at the root (pivot) position
    // With wheels at ±0.25, shifting by -0.25 aligns front axle at world origin.
    bikeGroup.position.z = -0.25;

    return bikeGroup;
  }

  public updatePosition(position: THREE.Vector3, rotation: number): void {
    this.rootGroup.rotation.y = rotation;
    this.rootGroup.position.copy(position);
  }

  public getBikeGroup(): THREE.Group {
    return this.bikeGroup;
  }

  public setColor(color: number): void {
    if (this.bodyMaterial) {
      this.bodyMaterial.color = new THREE.Color(color);
      this.bodyMaterial.emissive = new THREE.Color(color);
    }
  }
}
