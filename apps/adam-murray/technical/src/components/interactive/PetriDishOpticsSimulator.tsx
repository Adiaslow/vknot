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
  collimatedSource,
  diffuseSky,
  horizontalSegment,
  verticalSegment,
  heightField,
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
// is a visualization parameter — it sets where the rays' starting dots
// appear on the canvas — and has no physical meaning.
const SKY_NUM_DIRECTIONS = 12;
const SKY_RAYS_PER_DIRECTION = 3;
const SKY_ORIGIN_DIST = 130;
const SKY_AIM_Y = 1; // aim line just above the dish floor

// Directional lamps are physically collimated (fibre-optic or focused
// spot). One ray per lamp, aimed at the dish-rim point (0, LAMP_AIM_Y).
const LAMP_DISTANCE = 150;
const LAMP_AIM_Y = 8;

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

// ─── colours by medium for ray rendering ───────────────────────────
// Hard-coded RGB; alpha is applied per-segment from intensity.
function mediumColor(m: Medium): string {
  switch (m.name) {
    case 'air':
      return 'rgba(250, 220, 100,'; // warm yellow
    case 'water':
      return 'rgba(140, 200, 230,'; // pale blue
    case 'polystyrene':
      return 'rgba(190, 200, 220,'; // pale cool gray
    case 'agar':
      return 'rgba(210, 130, 50,'; // warm amber
    case 'absorber':
      return 'rgba(40, 40, 40,'; // near-black (rays inside the floor)
    default:
      return 'rgba(180, 180, 180,';
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

    // — Dish floor: agar above, ABSORBER below (rays terminate inside
    //   the floor's high-α medium within a fraction of a millimetre).
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
      return collimatedSource(lampPos, dir, AIR);
    };
    if (lamp1On) list.push(buildLamp(lampAngle1));
    if (lamp2On) list.push(buildLamp(lampAngle2));

    return list;
  }, [overheadOn, lamp1On, lamp2On, lampAngle1, lampAngle2]);

  // ── trace ───────────────────────────────────────────────────────
  const tracedSegments = useMemo<RaySegment[]>(() => {
    const initialRays = sources.flatMap((src) => src());
    return trace(scene, initialRays, { maxDepth: 6, minIntensity: 0.003 });
  }, [scene, sources]);

  // ── stats ───────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const primaryRays = tracedSegments.filter(
      (s) => s.bornBy === 'source',
    ).length;
    const reachingFloor = tracedSegments.filter(
      (s) => s.surfaceName === 'dish floor' && s.bornBy !== 'reflected',
    ).length;
    const maxDepthSeen = tracedSegments.reduce(
      (m, s) => Math.max(m, s.depth),
      0,
    );
    const totalEnergyAtFloor = tracedSegments
      .filter((s) => s.surfaceName === 'dish floor')
      .reduce((sum, s) => sum + s.intensityEnd, 0);
    const totalSourceEnergy = tracedSegments
      .filter((s) => s.bornBy === 'source')
      .reduce((sum, s) => sum + s.intensityStart, 0);
    const fractionToFloor =
      totalSourceEnergy > 0 ? totalEnergyAtFloor / totalSourceEnergy : 0;
    return { primaryRays, reachingFloor, maxDepthSeen, fractionToFloor };
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

    ctx.fillStyle = tokens.paper;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // ── dish exterior ───────────────────────────────────────────
    ctx.strokeStyle = tokens.inkSoft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wx(-DISH_RADIUS - DISH_WALL_THICKNESS), wy(DISH_WALL_HEIGHT));
    ctx.lineTo(wx(-DISH_RADIUS - DISH_WALL_THICKNESS), wy(-DISH_WALL_THICKNESS));
    ctx.lineTo(wx(DISH_RADIUS + DISH_WALL_THICKNESS), wy(-DISH_WALL_THICKNESS));
    ctx.lineTo(wx(DISH_RADIUS + DISH_WALL_THICKNESS), wy(DISH_WALL_HEIGHT));
    ctx.stroke();

    // dish wall top rims
    ctx.beginPath();
    ctx.moveTo(wx(-DISH_RADIUS - DISH_WALL_THICKNESS), wy(DISH_WALL_HEIGHT));
    ctx.lineTo(wx(-DISH_RADIUS), wy(DISH_WALL_HEIGHT));
    ctx.moveTo(wx(DISH_RADIUS), wy(DISH_WALL_HEIGHT));
    ctx.lineTo(wx(DISH_RADIUS + DISH_WALL_THICKNESS), wy(DISH_WALL_HEIGHT));
    ctx.stroke();

    // dish interior
    ctx.beginPath();
    ctx.moveTo(wx(-DISH_RADIUS), wy(DISH_WALL_HEIGHT));
    ctx.lineTo(wx(-DISH_RADIUS), wy(0));
    ctx.lineTo(wx(DISH_RADIUS), wy(0));
    ctx.lineTo(wx(DISH_RADIUS), wy(DISH_WALL_HEIGHT));
    ctx.stroke();

    // ── agar fill ───────────────────────────────────────────────
    const { xs, agarYs, liquidYs } = surfaceSamples;
    ctx.fillStyle = 'rgba(195, 135, 50, 0.55)';
    ctx.beginPath();
    ctx.moveTo(wx(-DISH_RADIUS), wy(0));
    for (let i = 0; i < xs.length; i++) ctx.lineTo(wx(xs[i]), wy(agarYs[i]));
    ctx.lineTo(wx(DISH_RADIUS), wy(0));
    ctx.closePath();
    ctx.fill();

    // ── liquid fill ─────────────────────────────────────────────
    if (liquidPresent) {
      ctx.fillStyle = 'rgba(210, 195, 110, 0.30)';
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

      ctx.fillStyle = 'rgba(160, 170, 195, 0.32)';
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

      ctx.strokeStyle = tokens.inkSoft;
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

    // ── camera marker ───────────────────────────────────────────
    ctx.fillStyle = tokens.accent;
    ctx.beginPath();
    const camPx = wx(0);
    const camPy = wy(cameraHeight);
    ctx.moveTo(camPx, camPy);
    ctx.lineTo(camPx - 6, camPy + 10);
    ctx.lineTo(camPx + 6, camPy + 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = tokens.inkSoft;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('camera', camPx + 10, camPy + 4);

    // ── light source markers ────────────────────────────────────
    // The diffuse-sky source has no single position; the rays
    // themselves originate at scattered points around the upper
    // canvas (one per (direction, lateral-offset) pair). The trace
    // segments visualize that distribution; no separate markers
    // needed for the overhead lighting.
    if (lamp1On) {
      const lx = Math.sin((lampAngle1 * Math.PI) / 180) * LAMP_DISTANCE;
      const ly =
        Math.cos((lampAngle1 * Math.PI) / 180) * LAMP_DISTANCE + LAMP_AIM_Y;
      ctx.fillStyle = 'rgba(250, 220, 120, 0.95)';
      ctx.beginPath();
      ctx.arc(wx(lx), wy(ly), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (lamp2On) {
      const lx = Math.sin((lampAngle2 * Math.PI) / 180) * LAMP_DISTANCE;
      const ly =
        Math.cos((lampAngle2 * Math.PI) / 180) * LAMP_DISTANCE + LAMP_AIM_Y;
      ctx.fillStyle = 'rgba(250, 220, 120, 0.95)';
      ctx.beginPath();
      ctx.arc(wx(lx), wy(ly), 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── traced ray segments ─────────────────────────────────────
    // Reflected segments use a dashed stroke. Color comes from the
    // medium the segment is traversing. Alpha tracks intensity along
    // the segment via a per-segment linear gradient.
    for (const seg of tracedSegments) {
      const colorPrefix = mediumColor(seg.medium);
      const aStart = Math.max(0.08, Math.min(1, seg.intensityStart));
      const aEnd = Math.max(0.08, Math.min(1, seg.intensityEnd));
      const grad = ctx.createLinearGradient(
        wx(seg.start.x),
        wy(seg.start.y),
        wx(seg.end.x),
        wy(seg.end.y),
      );
      grad.addColorStop(0, `${colorPrefix} ${aStart})`);
      grad.addColorStop(1, `${colorPrefix} ${aEnd})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = seg.bornBy === 'reflected' ? 1.2 : 1.5;
      ctx.setLineDash(seg.bornBy === 'reflected' ? [4, 3] : []);
      ctx.beginPath();
      ctx.moveTo(wx(seg.start.x), wy(seg.start.y));
      ctx.lineTo(wx(seg.end.x), wy(seg.end.y));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Floor-hit markers
    ctx.fillStyle = 'rgba(210, 130, 50, 0.95)';
    for (const seg of tracedSegments) {
      if (seg.surfaceName === 'dish floor' && seg.bornBy !== 'reflected') {
        ctx.beginPath();
        ctx.arc(wx(seg.end.x), wy(seg.end.y), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── scale bar ───────────────────────────────────────────────
    {
      const barY = -13;
      const x0 = wx(0);
      const x1 = wx(DISH_RADIUS);
      const yPx = wy(barY);
      ctx.strokeStyle = tokens.inkSoft;
      ctx.fillStyle = tokens.inkSoft;
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
          and rays from a given direction are parallel. Directional lamps are
          collimated single rays. Rays refract (Snell), Fresnel-split into
          reflected (dashed) and transmitted (solid) branches at every
          interface, attenuate via Beer-Lambert inside absorbing media, and
          undergo total internal reflection at grazing angles past the
          critical angle. Floor hits are absorbed. Refractive indices: air
          1.00, polystyrene 1.59, water 1.33, agar 1.34.
        </>
      }
      footer={
        <Legend
          items={[
            { color: 'rgba(195, 135, 50, 0.7)', label: 'Agar (MRS)' },
            { color: 'rgba(210, 195, 110, 0.7)', label: 'Liquid layer' },
            { color: 'rgba(160, 170, 195, 0.6)', label: 'Lid (polystyrene)' },
            { color: 'rgba(250, 220, 120, 0.95)', label: 'Light source' },
            { color: tokens.accent, label: 'Camera' },
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
          min={-75}
          max={75}
          step={1}
          display={`${lampAngle1}°`}
          hint="Off-vertical angle (right of camera = positive)"
          scale={['-75°', '+75°']}
          onChange={setLampAngle1}
        />
        <Slider
          label="Lamp 2 angle (°)"
          value={lampAngle2}
          min={-75}
          max={75}
          step={1}
          display={`${lampAngle2}°`}
          scale={['-75°', '+75°']}
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <StatCard label="Primary rays" value={stats.primaryRays.toString()} />
        <StatCard
          label="Reaching floor"
          value={stats.reachingFloor.toString()}
          tone="accent"
        />
        <StatCard label="Max bounce depth" value={stats.maxDepthSeen.toString()} />
        <StatCard
          label="Fraction to floor"
          value={
            stats.primaryRays > 0
              ? `${(100 * stats.fractionToFloor).toFixed(1)}%`
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
