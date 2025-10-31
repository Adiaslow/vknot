/**
 * Three.js Fur Background
 * Implements realistic fur rendering with dynamic compression under glass cards
 * Using WebGL instanced rendering for maximum performance
 */

import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

interface CardData {
  element: HTMLElement;
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  velocity: THREE.Vector2; // Raw movement direction (world space)
  velocityMemory: THREE.Vector2; // Persisted velocity for angle buffer (decays in getFlowAngle)
  size: THREE.Vector2;
  compression: number; // 0 = no compression, 1 = full compression
}

class ThreeFurBackground {
  // ============================================================================
  // CAMERA CONFIGURATION
  // ============================================================================
  private readonly CAMERA_FRUSTUM_SIZE = 10;
  private readonly CAMERA_NEAR_PLANE = 0.1;
  private readonly CAMERA_FAR_PLANE = 1000;
  private readonly CAMERA_Z_POSITION = 10;

  // ============================================================================
  // RENDERER CONFIGURATION
  // ============================================================================
  private readonly MAX_PIXEL_RATIO = 2;

  // ============================================================================
  // SEEDED RANDOM GENERATOR PARAMETERS
  // ============================================================================
  private readonly RANDOM_SEED = 137;
  private readonly RANDOM_MULTIPLIER = 1217;
  private readonly RANDOM_INCREMENT = 4927;
  private readonly RANDOM_MODULUS = 233280237117;

  // ============================================================================
  // TEXTURE CONFIGURATION
  // ============================================================================
  private readonly TEXTURE_SIZE = 1024;

  // ============================================================================
  // TEMPORAL SMOOTHING
  // ============================================================================
  private readonly TEMPORAL_BLEND_RATE = 0.2; // 60% blend/decay per frame for all temporal effects - faster recovery when glass moves away

  // ============================================================================
  // FLOW FIELD CONFIGURATION
  // ============================================================================
  private readonly BASE_FLOW_ANGLE = Math.PI / 3; // 45 degree base flow direction
  private readonly FLOW_NOISE_SCALE = 0.003; // Scale for shared flow field
  private readonly FLOW_NOISE_MULTIPLIER = 0.7; // Multiplier for noise influence on angle

  // ============================================================================
  // DIRECTIONAL STRAIN CONFIGURATION
  // ============================================================================
  private readonly ANGLE_SPRING_CONSTANT = 0.01; // Restoring force strength (how strongly hairs pull back to rest)
  private readonly MAX_ANGLE_DEVIATION = Math.PI / 2; // Maximum deviation from rest angle (~90 degrees)
  private readonly RESISTANCE_CURVE = 0.1; // Exponential resistance growth (higher = faster resistance)

  // ============================================================================
  // GLASS INFLUENCE CONFIGURATION
  // ============================================================================
  private readonly GLASS_INFLUENCE_RADIUS = 40;
  private readonly GAUSSIAN_SIGMA_MULTIPLIER = 0.5; // 50% of radius for smooth curve

  // ============================================================================
  // VELOCITY CONFIGURATION
  // ============================================================================
  private readonly VELOCITY_MAGNITUDE_THRESHOLD = 0.00001;
  private readonly VELOCITY_SCALING_FACTOR = 5000;
  private readonly VELOCITY_BLEND_STRENGTH = 0.2;

  // ============================================================================
  // TURBULENCE CONFIGURATION
  // ============================================================================
  private readonly TURBULENCE_OCTAVES = 3;
  private readonly TURBULENCE_FREQUENCY_MULTIPLIER = 2.0;
  private readonly TURBULENCE_AMPLITUDE_MULTIPLIER = 0.5;
  private readonly TURBULENCE_NORMALIZATION_DIVISOR = 2.0;

  // ============================================================================
  // HAIR RENDERING PARAMETERS
  // ============================================================================
  private readonly HAIR_SCALE = 0.05;
  private readonly HAIR_COUNT = 150000; // Safe limit below WebGL buffer max (124,333)
  private readonly HAIR_THICKNESS_MIN = 0.5;
  private readonly HAIR_THICKNESS_MAX = 2.0;
  private readonly HAIR_LENGTH_MIN = 40;
  private readonly HAIR_LENGTH_MAX = 60;
  private readonly HAIR_DENSITY = 10.0;
  private readonly HAIR_DENSITY_POWER = 2.0;

  // Single-triangle hairs - no segmentation needed

  // ============================================================================
  // COLOR CONFIGURATION
  // ============================================================================
  // SINGLE SOURCE OF TRUTH for all background colors in the fur system
  // All other colors derive from this value at runtime - no fallbacks, no duplicates
  private readonly BASE_COLOR_RGB = [196, 152, 103] as const; // Rich dark brown
  private readonly HIGHLIGHT_COLOR_RGB = [242, 228, 204] as const; // Brightest: nearly white with warm hint
  private readonly HIGHLIGHT_REDUCTION_MULTIPLIER = 0.8; // Reduction at full glass influence
  private readonly GRADIENT_HIGHLIGHT_POSITION = 0.5; // Position where highlight starts (0-1): lower = more highlight, higher = more base

  // ============================================================================
  // OPACITY CONFIGURATION
  // ============================================================================
  private readonly OPACITY_BASE_MIN = 0.1;
  private readonly OPACITY_BASE_RANGE = 0.25;
  private readonly OPACITY_TIP_MIN = 0.5;
  private readonly OPACITY_TIP_RANGE = 0.7;

  // ============================================================================
  // MARGIN CONFIGURATION
  // ============================================================================
  private readonly HAIR_PLACEMENT_MARGIN = -100; // Fixed margin in texture pixels - prevents hairs from clipping at edges

  // ============================================================================
  // CONVERGENCE LIGHTING CONFIGURATION
  // ============================================================================
  private readonly CONVERGENCE_LIGHTING_STRENGTH = 0.5; // How strong the lighting effect is (0-1)
  private readonly CONVERGENCE_SMOOTHING = 2.0; // Smoothing factor for convergence calculation
  private readonly LIGHT_DIRECTION_X = 1.0; // Horizontal light component (negative = from left)
  private readonly LIGHT_DIRECTION_Y = -0.5; // Vertical light component (negative = from top)
  private readonly CONVERGENCE_AMBIENT = 0.5; // Ambient lighting level (0 = no ambient)

  // ============================================================================
  // DEBUG CONFIGURATION
  // ============================================================================
  private readonly DEBUG_SHOW_CONVERGENCE_LINES = false; // Enable/disable debug visualization

  // ============================================================================
  // ANIMATION CONFIGURATION
  // ============================================================================
  private readonly ANIMATION_VELOCITY_THRESHOLD = 0.0001; // Threshold for updating texture

  // ============================================================================
  // SCENE OBJECTS
  // ============================================================================
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private furMesh: THREE.Mesh | null = null;
  private leftStaticFurMesh: THREE.Mesh | null = null; // Static fur on left side
  private rightStaticFurMesh: THREE.Mesh | null = null; // Static fur on right side
  private backgroundMesh: THREE.Mesh | null = null; // Noise field background
  private cards: CardData[] = [];
  private canvas: HTMLCanvasElement;
  private frameCount = 0; // For debug logging
  private convergenceDebugMesh: THREE.Points | null = null; // Debug visualization mesh

