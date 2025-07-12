import * as THREE from 'three';
import { GameConfig } from '../engine/types';

export class ArenaRenderer {
  private ringGroup: THREE.Group;
  private innerRingGroup: THREE.Group;
  private gridHelper: THREE.GridHelper | null = null;

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
      opacity: 0.15, // Reduced opacity to make walls less prominent
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
    
    const gridHelper = new THREE.GridHelper(
      gridSize, gridDivisions,
      0x222222, // Normal grid color
      0x222222  // Normal grid color
    );
    (gridHelper.material as THREE.Material).opacity = 0.15;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).depthWrite = false;
    gridHelper.position.y = -0.5;
    
    this.scene.add(gridHelper);
    this.gridHelper = gridHelper; // Track the gridHelper object
  }

  public updateRings(scale: number, frameCount: number, isPlayerOutsideRing: boolean): void {
    // The danger zone should always be visible, even at minimum size
    // Only hide rings if they're smaller than the actual minimum game size
    const minGameScale = this.config.ringMinRadius / this.config.ringInitialRadius; // Actual minimum from config
    const hideThreshold = minGameScale * 0.8; // Only hide if smaller than 80% of minimum game size
    
    if (scale < hideThreshold) {
      // Completely disable rings that are smaller than the game's minimum
      this.ringGroup.scale.setScalar(0);
      this.innerRingGroup.scale.setScalar(0);
      this.ringGroup.position.set(0, -1000, 0); // Move far below ground
      this.innerRingGroup.position.set(0, -1000, 0);
      this.ringGroup.visible = false;
      this.innerRingGroup.visible = false;
      
      // Rings are hidden when too small
      return;
    }

    // Update ring scale for visible rings
    this.ringGroup.scale.setScalar(scale);
    this.innerRingGroup.scale.setScalar(scale);

    // Keep rings positioned correctly
    this.ringGroup.position.set(0, 0.05, 0);
    this.innerRingGroup.position.set(0, 0.051, 0);
    
    // Make sure rings are visible
    this.ringGroup.visible = true;
    this.innerRingGroup.visible = true;

    // Further optimized pulsing - only update every 8 frames for better performance
    if (frameCount % 8 === 0) {
      const pulseIntensity = 0.2; // Further reduced intensity for performance
      const timeScale = frameCount * 0.04; // Slower pulsing
      const pulse = 1 + Math.sin(timeScale) * pulseIntensity;
      
      const dangerMultiplier = isPlayerOutsideRing ? 1.5 : 1.0; // Further reduced multiplier
      const basePulse = isPlayerOutsideRing ? 0.2 : 0.1; // Further reduced opacity changes
      const innerBasePulse = isPlayerOutsideRing ? 0.12 : 0.06;
      
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
    
    // Rotation effects - further optimized spin speed
    const spinMultiplier = isPlayerOutsideRing ? 1.2 : 1; // Further reduced spin multiplier
    this.ringGroup.rotation.y += this.config.ringSpinSpeed * 1.5 * spinMultiplier; // Further reduced base speed
    this.innerRingGroup.rotation.y -= this.config.ringSpinSpeed * 1.2 * spinMultiplier;
  }

  public reset(): void {
    this.ringGroup.scale.setScalar(1.0);
    this.innerRingGroup.scale.setScalar(1.0);
    this.ringGroup.rotation.y = 0;
    this.innerRingGroup.rotation.y = 0;
    
    // Make sure rings are visible after reset
    this.ringGroup.visible = true;
    this.innerRingGroup.visible = true;
    
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

  public setGridVisible(visible: boolean): void {
    if (this.gridHelper) {
      this.gridHelper.visible = visible;
    }
  }
}
