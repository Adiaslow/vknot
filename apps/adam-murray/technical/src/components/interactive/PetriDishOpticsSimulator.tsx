import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useThemeTokens,
  VizFigure,
  VizSurface,
  Slider,
  StatCard,
  Legend,
  // ── ray tracer module ────────────────────────────────────────────
  AIR,
  POLYSTYRENE,
  WATER,
  AGAR,
  ABSORBER,
  coneSource,
  diffuseSky,
  horizontalSegment,
  verticalSegment,
  heightField,
  lambertianScatterer,
  trace,
} from './_viz';
import type {
  LightSource,
  Medium,
  RaySegment,
  Scene,
  Surface,
  Vec2,
} from './_viz';

// ────────────────────────────────────────────────────────────────────
// Petri dish optics simulator.
//
// All physics is delegated to the raytracer module (./_viz/raytracer).
// This file is responsible for:
//   • Translating component state into a scene (a list of optical
//     interfaces with proper media on each side) and a list of light
//     sources.
//   • Calling trace() to get all ray segments.
//   • Rendering segments and geometry on a canvas.
//   • Deriving summary statistics from the traced rays.
//
// No optical physics lives in this file. If a fix is needed to Snell,
// Fresnel, or Beer-Lambert behaviour, it belongs in the raytracer module.
// ────────────────────────────────────────────────────────────────────

// ─── geometry constants (millimetres) ──────────────────────────────
const DISH_RADIUS = 50; // 100 mm dish diameter, from Fisher MRS plates
const DISH_WALL_HEIGHT = 15; // interior wall height
const DISH_WALL_THICKNESS = 1; // polystyrene wall (visual)
const AGAR_FILL_DEPTH = 2.3; // 18 mL / (π · 50²) mm³
const LID_THICKNESS = 1;
const LID_CLEARANCE = 0.5;
const LID_OVERLAP = 5;
const LID_HEIGHT = 7;

// ─── light source layout ───────────────────────────────────────────
// Overhead lighting is modelled as a uniform-radiance upper hemisphere
// (an effectively-distant, horizontally-extended diffuse emitter — the
// physical situation of a ceiling fluorescent panel, an LED light box,
// or an overcast sky illuminating a benchtop). Rays arrive at the dish
// from every direction in the upper hemisphere; the angular density is
// cos-weighted, so each ray represents an equal share of the irradiance
// on a horizontal receiver. Rays from any one direction are parallel,
// because the source is at infinity relative to the 100 mm dish.
//
// SKY_NUM_DIRECTIONS sets how finely the hemisphere is sampled in
// angle; SKY_RAYS_PER_DIRECTION sets how many parallel rays each
// direction emits across the dish's horizontal extent. SKY_ORIGIN_DIST
// is a visualization parameter — it sets where the rays' starting
// points sit, with no physical meaning beyond ensuring sky rays
// originate above any object that could intercept them. We set it
// large enough (800 mm) that even the steepest sampled direction's
// origin sits above the maximum camera position (260 mm).
const SKY_NUM_DIRECTIONS = 12;
const SKY_RAYS_PER_DIRECTION = 3;
const SKY_ORIGIN_DIST = 800;
const SKY_AIM_Y = 1; // aim line just above the dish floor

// Directional lamps model finite-divergence lab spotlights (gooseneck
// lamps, fibre-optic illuminators, microscope spots). A perfectly
// collimated single ray would be a laser, not a lamp; real lamps emit
// in a small cone. LAMP_CONE_HALF_DEG is a typical few-degree divergence
// for a focused spot.
const LAMP_DISTANCE = 150;
const LAMP_AIM_Y = 8;
const LAMP_CONE_HALF_DEG = 8;
const LAMP_RAYS = 5;

// The camera is a finite-aperture lens, not a point. CAMERA_APERTURE_RADIUS
// is the lens half-width; only rays that pass through this aperture from
// below form the image. We add the lens to the scene as a horizontal
// absorbing surface so that incident rays which strike it terminate
// there (the photon is captured by the sensor), and we count those hits
// as "rays reaching camera."
const CAMERA_APERTURE_RADIUS = 8; // 16 mm aperture

// ─── floor scattering ──────────────────────────────────────────────
// A purely specular dish (Fresnel only at every interface) does NOT
// image samples sitting on the floor — there is no path from a
// non-specular feature to the camera, and the camera sees a black
// field except for direct specular reflections off smooth surfaces.
// Real petri dishes image their contents because the floor and the
// material sitting on it (agar, polystyrene, colonies) SCATTER light
// diffusely. The Lambertian floor below models this: each ray that
// reaches the floor produces a fan of upward-going rays in a cos-
// weighted distribution, carrying total flux = albedo × incoming.
//
// Albedo 0.55 is a reasonable approximation for warm-translucent agar
// over a white polystyrene floor; bacterial colonies typically scatter
// more strongly (≈ 0.7–0.85). Volumetric scatter inside the agar itself
// (subsurface scattering) is a related but weaker effect for clear MRS
// and is NOT modelled here — the floor scatter alone is enough to
// recover the dominant signal path to the camera and to demonstrate
// the darkfield principle.
const FLOOR_ALBEDO = 0.55;
const FLOOR_SCATTER_RAYS = 7;

