import * as THREE from 'three';

export class BikeRenderer {
  private bikeGroup: THREE.Group;
  private bodyMaterial: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, color: number = 0x00ffff) {
    this.bikeGroup = this.createBike(color);
    scene.add(this.bikeGroup);
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

    return bikeGroup;
  }

  public updatePosition(position: THREE.Vector3, rotation: number): void {
    this.bikeGroup.position.copy(position);
    this.bikeGroup.rotation.y = rotation;
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
