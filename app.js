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
const seeds = new Float32Array(particleCount);

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
  sizes[i] = 3 + Math.random() * 5.5;

  // Per-particle seed drives twinkle offset so the field never pulses in unison
  seeds[i] = Math.random();
}

particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
particleGeometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));

// Particle material with custom shader for dynamic coloring and soft rendering
const particleMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uColor: { value: new THREE.Color().copy(targetColor) },
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector3(0, 0, 0) },
    uPulse: { value: 0 },
    uPulseRadius: { value: 0 },
    uOpacity: { value: 1 }
  },
  vertexShader: `
    attribute float size;
    attribute float seed;

    uniform float uTime;
    uniform vec3 uMouse;
    uniform float uPulse;
    uniform float uPulseRadius;

    varying float vDistance;
    varying float vGlow;

    void main() {
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vDistance = length(mvPosition.xyz);

      // Proximity to the cursor lights particles up
      float toMouse = distance(position, uMouse);
      float near = 1.0 - smoothstep(0.0, 300.0, toMouse);

      // Expanding sonar ring fired on click
      float ring = 1.0 - smoothstep(0.0, 110.0, abs(toMouse - uPulseRadius));
      vGlow = max(near, ring * uPulse);

      // Independent twinkle per particle
      float twinkle = 0.78 + 0.22 * sin(uTime * 1.8 + seed * 6.2831);

      gl_PointSize = size * (300.0 / vDistance) * twinkle * (1.0 + vGlow * 1.9);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uOpacity;

    varying float vDistance;
    varying float vGlow;

    void main() {
      float dist = length(gl_PointCoord - vec2(0.5));

      // Hard core with a soft halo around it reads sharper than a single falloff
      float core = 1.0 - smoothstep(0.0, 0.2, dist);
      float halo = 1.0 - smoothstep(0.14, 0.5, dist);
      float strength = core + halo * 0.42;

      // Depth fade
      float intensity = clamp(1.0 - vDistance / 1300.0, 0.06, 1.0);

      float alpha = strength * intensity * uOpacity * (0.62 + 0.9 * vGlow);
      gl_FragColor = vec4(uColor, alpha);
    }
  `
});

const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particleSystem);

// Cursor position projected into the particle field, and the click shockwave state
const mouseWorld = new THREE.Vector3(0, 0, 0);
const pointerRay = new THREE.Vector3();
let pointerActive = false;
let pulseProgress = 1; // 1 = spent

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
  pointerActive = true;
});

window.addEventListener('mouseleave', () => {
  pointerActive = false;
});

// Click fires a shockwave ring through the field
function firePulse() {
  pulseProgress = 0;
}

heroSection.addEventListener('pointerdown', firePulse);

// Touch devices steer the field by dragging
window.addEventListener('touchmove', (event) => {
  const touch = event.touches[0];
  if (!touch) return;
  mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
  pointerActive = true;
}, { passive: true });

// Project the cursor onto the z = 0 plane of the field
function updateMouseWorld() {
  pointerRay.set(mouse.x, mouse.y, 0.5).unproject(camera).sub(camera.position).normalize();
  const travel = pointerRay.z === 0 ? 0 : -camera.position.z / pointerRay.z;
  mouseWorld.copy(camera.position).addScaledVector(pointerRay, travel);
}

