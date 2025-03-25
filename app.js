// Custom cursor
const cursor = document.getElementById('cursor');
document.addEventListener('mousemove', (e) => {
  cursor.style.left = e.clientX + 'px';
  cursor.style.top = e.clientY + 'px';
});

// Setup Three.js scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const heroSection = document.querySelector('.hero');
heroSection.appendChild(renderer.domElement);


// Camera position
camera.position.z = 800;

// Mouse position in normalized device coordinates
const mouse = new THREE.Vector2();
const mouseSpeed = new THREE.Vector2();
const lastMouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

// Scene globals
let time = 0;
const noiseGenerator = new SimplexNoise();

// Create a field of particles
const particleCount = isMobile() ? 5000 : 15000;
const particleGeometry = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);
const sizes = new Float32Array(particleCount);
const originalPositions = new Float32Array(particleCount * 3);
const particleVelocities = new Float32Array(particleCount * 3);
const particlePhases = new Float32Array(particleCount);

// Create particles with initial positions
for (let i = 0; i < particleCount; i++) {
  // More interesting distribution with clusters and voids
  let x, y, z;
  
  // 70% of particles follow a spiral pattern
  if (Math.random() < 0.7) {
    const angle = Math.random() * Math.PI * 8;
    const radius = 5 + Math.pow(Math.random(), 0.5) * 700;
    const height = (Math.random() - 0.5) * 1000;
    
    x = Math.cos(angle) * radius;
    y = Math.sin(angle) * radius;
    z = height;
  } 
  // 30% are scattered randomly
  else {
    const radius = 100 + Math.random() * 700;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    
    x = radius * Math.sin(phi) * Math.cos(theta);
    y = radius * Math.sin(phi) * Math.sin(theta);
    z = radius * Math.cos(phi);
  }
  
  const i3 = i * 3;
  positions[i3] = x;
  positions[i3 + 1] = y;
  positions[i3 + 2] = z;
  
  // Store original positions for reset behavior
  originalPositions[i3] = x;
  originalPositions[i3 + 1] = y;
  originalPositions[i3 + 2] = z;
  
  // Random initial velocities
  particleVelocities[i3] = (Math.random() - 0.5) * 0.2;
  particleVelocities[i3 + 1] = (Math.random() - 0.5) * 0.2;
  particleVelocities[i3 + 2] = (Math.random() - 0.5) * 0.2;
  
  // Random phases for movement
  particlePhases[i] = Math.random() * Math.PI * 2;
  
  // Varied sizes for depth feeling
  sizes[i] = 1.5 + Math.random() * 3;
}

particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

// Particle material with custom shader for more interesting visuals
const particleMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: `
    attribute float size;
    varying float vDistance;
    varying float vSize;
    
    void main() {
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vDistance = length(mvPosition.xyz);
      vSize = size;
      
      gl_PointSize = size * (300.0 / vDistance);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying float vDistance;
    varying float vSize;
    
    void main() {
      // Calculate distance from center of point
      vec2 center = gl_PointCoord - vec2(0.5);
      float dist = length(center);
      
      // Soft circular particle with falloff at edges
      float strength = 1.0 - smoothstep(0.3, 0.5, dist);
      
      // Distance-based intensity and fade
      float intensity = 1.0 - vDistance / 1200.0;
      intensity = clamp(intensity, 0.1, 1.0);
      
      // Final color
      gl_FragColor = vec4(1.0, 1.0, 1.0, strength * intensity);
    }
  `
});

const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particleSystem);

// Create visual effects for mouse interaction (fixed size sphere)
const mouseEffectGeometry = new THREE.SphereGeometry(1, 32, 32);
const mouseEffectMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: false,
  opacity: 0
});
const mouseEffect = new THREE.Mesh(mouseEffectGeometry, mouseEffectMaterial);
scene.add(mouseEffect);
mouseEffect.visible = true;
mouseEffect.scale.set(7, 7, 7); // Fixed size sphere

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// Mouse movement tracking
window.addEventListener('mousemove', (event) => {
  // Update mouse position in normalized device coordinates
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  
  // Update mouse speed for calculations
  mouseSpeed.x = mouse.x - lastMouse.x;
  mouseSpeed.y = mouse.y - lastMouse.y;
  
  lastMouse.x = mouse.x;
  lastMouse.y = mouse.y;
});

