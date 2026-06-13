// Global utilities
const noiseGenerator = new SimplexNoise();

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
}

// Setup Three.js scene only if .hero container exists
const heroSection = document.querySelector('.hero');
if (heroSection) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
  let timeStep = 0.001;
  let targetTimeStep = 0.001;
  const targetColor = new THREE.Color(0xffffff);

  // Detect active page theme immediately from DOM class to avoid particle color flash on initialization
  const body = document.body;
  if (body.classList.contains('theme-music')) {
    targetColor.set(0xffffff); // stark white
    targetTimeStep = 0.0035;   // dynamic wavy currents
    timeStep = 0.0035;
  } else if (body.classList.contains('theme-professional')) {
    targetColor.set(0xffffff); // stark white (all particles must be white)
    targetTimeStep = 0.0001;   // static grid stability
    timeStep = 0.0001;
  } else if (body.classList.contains('theme-fist')) {
    targetColor.set(0xffffff); // stark white
    targetTimeStep = 0.0018;   // heavy slow drift
    timeStep = 0.0018;
  } else {
    targetColor.set(0xffffff); // default white
    targetTimeStep = 0.001;
    timeStep = 0.001;
  }

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

// Particle material with custom shader for dynamic coloring and soft rendering
const particleMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uColor: { value: new THREE.Color().copy(targetColor) }
  },
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
    uniform vec3 uColor;
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
      
      // Final dynamic color
      gl_FragColor = vec4(uColor, strength * intensity);
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
mouseEffect.scale.set(1, 1, 1); // Fixed size sphere

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

// isMobile function moved to top level

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  // Smoothly update noise movement timestep based on current active segment
  timeStep = THREE.MathUtils.lerp(timeStep, targetTimeStep, 0.05);
  time += timeStep;

  // Lerp particle color toward target color
  particleMaterial.uniforms.uColor.value.lerp(targetColor, 0.05);
  
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
    mouseWorldPosition.set(mouse.x * 90, mouse.y * 90, 0);
  }
  
  // Update visual mouse effect position (but keep size fixed)
  mouseEffect.position.copy(mouseWorldPosition);
  
  // Update particle positions
  const positions = particleGeometry.attributes.position.array;
  const influenceRadius = 200;
  const influenceStrength = 15;
  
  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    
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
}

// Letter changes in the header
document.addEventListener('DOMContentLoaded', () => {
  const heading = document.getElementById('animated-heading');
  if (!heading) return;

  // Split name characters only (leaving subtitles un-split to preserve HTML layout)
  const animTarget = heading.querySelector('.name-split') || heading;
  const originalText = animTarget.textContent.trim();
  
  // Clear the target content
  animTarget.innerHTML = '';
  
  // Split text into individual span elements
  for (let i = 0; i < originalText.length; i++) {
      const letter = document.createElement('span');
      letter.className = 'letter';
      letter.textContent = originalText[i];
      letter.dataset.original = originalText[i];
      
      // Generate alternative letters for each character
      if (originalText[i] !== ' ') {
          letter.dataset.alternatives = generateAlternatives(originalText[i]);
      }
      
      animTarget.appendChild(letter);
  }
  
  // Tracking current animations
  let currentlyAnimating = 0;
  const MAX_ANIMATIONS = 1; // Maximum concurrent animations allowed
  let lastAnimationTime = 0; // Track the last time an animation started
  const ANIMATION_DELAY = 1500; // 1.5s delay between animations
  
  // Add event listeners
  const letters = animTarget.querySelectorAll('.letter');
  
  // Random animation trigger
  setInterval(() => {
      const now = Date.now();
      // Check if we've waited long enough since the last animation started
      if (currentlyAnimating < MAX_ANIMATIONS && (now - lastAnimationTime >= ANIMATION_DELAY)) {
          // Get all non-animating letters
          const inactiveLetters = Array.from(letters).filter(letter => 
              !letter.dataset.animating && letter.textContent !== ' ');
          
          if (inactiveLetters.length > 0) {
              // Choose a random letter to animate
              const randomIndex = Math.floor(Math.random() * inactiveLetters.length);
              animateLetter(inactiveLetters[randomIndex]);
              currentlyAnimating++;
              lastAnimationTime = now; // Update the last animation time
          }
      }
  }, 500);
  
  // Hover animation
  letters.forEach(letter => {
      if (letter.textContent !== ' ') {
          letter.addEventListener('mouseenter', () => {
              if (!letter.dataset.animating) {
                  animateLetter(letter, true);
              }
          });
      }
  });
  
  function animateLetter(letterElement, isHover = false) {
      if (letterElement.dataset.animating) return;
      
      letterElement.dataset.animating = 'true';
      letterElement.classList.add('animating');
      if (isHover) {
          letterElement.dataset.isHover = 'true';
      }
      
      const original = letterElement.dataset.original;
      const alternatives = letterElement.dataset.alternatives;
      let iterations = 0;
      const maxIterations = 3; // Number of character changes before returning to original
      
      const interval = setInterval(() => {
          if (iterations >= maxIterations) {
              letterElement.textContent = original;
              clearInterval(interval);
              setTimeout(() => {
                  delete letterElement.dataset.animating;
                  letterElement.classList.remove('animating');
                  
                  // Decrement animation counter for random animations only
                  if (!letterElement.dataset.isHover) {
                      currentlyAnimating--;
                  }
                  delete letterElement.dataset.isHover;
              }, 300);
              return;
          }
          
          const randomIndex = Math.floor(Math.random() * alternatives.length);
          letterElement.textContent = alternatives[randomIndex];
          iterations++;
      }, 150); // Each change lasts 150ms
  }
});