// isMobile function moved to top level

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  // Smoothly update noise movement timestep based on current active segment
  timeStep = THREE.MathUtils.lerp(timeStep, targetTimeStep, 0.05);
  time += timeStep;

  // Lerp particle color toward target color
  particleMaterial.uniforms.uColor.value.lerp(targetColor, 0.05);
  
  // Cursor parallax: the camera leans toward the pointer, then drifts on its own
  const targetCamX = Math.sin(time * 0.2) * 50 + (pointerActive ? mouse.x * 130 : 0);
  const targetCamY = Math.cos(time * 0.3) * 30 + (pointerActive ? mouse.y * 85 : 0);
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.045);
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, 0.045);
  camera.lookAt(0, 0, 0);

  // Project the cursor into the field (cheap plane hit, no raycast against 15k points)
  updateMouseWorld();
  particleMaterial.uniforms.uMouse.value.copy(mouseWorld);
  particleMaterial.uniforms.uTime.value = time * 100;

  // Advance the click shockwave
  if (pulseProgress < 1) {
    pulseProgress = Math.min(1, pulseProgress + 0.013);
    particleMaterial.uniforms.uPulse.value = Math.pow(1 - pulseProgress, 1.6);
    particleMaterial.uniforms.uPulseRadius.value = pulseProgress * 1100;
  } else {
    particleMaterial.uniforms.uPulse.value = 0;
  }

  // The field thins out and expands as the hero scrolls away
  const heroHeight = heroSection.offsetHeight || window.innerHeight;
  const scrolled = Math.min(1, (window.scrollY || 0) / heroHeight);
  particleMaterial.uniforms.uOpacity.value = Math.max(0, 1 - scrolled * 1.15);
  particleSystem.scale.setScalar(1 + scrolled * 0.32);
  particleSystem.rotation.z = scrolled * 0.22;

  // Skip the simulation entirely once the field is invisible
  if (particleMaterial.uniforms.uOpacity.value <= 0.001) {
    renderer.render(scene, camera);
    return;
  }

  // Update particle positions
  const positions = particleGeometry.attributes.position.array;
  const influenceRadius = 300;
  const influenceStrength = 16;
  const pulseRadius = particleMaterial.uniforms.uPulseRadius.value;
  const pulseForce = particleMaterial.uniforms.uPulse.value * 9;

  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;

    // Curl-ish drift from the noise field
    const px = positions[i3] * 0.01;
    const py = positions[i3 + 1] * 0.01;
    const pz = positions[i3 + 2] * 0.01;

    const noise1 = noiseGenerator.noise3D(px, py, time) * 0.3;
    const noise2 = noiseGenerator.noise3D(px, time, pz) * 0.3;
    const noise3 = noiseGenerator.noise3D(time, py, pz) * 0.3;

    particleVelocities[i3] += noise1 * 0.05;
    particleVelocities[i3 + 1] += noise2 * 0.05;
    particleVelocities[i3 + 2] += noise3 * 0.05;

    // Spring back toward the original lattice, so the field always reforms
    particleVelocities[i3] += (originalPositions[i3] - positions[i3]) * 0.0022;
    particleVelocities[i3 + 1] += (originalPositions[i3 + 1] - positions[i3 + 1]) * 0.0022;
    particleVelocities[i3 + 2] += (originalPositions[i3 + 2] - positions[i3 + 2]) * 0.0022;

    // Cursor force field: push away radially, and swirl around the pointer
    const dx = positions[i3] - mouseWorld.x;
    const dy = positions[i3 + 1] - mouseWorld.y;
    const dz = positions[i3 + 2] - mouseWorld.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.0001;

    if (distance < influenceRadius) {
      const falloff = 1 - distance / influenceRadius;
      const force = falloff * influenceStrength;
      const nx = dx / distance;
      const ny = dy / distance;
      const nz = dz / distance;

      particleVelocities[i3] += nx * force * 0.16;
      particleVelocities[i3 + 1] += ny * force * 0.16;
      particleVelocities[i3 + 2] += nz * force * 0.16;

      // Tangential component (cross product with the view axis) gives the vortex
      const swirl = falloff * falloff * 0.9;
      particleVelocities[i3] += -ny * swirl;
      particleVelocities[i3 + 1] += nx * swirl;
    }

    // Shockwave: a thin shell of outward impulse travelling through the field
    if (pulseForce > 0.01) {
      const shell = Math.abs(distance - pulseRadius);
      if (shell < 130) {
        const hit = (1 - shell / 130) * pulseForce;
        particleVelocities[i3] += (dx / distance) * hit;
        particleVelocities[i3 + 1] += (dy / distance) * hit;
        particleVelocities[i3 + 2] += (dz / distance) * hit;
      }
    }

    // Integrate with damping
    positions[i3] += particleVelocities[i3];
    positions[i3 + 1] += particleVelocities[i3 + 1];
    positions[i3 + 2] += particleVelocities[i3 + 2];

    particleVelocities[i3] *= 0.955;
    particleVelocities[i3 + 1] *= 0.955;
    particleVelocities[i3 + 2] *= 0.955;
  }

  // Update particle geometry
  particleGeometry.attributes.position.needsUpdate = true;
  
  // Render scene
  renderer.render(scene, camera);
}

// Start animation
animate();
}

// Whitespace check that also catches the non-breaking space used between name and surname
function isSpaceChar(char) {
  return !char || !char.trim();
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
      
      // Spaces (regular or non-breaking) stay untouched by the scramble effect
      if (!isSpaceChar(originalText[i])) {
          letter.dataset.alternatives = generateAlternatives(originalText[i]);
      } else {
          letter.classList.add('is-space');
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
              !letter.dataset.animating && !isSpaceChar(letter.textContent));
          
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
      if (!isSpaceChar(letter.textContent)) {
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
    // Low threshold: on narrow screens the cards stack far taller than the viewport,
    // so a high ratio could never be met and the content would stay hidden.
    threshold: 0.08
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