// Detect mobile devices for performance optimization
function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  time += 0.001;
  
  // Update raycaster with mouse position
  raycaster.setFromCamera(mouse, camera);
  
  // Get 3D point at cursor
  const intersects = raycaster.intersectObjects([particleSystem]);
  
  // Update mouse effect position
  const mouseWorldPosition = new THREE.Vector3();
  if (intersects.length > 0) {
    mouseWorldPosition.copy(intersects[0].point);
  } else {
    // Default position if no intersection
    mouseWorldPosition.set(mouse.x * 990, mouse.y * 990, 0);
  }
  
  // Update visual mouse effect position (but keep size fixed)
  mouseEffect.position.copy(mouseWorldPosition);
  
  // Update particle positions
  const positions = particleGeometry.attributes.position.array;
  const influenceRadius = 200;
  const influenceStrength = 15;
  
  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    
    // Base autonomous movement
    const phase = particlePhases[i];
    
    // Add some perlin noise to movement
    const px = positions[i3] * 0.01;
    const py = positions[i3 + 1] * 0.01;
    const pz = positions[i3 + 2] * 0.01;
    
    const noise1 = noiseGenerator.noise3D(px, py, time) * 0.3;
    const noise2 = noiseGenerator.noise3D(px, time, pz) * 0.3;
    const noise3 = noiseGenerator.noise3D(time, py, pz) * 0.3;
    
    // Autonomous movement
    particleVelocities[i3] += noise1 * 0.05;
    particleVelocities[i3 + 1] += noise2 * 0.05;
    particleVelocities[i3 + 2] += noise3 * 0.05;
    
    // Apply velocity with damping
    positions[i3] += particleVelocities[i3];
    positions[i3 + 1] += particleVelocities[i3 + 1];
    positions[i3 + 2] += particleVelocities[i3 + 2];
    
    particleVelocities[i3] *= 0.98;
    particleVelocities[i3 + 1] *= 0.98;
    particleVelocities[i3 + 2] *= 0.98;
    
    // Mouse influence
    const px2 = positions[i3];
    const py2 = positions[i3 + 1];
    const pz2 = positions[i3 + 2];
    
    const dx = px2 - mouseWorldPosition.x;
    const dy = py2 - mouseWorldPosition.y;
    const dz = pz2 - mouseWorldPosition.z;
    
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    if (distance < influenceRadius) {
      // Repulsion force
      const force = (1 - distance / influenceRadius) * influenceStrength;
      const directionX = dx / distance || 0;
      const directionY = dy / distance || 0;
      const directionZ = dz / distance || 0;
      
      particleVelocities[i3] += directionX * force * 0.3;
      particleVelocities[i3 + 1] += directionY * force * 0.3;
      particleVelocities[i3 + 2] += directionZ * force * 0.3;
    }
    
    // Attraction to original position (very subtle)
    const origX = originalPositions[i3];
    const origY = originalPositions[i3 + 1];
    const origZ = originalPositions[i3 + 2];
    
    const dxOrig = origX - positions[i3];
    const dyOrig = origY - positions[i3 + 1];
    const dzOrig = origZ - positions[i3 + 2];
    
    // Very gentle pull towards original position
    // particleVelocities[i3] += dxOrig * 0.0005;
    // particleVelocities[i3 + 1] += dyOrig * 0.0005;
    // particleVelocities[i3 + 2] += dzOrig * 0.0005;
  }
  
  // Subtle camera movement
  camera.position.x = Math.sin(time * 0.2) * 50;
  camera.position.y = Math.cos(time * 0.3) * 30;
  camera.lookAt(0, 0, 0);
  
  // Update particle geometry
  particleGeometry.attributes.position.needsUpdate = true;
  
  // Render scene
  renderer.render(scene, camera);
}

// Start animation
animate();