import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface CustomiseMenuProps {
  bikeColor: string;
  trailColor: string;
  onBikeColorChange: (color: string) => void;
  onTrailColorChange: (color: string) => void;
  onBack: () => void;
}

const COLOR_PALETTE = [
  { name: 'Neon Cyan', hex: '#00ffff', glow: true },
  { name: 'Plasma Red', hex: '#ff3030', glow: true },
  { name: 'Gold Circuit', hex: '#ffd700', glow: true },
  { name: 'Quantum Violet', hex: '#7c4dff', glow: true },
  { name: 'Matrix Green', hex: '#00e676', glow: true },
  { name: 'Stealth Black', hex: '#1a1a1a', glow: false },
  { name: 'Arctic White', hex: '#f0f0f0', glow: false },
  { name: 'Electric Blue', hex: '#2196f3', glow: true },
  { name: 'Magma Orange', hex: '#ff6b35', glow: true },
];

const CustomiseMenu: React.FC<CustomiseMenuProps> = ({
  bikeColor,
  trailColor,
  onBikeColorChange,
  onTrailColorChange,
  onBack
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const bikeGroupRef = useRef<THREE.Group | null>(null);
  const trailMeshRef = useRef<THREE.Mesh | null>(null);
  const frameRef = useRef<number>(0);
  const [activeTab, setActiveTab] = useState<'bike' | 'trail'>('bike');

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    scene.fog = new THREE.Fog(0xffffff, 10, 50);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      100
    );
    camera.position.set(4, 2.5, 4);
    camera.lookAt(0, 0, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(5, 10, 5);
    mainLight.castShadow = true;
    mainLight.shadow.camera.near = 0.1;
    mainLight.shadow.camera.far = 50;
    mainLight.shadow.camera.left = -10;
    mainLight.shadow.camera.right = 10;
    mainLight.shadow.camera.top = 10;
    mainLight.shadow.camera.bottom = -10;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    scene.add(mainLight);

    const rimLight = new THREE.PointLight(0x00ffff, 0.5, 10);
    rimLight.position.set(-3, 2, -3);
    scene.add(rimLight);

    // Create bike group
    const bikeGroup = new THREE.Group();
    bikeGroupRef.current = bikeGroup;
    scene.add(bikeGroup);

    // Bike body (sleek futuristic design) - positioned flat on grid
    const bodyGeometry = new THREE.BoxGeometry(1.2, 0.3, 0.5);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(bikeColor),
      metalness: 0.7,
      roughness: 0.2,
      emissive: new THREE.Color(bikeColor),
      emissiveIntensity: 0.2
    });
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.position.y = 0.15; // Half the height to sit on grid
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    bikeGroup.add(bodyMesh);

    // Position bike group at ground level
    bikeGroup.position.y = -0.3;

    // Wheels removed - they were facing wrong direction

    // Trail with height growth effect - starts slightly below bike, grows slightly as it goes away
    const trailSegments = [];
    const bikeHeight = 0.3; // Same as bike body height
    for (let i = 0; i < 8; i++) {
      const progress = i / 7; // 0 to 1
      const startHeight = bikeHeight - 0.05; // Start slightly below bike to avoid z-fighting
      const endHeight = bikeHeight + 0.05; // Grow to slightly above bike height
      const currentHeight = startHeight + (endHeight - startHeight) * progress;
      
      const segmentGeometry = new THREE.BoxGeometry(0.5, currentHeight, 0.4);
      const segmentMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(trailColor),
        metalness: 0.25,
        roughness: 0.55,
        emissive: new THREE.Color(trailColor),
        emissiveIntensity: 0.5,
        transparent: false
      });
      const segmentMesh = new THREE.Mesh(segmentGeometry, segmentMaterial);
      // Position starting AT the bike (x=0) and extending away (positive x direction)
      // Bottom of all segments at ground level (-0.3)
      segmentMesh.position.set(i * 0.5, currentHeight / 2 - 0.3, 0);
      segmentMesh.castShadow = true;
      segmentMesh.receiveShadow = true;
      scene.add(segmentMesh);
      trailSegments.push(segmentMesh);
    }
    trailMeshRef.current = trailSegments[0]; // Store first segment for color updates

    // Ground plane (white)
    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0xf8f8f8,
      metalness: 0.1,
      roughness: 0.8
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.3;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid lines on ground (subtle on white)
    const gridHelper = new THREE.GridHelper(20, 40, 0x999999, 0xdddddd);
    gridHelper.position.y = -0.29;
    scene.add(gridHelper);

    // Store trail segments for color updates
    const trailSegmentsRef = { current: trailSegments };

    // Animation loop
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      
      // Orbit camera around static bike
      const time = Date.now() * 0.001;
      const radius = 6;
      camera.position.x = Math.cos(time * 0.5) * radius;
      camera.position.z = Math.sin(time * 0.5) * radius;
      camera.position.y = 2.5 + Math.sin(time * 0.3) * 0.5;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [trailColor]); // Add trailColor dependency for trail segments creation

  // Update bike color
  useEffect(() => {
    if (bikeGroupRef.current) {
      const bodyMesh = bikeGroupRef.current.children[0] as THREE.Mesh;
      if (bodyMesh && bodyMesh.material) {
        const mat = bodyMesh.material as THREE.MeshStandardMaterial;
        mat.color = new THREE.Color(bikeColor);
        mat.emissive = new THREE.Color(bikeColor);
      }
    }
  }, [bikeColor]);

  // Update trail color - update all segments
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BoxGeometry) {
          // Check if it's a trail segment (has the right dimensions)
          const box = new THREE.Box3().setFromObject(child);
          if (box.max.x - box.min.x < 1 && box.max.z - box.min.z < 1) {
            const mat = child.material as THREE.MeshStandardMaterial;
            if (mat && mat.emissiveIntensity === 0.5) { // Trail material check
              mat.color = new THREE.Color(trailColor);
              mat.emissive = new THREE.Color(trailColor);
            }
          }
        }
      });
    }
  }, [trailColor]);

  return (
    <div className="customise-container">
      <div className="customise-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 className="customise-title">CUSTOMISE</h1>
      </div>

      <div className="customise-layout">
        <div className="preview-3d" ref={mountRef}></div>
        
        <div className="customise-controls">
          <div className="tab-selector">
            <button 
              className={`tab-btn ${activeTab === 'bike' ? 'active' : ''}`}
              onClick={() => setActiveTab('bike')}
            >
              BIKE BODY
            </button>
            <button 
              className={`tab-btn ${activeTab === 'trail' ? 'active' : ''}`}
              onClick={() => setActiveTab('trail')}
            >
              LIGHT TRAIL
            </button>
          </div>

          <div className="color-grid">
            {COLOR_PALETTE.map((color) => {
              const isSelected = activeTab === 'bike' 
                ? bikeColor === color.hex 
                : trailColor === color.hex;
              
              return (
                <button
                  key={color.hex}
                  className={`color-option ${isSelected ? 'selected' : ''} ${color.glow ? 'glow' : ''}`}
                  onClick={() => {
                    if (activeTab === 'bike') {
                      onBikeColorChange(color.hex);
                    } else {
                      onTrailColorChange(color.hex);
                    }
                  }}
                  style={{
                    '--color': color.hex,
                    '--glow-color': color.glow ? color.hex : 'transparent'
                  } as React.CSSProperties}
                >
                  <div className="color-preview" style={{ backgroundColor: color.hex }}></div>
                  <span className="color-name">{color.name}</span>
                </button>
              );
            })}
          </div>

          <div className="current-selection">
            <div className="selection-item">
              <span className="selection-label">BIKE</span>
              <div className="selection-color" style={{ backgroundColor: bikeColor }}></div>
            </div>
            <div className="selection-item">
              <span className="selection-label">TRAIL</span>
              <div className="selection-color" style={{ backgroundColor: trailColor }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomiseMenu;
