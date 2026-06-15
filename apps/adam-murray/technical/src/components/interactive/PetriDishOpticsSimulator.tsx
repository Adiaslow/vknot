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
    const lightY = 250;
    const overheadXs = [-150, -75, 0, 75, 150];
    if (overheadOn) {
      ctx.fillStyle = 'rgba(220, 180, 60, 0.85)';
      for (const lx of overheadXs) {
        ctx.beginPath();
        ctx.arc(wx(lx), wy(lightY), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Directional lamps: positioned by angle off-axis from above the dish
    const lampDistance = 150;
    if (lamp1On) {
      const lx = Math.sin((lampAngle1 * Math.PI) / 180) * lampDistance;
      const ly = Math.cos((lampAngle1 * Math.PI) / 180) * lampDistance + 8;
      ctx.fillStyle = 'rgba(250, 220, 120, 0.95)';
      ctx.beginPath();
      ctx.arc(wx(lx), wy(ly), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (lamp2On) {
      const lx = Math.sin((lampAngle2 * Math.PI) / 180) * lampDistance;
      const ly = Math.cos((lampAngle2 * Math.PI) / 180) * lampDistance + 8;
      ctx.fillStyle = 'rgba(250, 220, 120, 0.95)';
      ctx.beginPath();
      ctx.arc(wx(lx), wy(ly), 4, 0, Math.PI * 2);
      ctx.fill();
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
          liquid layer, and optional lid. Adjust the parameters below to see
          the geometry change; ray tracing will be layered onto this scene in
          subsequent revisions.
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

      {/* Stat cards (placeholders until ray tracing is wired up) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <StatCard label="Rays traced" value="—" />
        <StatCard label="Reaching camera" value="—" tone="accent" />
        <StatCard label="Max bounces" value="—" />
        <StatCard label="Avg intensity" value="—" />
      </div>

      <VizSurface>
        <canvas ref={canvasRef} />
      </VizSurface>
    </VizFigure>
  );
}
