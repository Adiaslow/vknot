import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useThemeTokens,
  VizFigure,
  VizSurface,
  Slider,
  StatCard,
  Legend,
} from './_viz';

// ─── physical constants (millimetres) ──────────────────────────────
const DISH_RADIUS = 50; // 100 mm dish diameter, from Fisher MRS plates
const DISH_WALL_HEIGHT = 15; // interior wall height
const DISH_WALL_THICKNESS = 1; // polystyrene wall (visual)
const AGAR_FILL_DEPTH = 2.3; // 18 mL / (π · 50²) mm³
const LID_THICKNESS = 1; // lid wall thickness
const LID_CLEARANCE = 0.5; // horizontal gap between dish outer wall and lid inner wall
const LID_OVERLAP = 5; // how far the lid walls extend below the dish wall top
const LID_HEIGHT = 7; // total vertical extent of the lid (wall + top)

// ─── optical constants ─────────────────────────────────────────────
// Refractive indices, dimensionless. MRS agar approximates water with
// ~20 g/L dissolved solids — ≈1.34 is a reasonable nominal value.
const N_AIR = 1.0;
const N_AGAR = 1.34;

// Beer-Lambert linear absorption for the agar (mm⁻¹). Real MRS agar is
// ≈0.05 mm⁻¹ in the visible band; we bump it to make the attenuation
// through 2-3 mm of agar visible to the eye.
const ABSORPTION_AGAR = 0.15;

// ─── light source positions ────────────────────────────────────────
const LIGHT_Y = 250; // world-mm; overhead row well above the dish
const OVERHEAD_XS = [-150, -75, 0, 75, 150] as const;
const LAMP_DISTANCE = 150; // mm; directional lamps on a circle of this radius
const LAMP_AIM_Y = 8; // world-y the directional lamps point at, near dish rim

// ─── canvas geometry ───────────────────────────────────────────────
const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 600;
const PX_PER_MM = 2.0;
const WORLD_X_MIN = -180;
const WORLD_Y_MIN = -22;

// World-to-canvas transforms. World x is horizontal, world y is vertical
// (positive y is upward in physical space). Canvas y is inverted so that
// world-up corresponds to canvas-up.
const wx = (worldX: number) => (worldX - WORLD_X_MIN) * PX_PER_MM;
const wy = (worldY: number) => CANVAS_HEIGHT - (worldY - WORLD_Y_MIN) * PX_PER_MM;

// ─── surface equations ─────────────────────────────────────────────
// Agar bowl: cosh meniscus, depressed in the middle and climbing to
// AGAR_FILL_DEPTH at the walls.
function agarSurface(x: number, A: number, lambda: number): number {
  return (
    AGAR_FILL_DEPTH -
    A +
    (A * Math.cosh(x / lambda)) / Math.cosh(DISH_RADIUS / lambda)
  );
}

// Liquid layer (raw): the liquid's own meniscus curve, ignoring whether
// the agar is above or below it at this x.
function liquidRaw(x: number, yPool: number, Ap: number, lambdaP: number): number {
  return (
    yPool + Ap * (Math.cosh(x / lambdaP) / Math.cosh(DISH_RADIUS / lambdaP) - 1)
  );
}