function generateAlternatives(character) {
  // Characters to choose from based on the original character
  const letters = 'abcdtuvwxyz01230';
  let alternatives = '';
  
  // Generate 9 alternative characters (plus the original makes 10)
  for (let i = 0; i < 9; i++) {
      let randomChar;
      do {
          randomChar = letters.charAt(Math.floor(Math.random() * letters.length));
      } while (alternatives.includes(randomChar) || randomChar === character);
      
      alternatives += randomChar;
  }
  
  return alternatives;
}

// Awwwards Music Player State & UI Controller Logic
document.addEventListener('DOMContentLoaded', () => {
  const isMusicPage = document.body.classList.contains('page-music');
  if (!isMusicPage) return;

  const tracks = [
    { title: "Sardaana", previewUrl: "https://p.scdn.co/mp3-preview/25622ad72e583c0e2265d1c8f0262dcd29fe5322" }, // placeholder audio preview
    { title: "Lacrima Maris", previewUrl: "https://p.scdn.co/mp3-preview/25622ad72e583c0e2265d1c8f0262dcd29fe5322" },
    { title: "Puppet Face", previewUrl: "https://p.scdn.co/mp3-preview/93393c2bc5e782be4c3c10ff8e578d11a9c8a29f" },
    { title: "We Ain't Wasting Any Time", previewUrl: "https://p.scdn.co/mp3-preview/7859a4d991f6385abc2a32381d064a1a72bc8a51" },
    { title: "Promise", previewUrl: "https://p.scdn.co/mp3-preview/3c99b2eef822558484556f01c3c0d7a8fe94f4b5" },
    { title: "November", previewUrl: "https://p.scdn.co/mp3-preview/b5ebceda015a05ee7a7aa761ff165cfb80078e18" }
  ];

  const playerStates = [
    { isPlaying: false, currentTimeSeconds: 0, progress: 0, bars: [], audio: null },
    { isPlaying: false, currentTimeSeconds: 0, progress: 0, bars: [], audio: null },
    { isPlaying: false, currentTimeSeconds: 0, progress: 0, bars: [], audio: null },
    { isPlaying: false, currentTimeSeconds: 0, progress: 0, bars: [], audio: null },
    { isPlaying: false, currentTimeSeconds: 0, progress: 0, bars: [], audio: null },
    { isPlaying: false, currentTimeSeconds: 0, progress: 0, bars: [], audio: null }
  ];

  // Initialize visualizers and Audio elements for each track
  const numVisualizerBars = 100;
  playerStates.forEach((state, index) => {
    // Visualizer container
    const visContainer = document.getElementById(`visualizer-${index}`);
    if (visContainer) {
      visContainer.innerHTML = '';
      for (let i = 0; i < numVisualizerBars; i++) {
        const bar = document.createElement('div');
        bar.className = 'visualizer-bar';
        visContainer.appendChild(bar);
        state.bars.push(bar);
      }
    }

    // Audio binding
    state.audio = new Audio(tracks[index].previewUrl);

    // timeupdate
    state.audio.addEventListener('timeupdate', () => {
      if (!state.isPlaying) return;
      state.currentTimeSeconds = Math.floor(state.audio.currentTime);
      state.progress = (state.audio.currentTime / (state.audio.duration || 30)) * 100;
      updateScrubberUI(index);
    });

    // ended
    state.audio.addEventListener('ended', () => {
      pauseTrack(index);
      state.currentTimeSeconds = 0;
      state.progress = 0;
      updateScrubberUI(index);
    });
  });

  // Track Play/Pause buttons
  const playBtns = document.querySelectorAll('.play-btn');
  playBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const trackIdx = parseInt(btn.dataset.trackIndex);
      togglePlayback(trackIdx);
    });
  });

  // Track Scrubbers
  playerStates.forEach((state, index) => {
    const scrubberContainer = document.querySelector(`.scrubber-track-${index}`);
    if (scrubberContainer) {
      const scrubberTrack = scrubberContainer.querySelector('.scrubber-track');
      if (scrubberTrack) {
        scrubberTrack.addEventListener('click', (e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const width = rect.width;
          const ratio = Math.max(0, Math.min(1, clickX / width));
          
          if (state.audio && state.audio.duration) {
            state.audio.currentTime = ratio * state.audio.duration;
            state.currentTimeSeconds = Math.floor(state.audio.currentTime);
            state.progress = ratio * 100;
            updateScrubberUI(index);
          }
        });
      }
    }
  });

  function togglePlayback(index) {
    const state = playerStates[index];
    if (state.isPlaying) {
      pauseTrack(index);
    } else {
      // Pause all other playing tracks first to avoid overlapping playback
      playerStates.forEach((otherState, otherIdx) => {
        if (otherIdx !== index && otherState.isPlaying) {
          pauseTrack(otherIdx);
        }
      });
      playTrack(index);
    }
  }

  function playTrack(index) {
    const state = playerStates[index];
    const playIcon = document.getElementById(`play-icon-${index}`);
    const vinylContainer = document.getElementById(`vinyl-container-${index}`);

    state.isPlaying = true;
    if (playIcon) playIcon.className = 'fas fa-pause';
    if (vinylContainer) vinylContainer.classList.add('playing');

    if (state.audio) {
      state.audio.play().catch(err => {
        console.log("Audio playback blocked by autoplay policy or browser settings:", err);
      });
    }

    requestAnimationFrame(() => updateVisualizer(index));
  }

  function pauseTrack(index) {
    const state = playerStates[index];
    const playIcon = document.getElementById(`play-icon-${index}`);
    const vinylContainer = document.getElementById(`vinyl-container-${index}`);

    state.isPlaying = false;
    if (playIcon) playIcon.className = 'fas fa-play';
    if (vinylContainer) vinylContainer.classList.remove('playing');

    if (state.audio) {
      state.audio.pause();
    }

    // Reset visualizer bars to flat state
    state.bars.forEach(bar => {
      bar.style.height = '5px';
    });
  }

  function updateScrubberUI(index) {
    const state = playerStates[index];
    const fill = document.getElementById(`scrubber-fill-${index}`);
    const currentLabel = document.getElementById(`current-time-${index}`);
    
    if (fill) fill.style.width = `${state.progress}%`;
    if (currentLabel) currentLabel.textContent = formatTime(state.currentTimeSeconds);
  }

  function updateVisualizer(index) {
    const state = playerStates[index];
    if (!state.isPlaying) return;

    const timeVal = Date.now() * 0.005;
    state.bars.forEach((bar, barIdx) => {
      // Generate two octaves of simplex noise for richer audio-like visuals
      const n1 = noiseGenerator.noise2D(barIdx * 0.07, timeVal) * 0.7;
      const n2 = noiseGenerator.noise2D(barIdx * 0.15, timeVal * 1.5) * 0.3;
      const noiseVal = n1 + n2;
      
      // Map combined noise [-1, 1] to height [5, 45]
      const height = Math.floor((noiseVal + 1) * 20) + 5;
      bar.style.height = `${height}px`;
    });

    requestAnimationFrame(() => updateVisualizer(index));
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  // Intersection Observer for scroll stacked cards reveal animation
  const cards = document.querySelectorAll('.track-card');
  const cardObserverOptions = {
    threshold: 0.25
  };
  
  const cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      } else {
        entry.target.classList.remove('visible');
      }
    });
  }, cardObserverOptions);
  
  cards.forEach(card => cardObserver.observe(card));
});