// ─── visualization gamma ──────────────────────────────────────────
// Beer-Lambert attenuation plus multiple Fresnel transmissions can
// drive ray intensities far below 1% of source before they reach the
// camera, even when they DO reach it. A linear alpha = intensity map
// renders such rays invisibly faint. We apply a gamma transform to
// the rendered alpha (alpha = intensity^GAMMA, GAMMA < 1) so that
// low-intensity paths remain legible. This is a VISUAL transform
// only; the physics carries true linear intensities through the
// scene and into the stats.
const VIS_GAMMA = 0.45;

// ─── canvas geometry ───────────────────────────────────────────────
const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 600;
const PX_PER_MM = 2.0;
const WORLD_X_MIN = -180;
const WORLD_Y_MIN = -22;
const WORLD_X_MAX = WORLD_X_MIN + CANVAS_WIDTH / PX_PER_MM; // +180
const WORLD_Y_MAX = WORLD_Y_MIN + CANVAS_HEIGHT / PX_PER_MM; // +278

const wx = (worldX: number) => (worldX - WORLD_X_MIN) * PX_PER_MM;
const wy = (worldY: number) =>
  CANVAS_HEIGHT - (worldY - WORLD_Y_MIN) * PX_PER_MM;

// ─── surface equations (geometry, not optics) ──────────────────────
function agarSurface(x: number, A: number, lambda: number): number {
  return (
    AGAR_FILL_DEPTH -
    A +
    (A * Math.cosh(x / lambda)) / Math.cosh(DISH_RADIUS / lambda)
  );
}

function liquidRaw(
  x: number,
  yPool: number,
  Ap: number,
  lambdaP: number,
): number {
  return (
    yPool +
    Ap * (Math.cosh(x / lambdaP) / Math.cosh(DISH_RADIUS / lambdaP) - 1)
  );
}

function liquidSurfaceY(
  x: number,
  yPool: number,
  Ap: number,
  lambdaP: number,
  agarA: number,
  agarLambda: number,
): number {
  return Math.max(
    liquidRaw(x, yPool, Ap, lambdaP),
    agarSurface(x, agarA, agarLambda),
  );
}

// ─── theme-aware rendering helpers ─────────────────────────────────
// The site has both a light (Paper) theme and a dark theme. The
// simulator follows whichever is active.
//
// Beer-Lambert attenuation is "intensity = how visible the ray is
// against the background", and that maps in opposite directions in the
// two themes:
//   • Light theme: rays are dark saturated ink lines fading to paper
//     (standard textbook ray-diagram look). Overlapping rays accumulate
//     darkness under normal source-over compositing.
//   • Dark theme: rays are bright luminous lines glowing on dark
//     (photon-trail / instrument-readout look). Overlapping rays
//     accumulate brightness under additive ('lighter') compositing —
//     which is the physically correct superposition of photon flux.
// Per-medium hue (the distinction between air/water/polystyrene/agar
// rays) is preserved across themes via paired palettes.

function parseColor(s: string): [number, number, number] {
  if (s.startsWith('#')) {
    const h = s.slice(1);
    const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  }
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (m) {
    const parts = m[1].split(',').map((x) => parseFloat(x.trim()));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  }
  return [255, 255, 255];
}