  // Track previous frame's influence bounds for proper decay
  private prevInfluenceBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  // ============================================================================
  // CONTENT BAND CONFIGURATION (for optimization)
  // ============================================================================
  private contentBandMinX = 0; // Left boundary of dynamic region in texture space
  private contentBandMaxX = 0; // Right boundary of dynamic region in texture space
  private readonly CONTENT_MAX_WIDTH = 1280; // Max content width in pixels (matches max-w-5xl)

  // ============================================================================
  // WEBGL DATA TEXTURES FOR GPU
  // ============================================================================
  private angleDataTexture: THREE.DataTexture | null = null;
  private influenceDataTexture: THREE.DataTexture | null = null;
  private convergenceDataTexture: THREE.DataTexture | null = null;

  // ============================================================================
  // PERSISTENT GENERATORS AND BUFFERS
  // ============================================================================
  private noise2D = createNoise2D();
  private seededRandom = this.createSeededRandom(this.RANDOM_SEED);
  private angleBuffer: Float32Array | null = null;
  private influenceBuffer: Float32Array | null = null;
  private convergenceBuffer: Float32Array | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = this.createCamera();
    this.renderer = this.createRenderer();

    this.init();

    // Set DOM background colors directly from BASE_COLOR_RGB (single source of truth)
    this.setDOMBackgroundColors();
  }

  /**
   * Sets DOM background colors directly from BASE_COLOR_RGB
   * This is the ONLY place colors are derived from - no fallbacks, no CSS custom properties
   */
  private setDOMBackgroundColors(): void {
    const bgColor = `rgb(${this.BASE_COLOR_RGB[0]}, ${this.BASE_COLOR_RGB[1]}, ${this.BASE_COLOR_RGB[2]})`;

    // Set background color on html element
    document.documentElement.style.backgroundColor = bgColor;

    // Set background color on body element
    document.body.style.backgroundColor = bgColor;

    // Set background color on velvet-background element
    const velvetBg = document.querySelector('.velvet-background');
    if (velvetBg instanceof HTMLElement) {
      velvetBg.style.backgroundColor = bgColor;
    }
  }

  private createCamera(): THREE.OrthographicCamera {
    const aspect = window.innerWidth / window.innerHeight;
    const camera = new THREE.OrthographicCamera(
      -this.CAMERA_FRUSTUM_SIZE * aspect / 2,
      this.CAMERA_FRUSTUM_SIZE * aspect / 2,
      this.CAMERA_FRUSTUM_SIZE / 2,
      -this.CAMERA_FRUSTUM_SIZE / 2,
      this.CAMERA_NEAR_PLANE,
      this.CAMERA_FAR_PLANE
    );
    camera.position.z = this.CAMERA_Z_POSITION;
    return camera;
  }

  private createRenderer(): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: false,
      antialias: true,
      premultipliedAlpha: false, // Prevent alpha premultiplication which can affect color blending
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.MAX_PIXEL_RATIO));

    // Use LinearSRGBColorSpace to prevent gamma brightening
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;

    // Set clear color to match BASE_COLOR_RGB exactly (values are in linear space now)
    renderer.setClearColor(new THREE.Color(
      this.BASE_COLOR_RGB[0] / 255,
      this.BASE_COLOR_RGB[1] / 255,
      this.BASE_COLOR_RGB[2] / 255
    ), 1.0);

    return renderer;
  }

  private createSeededRandom(seed: number) {
    const multiplier = this.RANDOM_MULTIPLIER;
    const increment = this.RANDOM_INCREMENT;
    const modulus = this.RANDOM_MODULUS;
    return function() {
      seed = (seed * multiplier + increment) % modulus;
      return seed / modulus;
    };
  }

  private init(): void {
    this.calculateContentBandBoundaries();
    this.initializeBuffers();
    this.createNoiseBackground(); // Create noise field background first (renders behind fur)
    this.createInstancedFurMesh();
    this.setupCardTracking();
    this.setupEventListeners();
    // Do an initial buffer update to calculate convergence for the static flow field
    this.updateBuffers();
    this.animate();
  }

  /**
   * Calculate the boundaries of the content band in texture space
   * Content is centered and has max-width, with buffer zones for card influence
   */
  private calculateContentBandBoundaries(): void {
    const size = this.TEXTURE_SIZE;
    const aspect = window.innerWidth / window.innerHeight;

    // Calculate content width in pixels (capped at CONTENT_MAX_WIDTH)
    const contentWidthPx = Math.min(this.CONTENT_MAX_WIDTH, window.innerWidth);

    // Add buffer for glass influence radius on each side
    const bufferPx = this.GLASS_INFLUENCE_RADIUS * 2; // Extra margin for safety
    const dynamicWidthPx = contentWidthPx + (bufferPx * 2);

    // Convert to texture space
    // Texture space goes from 0 to size, where size maps to full screen width
    const centerX = size / 2;
    const dynamicHalfWidthTex = (dynamicWidthPx / window.innerWidth) * size / 2;

    this.contentBandMinX = Math.max(0, centerX - dynamicHalfWidthTex);
    this.contentBandMaxX = Math.min(size, centerX + dynamicHalfWidthTex);

    console.log('[Fur Optimization] Content band calculated:', {
      windowWidth: window.innerWidth,
      contentWidthPx,
      dynamicWidthPx,
      textureSpace: {
        minX: this.contentBandMinX.toFixed(1),
        maxX: this.contentBandMaxX.toFixed(1),
        width: (this.contentBandMaxX - this.contentBandMinX).toFixed(1)
      },
      coveragePercent: ((this.contentBandMaxX - this.contentBandMinX) / size * 100).toFixed(1) + '%'
    });
  }

  private initializeBuffers(): void {
    const size = this.TEXTURE_SIZE;

    // Initialize persistent angle buffer for fur memory
    this.angleBuffer = new Float32Array(size * size);
    // Initialize persistent influence buffer for glass compression memory
    this.influenceBuffer = new Float32Array(size * size);
    // Initialize persistent convergence buffer for volumetric lighting
    this.convergenceBuffer = new Float32Array(size * size);

    // Initialize with base flow angles and zero influence
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const flowNoise = this.noise2D(x * this.FLOW_NOISE_SCALE, y * this.FLOW_NOISE_SCALE);
        this.angleBuffer[y * size + x] = this.BASE_FLOW_ANGLE + flowNoise * this.FLOW_NOISE_MULTIPLIER;
        this.influenceBuffer[y * size + x] = 0; // Start with no glass influence
        this.convergenceBuffer[y * size + x] = 0; // Start with no convergence
      }
    }

    // Create data textures for GPU
    this.angleDataTexture = new THREE.DataTexture(
      this.angleBuffer,
      size,
      size,
      THREE.RedFormat,
      THREE.FloatType
    );
    this.angleDataTexture.needsUpdate = true;

    this.influenceDataTexture = new THREE.DataTexture(
      this.influenceBuffer,
      size,
      size,
      THREE.RedFormat,
      THREE.FloatType
    );
    this.influenceDataTexture.needsUpdate = true;

    this.convergenceDataTexture = new THREE.DataTexture(
      this.convergenceBuffer,
      size,
      size,
      THREE.RedFormat,
      THREE.FloatType
    );
    this.convergenceDataTexture.needsUpdate = true;
  }

  private createNoiseBackground(): void {
    // Create full-screen plane
    const aspect = window.innerWidth / window.innerHeight;
    const planeGeometry = new THREE.PlaneGeometry(
      this.CAMERA_FRUSTUM_SIZE * aspect,
      this.CAMERA_FRUSTUM_SIZE
    );

    // Create shader material that renders the hair density turbulence as brown variations
    const material = new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: new THREE.Vector3(
          this.BASE_COLOR_RGB[0] / 255,
          this.BASE_COLOR_RGB[1] / 255,
          this.BASE_COLOR_RGB[2] / 255
        )},
        hairScale: { value: this.HAIR_SCALE },
        hairDensityPower: { value: this.HAIR_DENSITY_POWER },
        turbulenceOctaves: { value: this.TURBULENCE_OCTAVES },
        turbulenceFreqMult: { value: this.TURBULENCE_FREQUENCY_MULTIPLIER },
        turbulenceAmpMult: { value: this.TURBULENCE_AMPLITUDE_MULTIPLIER },
        turbulenceNormDiv: { value: this.TURBULENCE_NORMALIZATION_DIVISOR },
        textureSize: { value: this.TEXTURE_SIZE },
        cameraFrustumSize: { value: this.CAMERA_FRUSTUM_SIZE },
        aspectRatio: { value: aspect },
      },
      vertexShader: `
        varying vec2 vWorldPos;

        void main() {
          vWorldPos = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vWorldPos;

        uniform vec3 baseColor;
        uniform float hairScale;
        uniform float hairDensityPower;
        uniform int turbulenceOctaves;
        uniform float turbulenceFreqMult;
        uniform float turbulenceAmpMult;
        uniform float turbulenceNormDiv;
        uniform float textureSize;
        uniform float cameraFrustumSize;
        uniform float aspectRatio;

        // Simplex noise function (same as used for hair density)
        vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

        float snoise(vec2 v) {
          const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                   -0.577350269189626, 0.024390243902439);
          vec2 i  = floor(v + dot(v, C.yy));
          vec2 x0 = v - i + dot(i, C.xx);
          vec2 i1;
          i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;
          i = mod(i, 289.0);
          vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
            + i.x + vec3(0.0, i1.x, 1.0));
          vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
            dot(x12.zw,x12.zw)), 0.0);
          m = m*m;
          m = m*m;
          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
          vec3 g;
          g.x  = a0.x  * x0.x  + h.x  * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        void main() {
          // Convert world position to texture space
          vec2 normPos = vec2(
            (vWorldPos.x / (cameraFrustumSize * aspectRatio) + 1.0) / 2.0,
            (-vWorldPos.y / cameraFrustumSize + 1.0) / 2.0
          );
          vec2 texPos = normPos * textureSize;

          // Calculate turbulence (same as hair density calculation)
          float turbulence = 0.0;
          float amplitude = 1.0;
          float frequency = 1.0;

          for (int octave = 0; octave < 8; octave++) {
            if (octave >= turbulenceOctaves) break;
            turbulence += abs(snoise(texPos * frequency * hairScale * 0.01)) * amplitude;
            frequency *= turbulenceFreqMult;
            amplitude *= turbulenceAmpMult;
          }

          turbulence /= turbulenceNormDiv;

          // Apply density power (same as hair placement)
          float localDensity = pow(turbulence, hairDensityPower);

          // Invert: high density (more hairs) = darker background
          // Map density (0 to 1) to brightness (0.9 to 0.5) - inverted
          float brightness = 0.9 - localDensity * 0.4; // Range from 0.5 to 0.9
          vec3 color = baseColor * brightness;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    this.backgroundMesh = new THREE.Mesh(planeGeometry, material);
    this.backgroundMesh.position.z = -1; // Behind fur
    this.scene.add(this.backgroundMesh);
  }

  private createInstancedFurMesh(): void {
    const aspect = window.innerWidth / window.innerHeight;

    // Reset seeded random for consistent hair placement
    this.seededRandom = this.createSeededRandom(this.RANDOM_SEED);

    // Calculate margin to allow hairs to start outside canvas
    const margin = this.HAIR_LENGTH_MAX * this.MARGIN_MULTIPLIER;
    const size = this.TEXTURE_SIZE;

    // Helper: Get turbulence at specific frequency
    const getTurbulence = (x: number, y: number, scale: number): number => {
      let value = 0;
      let amplitude = 1.0;
      let frequency = 1.0;

      for (let octave = 0; octave < this.TURBULENCE_OCTAVES; octave++) {
        value += Math.abs(this.noise2D(x * frequency * scale, y * frequency * scale)) * amplitude;
        frequency *= this.TURBULENCE_FREQUENCY_MULTIPLIER;
        amplitude *= this.TURBULENCE_AMPLITUDE_MULTIPLIER;
      }

      return value / this.TURBULENCE_NORMALIZATION_DIVISOR;
    };

    // Generate instance attributes for each hair
    // Split into three regions: left static, dynamic center, right static
    const instanceCount = this.HAIR_COUNT;

    // Separate arrays for each region
    const leftStaticData = {
      positions: [] as number[],
      properties: [] as number[],
      opacities: [] as number[],
      seeds: [] as number[]
    };
    const dynamicData = {
      positions: [] as number[],
      properties: [] as number[],
      opacities: [] as number[],
      seeds: [] as number[]
    };
    const rightStaticData = {
      positions: [] as number[],
      properties: [] as number[],
      opacities: [] as number[],
      seeds: [] as number[]
    };

    let validHairCount = 0;

    for (let i = 0; i < this.HAIR_COUNT; i++) {
      // Place hairs with margin buffer so they can extend without clipping
      const margin = this.HAIR_PLACEMENT_MARGIN;
      const x = margin + this.seededRandom() * (size - margin * 2);
      const y = margin + this.seededRandom() * (size - margin * 2);

      // Sample turbulence for density variation
      const turbulence = getTurbulence(x, y, this.HAIR_SCALE);
      const localDensity = Math.pow(turbulence, this.HAIR_DENSITY_POWER);

      // Density threshold
      if (this.seededRandom() > localDensity * this.HAIR_DENSITY) continue;

      // Vary hair properties
      const length = this.HAIR_LENGTH_MIN + this.seededRandom() * (this.HAIR_LENGTH_MAX - this.HAIR_LENGTH_MIN);
      const thickness = this.HAIR_THICKNESS_MIN + this.seededRandom() * (this.HAIR_THICKNESS_MAX - this.HAIR_THICKNESS_MIN);
      const baseOpacity = this.OPACITY_BASE_MIN + this.seededRandom() * this.OPACITY_BASE_RANGE;
      const tipOpacity = this.OPACITY_TIP_MIN + this.seededRandom() * this.OPACITY_TIP_RANGE;
      const seed = this.seededRandom() * 1000.0;

      // Determine which region this hair belongs to
      let targetData;
      if (x < this.contentBandMinX) {
        targetData = leftStaticData;
      } else if (x > this.contentBandMaxX) {
        targetData = rightStaticData;
      } else {
        targetData = dynamicData;
      }

      // Store hair data in appropriate region
      targetData.positions.push(x, y);
      targetData.properties.push(length, thickness);
      targetData.opacities.push(baseOpacity, tipOpacity);
      targetData.seeds.push(seed);

      validHairCount++;
    }

    console.log(`[Fur] Created ${validHairCount} valid hairs from ${this.HAIR_COUNT} attempts`);
    console.log(`[Fur Optimization] Region distribution:`, {
      leftStatic: leftStaticData.positions.length / 2,
      dynamic: dynamicData.positions.length / 2,
      rightStatic: rightStaticData.positions.length / 2
    });

    // Create base geometry - single triangle for maximum instance count
    // Triangle: base-left, base-right, tip-center
    const baseGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
      0, -1, 0,  // Vertex 0: base left (alongHair=0, side=-1)
      0,  1, 0,  // Vertex 1: base right (alongHair=0, side=+1)
      1,  0, 0,  // Vertex 2: tip center (alongHair=1, side=0)
    ]);

    baseGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    baseGeometry.setIndex([0, 1, 2]); // Single triangle

    // Helper function to create instanced mesh for a region
    const createRegionMesh = (data: typeof leftStaticData, name: string): THREE.Mesh | null => {
      const count = data.positions.length / 2;
      if (count === 0) {
        console.log(`[Fur] No hairs in ${name} region`);
        return null;
      }

      const geometry = new THREE.InstancedBufferGeometry();
      geometry.copy(baseGeometry);
      geometry.instanceCount = count;

      geometry.setAttribute('basePosition', new THREE.InstancedBufferAttribute(new Float32Array(data.positions), 2));
      geometry.setAttribute('hairProperties', new THREE.InstancedBufferAttribute(new Float32Array(data.properties), 2));
      geometry.setAttribute('opacityValues', new THREE.InstancedBufferAttribute(new Float32Array(data.opacities), 2));
      geometry.setAttribute('randomSeed', new THREE.InstancedBufferAttribute(new Float32Array(data.seeds), 1));

      console.log(`[Fur] ${name} mesh created with ${count} hairs`);
      return new THREE.Mesh(geometry, this.createFurMaterial(aspect));
    };

    // Create three separate meshes for left static, dynamic, and right static regions
    this.leftStaticFurMesh = createRegionMesh(leftStaticData, 'Left Static');
    this.furMesh = createRegionMesh(dynamicData, 'Dynamic (Center)');
    this.rightStaticFurMesh = createRegionMesh(rightStaticData, 'Right Static');

    // Add meshes to scene
    if (this.leftStaticFurMesh) {
      this.leftStaticFurMesh.frustumCulled = false;
      this.scene.add(this.leftStaticFurMesh);
    }
    if (this.furMesh) {
      this.furMesh.frustumCulled = false;
      this.scene.add(this.furMesh);
    }
    if (this.rightStaticFurMesh) {
      this.rightStaticFurMesh.frustumCulled = false;
      this.scene.add(this.rightStaticFurMesh);
    }

    console.log("[Fur] All region meshes created and added to scene");
  }

  /**
   * Create shader material for fur rendering
   * Shared across all three regions (left static, dynamic, right static)
   */
  private createFurMaterial(aspect: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      vertexShader: this.getVertexShader(),
      fragmentShader: this.getFragmentShader(),
      uniforms: {
        angleTexture: { value: this.angleDataTexture },
        influenceTexture: { value: this.influenceDataTexture },
        convergenceTexture: { value: this.convergenceDataTexture },
        textureSize: { value: this.TEXTURE_SIZE },
        baseColor: { value: new THREE.Vector3(
          this.BASE_COLOR_RGB[0] / 255,
          this.BASE_COLOR_RGB[1] / 255,
          this.BASE_COLOR_RGB[2] / 255
        )},
        highlightColor: { value: new THREE.Vector3(
          this.HIGHLIGHT_COLOR_RGB[0] / 255,
          this.HIGHLIGHT_COLOR_RGB[1] / 255,
          this.HIGHLIGHT_COLOR_RGB[2] / 255
        )},
        highlightReductionMultiplier: { value: this.HIGHLIGHT_REDUCTION_MULTIPLIER },
        gradientHighlightPosition: { value: this.GRADIENT_HIGHLIGHT_POSITION },
        convergenceLightingStrength: { value: this.CONVERGENCE_LIGHTING_STRENGTH },
        lightDirection: { value: new THREE.Vector2(
          this.LIGHT_DIRECTION_X,
          this.LIGHT_DIRECTION_Y
        )},
        texelSize: { value: 1.0 / this.TEXTURE_SIZE },
        convergenceAmbient: { value: this.CONVERGENCE_AMBIENT },
        cameraFrustumSize: { value: this.CAMERA_FRUSTUM_SIZE },
        aspectRatio: { value: aspect },
      }
    });
  }

  private getVertexShader(): string {
    return `
      // Instance attributes
      attribute vec2 basePosition; // Hair base position in texture space
      attribute vec2 hairProperties; // length, thickness
      attribute vec2 opacityValues; // baseOpacity, tipOpacity
      attribute float randomSeed;

      // Uniforms
      uniform sampler2D angleTexture;
      uniform sampler2D influenceTexture;
      uniform float textureSize;
      uniform float cameraFrustumSize;
      uniform float aspectRatio;

      // Varying to fragment shader
      varying float vAlongHair; // Position along hair (0 = base, 1 = tip)
      varying float vGlassInfluence;
      varying vec2 vOpacities;
      varying vec2 vBaseUV; // Base texture coordinate for convergence sampling

      // Seeded random function (matches CPU-side logic)
      float seededRandom(float seed) {
        return fract(sin(seed) * 43758.5453123);
      }

      void main() {
        // Extract hair properties
        float hairLength = hairProperties.x;
        float hairThickness = hairProperties.y;

        // Get position along hair (0 = base, 1 = tip) and side (-1 = left, 0 = center, +1 = right)
        float alongHair = position.x;
        float side = position.y;
        vAlongHair = alongHair;

        // Sample angle texture at base position
        vec2 texCoord = basePosition / textureSize;
        float baseAngle = texture2D(angleTexture, texCoord).r;

        // Sample glass influence
        vGlassInfluence = texture2D(influenceTexture, texCoord).r;

        // Pass opacities to fragment shader
        vOpacities = opacityValues;

        // Pass base UV coordinate to fragment shader for convergence sampling
        vBaseUV = texCoord;

        // Calculate hair direction vectors
        vec2 tangent = vec2(cos(baseAngle), sin(baseAngle));
        vec2 perpendicular = vec2(-tangent.y, tangent.x); // Rotate 90° counterclockwise

        // Position vertex based on which vertex of the triangle this is:
        // - Base vertices (alongHair=0): at basePosition, offset by thickness * side
        // - Tip vertex (alongHair=1): at basePosition + hairLength along flow direction
        vec2 currentPos = basePosition;

        // Move along hair direction
        currentPos += tangent * hairLength * alongHair;

        // Apply thickness offset (only at base where side != 0)
        // Base is thick, tip tapers to a point
        float thicknessAtPoint = hairThickness * (1.0 - alongHair);
        currentPos += perpendicular * thicknessAtPoint * side * 0.5;

        // Convert texture space to world space
        vec2 normalizedPos = currentPos / textureSize; // 0 to 1
        vec2 worldPos;
        worldPos.x = (normalizedPos.x * 2.0 - 1.0) * cameraFrustumSize * aspectRatio * 0.5;
        worldPos.y = (1.0 - normalizedPos.y * 2.0) * cameraFrustumSize * 0.5; // Flip Y

        gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 0.0, 1.0);
      }
    `;
  }

  private getFragmentShader(): string {
    return `
      uniform vec3 baseColor;
      uniform vec3 highlightColor;
      uniform float highlightReductionMultiplier;
      uniform float gradientHighlightPosition;
      uniform sampler2D angleTexture;
      uniform sampler2D convergenceTexture;
      uniform float convergenceLightingStrength;
      uniform vec2 lightDirection;
      uniform float texelSize;
      uniform float convergenceAmbient;

      varying float vAlongHair;
      varying float vGlassInfluence;
      varying vec2 vOpacities;
      varying vec2 vBaseUV;

      void main() {
        // Calculate gradient color based on position along hair
        float gradientPos = smoothstep(0.0, gradientHighlightPosition, vAlongHair);

        // Reduce base color intensity under glass (makes depressed hairs more highlighted)
        float baseColorReduction = vGlassInfluence * highlightReductionMultiplier;
        vec3 adjustedBase = mix(baseColor, highlightColor, baseColorReduction);

        // Mix adjusted base and highlight colors
        vec3 color = mix(adjustedBase, highlightColor, gradientPos);

        // === FLOW-PERPENDICULAR CONVERGENCE LIGHTING ===
        // Apply realistic lighting based on convergence ridges

        // Sample convergence and neighbors for gradient calculation
        float convergence = texture2D(convergenceTexture, vBaseUV).r;
        float convRight = texture2D(convergenceTexture, vBaseUV + vec2(texelSize, 0.0)).r;
        float convLeft = texture2D(convergenceTexture, vBaseUV - vec2(texelSize, 0.0)).r;
        float convUp = texture2D(convergenceTexture, vBaseUV - vec2(0.0, texelSize)).r;
        float convDown = texture2D(convergenceTexture, vBaseUV + vec2(0.0, texelSize)).r;

        // Calculate convergence gradient (surface slope)
        vec2 gradient = vec2(
          (convRight - convLeft) * 0.5,
          (convDown - convUp) * 0.5
        );

        // Get local flow direction and create perpendicular light
        float angle = texture2D(angleTexture, vBaseUV).r;
        vec2 flowDir = vec2(cos(angle), sin(angle));

        // Perpendicular to flow (rotate 90 degrees)
        vec2 perpendicularLight = vec2(-flowDir.y, flowDir.x);

        // Directional lighting: dot product with perpendicular light direction
        float lighting = -dot(perpendicularLight, gradient);

        // Scale by convergence magnitude (enhanced for strong visibility)
        float lightingEffect = lighting * abs(convergence) * convergenceLightingStrength * 30.0;

        // Apply as brightness adjustment
        // Positive = brighten (catching light), Negative = darken (shadow)
        float lightingFactor = 1.0 + lightingEffect;

        // Fade effect toward tip for natural look
        lightingFactor = mix(lightingFactor, 1.0, vAlongHair * 0.3);

        // Apply lighting to color
        color *= lightingFactor;

        // Interpolate opacity from base to tip
        float opacity = mix(vOpacities.x, vOpacities.y, vAlongHair);

        // DEBUG: Render all hairs as bright green at full opacity
        // gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0); // DEBUG disabled
        gl_FragColor = vec4(color, opacity);
      }
    `;
  }

  private updateBuffers(): void {
    if (!this.angleBuffer || !this.influenceBuffer) return;

    const size = this.TEXTURE_SIZE;
    const aspect = window.innerWidth / window.innerHeight;

    // OPTIMIZATION: Only process the dynamic content band
    // Static regions (left and right) never change, so skip them
    const minXToProcess = Math.floor(this.contentBandMinX);
    const maxXToProcess = Math.ceil(this.contentBandMaxX);

    // Convert Three.js world coordinates to texture space
    const worldToTexture = (worldPos: THREE.Vector2): THREE.Vector2 => {
      const normX = (worldPos.x / (this.CAMERA_FRUSTUM_SIZE * aspect / 2) + 1) / 2;
      const normY = (-worldPos.y / (this.CAMERA_FRUSTUM_SIZE / 2) + 1) / 2;
      return new THREE.Vector2(normX * size, normY * size);
    };

    // Create a map to track which pixels are influenced by cards
    const influencedPixels = new Set<number>();

    // Track dirty regions to avoid updating entire texture
    let minX = size, minY = size, maxX = 0, maxY = 0;

    // Update buffers around each card
    for (const card of this.cards) {
      if (card.compression <= 0) continue;

      const cardTexPos = worldToTexture(new THREE.Vector2(card.position.x, card.position.y));
      const cardTexSize = new THREE.Vector2(
        (card.size.x / (this.CAMERA_FRUSTUM_SIZE * aspect)) * size,
        (card.size.y / this.CAMERA_FRUSTUM_SIZE) * size
      );

      const halfWidth = cardTexSize.x / 2;
      const halfHeight = cardTexSize.y / 2;

      // Calculate bounds to update
      const updateMinX = Math.max(0, Math.floor(cardTexPos.x - halfWidth - this.GLASS_INFLUENCE_RADIUS));
      const updateMaxX = Math.min(size - 1, Math.ceil(cardTexPos.x + halfWidth + this.GLASS_INFLUENCE_RADIUS));
      const updateMinY = Math.max(0, Math.floor(cardTexPos.y - halfHeight - this.GLASS_INFLUENCE_RADIUS));
      const updateMaxY = Math.min(size - 1, Math.ceil(cardTexPos.y + halfHeight + this.GLASS_INFLUENCE_RADIUS));

      minX = Math.min(minX, updateMinX);
      maxX = Math.max(maxX, updateMaxX);
      minY = Math.min(minY, updateMinY);
      maxY = Math.max(maxY, updateMaxY);

      // Update pixels in influence region
      // OPTIMIZATION: Clamp to dynamic content band
      const clampedMinX = Math.max(updateMinX, minXToProcess);
      const clampedMaxX = Math.min(updateMaxX, maxXToProcess);

      for (let y = updateMinY; y <= updateMaxY; y++) {
        for (let x = clampedMinX; x <= clampedMaxX; x++) {
          const bufferIndex = y * size + x;

          // Calculate target influence for this card
          const dx = x - cardTexPos.x;
          const dy = y - cardTexPos.y;

          const distFromEdgeX = Math.max(0, Math.abs(dx) - halfWidth);
          const distFromEdgeY = Math.max(0, Math.abs(dy) - halfHeight);
          const distFromEdge = Math.sqrt(distFromEdgeX * distFromEdgeX + distFromEdgeY * distFromEdgeY);

          let targetInfluence = 0;
          if (distFromEdge === 0) {
            targetInfluence = card.compression;
          } else if (distFromEdge < this.GLASS_INFLUENCE_RADIUS) {
            const sigma = this.GLASS_INFLUENCE_RADIUS * this.GAUSSIAN_SIGMA_MULTIPLIER;
            const gaussianFalloff = Math.exp(-(distFromEdge * distFromEdge) / (2 * sigma * sigma));
            targetInfluence = card.compression * gaussianFalloff;
          }

          // If this card has influence, mark pixel and take maximum influence
          if (targetInfluence > 0) {
            influencedPixels.add(bufferIndex);
            const storedInfluence = this.influenceBuffer[bufferIndex];
            const newInfluence = Math.max(storedInfluence, targetInfluence);
            this.influenceBuffer[bufferIndex] = newInfluence;
          }

          // Update angle buffer with directional strain system
          // Calculate base/rest angle (natural position from flow field)
          const flowNoise = this.noise2D(x * this.FLOW_NOISE_SCALE, y * this.FLOW_NOISE_SCALE);
          const baseAngle = this.BASE_FLOW_ANGLE + flowNoise * this.FLOW_NOISE_MULTIPLIER;

          // Get current angle and calculate deviation from rest position
          const storedAngle = this.angleBuffer[bufferIndex];
          const deviation = storedAngle - baseAngle;

          // Calculate resistance: reduces glass influence as deviation increases
          const normalizedDeviation = Math.abs(deviation) / this.MAX_ANGLE_DEVIATION;
          const resistanceFactor = Math.pow(1.0 - Math.min(normalizedDeviation, 1.0), this.RESISTANCE_CURVE);

          // Start with base angle as target
          let targetAngle = baseAngle;

          // Add velocity influence if card is moving
          const velMag = Math.sqrt(
            card.velocityMemory.x * card.velocityMemory.x +
            card.velocityMemory.y * card.velocityMemory.y
          );

          if (velMag > this.VELOCITY_MAGNITUDE_THRESHOLD && distFromEdge < this.GLASS_INFLUENCE_RADIUS) {
            const velocityAngle = Math.atan2(-card.velocityMemory.y, card.velocityMemory.x);
            const velocityInfluence = Math.min(velMag * this.VELOCITY_SCALING_FACTOR, 1.0);

            let influenceStrength;
            if (distFromEdge === 0) {
              influenceStrength = card.compression;
            } else {
              const sigma = this.GLASS_INFLUENCE_RADIUS * this.GAUSSIAN_SIGMA_MULTIPLIER;
              const gaussianFalloff = Math.exp(-(distFromEdge * distFromEdge) / (2 * sigma * sigma));
              influenceStrength = card.compression * gaussianFalloff;
            }

            const blendStrength = influenceStrength * velocityInfluence * this.VELOCITY_BLEND_STRENGTH;
            targetAngle = baseAngle * (1 - blendStrength) + velocityAngle * blendStrength;
          }

          // Apply restoring force (spring pulls toward base angle)
          const restoringForce = -deviation * this.ANGLE_SPRING_CONSTANT;

          // Blend with resistance-adjusted rate and add restoring force
          const effectiveBlendRate = this.TEMPORAL_BLEND_RATE * resistanceFactor;
          let newAngle = storedAngle + (targetAngle - storedAngle) * effectiveBlendRate + restoringForce;

          // Clamp deviation to maximum allowed
          const finalDeviation = newAngle - baseAngle;
          const clampedDeviation = Math.max(-this.MAX_ANGLE_DEVIATION,
                                            Math.min(this.MAX_ANGLE_DEVIATION, finalDeviation));
          newAngle = baseAngle + clampedDeviation;

          this.angleBuffer[bufferIndex] = newAngle;
        }
      }
    }

    // Decay influence for pixels not currently influenced by any card
    // Include BOTH current frame bounds AND previous frame bounds to catch fast-moving cards
    // OPTIMIZATION: Clamp decay region to dynamic content band
    const decayRadius = Math.ceil(this.GLASS_INFLUENCE_RADIUS);
    const decayMinX = Math.max(minXToProcess, Math.min(minX, this.prevInfluenceBounds.minX) - decayRadius);
    const decayMaxX = Math.min(maxXToProcess, Math.max(maxX, this.prevInfluenceBounds.maxX) + decayRadius);
    const decayMinY = Math.max(0, Math.min(minY, this.prevInfluenceBounds.minY) - decayRadius);
    const decayMaxY = Math.min(size - 1, Math.max(maxY, this.prevInfluenceBounds.maxY) + decayRadius);

    // Store current bounds for next frame
    this.prevInfluenceBounds = { minX, maxX, minY, maxY };

    for (let y = decayMinY; y <= decayMaxY; y++) {
      for (let x = decayMinX; x <= decayMaxX; x++) {
        const bufferIndex = y * size + x;

        // If pixel is not influenced by any card, decay it
        if (!influencedPixels.has(bufferIndex)) {
          const storedInfluence = this.influenceBuffer[bufferIndex];
          if (storedInfluence > 0.001) {
            // Decay toward 0
            const newInfluence = storedInfluence * (1 - this.TEMPORAL_BLEND_RATE);
            this.influenceBuffer[bufferIndex] = newInfluence;
          } else if (storedInfluence > 0) {
            // Snap to 0 when very close
            this.influenceBuffer[bufferIndex] = 0;
          }
        }
      }
    }

    // Calculate convergence (divergence of flow field) for volumetric lighting
    // OPTIMIZATION: Only calculate convergence in dynamic content band
    if (this.convergenceBuffer) {
      let minConv = Infinity;
      let maxConv = -Infinity;
      let sumConv = 0;
      let countConv = 0;

      for (let y = 1; y < size - 1; y++) {
        for (let x = Math.max(1, minXToProcess); x < Math.min(size - 1, maxXToProcess); x++) {
          const bufferIndex = y * size + x;

          // Sample angles from neighbors
          const angleCenter = this.angleBuffer[bufferIndex];
          const angleLeft = this.angleBuffer[y * size + (x - 1)];
          const angleRight = this.angleBuffer[y * size + (x + 1)];
          const angleUp = this.angleBuffer[(y - 1) * size + x];
          const angleDown = this.angleBuffer[(y + 1) * size + x];

          // Convert angles to unit vectors
          const vecCenter = { x: Math.cos(angleCenter), y: Math.sin(angleCenter) };
          const vecLeft = { x: Math.cos(angleLeft), y: Math.sin(angleLeft) };
          const vecRight = { x: Math.cos(angleRight), y: Math.sin(angleRight) };
          const vecUp = { x: Math.cos(angleUp), y: Math.sin(angleUp) };
          const vecDown = { x: Math.cos(angleDown), y: Math.sin(angleDown) };

          // Calculate divergence (how much vectors are spreading apart)
          // Divergence = d(vx)/dx + d(vy)/dy
          const divX = (vecRight.x - vecLeft.x) / 2.0;
          const divY = (vecDown.y - vecUp.y) / 2.0;
          const divergence = divX + divY;

          // Negate so positive values = convergence (ridge)
          // Apply smoothing to reduce noise
          const targetConvergence = -divergence / this.CONVERGENCE_SMOOTHING;

          // Blend with previous convergence for temporal consistency
          const storedConvergence = this.convergenceBuffer[bufferIndex];
          const newConvergence = storedConvergence + (targetConvergence - storedConvergence) * this.TEMPORAL_BLEND_RATE;
          this.convergenceBuffer[bufferIndex] = newConvergence;

          // Track statistics
          minConv = Math.min(minConv, newConvergence);
          maxConv = Math.max(maxConv, newConvergence);
          sumConv += Math.abs(newConvergence);
          countConv++;
        }
      }

      // Debug logging every 60 frames
      if (this.frameCount % 60 === 0) {
        const avgAbs = sumConv / countConv;
        const nonZero = this.convergenceBuffer.filter(v => Math.abs(v) > 0.01).length;
        console.log('[Convergence Debug]', {
          min: minConv.toFixed(6),
          max: maxConv.toFixed(6),
          avgAbs: avgAbs.toFixed(6),
          activePixels: nonZero,
          frame: this.frameCount
        });
      }

      // Handle edges by copying from nearest interior pixel
      for (let x = 0; x < size; x++) {
        this.convergenceBuffer[0 * size + x] = this.convergenceBuffer[1 * size + x]; // Top edge
        this.convergenceBuffer[(size - 1) * size + x] = this.convergenceBuffer[(size - 2) * size + x]; // Bottom edge
      }
      for (let y = 0; y < size; y++) {
        this.convergenceBuffer[y * size + 0] = this.convergenceBuffer[y * size + 1]; // Left edge
        this.convergenceBuffer[y * size + (size - 1)] = this.convergenceBuffer[y * size + (size - 2)]; // Right edge
      }
    }

    // Update data textures
    if (this.angleDataTexture) {
      this.angleDataTexture.needsUpdate = true;
    }
    if (this.influenceDataTexture) {
      this.influenceDataTexture.needsUpdate = true;
    }
    if (this.convergenceDataTexture) {
      this.convergenceDataTexture.needsUpdate = true;
    }

    // Update debug visualization
    this.updateConvergenceDebugVisualization();
  }

  /**
   * Bilinear interpolation of convergence buffer at fractional coordinates
   */
  private bilinearInterpolate(x: number, y: number, size: number): number {
    // Clamp to valid range
    x = Math.max(0, Math.min(size - 1, x));
    y = Math.max(0, Math.min(size - 1, y));

    const x0 = Math.floor(x);
    const x1 = Math.min(size - 1, x0 + 1);
    const y0 = Math.floor(y);
    const y1 = Math.min(size - 1, y0 + 1);

    const fx = x - x0;
    const fy = y - y0;

    const c00 = this.convergenceBuffer![y0 * size + x0];
    const c10 = this.convergenceBuffer![y0 * size + x1];
    const c01 = this.convergenceBuffer![y1 * size + x0];
    const c11 = this.convergenceBuffer![y1 * size + x1];

    const c0 = c00 * (1 - fx) + c10 * fx;
    const c1 = c01 * (1 - fx) + c11 * fx;

    return c0 * (1 - fy) + c1 * fy;
  }

  /**
   * Traces equilibrium curves where flow converges from different directions
   * Uses convergence field to find regions where streamlines naturally meet
   */
  private updateConvergenceDebugVisualization(): void {
    if (!this.DEBUG_SHOW_CONVERGENCE_LINES) return;
    if (!this.angleBuffer || !this.convergenceBuffer) return;

    const aspect = window.innerWidth / window.innerHeight;

    // Remove old debug mesh if it exists
    if (this.convergenceDebugMesh) {
      this.scene.remove(this.convergenceDebugMesh);
      this.convergenceDebugMesh.geometry.dispose();
      (this.convergenceDebugMesh.material as THREE.Material).dispose();
    }

    const size = this.TEXTURE_SIZE;
    const curves: number[][] = [];

    // Trace a grid of streamlines to show flow patterns
    // Start from evenly spaced seed points
    const spacing = 40;

    for (let y = spacing; y < size - spacing; y += spacing) {
      for (let x = spacing; x < size - spacing; x += spacing) {
        // Trace streamline forward
        const curve = this.integrateStreamline(x, y, size, 1.5, 200, 1);
        if (curve.length > 20) {
          curves.push(curve);
        }
      }
    }

    // Convert curves to line segments for rendering
    const lineSegments: number[] = [];

    for (const curve of curves) {
      for (let i = 0; i < curve.length - 2; i += 2) {
        const x1 = curve[i];
        const y1 = curve[i + 1];
        const x2 = curve[i + 2];
        const y2 = curve[i + 3];

        const worldX1 = ((x1 / size) - 0.5) * this.CAMERA_FRUSTUM_SIZE * aspect;
        const worldY1 = ((0.5 - y1 / size)) * this.CAMERA_FRUSTUM_SIZE;
        const worldX2 = ((x2 / size) - 0.5) * this.CAMERA_FRUSTUM_SIZE * aspect;
        const worldY2 = ((0.5 - y2 / size)) * this.CAMERA_FRUSTUM_SIZE;

        lineSegments.push(worldX1, worldY1, 0.2);
        lineSegments.push(worldX2, worldY2, 0.2);
      }
    }

    // Always log for debugging
    console.log('[Streamline Visualization] Frame', this.frameCount, {
      spacing,
      curvesTraced: curves.length,
      totalLineSegments: lineSegments.length / 6,
      avgPointsPerCurve: curves.length > 0 ? (curves.reduce((sum, c) => sum + c.length, 0) / curves.length / 2).toFixed(1) : 0,
      sampleCurveLength: curves[0] ? curves[0].length / 2 : 0
    });

    // Create visualization if we have curves
    if (lineSegments.length > 0) {
      console.log('[Streamline Visualization] Creating mesh with', lineSegments.length / 6, 'line segments');
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(lineSegments, 3));

      const material = new THREE.LineBasicMaterial({
        color: 0xff0000, // Red for equilibrium curves
        linewidth: 2,
        transparent: true,
        opacity: 0.9,
      });

      this.convergenceDebugMesh = new THREE.LineSegments(geometry, material);
      this.scene.add(this.convergenceDebugMesh);
    }
  }


  /**
   * Integrate a streamline in the flow field using RK4
   */
  private integrateStreamline(
    startX: number,
    startY: number,
    size: number,
    stepSize: number,
    maxSteps: number,
    direction: number
  ): number[] {
    const curve: number[] = [];
    let x = startX;
    let y = startY;

    for (let step = 0; step < maxSteps; step++) {
      // Check bounds
      if (x < 5 || x >= size - 5 || y < 5 || y >= size - 5) break;

      curve.push(x, y);

      // Get flow vector at current position
      const angle = this.bilinearInterpolateAngle(x, y, size);
      let vx = Math.cos(angle);
      let vy = Math.sin(angle);
      const vmag = Math.sqrt(vx * vx + vy * vy);

      if (vmag < 0.001) break;

      vx /= vmag;
      vy /= vmag;

      // Simple Euler integration
      x += direction * vx * stepSize;
      y += direction * vy * stepSize;
    }

    return curve;
  }

  /**
   * Bilinear interpolation of angle field
   */
  private bilinearInterpolateAngle(x: number, y: number, size: number): number {
    x = Math.max(0, Math.min(size - 1, x));
    y = Math.max(0, Math.min(size - 1, y));

    const x0 = Math.floor(x);
    const x1 = Math.min(size - 1, x0 + 1);
    const y0 = Math.floor(y);
    const y1 = Math.min(size - 1, y0 + 1);

    const fx = x - x0;
    const fy = y - y0;

    const a00 = this.angleBuffer![y0 * size + x0];
    const a10 = this.angleBuffer![y0 * size + x1];
    const a01 = this.angleBuffer![y1 * size + x0];
    const a11 = this.angleBuffer![y1 * size + x1];

    // Simple average (not handling angle wrapping properly, but good enough for visualization)
    const a0 = a00 * (1 - fx) + a10 * fx;
    const a1 = a01 * (1 - fx) + a11 * fx;

    return a0 * (1 - fy) + a1 * fy;
  }

  private setupCardTracking(): void {
    const cardElements = document.querySelectorAll<HTMLElement>('.card');
    console.log(`[Fur] Found ${cardElements.length} glass cards`);

    this.cards = Array.from(cardElements).map((element) => {
      const card: CardData = {
        element,
        position: new THREE.Vector3(),
        previousPosition: new THREE.Vector3(),
        velocity: new THREE.Vector2(0, 0),
        velocityMemory: new THREE.Vector2(0, 0),
        size: new THREE.Vector2(),
        compression: 1, // Always resting on fur, no lifting
      };

      return card;
    });

    this.updateCardPositions();
  }

  private updateCardPositions(): void {
    const aspect = window.innerWidth / window.innerHeight;

    this.cards.forEach(card => {
      const rect = card.element.getBoundingClientRect();

      // Store previous position
      card.previousPosition.copy(card.position);

      // Convert DOM coordinates to Three.js world coordinates
      const x = ((rect.left + rect.width / 2) / window.innerWidth) * 2 - 1;
      const y = -((rect.top + rect.height / 2) / window.innerHeight) * 2 + 1;

      card.position.set(
        x * this.CAMERA_FRUSTUM_SIZE * aspect / 2,
        y * this.CAMERA_FRUSTUM_SIZE / 2,
        card.compression
      );

      // Calculate raw velocity
      card.velocity.set(
        card.position.x - card.previousPosition.x,
        card.position.y - card.previousPosition.y
      );

      // Update velocity memory
      const velMag = Math.sqrt(card.velocity.x * card.velocity.x + card.velocity.y * card.velocity.y);
      if (velMag > this.VELOCITY_MAGNITUDE_THRESHOLD) {
        card.velocityMemory.copy(card.velocity);
      } else {
        card.velocityMemory.multiplyScalar(1 - this.TEMPORAL_BLEND_RATE);
      }

      card.size.set(
        (rect.width / window.innerWidth) * this.CAMERA_FRUSTUM_SIZE * aspect,
        (rect.height / window.innerHeight) * this.CAMERA_FRUSTUM_SIZE
      );
    });
  }

  private setupEventListeners(): void {
    window.addEventListener('resize', () => this.handleResize());
    window.addEventListener('scroll', () => this.updateCardPositions());
  }

  private handleResize(): void {
    const aspect = window.innerWidth / window.innerHeight;

    this.camera.left = -this.CAMERA_FRUSTUM_SIZE * aspect / 2;
    this.camera.right = this.CAMERA_FRUSTUM_SIZE * aspect / 2;
    this.camera.top = this.CAMERA_FRUSTUM_SIZE / 2;
    this.camera.bottom = -this.CAMERA_FRUSTUM_SIZE / 2;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.updateCardPositions();

    // Recalculate content band boundaries for new window size
    const oldMinX = this.contentBandMinX;
    const oldMaxX = this.contentBandMaxX;
    this.calculateContentBandBoundaries();

    // Check if boundaries changed significantly (more than 10% of texture size)
    const bandShiftThreshold = this.TEXTURE_SIZE * 0.1;
    const minXShift = Math.abs(this.contentBandMinX - oldMinX);
    const maxXShift = Math.abs(this.contentBandMaxX - oldMaxX);

    if (minXShift > bandShiftThreshold || maxXShift > bandShiftThreshold) {
      console.log('[Fur Optimization] Content band shifted significantly, regenerating fur...');
      // Remove old meshes
      if (this.leftStaticFurMesh) {
        this.scene.remove(this.leftStaticFurMesh);
        this.leftStaticFurMesh.geometry.dispose();
        (this.leftStaticFurMesh.material as THREE.Material).dispose();
      }
      if (this.furMesh) {
        this.scene.remove(this.furMesh);
        this.furMesh.geometry.dispose();
        (this.furMesh.material as THREE.Material).dispose();
      }
      if (this.rightStaticFurMesh) {
        this.scene.remove(this.rightStaticFurMesh);
        this.rightStaticFurMesh.geometry.dispose();
        (this.rightStaticFurMesh.material as THREE.Material).dispose();
      }
      if (this.backgroundMesh) {
        this.scene.remove(this.backgroundMesh);
        this.backgroundMesh.geometry.dispose();
        (this.backgroundMesh.material as THREE.Material).dispose();
      }

      // Recreate fur and background
      this.createNoiseBackground();
      this.createInstancedFurMesh();
    } else {
      // Update shader uniforms for aspect ratio on all meshes
      const updateMeshAspect = (mesh: THREE.Mesh | null) => {
        if (mesh && mesh.material instanceof THREE.ShaderMaterial) {
          mesh.material.uniforms.aspectRatio.value = aspect;
        }
      };

      updateMeshAspect(this.leftStaticFurMesh);
      updateMeshAspect(this.furMesh);
      updateMeshAspect(this.rightStaticFurMesh);

      // Update background mesh aspect ratio
      if (this.backgroundMesh && this.backgroundMesh.material instanceof THREE.ShaderMaterial) {
        this.backgroundMesh.material.uniforms.aspectRatio.value = aspect;
      }
    }
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    this.frameCount++;

    // Update card positions every frame
    this.updateCardPositions();

    // Check if any card has significant velocity memory
    const hasActiveMovement = this.cards.some(card => {
      const velMag = Math.sqrt(
        card.velocityMemory.x * card.velocityMemory.x +
        card.velocityMemory.y * card.velocityMemory.y
      );
      return velMag > this.ANIMATION_VELOCITY_THRESHOLD;
    });

    // Update buffers and textures when there's movement
    if (hasActiveMovement) {
      this.updateBuffers();
    }

    this.renderer.render(this.scene, this.camera);
  };
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  const canvas = document.getElementById('fur-background') as HTMLCanvasElement;
  if (!canvas) {
    console.error('[Fur] Canvas element #fur-background not found!');
    return;
  }

  console.log('[Fur] Initializing Three.js fur background system...');
  new ThreeFurBackground(canvas);
  console.log('[Fur] Three.js fur background initialized successfully');
}