// Active liquid surface: the higher of the liquid's own curve and the agar
// surface. The liquid cannot sit below the agar that contains it.
function liquidSurface(
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

// ─── ray tracing primitives ────────────────────────────────────────
// 2D vectors in world coordinates (mm). Right-handed: +x right, +y up.
type Vec2 = { x: number; y: number };

interface RaySegment {
  start: Vec2;
  end: Vec2;
  intensity: number; // 0..1, average over the segment
  medium: 'air' | 'agar';
}

// Snell refraction at a surface with outward unit normal `n`, going from
// medium `n1` into medium `n2`. Returns the refracted unit direction, or
// null on total internal reflection. `d` should be a unit vector pointing
// INTO the surface (i.e. cos(θᵢ) = -d·n ≥ 0 for a normal hit).
function refract(d: Vec2, n: Vec2, n1: number, n2: number): Vec2 | null {
  const cosI = -(d.x * n.x + d.y * n.y);
  const eta = n1 / n2;
  const sin2T = eta * eta * (1 - cosI * cosI);
  if (sin2T > 1) return null;
  const cosT = Math.sqrt(1 - sin2T);
  return {
    x: eta * d.x + (eta * cosI - cosT) * n.x,
    y: eta * d.y + (eta * cosI - cosT) * n.y,
  };
}

// Find the first downward intersection of a ray with a 1D height field
// y = surfaceY(x) over [xMin, xMax]. Walks the ray in N steps, locates
// the first sign change of (surfaceY(x) - rayY(x)), then bisects to
// refine. Returns the intersection point and the outward (upward) unit
// normal, or null if the ray misses the surface within tMax.
function intersectSurface(
  origin: Vec2,
  dir: Vec2,
  surfaceY: (x: number) => number,
  xMin: number,
  xMax: number,
  tMax: number,
): { point: Vec2; t: number; normal: Vec2 } | null {
  const N = 100;
  const sample = (t: number) => {
    const x = origin.x + t * dir.x;
    if (x < xMin || x > xMax) return null;
    return surfaceY(x) - (origin.y + t * dir.y);
  };

  let prevT = 1e-4;
  const prevF = sample(prevT);
  if (prevF === null || prevF >= 0) return null;
  for (let i = 1; i <= N; i++) {
    const t = (tMax * i) / N;
    const f = sample(t);
    if (f === null) return null;
    if (f >= 0) {
      let lo = prevT;
      let hi = t;
      for (let j = 0; j < 24; j++) {
        const mid = 0.5 * (lo + hi);
        const fm = sample(mid);
        if (fm === null) return null;
        if (fm < 0) lo = mid;
        else hi = mid;
      }
      const tHit = 0.5 * (lo + hi);
      const x = origin.x + tHit * dir.x;
      const y = origin.y + tHit * dir.y;
      const h = 0.01;
      const dydx = (surfaceY(x + h) - surfaceY(x - h)) / (2 * h);
      const inv = 1 / Math.sqrt(dydx * dydx + 1);
      const normal = { x: -dydx * inv, y: inv };
      return { point: { x, y }, t: tHit, normal };
    }
    prevT = t;
  }
  return null;
}

// Trace a single ray from origin in direction `dir` through the scene.
// v0: air → agar surface (Snell refraction) → floor with Beer-Lambert
// attenuation through the agar. Lid and liquid layer are ignored at
// this stage and will get interface handling in v1.
function traceRay(
  origin: Vec2,
  dir: Vec2,
  agarA: number,
  agarLambda: number,
): RaySegment[] {
  const T_MAX = 350;
  const segs: RaySegment[] = [];

  const hit = intersectSurface(
    origin,
    dir,
    (x) => agarSurface(x, agarA, agarLambda),
    -DISH_RADIUS,
    DISH_RADIUS,
    T_MAX,
  );

  if (!hit) {
    // Ray misses the dish — extend in air to the world boundary.
    segs.push({
      start: origin,
      end: { x: origin.x + T_MAX * dir.x, y: origin.y + T_MAX * dir.y },
      intensity: 1,
      medium: 'air',
    });
    return segs;
  }

  segs.push({ start: origin, end: hit.point, intensity: 1, medium: 'air' });

  const refracted = refract(dir, hit.normal, N_AIR, N_AGAR);
  if (!refracted || refracted.y >= 0) return segs;

  const tFloor = -hit.point.y / refracted.y;
  const floor: Vec2 = {
    x: hit.point.x + tFloor * refracted.x,
    y: 0,
  };
  const endIntensity = Math.exp(-ABSORPTION_AGAR * tFloor);
  const avgIntensity = 0.5 * (1 + endIntensity);

  segs.push({
    start: hit.point,
    end: floor,
    intensity: avgIntensity,
    medium: 'agar',
  });

  return segs;
}

// ─── component ─────────────────────────────────────────────────────
export default function PetriDishOpticsSimulator() {
  // Surface geometry
  const [agarMeniscus, setAgarMeniscus] = useState(1.0); // mm at wall
  const [agarCapillary, setAgarCapillary] = useState(2.7); // mm
  const [liquidPool, setLiquidPool] = useState(2.5); // mm
  const [liquidMeniscus, setLiquidMeniscus] = useState(0.5); // mm at wall

  // Camera and lights (placeholders for next step)
  const [cameraHeight, setCameraHeight] = useState(180); // mm above dish bottom
  const [lampAngle1, setLampAngle1] = useState(30); // degrees from vertical
  const [lampAngle2, setLampAngle2] = useState(-30); // degrees from vertical

  // Toggles
  const [lidPresent, setLidPresent] = useState(true);
  const [liquidPresent, setLiquidPresent] = useState(true);
  const [overheadOn, setOverheadOn] = useState(true);
  const [lamp1On, setLamp1On] = useState(false);
  const [lamp2On, setLamp2On] = useState(false);

  const tokens = useThemeTokens();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Sampled surface points for drawing the filled regions
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
        liquidSurface(
          x,
          liquidPool,
          liquidMeniscus,
          agarCapillary, // share capillary length with agar for simplicity
          agarMeniscus,
          agarCapillary,
        ),
      );
    }
    return { xs, agarYs, liquidYs };
  }, [agarMeniscus, agarCapillary, liquidPool, liquidMeniscus]);

  // ─── trace rays through the scene ────────────────────────────────
  // Each enabled light source emits a single ray. Overhead LEDs cast
  // straight down; directional lamps aim at (0, LAMP_AIM_Y) on the dish
  // rim. v0 traces air → agar surface (Snell) → floor (Beer-Lambert);
  // lid and liquid interfaces are ignored.
  const tracedRays = useMemo(() => {
    const rays: RaySegment[] = [];

    if (overheadOn) {
      for (const lx of OVERHEAD_XS) {
        const segs = traceRay(
          { x: lx, y: LIGHT_Y },
          { x: 0, y: -1 },
          agarMeniscus,
          agarCapillary,
        );
        rays.push(...segs);
      }
    }

    const traceLamp = (angleDeg: number) => {
      const t = (angleDeg * Math.PI) / 180;
      const lampPos = {
        x: Math.sin(t) * LAMP_DISTANCE,
        y: Math.cos(t) * LAMP_DISTANCE + LAMP_AIM_Y,
      };
      const aim = { x: 0, y: LAMP_AIM_Y };
      const dx = aim.x - lampPos.x;
      const dy = aim.y - lampPos.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const segs = traceRay(
        lampPos,
        { x: dx / len, y: dy / len },
        agarMeniscus,
        agarCapillary,
      );
      rays.push(...segs);
    };
    if (lamp1On) traceLamp(lampAngle1);
    if (lamp2On) traceLamp(lampAngle2);

    return rays;
  }, [
    overheadOn,
    lamp1On,
    lamp2On,
    lampAngle1,
    lampAngle2,
    agarMeniscus,
    agarCapillary,
  ]);

  // Derived stats for the StatCards. A "ray" is one origin-to-floor (or
  // origin-to-boundary) walk; count by air-medium segments since each
  // ray emits exactly one air segment.
  const stats = useMemo(() => {
    const raysTraced = tracedRays.filter((s) => s.medium === 'air').length;
    const reachingFloor = tracedRays.filter(
      (s) => s.medium === 'agar' && Math.abs(s.end.y) < 1e-3,
    ).length;
    const avgIntensity =
      tracedRays.length === 0
        ? 0
        : tracedRays.reduce((sum, s) => sum + s.intensity, 0) / tracedRays.length;
    return { raysTraced, reachingFloor, avgIntensity };
  }, [tracedRays]);

  // ─── render scene ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_WIDTH * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    canvas.style.width = `${CANVAS_WIDTH}px`;
    canvas.style.height = `${CANVAS_HEIGHT}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear
    ctx.fillStyle = tokens.paper;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // ── dish exterior (outline) ──────────────────────────────────
    // Outer wall of the dish — uniform line weight matching the rest.
    ctx.strokeStyle = tokens.inkSoft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wx(-DISH_RADIUS - DISH_WALL_THICKNESS), wy(DISH_WALL_HEIGHT));
    ctx.lineTo(wx(-DISH_RADIUS - DISH_WALL_THICKNESS), wy(-DISH_WALL_THICKNESS));
    ctx.lineTo(wx(DISH_RADIUS + DISH_WALL_THICKNESS), wy(-DISH_WALL_THICKNESS));
    ctx.lineTo(wx(DISH_RADIUS + DISH_WALL_THICKNESS), wy(DISH_WALL_HEIGHT));
    ctx.stroke();

    // Top rims of the dish wall, connecting outer to inner.
    ctx.beginPath();
    ctx.moveTo(wx(-DISH_RADIUS - DISH_WALL_THICKNESS), wy(DISH_WALL_HEIGHT));
    ctx.lineTo(wx(-DISH_RADIUS), wy(DISH_WALL_HEIGHT));
    ctx.moveTo(wx(DISH_RADIUS), wy(DISH_WALL_HEIGHT));
    ctx.lineTo(wx(DISH_RADIUS + DISH_WALL_THICKNESS), wy(DISH_WALL_HEIGHT));
    ctx.stroke();

    // ── dish interior outline ────────────────────────────────────
    // Inner surface where agar/liquid contacts the wall.
    ctx.beginPath();
    ctx.moveTo(wx(-DISH_RADIUS), wy(DISH_WALL_HEIGHT));
    ctx.lineTo(wx(-DISH_RADIUS), wy(0));
    ctx.lineTo(wx(DISH_RADIUS), wy(0));
    ctx.lineTo(wx(DISH_RADIUS), wy(DISH_WALL_HEIGHT));
    ctx.stroke();

    // ── agar fill ─────────────────────────────────────────────────
    // Medium amber, slightly opalescent — matches the Fisher MRS spec.
    const { xs, agarYs, liquidYs } = surfaceSamples;
    ctx.fillStyle = 'rgba(195, 135, 50, 0.55)';
    ctx.beginPath();
    ctx.moveTo(wx(-DISH_RADIUS), wy(0));
    for (let i = 0; i < xs.length; i++) ctx.lineTo(wx(xs[i]), wy(agarYs[i]));
    ctx.lineTo(wx(DISH_RADIUS), wy(0));
    ctx.closePath();
    ctx.fill();

    // ── liquid fill (if toggled on) ──────────────────────────────
    if (liquidPresent) {
      ctx.fillStyle = 'rgba(210, 195, 110, 0.30)';
      ctx.beginPath();
      ctx.moveTo(wx(xs[0]), wy(agarYs[0]));
      for (let i = 0; i < xs.length; i++) ctx.lineTo(wx(xs[i]), wy(liquidYs[i]));
      for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(wx(xs[i]), wy(agarYs[i]));
      ctx.closePath();
      ctx.fill();
    }

    // ── lid (if toggled on) ──────────────────────────────────────
    // The lid is an inverted U-cup that fits over the dish: its inner
    // walls sit just outside the dish's outer walls (LID_CLEARANCE),
    // and its walls extend down past the dish wall top by LID_OVERLAP
    // so the lid is visibly seated on the dish.
    if (lidPresent) {
      const lidInnerR = DISH_RADIUS + DISH_WALL_THICKNESS + LID_CLEARANCE;
      const lidOuterR = lidInnerR + LID_THICKNESS;
      const lidWallBottom = DISH_WALL_HEIGHT - LID_OVERLAP;
      const lidOuterTop = lidWallBottom + LID_HEIGHT;
      const lidInnerTop = lidOuterTop - LID_THICKNESS;

      // Translucent fill for the lid wall material only.
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

      // Outer outline of the lid: uniform line, inverted U.
      ctx.strokeStyle = tokens.inkSoft;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wx(-lidOuterR), wy(lidWallBottom));
      ctx.lineTo(wx(-lidOuterR), wy(lidOuterTop));
      ctx.lineTo(wx(lidOuterR), wy(lidOuterTop));
      ctx.lineTo(wx(lidOuterR), wy(lidWallBottom));
      ctx.stroke();

      // Bottom rims of the lid wall, connecting outer to inner.
      ctx.beginPath();
      ctx.moveTo(wx(-lidOuterR), wy(lidWallBottom));
      ctx.lineTo(wx(-lidInnerR), wy(lidWallBottom));
      ctx.moveTo(wx(lidInnerR), wy(lidWallBottom));
      ctx.lineTo(wx(lidOuterR), wy(lidWallBottom));
      ctx.stroke();

      // Inner outline of the lid: same line style, inverted U inside.
      ctx.beginPath();
      ctx.moveTo(wx(-lidInnerR), wy(lidWallBottom));
      ctx.lineTo(wx(-lidInnerR), wy(lidInnerTop));
      ctx.lineTo(wx(lidInnerR), wy(lidInnerTop));
      ctx.lineTo(wx(lidInnerR), wy(lidWallBottom));
      ctx.stroke();
    }

    // ── camera marker ────────────────────────────────────────────
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

    // ── light source markers ─────────────────────────────────────
    if (overheadOn) {
      ctx.fillStyle = 'rgba(220, 180, 60, 0.85)';
      for (const lx of OVERHEAD_XS) {
        ctx.beginPath();
        ctx.arc(wx(lx), wy(LIGHT_Y), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Directional lamps: positioned by angle off-axis from above the dish
    if (lamp1On) {
      const lx = Math.sin((lampAngle1 * Math.PI) / 180) * LAMP_DISTANCE;
      const ly = Math.cos((lampAngle1 * Math.PI) / 180) * LAMP_DISTANCE + LAMP_AIM_Y;
      ctx.fillStyle = 'rgba(250, 220, 120, 0.95)';
      ctx.beginPath();
      ctx.arc(wx(lx), wy(ly), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (lamp2On) {
      const lx = Math.sin((lampAngle2 * Math.PI) / 180) * LAMP_DISTANCE;
      const ly = Math.cos((lampAngle2 * Math.PI) / 180) * LAMP_DISTANCE + LAMP_AIM_Y;
      ctx.fillStyle = 'rgba(250, 220, 120, 0.95)';
      ctx.beginPath();
      ctx.arc(wx(lx), wy(ly), 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── traced rays ──────────────────────────────────────────────
    // Air segments render in bright yellow; agar segments shift to a
    // warmer amber and dim with Beer-Lambert attenuation along the path.
    ctx.lineWidth = 1.5;
    for (const seg of tracedRays) {
      const a = Math.max(0.1, seg.intensity);
      ctx.strokeStyle =
        seg.medium === 'air'
          ? `rgba(250, 220, 100, ${0.85 * a})`
          : `rgba(220, 145, 60, ${0.9 * a})`;
      ctx.beginPath();
      ctx.moveTo(wx(seg.start.x), wy(seg.start.y));
      ctx.lineTo(wx(seg.end.x), wy(seg.end.y));
      ctx.stroke();
    }
    // Floor-hit markers: small dots where rays terminate on the dish floor
    ctx.fillStyle = 'rgba(220, 145, 60, 0.95)';
    for (const seg of tracedRays) {
      if (seg.medium === 'agar' && Math.abs(seg.end.y) < 1e-3) {
        ctx.beginPath();
        ctx.arc(wx(seg.end.x), wy(seg.end.y), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── scale bar ────────────────────────────────────────────────
    // Placed in world coordinates immediately below the dish, spanning
    // from x=0 to x=DISH_RADIUS so the bar directly corresponds to half
    // the dish width. Label sits below the bar in the standard
    // scientific-illustration position.
    {
      const barY = -13; // world mm, below the dish outer floor at y=-1
      const x0 = wx(0);
      const x1 = wx(DISH_RADIUS);
      const yPx = wy(barY);
      ctx.strokeStyle = tokens.inkSoft;
      ctx.fillStyle = tokens.inkSoft;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, yPx);
      ctx.lineTo(x1, yPx);
      // tick marks pointing down only
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
    tracedRays,
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
          liquid layer, and optional lid. Each lit source casts a single ray
          that refracts at the agar surface (Snell's law, n<sub>air</sub>=1,
          n<sub>agar</sub>=1.34) and attenuates through the medium
          (Beer-Lambert). Fresnel split, lid/liquid interfaces, and
          camera-side ray collection will arrive in subsequent versions.
        </>
      }
      footer={
        <Legend
          items={[
            { color: 'rgba(180, 140, 60, 0.7)', label: 'Agar (MRS)' },
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
            wall (the bowl is depressed in the middle and rises at the edges)
          </li>
          <li>
            <strong>Liquid pool</strong>: base level of any aqueous layer
            poured on top of the agar
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

      {/* Geometry sliders */}
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

      {/* Camera + lamp sliders */}
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

      {/* Toggles */}
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

      {/* Stat cards — v0 ray tracing */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <StatCard label="Rays traced" value={stats.raysTraced.toString()} />
        <StatCard
          label="Reaching floor"
          value={stats.reachingFloor.toString()}
          tone="accent"
        />
        <StatCard label="Max bounces" value="1" />
        <StatCard
          label="Avg intensity"
          value={
            stats.avgIntensity > 0 ? stats.avgIntensity.toFixed(2) : '—'
          }
        />
      </div>

      <VizSurface>
        <canvas ref={canvasRef} />
      </VizSurface>
    </VizFigure>
  );
}
