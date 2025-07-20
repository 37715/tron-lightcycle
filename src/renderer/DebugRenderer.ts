import * as THREE from 'three';

export class DebugRenderer {
  private scene: THREE.Scene;
  private collisionBoxes: Map<string, THREE.LineSegments> = new Map();
  private wallSegments: THREE.LineSegments | null = null;
  private grindZones: Map<string, THREE.Mesh> = new Map();
  private textElement: HTMLDivElement | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.createTextOverlay();
  }

  private createTextOverlay(): void {
    // Create text overlay element
    this.textElement = document.createElement('div');
    this.textElement.style.position = 'absolute';
    this.textElement.style.top = '10px';
    this.textElement.style.left = '10px';
    this.textElement.style.color = 'white';
    this.textElement.style.fontFamily = 'monospace';
    this.textElement.style.fontSize = '14px';
    this.textElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    this.textElement.style.padding = '10px';
    this.textElement.style.borderRadius = '5px';
    this.textElement.style.pointerEvents = 'none';
    this.textElement.style.zIndex = '1000';
    this.textElement.style.whiteSpace = 'pre-line';
    this.textElement.style.lineHeight = '1.2';
    document.body.appendChild(this.textElement);
  }

  public updateCollisionBox(bikeId: string, corners: THREE.Vector3[], color: string = '#00ff00'): void {
    if (corners.length !== 4) return;

    // Remove existing collision box
    const existing = this.collisionBoxes.get(bikeId);
    if (existing) {
      this.scene.remove(existing);
    }

    // Create wireframe box geometry
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
      // Bottom square
      corners[0].x, corners[0].y, corners[0].z,
      corners[1].x, corners[1].y, corners[1].z,
      corners[1].x, corners[1].y, corners[1].z,
      corners[2].x, corners[2].y, corners[2].z,
      corners[2].x, corners[2].y, corners[2].z,
      corners[3].x, corners[3].y, corners[3].z,
      corners[3].x, corners[3].y, corners[3].z,
      corners[0].x, corners[0].y, corners[0].z,
      
      // Top square (slightly above)
      corners[0].x, corners[0].y + 0.1, corners[0].z,
      corners[1].x, corners[1].y + 0.1, corners[1].z,
      corners[1].x, corners[1].y + 0.1, corners[1].z,
      corners[2].x, corners[2].y + 0.1, corners[2].z,
      corners[2].x, corners[2].y + 0.1, corners[2].z,
      corners[3].x, corners[3].y + 0.1, corners[3].z,
      corners[3].x, corners[3].y + 0.1, corners[3].z,
      corners[0].x, corners[0].y + 0.1, corners[0].z,
      
      // Vertical lines
      corners[0].x, corners[0].y, corners[0].z,
      corners[0].x, corners[0].y + 0.1, corners[0].z,
      corners[1].x, corners[1].y, corners[1].z,
      corners[1].x, corners[1].y + 0.1, corners[1].z,
      corners[2].x, corners[2].y, corners[2].z,
      corners[2].x, corners[2].y + 0.1, corners[2].z,
      corners[3].x, corners[3].y, corners[3].z,
      corners[3].x, corners[3].y + 0.1, corners[3].z,
    ]);

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({ 
      color: color,
      transparent: true,
      opacity: 0.8
    });

    const wireframe = new THREE.LineSegments(geometry, material);
    this.scene.add(wireframe);
    this.collisionBoxes.set(bikeId, wireframe);
  }

  public updateWallSegments(segments: { start: THREE.Vector3; end: THREE.Vector3 }[]): void {
    // Remove existing wall segments
    if (this.wallSegments) {
      this.scene.remove(this.wallSegments);
    }

    if (segments.length === 0) return;

    // Create line segments for walls
    const positions: number[] = [];
    segments.forEach(segment => {
      positions.push(segment.start.x, segment.start.y, segment.start.z);
      positions.push(segment.end.x, segment.end.y, segment.end.z);
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({ 
      color: '#ff0000',  // Red for walls
      transparent: true,
      opacity: 0.7
    });

    this.wallSegments = new THREE.LineSegments(geometry, material);
    this.scene.add(this.wallSegments);
  }

  public updateGrindZone(bikeId: string, corners: THREE.Vector3[]): void {
    // Remove existing grind zone
    const existing = this.grindZones.get(bikeId);
    if (existing) {
      this.scene.remove(existing);
    }

    if (corners.length === 0) return;

    // Create a simple plane mesh to show the grind zone
    const geometry = new THREE.PlaneGeometry(0.3, 0.1);
    const material = new THREE.MeshBasicMaterial({ 
      color: '#ffff00',  // Yellow for grind zone
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    
    // Position the mesh at the average of corners
    if (corners.length > 0) {
      const center = new THREE.Vector3();
      corners.forEach(corner => center.add(corner));
      center.divideScalar(corners.length);
      mesh.position.copy(center);
      mesh.rotation.x = -Math.PI / 2; // Lay flat on ground
    }

    this.scene.add(mesh);
    this.grindZones.set(bikeId, mesh);
  }

  public updateTextOverlay(text: string): void {
    if (this.textElement) {
      this.textElement.textContent = text;
      this.textElement.style.display = text ? 'block' : 'none';
    }
  }

  public setVisible(visible: boolean): void {
    // Toggle visibility of all debug elements
    this.collisionBoxes.forEach(box => {
      box.visible = visible;
    });
    
    if (this.wallSegments) {
      this.wallSegments.visible = visible;
    }
    
    this.grindZones.forEach(zone => {
      zone.visible = visible;
    });
    
    if (this.textElement) {
      this.textElement.style.display = visible && this.textElement.textContent ? 'block' : 'none';
    }
  }

  public cleanup(): void {
    // Remove all debug objects from scene
    this.collisionBoxes.forEach(box => {
      this.scene.remove(box);
    });
    this.collisionBoxes.clear();

    if (this.wallSegments) {
      this.scene.remove(this.wallSegments);
      this.wallSegments = null;
    }

    this.grindZones.forEach(zone => {
      this.scene.remove(zone);
    });
    this.grindZones.clear();

    // Remove text overlay
    if (this.textElement && this.textElement.parentNode) {
      this.textElement.parentNode.removeChild(this.textElement);
      this.textElement = null;
    }
  }
} 