function isDarkTheme(paperColor: string): boolean {
  const [r, g, b] = parseColor(paperColor);
  // ITU-R BT.709 luminance
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

/**
 * Returns the RGB triple prefix `"rgba(R, G, B,"` for a ray traversing
 * the given medium, in either light or dark theme. The caller appends
 * the alpha value and closing paren.
 */
function rayColor(m: Medium, dark: boolean): string {
  if (dark) {
    // Bright luminous palette: rays glow on dark canvas, accumulate
    // additively where they overlap.
    switch (m.name) {
      case 'air':
        return 'rgba(255, 230, 130,'; // warm tungsten yellow
      case 'water':
        return 'rgba(140, 210, 255,'; // bright cyan
      case 'polystyrene':
        return 'rgba(220, 225, 255,'; // pale blue-white
      case 'agar':
        return 'rgba(255, 160, 70,'; // bright amber
      case 'absorber':
        return 'rgba(30, 30, 30,';
      default:
        return 'rgba(200, 200, 200,';
    }
  }
  // Dark saturated palette: rays look like ink on paper, accumulate
  // darkness via standard alpha compositing.
  switch (m.name) {
    case 'air':
      return 'rgba(170, 110, 20,'; // dark amber
    case 'water':
      return 'rgba(30, 90, 150,'; // dark teal
    case 'polystyrene':
      return 'rgba(75, 90, 130,'; // dark slate-blue
    case 'agar':
      return 'rgba(125, 60, 15,'; // dark brown
    case 'absorber':
      return 'rgba(30, 30, 30,';
    default:
      return 'rgba(70, 70, 70,';
  }
}

// ─── component ─────────────────────────────────────────────────────
export default function PetriDishOpticsSimulator() {
  // Geometry sliders
  const [agarMeniscus, setAgarMeniscus] = useState(1.0);
  const [agarCapillary, setAgarCapillary] = useState(2.7);
  const [liquidPool, setLiquidPool] = useState(2.5);
  const [liquidMeniscus, setLiquidMeniscus] = useState(0.5);

  // Camera + lamp angles
  const [cameraHeight, setCameraHeight] = useState(180);
  const [lampAngle1, setLampAngle1] = useState(30);
  const [lampAngle2, setLampAngle2] = useState(-30);

  // Toggles
  const [lidPresent, setLidPresent] = useState(true);
  const [liquidPresent, setLiquidPresent] = useState(true);
  const [floorScattering, setFloorScattering] = useState(true);
  const [overheadOn, setOverheadOn] = useState(true);
  const [lamp1On, setLamp1On] = useState(false);
  const [lamp2On, setLamp2On] = useState(false);

  const tokens = useThemeTokens();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── visual surface samples (for filling agar/liquid regions) ────
  const surfaceSamples = useMemo(() => {
    const N = 200;
    const xs: number[] = [];
    const agarYs: number[] = [];
    const liquidYs: number[] = [];
    for (let i = 0; i <= N; i++) {
      const x = -DISH_RADIUS + ((2 * DISH_RADIUS) / N) * i;
      xs.push(x);
      agarYs.push(agarSurface(x, agarMeniscus, agarCapillary));
      liquidYs.push(
        liquidSurfaceY(
          x,
          liquidPool,
          liquidMeniscus,
          agarCapillary,
          agarMeniscus,
          agarCapillary,
        ),
      );
    }
    return { xs, agarYs, liquidYs };
  }, [agarMeniscus, agarCapillary, liquidPool, liquidMeniscus]);

  // ── compose the optical scene from state ────────────────────────
  // The scene is a list of interfaces. Each interface knows which
  // medium is on each side at every point. The trace function walks
  // rays through this scene.
  const scene = useMemo<Scene>(() => {
    const surfaces: Surface[] = [];

    // — Lid (when present): two horizontal interfaces and four vertical
    //   walls. The lid is polystyrene; air sits above it (outside) and
    //   inside the lid cavity (between lid inner top and dish wall top).
    if (lidPresent) {
      const lidInnerR = DISH_RADIUS + DISH_WALL_THICKNESS + LID_CLEARANCE;
      const lidOuterR = lidInnerR + LID_THICKNESS;
      const lidWallBottom = DISH_WALL_HEIGHT - LID_OVERLAP;
      const lidOuterTop = lidWallBottom + LID_HEIGHT;
      const lidInnerTop = lidOuterTop - LID_THICKNESS;

      // Top of lid: air → polystyrene as you cross downward.
      surfaces.push(
        horizontalSegment(
          'lid top',
          lidOuterTop,
          -lidOuterR,
          lidOuterR,
          AIR,
          POLYSTYRENE,
        ),
      );
      // Underside of the lid's flat top: polystyrene above (the lid
      // material), air below (the cavity between lid and dish wall).
      surfaces.push(
        horizontalSegment(
          'lid inner top',
          lidInnerTop,
          -lidInnerR,
          lidInnerR,
          POLYSTYRENE,
          AIR,
        ),
      );
      // Lid outer walls. The canonical normal is +x. For the LEFT outer
      // wall at x=-lidOuterR, the +x side (mediumPlus) is the lid
      // material (polystyrene); the -x side is open air outside.
      surfaces.push(
        verticalSegment(
          'lid wall outer (left)',
          -lidOuterR,
          lidWallBottom,
          lidOuterTop,
          POLYSTYRENE,
          AIR,
        ),
      );
      // Right outer wall at x=+lidOuterR: +x side is open air; -x side
      // is the lid material.
      surfaces.push(
        verticalSegment(
          'lid wall outer (right)',
          lidOuterR,
          lidWallBottom,
          lidOuterTop,
          AIR,
          POLYSTYRENE,
        ),
      );
      // Lid inner walls. Inside the lid cavity is air. The wall material
      // (polystyrene) is on the OUTER side of each inner wall.
      surfaces.push(
        verticalSegment(
          'lid wall inner (left)',
          -lidInnerR,
          lidWallBottom,
          lidInnerTop,
          AIR,
          POLYSTYRENE,
        ),
      );
      surfaces.push(
        verticalSegment(
          'lid wall inner (right)',
          lidInnerR,
          lidWallBottom,
          lidInnerTop,
          POLYSTYRENE,
          AIR,
        ),
      );
    }

    // — Liquid surface (when present and the liquid actually rises
    //   above the agar at this x). Above is AIR, below is WATER.
    const agarFn = (x: number) =>
      agarSurface(x, agarMeniscus, agarCapillary);
    if (liquidPresent) {
      const liqFn = (x: number) =>
        liquidSurfaceY(
          x,
          liquidPool,
          liquidMeniscus,
          agarCapillary,
          agarMeniscus,
          agarCapillary,
        );
      const liquidExists = (x: number) =>
        liquidRaw(x, liquidPool, liquidMeniscus, agarCapillary) >
        agarFn(x) + 1e-3;
      surfaces.push(
        heightField(
          'liquid surface',
          liqFn,
          -DISH_RADIUS,
          DISH_RADIUS,
          () => AIR,
          () => WATER,
          liquidExists,
        ),
      );
    }

    // — Agar surface. The medium above depends on whether liquid is
    //   present at this x; below is always AGAR.
    const aboveAgarAt = liquidPresent
      ? (x: number) =>
          liquidRaw(x, liquidPool, liquidMeniscus, agarCapillary) >
          agarFn(x) + 1e-3
            ? WATER
            : AIR
      : () => AIR;
    surfaces.push(
      heightField(
        'agar surface',
        agarFn,
        -DISH_RADIUS,
        DISH_RADIUS,
        aboveAgarAt,
        () => AGAR,
      ),
    );

    // — Dish floor. With scattering ON, the floor is a Lambertian
    //   reflector that re-emits albedo·intensity as a cos-weighted fan
    //   of upward rays — physically modelling the warm-translucent
    //   agar + white polystyrene base + any sample sitting on it. With
    //   scattering OFF, the floor is a pure absorber (Fresnel split at
    //   the agar/absorber interface, then nearly all flux is absorbed
    //   below); this is the "specular-only" regime where the camera
    //   sees only direct specular paths.
    if (floorScattering) {
      surfaces.push(
        lambertianScatterer(
          'dish floor',
          0,
          -DISH_RADIUS,
          DISH_RADIUS,
          AGAR,
          ABSORBER,
          FLOOR_ALBEDO,
          FLOOR_SCATTER_RAYS,
        ),
      );
    } else {
      surfaces.push(
        horizontalSegment(
          'dish floor',
          0,
          -DISH_RADIUS,
          DISH_RADIUS,
          AGAR,
          ABSORBER,
        ),
      );
    }

    // — Dish side walls (vertical). To the OUTSIDE of each wall is air.
    //   To the INSIDE, the medium depends on y: below the agar surface
    //   it's agar; above it's whatever the cavity holds at that x. We
    //   approximate by tagging the inside as POLYSTYRENE-adjacent (the
    //   absorbing wall itself); these walls are mostly traversed at
    //   grazing angles by rays that have already deflected, so a
    //   single-medium approximation here introduces minimal error.
    //   (A future refinement could split each wall into agar/air
    //   sub-segments.)
    surfaces.push(
      verticalSegment(
        'dish wall inner (left)',
        -DISH_RADIUS,
        0,
        DISH_WALL_HEIGHT,
        AIR, // inside dish (to the +x side of x=-DISH_RADIUS)
        POLYSTYRENE, // wall material (to the -x side)
      ),
    );
    surfaces.push(
      verticalSegment(
        'dish wall inner (right)',
        DISH_RADIUS,
        0,
        DISH_WALL_HEIGHT,
        POLYSTYRENE,
        AIR,
      ),
    );

    // — Camera lens: a thin horizontal disc at y=cameraHeight, only
    //   over the aperture width. Both sides are ABSORBER, so any ray
    //   striking the lens (from either direction) terminates within a
    //   fraction of a millimetre inside the lens body. Rays passing
    //   AROUND the aperture (most rays, since the aperture is small
    //   relative to the canvas width) are unaffected.
    surfaces.push(
      horizontalSegment(
        'camera lens',
        cameraHeight,
        -CAMERA_APERTURE_RADIUS,
        CAMERA_APERTURE_RADIUS,
        ABSORBER,
        ABSORBER,
      ),
    );

    return {
      surfaces,
      bounds: {
        xMin: WORLD_X_MIN,
        xMax: WORLD_X_MAX,
        yMin: WORLD_Y_MIN,
        yMax: WORLD_Y_MAX,
      },
    };
  }, [
    agarMeniscus,
    agarCapillary,
    liquidPool,
    liquidMeniscus,
    lidPresent,
    liquidPresent,
    floorScattering,
    cameraHeight,
  ]);

  // ── build the light sources list ────────────────────────────────
  const sources = useMemo<LightSource[]>(() => {
    const list: LightSource[] = [];

    if (overheadOn) {
      // A single diffuse-sky source represents the entire upper
      // hemisphere of incoming light. The sampling parameters control
      // visual density (number of rays drawn), not the physics.
      list.push(
        diffuseSky({
          aimXMin: -DISH_RADIUS,
          aimXMax: DISH_RADIUS,
          aimY: SKY_AIM_Y,
          originDistance: SKY_ORIGIN_DIST,
          numDirections: SKY_NUM_DIRECTIONS,
          raysPerDirection: SKY_RAYS_PER_DIRECTION,
          ambient: AIR,
        }),
      );
    }

    const buildLamp = (angleDeg: number): LightSource => {
      const tRad = (angleDeg * Math.PI) / 180;
      const lampPos: Vec2 = {
        x: Math.sin(tRad) * LAMP_DISTANCE,
        y: Math.cos(tRad) * LAMP_DISTANCE + LAMP_AIM_Y,
      };
      const aim: Vec2 = { x: 0, y: LAMP_AIM_Y };
      const dir: Vec2 = { x: aim.x - lampPos.x, y: aim.y - lampPos.y };
      return coneSource(
        lampPos,
        dir,
        LAMP_CONE_HALF_DEG,
        LAMP_RAYS,
        AIR,
      );
    };
    if (lamp1On) list.push(buildLamp(lampAngle1));
    if (lamp2On) list.push(buildLamp(lampAngle2));

    return list;
  }, [overheadOn, lamp1On, lamp2On, lampAngle1, lampAngle2]);

  // ── trace ───────────────────────────────────────────────────────
  const tracedSegments = useMemo<RaySegment[]>(() => {
    const initialRays = sources.flatMap((src) => src());
    // minIntensity is set low (5e-4) because scattered rays at the
    // floor start at intensity ≈ (per-primary-flux × albedo / N), which
    // for our parameters is ~ 0.001 — i.e. several orders of magnitude
    // below the source. The visualization gamma transform recovers
    // legibility; the threshold here just keeps the queue from
    // pruning physically-meaningful paths.
    return trace(scene, initialRays, { maxDepth: 7, minIntensity: 5e-4 });
  }, [scene, sources]);

  // ── stats ───────────────────────────────────────────────────────
  // Image-forming rays are those that terminate at the camera lens
  // having approached it from below (going upward). Direct sky-to-lens
  // hits (rays approaching the lens from above) represent rays that
  // would directly expose the sensor without imaging through the dish;
  // we track them separately for visualization but the primary "what
  // does the camera see?" metric is the upward-going hits.
  const stats = useMemo(() => {
    const primaryRays = tracedSegments.filter(
      (s) => s.bornBy === 'source',
    ).length;
    const reachingFloor = tracedSegments.filter(
      (s) => s.surfaceName === 'dish floor' && s.bornBy !== 'reflected',
    ).length;
    const imageFormingHits = tracedSegments.filter(
      (s) =>
        s.surfaceName === 'camera lens' && s.end.y > s.start.y, // going up
    );
    const reachingCamera = imageFormingHits.length;
    const totalEnergyAtFloor = tracedSegments
      .filter((s) => s.surfaceName === 'dish floor')
      .reduce((sum, s) => sum + s.intensityEnd, 0);
    const totalEnergyAtCamera = imageFormingHits.reduce(
      (sum, s) => sum + s.intensityEnd,
      0,
    );
    const totalSourceEnergy = tracedSegments
      .filter((s) => s.bornBy === 'source')
      .reduce((sum, s) => sum + s.intensityStart, 0);
    const fractionToFloor =
      totalSourceEnergy > 0 ? totalEnergyAtFloor / totalSourceEnergy : 0;
    const fractionToCamera =
      totalSourceEnergy > 0 ? totalEnergyAtCamera / totalSourceEnergy : 0;
    return {
      primaryRays,
      reachingFloor,
      reachingCamera,
      fractionToFloor,
      fractionToCamera,
    };
  }, [tracedSegments]);

  // ── render ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_WIDTH * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    canvas.style.width = `${CANVAS_WIDTH}px`;
    canvas.style.height = `${CANVAS_HEIGHT}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Theme detection: derived from the paper token luminance. Toggling
    // the site theme updates tokens via the MutationObserver inside
    // useThemeTokens, which re-runs this effect.
    const dark = isDarkTheme(tokens.paper);

    // Palette varies with theme so that geometry remains visible
    // against the backdrop and ray colours pop against it. The agar /
    // liquid / lid fills are physically the same media — only their
    // rendering hue changes.
    const palette = dark
      ? {
          backdrop: tokens.paper,
          agarFill: 'rgba(160, 95, 30, 0.50)',
          liquidFill: 'rgba(90, 140, 200, 0.28)',
          lidFill: 'rgba(110, 125, 155, 0.30)',
          outline: 'rgba(180, 190, 210, 0.55)',
          outlineStrong: 'rgba(210, 220, 235, 0.75)',
          ink: 'rgba(200, 210, 230, 0.85)',
          lampGlow: 'rgba(255, 220, 110, 0.95)',
          floorHit: 'rgba(255, 165, 70,',
          cameraHit: 'rgba(160, 210, 255,',
          blendMode: 'lighter' as GlobalCompositeOperation,
          minRayAlpha: 0.0, // dark BG: fading to 0 is correct
        }
      : {
          backdrop: tokens.paper,
          agarFill: 'rgba(195, 135, 50, 0.55)',
          liquidFill: 'rgba(210, 195, 110, 0.30)',
          lidFill: 'rgba(160, 170, 195, 0.32)',
          outline: tokens.inkSoft,
          outlineStrong: tokens.ink,
          ink: tokens.inkSoft,
          lampGlow: 'rgba(220, 160, 30, 0.95)',
          floorHit: 'rgba(170, 90, 20,',
          cameraHit: 'rgba(40, 90, 160,',
          blendMode: 'source-over' as GlobalCompositeOperation,
          minRayAlpha: 0.0, // light BG: fading to paper is correct
        };

    ctx.fillStyle = palette.backdrop;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // ── dish exterior ───────────────────────────────────────────
    ctx.strokeStyle = palette.outlineStrong;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wx(-DISH_RADIUS - DISH_WALL_THICKNESS), wy(DISH_WALL_HEIGHT));
    ctx.lineTo(wx(-DISH_RADIUS - DISH_WALL_THICKNESS), wy(-DISH_WALL_THICKNESS));
    ctx.lineTo(wx(DISH_RADIUS + DISH_WALL_THICKNESS), wy(-DISH_WALL_THICKNESS));
    ctx.lineTo(wx(DISH_RADIUS + DISH_WALL_THICKNESS), wy(DISH_WALL_HEIGHT));
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(wx(-DISH_RADIUS - DISH_WALL_THICKNESS), wy(DISH_WALL_HEIGHT));
    ctx.lineTo(wx(-DISH_RADIUS), wy(DISH_WALL_HEIGHT));
    ctx.moveTo(wx(DISH_RADIUS), wy(DISH_WALL_HEIGHT));
    ctx.lineTo(wx(DISH_RADIUS + DISH_WALL_THICKNESS), wy(DISH_WALL_HEIGHT));
    ctx.stroke();

    ctx.strokeStyle = palette.outline;
    ctx.beginPath();
    ctx.moveTo(wx(-DISH_RADIUS), wy(DISH_WALL_HEIGHT));
    ctx.lineTo(wx(-DISH_RADIUS), wy(0));
    ctx.lineTo(wx(DISH_RADIUS), wy(0));
    ctx.lineTo(wx(DISH_RADIUS), wy(DISH_WALL_HEIGHT));
    ctx.stroke();

    // ── agar fill ───────────────────────────────────────────────
    const { xs, agarYs, liquidYs } = surfaceSamples;
    ctx.fillStyle = palette.agarFill;
    ctx.beginPath();
    ctx.moveTo(wx(-DISH_RADIUS), wy(0));
    for (let i = 0; i < xs.length; i++) ctx.lineTo(wx(xs[i]), wy(agarYs[i]));
    ctx.lineTo(wx(DISH_RADIUS), wy(0));
    ctx.closePath();
    ctx.fill();

    // ── liquid fill ─────────────────────────────────────────────
    if (liquidPresent) {
      ctx.fillStyle = palette.liquidFill;
      ctx.beginPath();
      ctx.moveTo(wx(xs[0]), wy(agarYs[0]));
      for (let i = 0; i < xs.length; i++)
        ctx.lineTo(wx(xs[i]), wy(liquidYs[i]));
      for (let i = xs.length - 1; i >= 0; i--)
        ctx.lineTo(wx(xs[i]), wy(agarYs[i]));
      ctx.closePath();
      ctx.fill();
    }

    // ── lid ──────────────────────────────────────────────────────
    if (lidPresent) {
      const lidInnerR = DISH_RADIUS + DISH_WALL_THICKNESS + LID_CLEARANCE;
      const lidOuterR = lidInnerR + LID_THICKNESS;
      const lidWallBottom = DISH_WALL_HEIGHT - LID_OVERLAP;
      const lidOuterTop = lidWallBottom + LID_HEIGHT;
      const lidInnerTop = lidOuterTop - LID_THICKNESS;

      ctx.fillStyle = palette.lidFill;
      ctx.beginPath();
      ctx.moveTo(wx(-lidOuterR), wy(lidWallBottom));
      ctx.lineTo(wx(-lidOuterR), wy(lidOuterTop));
      ctx.lineTo(wx(lidOuterR), wy(lidOuterTop));
      ctx.lineTo(wx(lidOuterR), wy(lidWallBottom));
      ctx.lineTo(wx(lidInnerR), wy(lidWallBottom));
      ctx.lineTo(wx(lidInnerR), wy(lidInnerTop));
      ctx.lineTo(wx(-lidInnerR), wy(lidInnerTop));
      ctx.lineTo(wx(-lidInnerR), wy(lidWallBottom));
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = palette.outlineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wx(-lidOuterR), wy(lidWallBottom));
      ctx.lineTo(wx(-lidOuterR), wy(lidOuterTop));
      ctx.lineTo(wx(lidOuterR), wy(lidOuterTop));
      ctx.lineTo(wx(lidOuterR), wy(lidWallBottom));
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(wx(-lidOuterR), wy(lidWallBottom));
      ctx.lineTo(wx(-lidInnerR), wy(lidWallBottom));
      ctx.moveTo(wx(lidInnerR), wy(lidWallBottom));
      ctx.lineTo(wx(lidOuterR), wy(lidWallBottom));
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(wx(-lidInnerR), wy(lidWallBottom));
      ctx.lineTo(wx(-lidInnerR), wy(lidInnerTop));
      ctx.lineTo(wx(lidInnerR), wy(lidInnerTop));
      ctx.lineTo(wx(lidInnerR), wy(lidWallBottom));
      ctx.stroke();
    }

    // ── camera (finite-aperture lens) ─────────────────────────────
    // Drawn as a horizontal lens segment of CAMERA_APERTURE_RADIUS
    // half-width, plus a small housing rectangle above. The lens
    // ITSELF is the active part — it absorbs rays that strike it from
    // either direction. The housing is purely cosmetic, conveying that
    // the lens is part of a camera body sitting above the dish.
    {
      const camY = cameraHeight;
      // Housing (cosmetic body)
      ctx.fillStyle = palette.lidFill;
      ctx.strokeStyle = palette.outlineStrong;
      ctx.lineWidth = 1;
      const housingX0 = -CAMERA_APERTURE_RADIUS - 1.5;
      const housingX1 = CAMERA_APERTURE_RADIUS + 1.5;
      const housingTop = camY + 10;
      const housingBot = camY;
      const hx = wx(housingX0);
      const hy = wy(housingTop);
      const hw = wx(housingX1) - wx(housingX0);
      const hh = wy(housingBot) - wy(housingTop);
      ctx.fillRect(hx, hy, hw, hh);
      ctx.strokeRect(hx, hy, hw, hh);
      // Lens (the active absorbing surface)
      ctx.strokeStyle = tokens.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(wx(-CAMERA_APERTURE_RADIUS), wy(camY));
      ctx.lineTo(wx(CAMERA_APERTURE_RADIUS), wy(camY));
      ctx.stroke();
      // Label
      ctx.fillStyle = palette.ink;
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(
        `camera (\u2300 ${CAMERA_APERTURE_RADIUS * 2} mm)`,
        wx(CAMERA_APERTURE_RADIUS + 4),
        wy(camY) + 4,
      );
    }

    // ── lamp markers ─────────────────────────────────────────────
    // The diffuse-sky source has no single position; its rays
    // originate from scattered points across the upper canvas and
    // their distribution itself depicts the source. Discrete lamps
    // do have a position; mark them.
    if (lamp1On) {
      const lx = Math.sin((lampAngle1 * Math.PI) / 180) * LAMP_DISTANCE;
      const ly =
        Math.cos((lampAngle1 * Math.PI) / 180) * LAMP_DISTANCE + LAMP_AIM_Y;
      ctx.fillStyle = palette.lampGlow;
      ctx.beginPath();
      ctx.arc(wx(lx), wy(ly), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (lamp2On) {
      const lx = Math.sin((lampAngle2 * Math.PI) / 180) * LAMP_DISTANCE;
      const ly =
        Math.cos((lampAngle2 * Math.PI) / 180) * LAMP_DISTANCE + LAMP_AIM_Y;
      ctx.fillStyle = palette.lampGlow;
      ctx.beginPath();
      ctx.arc(wx(lx), wy(ly), 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── traced ray segments ─────────────────────────────────────
    // Per-segment linear gradients carry Beer-Lambert attenuation
    // visually: alpha varies along the segment from intensityStart to
    // intensityEnd, after a VIS_GAMMA-shaped transform that boosts
    // low-intensity paths into a legible range. Blending mode is chosen
    // per theme so that overlap accumulates in the perceptually correct
    // direction (additive on dark, source-over on light). Reflected
    // segments are dashed; scattered segments are solid + finer.
    ctx.globalCompositeOperation = palette.blendMode;
    const visAlpha = (i: number) =>
      Math.pow(Math.max(0, Math.min(1, i)), VIS_GAMMA);
    for (const seg of tracedSegments) {
      const colorPrefix = rayColor(seg.medium, dark);
      const aStart = visAlpha(seg.intensityStart);
      const aEnd = visAlpha(seg.intensityEnd);
      const grad = ctx.createLinearGradient(
        wx(seg.start.x),
        wy(seg.start.y),
        wx(seg.end.x),
        wy(seg.end.y),
      );
      grad.addColorStop(0, `${colorPrefix} ${aStart})`);
      grad.addColorStop(1, `${colorPrefix} ${aEnd})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth =
        seg.bornBy === 'reflected'
          ? 1.0
          : seg.bornBy === 'scattered'
            ? 0.9
            : 1.4;
      ctx.setLineDash(seg.bornBy === 'reflected' ? [4, 3] : []);
      ctx.beginPath();
      ctx.moveTo(wx(seg.start.x), wy(seg.start.y));
      ctx.lineTo(wx(seg.end.x), wy(seg.end.y));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Floor-hit markers — drawn only when scattering is OFF (when
    // scattering is on, each floor hit is the START of new scattered
    // segments, which themselves convey where the floor was touched).
    if (!floorScattering) {
      for (const seg of tracedSegments) {
        if (seg.surfaceName === 'dish floor' && seg.bornBy !== 'reflected') {
          ctx.fillStyle = `${palette.floorHit} ${Math.max(0.35, visAlpha(seg.intensityEnd))})`;
          ctx.beginPath();
          ctx.arc(wx(seg.end.x), wy(seg.end.y), 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Camera-arrival markers (image-forming rays — upward hits).
    for (const seg of tracedSegments) {
      if (seg.surfaceName === 'camera lens' && seg.end.y > seg.start.y) {
        ctx.fillStyle = `${palette.cameraHit} ${Math.max(0.5, visAlpha(seg.intensityEnd))})`;
        ctx.beginPath();
        ctx.arc(wx(seg.end.x), wy(seg.end.y), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Restore default blending so the scale bar draws normally.
    ctx.globalCompositeOperation = 'source-over';

    // ── scale bar ───────────────────────────────────────────────
    {
      const barY = -13;
      const x0 = wx(0);
      const x1 = wx(DISH_RADIUS);
      const yPx = wy(barY);
      ctx.strokeStyle = palette.ink;
      ctx.fillStyle = palette.ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, yPx);
      ctx.lineTo(x1, yPx);
      ctx.moveTo(x0, yPx);
      ctx.lineTo(x0, yPx + 4);
      ctx.moveTo(x1, yPx);
      ctx.lineTo(x1, yPx + 4);
      ctx.stroke();
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('50 mm', (x0 + x1) / 2, yPx + 14);
    }
  }, [
    tokens,
    surfaceSamples,
    tracedSegments,
    cameraHeight,
    lidPresent,
    liquidPresent,
    floorScattering,
    overheadOn,
    lamp1On,
    lamp2On,
    lampAngle1,
    lampAngle2,
  ]);

  return (
    <VizFigure
      title="Petri Dish Optics"
      description={
        <>
          Cross-section of a petri dish with adjustable agar meniscus, optional
          liquid layer, and optional lid. Overhead lighting is modelled as a
          uniform-radiance upper hemisphere (a distant, extended diffuse
          emitter — the physical situation of a ceiling fixture or overcast
          sky illuminating a benchtop); each direction is sampled cos-weighted
          and rays from a given direction are parallel. Directional lamps emit
          finite-divergence cones (a few-degree spread, typical of focused
          lab spots). The camera is a finite-aperture lens (16 mm diameter)
          that absorbs any ray crossing it from either direction; image-forming
          rays approach from below. Rays refract (Snell), Fresnel-split into
          reflected (dashed) and transmitted (solid) branches at every
          interface, attenuate via Beer-Lambert inside absorbing media, and
          undergo total internal reflection at grazing angles past the
          critical angle. The dish floor is a Lambertian scatterer (toggle
          off to see the purely-specular regime, in which off-axis lighting
          leaves the camera with no signal — the darkfield setup needs
          something to scatter light back to the lens). Refractive indices:
          air 1.00, polystyrene 1.59, water 1.33, agar 1.34.
        </>
      }
      footer={
        <Legend
          items={[
            { color: 'rgba(170, 110, 35, 0.85)', label: 'Agar (MRS)' },
            { color: 'rgba(110, 160, 200, 0.75)', label: 'Liquid layer' },
            { color: 'rgba(130, 145, 175, 0.75)', label: 'Lid (polystyrene)' },
            { color: 'rgba(230, 180, 60, 0.95)', label: 'Lamp' },
            { color: tokens.accent, label: 'Camera lens (\u2300 16 mm)' },
          ]}
        />
      }
    >
      <div
        className="mb-6 rounded-lg p-3 text-xs"
        style={{
          background: 'var(--accent-soft)',
          border: '1px solid var(--rule)',
          color: 'var(--ink-soft)',
        }}
      >
        <p className="font-semibold mb-2">Parameter guide</p>
        <ul className="space-y-1 ml-2">
          <li>
            <strong>Agar meniscus</strong>: height the agar climbs at the dish
            wall
          </li>
          <li>
            <strong>Liquid pool</strong>: base level of an aqueous layer above
            the agar
          </li>
          <li>
            <strong>Camera height</strong>: distance above the dish bottom; the
            camera looks straight down
          </li>
          <li>
            <strong>Lamp angle</strong>: angular position of each directional
            lamp, measured from vertical (positive = right of the dish)
          </li>
        </ul>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Slider
          label="Agar meniscus (mm)"
          value={agarMeniscus}
          min={0}
          max={2}
          step={0.05}
          display={agarMeniscus.toFixed(2)}
          hint="Rise of the agar surface at the dish wall"
          scale={['0', '2']}
          onChange={setAgarMeniscus}
        />
        <Slider
          label="Liquid pool height (mm)"
          value={liquidPool}
          min={2.3}
          max={4}
          step={0.05}
          display={liquidPool.toFixed(2)}
          hint="Base level of the liquid pool above the agar floor"
          scale={['2.3', '4.0']}
          onChange={setLiquidPool}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Slider
          label="Camera height (mm)"
          value={cameraHeight}
          min={100}
          max={260}
          step={1}
          display={cameraHeight.toString()}
          scale={['100', '260']}
          onChange={setCameraHeight}
        />
        <Slider
          label="Lamp 1 angle (°)"
          value={lampAngle1}
          min={-90}
          max={90}
          step={1}
          display={`${lampAngle1}°`}
          hint="Off-vertical angle (right of camera = positive); ±90° is fully grazing"
          scale={['-90°', '+90°']}
          onChange={setLampAngle1}
        />
        <Slider
          label="Lamp 2 angle (°)"
          value={lampAngle2}
          min={-90}
          max={90}
          step={1}
          display={`${lampAngle2}°`}
          scale={['-90°', '+90°']}
          onChange={setLampAngle2}
        />
      </div>

      <div className="viz-panel mb-4">
        <div className="flex flex-wrap gap-1">
          <label className="viz-check">
            <input
              type="checkbox"
              checked={lidPresent}
              onChange={(e) => setLidPresent(e.target.checked)}
            />
            <span className="viz-check-sym">Lid</span>
          </label>
          <label className="viz-check">
            <input
              type="checkbox"
              checked={liquidPresent}
              onChange={(e) => setLiquidPresent(e.target.checked)}
            />
            <span className="viz-check-sym">Liquid layer</span>
          </label>
          <label className="viz-check">
            <input
              type="checkbox"
              checked={floorScattering}
              onChange={(e) => setFloorScattering(e.target.checked)}
            />
            <span className="viz-check-sym">Floor scatter</span>
          </label>
          <label className="viz-check">
            <input
              type="checkbox"
              checked={overheadOn}
              onChange={(e) => setOverheadOn(e.target.checked)}
            />
            <span className="viz-check-sym">Overhead lighting</span>
          </label>
          <label className="viz-check">
            <input
              type="checkbox"
              checked={lamp1On}
              onChange={(e) => setLamp1On(e.target.checked)}
            />
            <span className="viz-check-sym">Lamp 1</span>
          </label>
          <label className="viz-check">
            <input
              type="checkbox"
              checked={lamp2On}
              onChange={(e) => setLamp2On(e.target.checked)}
            />
            <span className="viz-check-sym">Lamp 2</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
        <StatCard label="Primary rays" value={stats.primaryRays.toString()} />
        <StatCard
          label="Reaching floor"
          value={stats.reachingFloor.toString()}
        />
        <StatCard
          label="Reaching camera"
          value={stats.reachingCamera.toString()}
          tone="accent"
        />
        <StatCard
          label="Fraction to floor"
          value={
            stats.primaryRays > 0
              ? `${(100 * stats.fractionToFloor).toFixed(1)}%`
              : '—'
          }
        />
        <StatCard
          label="Fraction to camera"
          value={
            stats.primaryRays > 0
              ? `${(100 * stats.fractionToCamera).toFixed(2)}%`
              : '—'
          }
        />
      </div>

      <VizSurface>
        <canvas ref={canvasRef} />
      </VizSurface>
    </VizFigure>
  );
}
