import * as THREE from 'three';
import { GameConfig } from '../engine/types';

export class ArenaRenderer {
  private ringGroup: THREE.Group;
  private innerRingGroup: THREE.Group;

  constructor(private scene: THREE.Scene, private config: GameConfig) {
    this.ringGroup = this.createRingGroup();
    this.innerRingGroup = this.createInnerRingGroup();
    
    this.ringGroup.position.y = 0.05;
    this.innerRingGroup.position.y = 0.051;
    
    this.scene.add(this.ringGroup);
    this.scene.add(this.innerRingGroup);

    this.createBoundaryWalls();
    this.createGrid();
  }

  private createRingGroup(): THREE.Group {
    const ringGroup = new THREE.Group();
    const numSegments = 32;
    const segmentAngle = (Math.PI * 2) / numSegments;
    const gapRatio = 0.3;
    
    for (let i = 0; i < numSegments; i++) {
      const startAngle = i * segmentAngle;
      const endAngle = startAngle + (segmentAngle * (1 - gapRatio));
      
      const segmentGeometry = new THREE.TorusGeometry(
        this.config.ringInitialRadius, 0.15, 8, 16, 
        endAngle - startAngle
      );
      
      const segmentMaterial = new THREE.MeshBasicMaterial({
        color: 0xff1111,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide
      });
      
      const segment = new THREE.Mesh(segmentGeometry, segmentMaterial);
      segment.rotation.x = Math.PI / 2;
      segment.rotation.z = startAngle;
      ringGroup.add(segment);
    }
    
    return ringGroup;
  }

  private createInnerRingGroup(): THREE.Group {
    const innerRingGroup = new THREE.Group();
    const numSegments = 32;
    const segmentAngle = (Math.PI * 2) / numSegments;
    
    for (let i = 0; i < numSegments; i++) {
      const startAngle = i * segmentAngle + segmentAngle * 0.5;
      const endAngle = startAngle + (segmentAngle * 0.4);
      
      const segmentGeometry = new THREE.TorusGeometry(
        this.config.ringInitialRadius * 0.96, 0.1, 6, 12,
        endAngle - startAngle
      );
      
      const segmentMaterial = new THREE.MeshBasicMaterial({
        color: 0x330000,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide
      });
      
      const segment = new THREE.Mesh(segmentGeometry, segmentMaterial);
      segment.rotation.x = Math.PI / 2;
      segment.rotation.z = startAngle;
      innerRingGroup.add(segment);
    }
    
    return innerRingGroup;
  }

  private createBoundaryWalls(): void {
    const wallHeight = 1.5;
    const wallThickness = 0.05;
    const boundarySize = 45;
    
    const wallMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x2a2a2a, 
      opacity: 0.2, 
      transparent: true 
    });
    
    const walls = [
      { pos: [0, wallHeight/2, boundarySize] as [number, number, number], size: [boundarySize*2, wallHeight, wallThickness] as [number, number, number] },
      { pos: [0, wallHeight/2, -boundarySize] as [number, number, number], size: [boundarySize*2, wallHeight, wallThickness] as [number, number, number] },
      { pos: [boundarySize, wallHeight/2, 0] as [number, number, number], size: [wallThickness, wallHeight, boundarySize*2] as [number, number, number] },
      { pos: [-boundarySize, wallHeight/2, 0] as [number, number, number], size: [wallThickness, wallHeight, boundarySize*2] as [number, number, number] }
    ];

    walls.forEach(wall => {
      const geometry = new THREE.BoxGeometry(...wall.size);
      const mesh = new THREE.Mesh(geometry, wallMaterial);
      mesh.position.set(...wall.pos);
      this.scene.add(mesh);
    });
  }

  private createGrid(): void {
    const gridSize = 200;
    const gridDivisions = 40;
    const gridColor = new THREE.Color(0x222222); // Use a lighter gray for subtlety
    const gridMaterial = new THREE.LineBasicMaterial({
      color: gridColor,
      opacity: 0.15, // Lower opacity for subtle effect
      transparent: true,
      depthWrite: false
    });
    
    const gridHelper = new THREE.GridHelper(
      gridSize, gridDivisions,
      0x222222, // grid color (lighter gray)
      0x222222  // grid color (lighter gray)
    );
    (gridHelper.material as THREE.Material).opacity = 0.15;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).depthWrite = false;
    gridHelper.position.y = -0.5;
    this.scene.add(gridHelper);
  }

  public updateRings(scale: number, frameCount: number, isPlayerOutsideRing: boolean): void {
    // Update ring scale
    this.ringGroup.scale.setScalar(scale);
    this.innerRingGroup.scale.setScalar(scale);

    // Keep rings positioned correctly
    this.ringGroup.position.set(0, 0.05, 0);
    this.innerRingGroup.position.set(0, 0.051, 0);

    // Optimized pulsing - only update every 4 frames for performance
    if (frameCount % 4 === 0) {
      const pulseIntensity = 0.3; // Reduced intensity for performance
      const timeScale = frameCount * 0.06; // Slower pulsing
      const pulse = 1 + Math.sin(timeScale) * pulseIntensity;
      
      const dangerMultiplier = isPlayerOutsideRing ? 2.0 : 1.0; // Reduced multiplier
      const basePulse = isPlayerOutsideRing ? 0.25 : 0.12; // Slightly reduced opacity changes
      const innerBasePulse = isPlayerOutsideRing ? 0.15 : 0.08;
      
      // Apply pulsing to ring segments
      this.ringGroup.children.forEach((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          const material = mesh.material as THREE.MeshBasicMaterial;
          material.opacity = Math.max(0.05, basePulse * pulse * dangerMultiplier);
          material.color.setHex(isPlayerOutsideRing ? 0xff3333 : 0xff1111);
        }
      });
      
      this.innerRingGroup.children.forEach((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          const material = mesh.material as THREE.MeshBasicMaterial;
          material.opacity = Math.max(0.03, innerBasePulse * pulse * dangerMultiplier);
          material.color.setHex(isPlayerOutsideRing ? 0x550000 : 0x330000);
        }
      });
    }
    
    // Rotation effects - optimized spin speed
    const spinMultiplier = isPlayerOutsideRing ? 1.5 : 1; // Reduced spin multiplier
    this.ringGroup.rotation.y += this.config.ringSpinSpeed * 2 * spinMultiplier; // Reduced base speed
    this.innerRingGroup.rotation.y -= this.config.ringSpinSpeed * 1.5 * spinMultiplier;
  }

  public reset(): void {
    this.ringGroup.scale.setScalar(1.0);
    this.innerRingGroup.scale.setScalar(1.0);
    this.ringGroup.rotation.y = 0;
    this.innerRingGroup.rotation.y = 0;
    
    // Reset ring materials
    this.ringGroup.children.forEach((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.material) {
        const material = mesh.material as THREE.MeshBasicMaterial;
        material.opacity = 0.15;
        material.color.setHex(0xff1111);
      }
    });
    
    this.innerRingGroup.children.forEach((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.material) {
        const material = mesh.material as THREE.MeshBasicMaterial;
        material.opacity = 0.1;
        material.color.setHex(0x330000);
      }
    });
  }
}
