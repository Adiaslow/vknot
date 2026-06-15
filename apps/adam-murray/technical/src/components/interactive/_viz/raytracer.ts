// ────────────────────────────────────────────────────────────────────
// Physically-based 2D ray tracer for optics simulations.
//
// Pure-physics module. No React, no canvas, no DOM.
//
// Scope:
//   • Ray-surface intersection for 3 surface types (horizontal segment,
//     vertical segment, 1D height field).
//   • Snell refraction with proper sign conventions.
//   • Fresnel reflectance for unpolarized light (energy-conserving split).
//   • Total internal reflection.
//   • Beer-Lambert attenuation through absorbing media.
//   • Recursive multi-bounce with depth + intensity pruning.
//   • Light source factories: collimated, cone (uniform angular),
//     Lambertian (cos-weighted), and uniform diffuse sky (cos-weighted
//     hemispherical, parallel rays per direction — for modelling
//     distant extended emitters like a ceiling).
//   • Surface factories: pure-Fresnel (default) + Lambertian-scattering
//     (custom `interact` hook) for diffuse white surfaces like a dish
//     floor or matte sample. Surfaces with a custom `interact` override
//     the Fresnel split at hit time.
//
// Conventions:
//   • Right-handed 2D coordinates. +x right, +y up.
//   • A surface's canonical `normal` is a unit vector that points from
//     the `mediumMinus` side into the `mediumPlus` side. The trace
//     function detects which side a ray approaches from and orients
//     the working normal accordingly.
//   • Ray directions are unit vectors.
// ────────────────────────────────────────────────────────────────────

export type Vec2 = { x: number; y: number };

export interface Medium {
  readonly name: string;
  readonly n: number; // refractive index
  readonly alpha: number; // Beer-Lambert absorption coefficient (mm⁻¹)
}

// ─── standard media ─────────────────────────────────────────────────
// Values are nominal for the visible band. Absorption coefficients are
// slightly exaggerated above clean-material values where noted so that
// attenuation is visible over millimetre-scale path lengths.

export const AIR: Medium = { name: 'air', n: 1.0003, alpha: 0 };
export const POLYSTYRENE: Medium = { name: 'polystyrene', n: 1.59, alpha: 0.002 };
export const WATER: Medium = { name: 'water', n: 1.333, alpha: 0.001 };
// MRS agar at ~20 g/L dissolved solutes. Absorption bumped from clean
// (~0.05 mm⁻¹) to give visible attenuation through 2-3 mm at canvas scale.
export const AGAR: Medium = { name: 'agar', n: 1.34, alpha: 0.35 };
// Terminal absorber: anything crossing into this medium dies within a
// fraction of a mm. Used as the "below the floor" sink so transmitted
// rays don't continue into the unbounded scene.
export const ABSORBER: Medium = { name: 'absorber', n: 1.0, alpha: 1e3 };

// ─── ray + segment types ────────────────────────────────────────────

export interface Ray {
  origin: Vec2;
  dir: Vec2; // unit vector
  intensity: number; // 0..1, fraction of source flux carried by this ray
  medium: Medium; // medium the ray is currently in
  depth: number; // bounce generation; 0 = primary from source
  bornBy: 'source' | 'reflected' | 'transmitted' | 'scattered';
}

export interface RaySegment {
  start: Vec2;
  end: Vec2;
  intensityStart: number;
  intensityEnd: number;
  medium: Medium;
  depth: number;
  bornBy: 'source' | 'reflected' | 'transmitted' | 'scattered';
  terminatedBy: 'hit' | 'escape';
  surfaceName?: string; // name of the surface the segment terminated at, if any
}

// ─── vector helpers ─────────────────────────────────────────────────

export const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
export const norm = (v: Vec2) => Math.sqrt(v.x * v.x + v.y * v.y);
export const normalize = (v: Vec2): Vec2 => {
  const m = norm(v);
  return m > 0 ? { x: v.x / m, y: v.y / m } : { x: 0, y: 0 };
};
export const scale = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const addScaled = (a: Vec2, b: Vec2, s: number): Vec2 => ({
  x: a.x + s * b.x,
  y: a.y + s * b.y,
});

// ─── optical physics ────────────────────────────────────────────────

/**
 * Snell refraction. `d` is the unit incident direction pointing INTO the
 * surface. `n` is the unit normal pointing INTO the medium the ray is
 * coming FROM (so cos(θᵢ) = -d·n ≥ 0 for a valid hit).
 * Returns the refracted unit direction in the second medium, or null on
 * total internal reflection (sin²(θₜ) > 1).
 */
export function refract(
  d: Vec2,
  n: Vec2,
  n1: number,
  n2: number,
): Vec2 | null {
  const cosI = -dot(d, n);
  const eta = n1 / n2;
  const sin2T = eta * eta * (1 - cosI * cosI);
  if (sin2T > 1) return null;
  const cosT = Math.sqrt(1 - sin2T);
  return {
    x: eta * d.x + (eta * cosI - cosT) * n.x,
    y: eta * d.y + (eta * cosI - cosT) * n.y,
  };
}

/** Mirror-reflect a direction `d` across unit normal `n`. */
export function reflect(d: Vec2, n: Vec2): Vec2 {
  const c = dot(d, n);
  return { x: d.x - 2 * c * n.x, y: d.y - 2 * c * n.y };
}

/**
 * Fresnel reflectance for unpolarized light at a single interface.
 * cosI must be ≥ 0 (angle measured from surface normal, on the
 * incident side). Returns R in [0, 1]; transmittance is 1 - R.
 */
export function fresnelR(cosI: number, n1: number, n2: number): number {
  const eta = n1 / n2;
  const sin2T = eta * eta * (1 - cosI * cosI);
  if (sin2T >= 1) return 1; // TIR
  const cosT = Math.sqrt(1 - sin2T);
  const Rs = ((n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT)) ** 2;
  const Rp = ((n1 * cosT - n2 * cosI) / (n1 * cosT + n2 * cosI)) ** 2;
  return 0.5 * (Rs + Rp);
}

// ─── surfaces ───────────────────────────────────────────────────────

export interface SurfaceHit {
  point: Vec2;
  t: number;
  /** Outward unit normal pointing into the `mediumPlus` side. */
  normal: Vec2;
  /** Medium on the +normal side at this hit point. */
  mediumPlus: Medium;
  /** Medium on the -normal side at this hit point. */
  mediumMinus: Medium;
}

export interface Surface {
  readonly name: string;
  /**
   * Intersect a ray with this surface. Returns the first hit with
   * t ∈ (tMin, tMax], or null if no hit.
   */
  intersect(
    origin: Vec2,
    dir: Vec2,
    tMin: number,
    tMax: number,
  ): SurfaceHit | null;
  /**
   * Optional custom interaction. If provided, the trace function calls
   * this instead of the default Fresnel-split when a ray hits this
   * surface. `rayAtHit` has its intensity already adjusted for
   * Beer-Lambert attenuation along the segment leading to the hit;
   * the function returns whatever child rays the interaction produces
   * (zero for pure absorption, two for Fresnel split, N for Lambertian
   * scatter, etc.). Child rays are responsible for setting their own
   * offset origin (typically via `addScaled(point, normal, eps)`) to
   * avoid self-intersection.
   */
  interact?: (
    rayAtHit: Ray,
    hit: SurfaceHit,
    opts: { selfIntersectEps: number },
  ) => Ray[];
}

/**
 * Horizontal line segment at y=y₀, x ∈ [xMin, xMax].
 * Canonical normal is (0, +1): mediumPlus is above, mediumMinus is below.
 */
export function horizontalSegment(
  name: string,
  y: number,
  xMin: number,
  xMax: number,
  mediumPlus: Medium,
  mediumMinus: Medium,
): Surface {
  const normal: Vec2 = { x: 0, y: 1 };
  return {
    name,
    intersect(origin, dir, tMin, tMax) {
      if (Math.abs(dir.y) < 1e-12) return null;
      const t = (y - origin.y) / dir.y;
      if (t <= tMin || t > tMax) return null;
      const x = origin.x + t * dir.x;
      if (x < xMin || x > xMax) return null;
      return { point: { x, y }, t, normal, mediumPlus, mediumMinus };
    },
  };
}

/**
 * Vertical line segment at x=x₀, y ∈ [yMin, yMax].
 * Canonical normal is (+1, 0): mediumPlus is to the right, mediumMinus is to the left.
 */
export function verticalSegment(
  name: string,
  x: number,
  yMin: number,
  yMax: number,
  mediumPlus: Medium,
  mediumMinus: Medium,
): Surface {
  const normal: Vec2 = { x: 1, y: 0 };
  return {
    name,
    intersect(origin, dir, tMin, tMax) {
      if (Math.abs(dir.x) < 1e-12) return null;
      const t = (x - origin.x) / dir.x;
      if (t <= tMin || t > tMax) return null;
      const y = origin.y + t * dir.y;
      if (y < yMin || y > yMax) return null;
      return { point: { x, y }, t, normal, mediumPlus, mediumMinus };
    },
  };
}

/**
 * 1D height field: y = f(x) over x ∈ [xMin, xMax].
 * Canonical normal points "up" (in the direction of decreasing -f),
 * computed numerically from f's derivative. mediumPlus is the medium
 * above f, mediumMinus is below — both may depend on x to support
 * cases like an agar surface whose above-medium switches between
 * AIR and WATER depending on whether a liquid layer is present.
 *
 * `existsAt(x)` lets callers restrict the surface to only the
 * x-range where it represents a real interface; returning false at a
 * hit candidate causes intersect() to ignore the hit. This avoids
 * spurious refractions where two surfaces coincide (e.g., a liquid
 * surface meeting the agar surface in dry regions of the dish).
 */
export function heightField(
  name: string,
  f: (x: number) => number,
  xMin: number,
  xMax: number,
  mediumPlusAt: (x: number) => Medium,
  mediumMinusAt: (x: number) => Medium,
  existsAt: (x: number) => boolean = () => true,
): Surface {
  return {
    name,
    intersect(origin, dir, tMin, tMax) {
      const N = 200;
      const sample = (t: number): number | null => {
        const x = origin.x + t * dir.x;
        if (x < xMin || x > xMax) return null;
        return f(x) - (origin.y + t * dir.y);
      };

      let prevT = tMin;
      let prevF: number | null = sample(prevT);

      for (let i = 1; i <= N; i++) {
        const t = tMin + ((tMax - tMin) * i) / N;
        const fT = sample(t);

        if (fT === null) {
          prevT = t;
          prevF = null;
          continue;
        }

        if (prevF === null) {
          prevT = t;
          prevF = fT;
          continue;
        }

        const signChange =
          (prevF < 0 && fT >= 0) || (prevF > 0 && fT <= 0);

        if (signChange) {
          // Bisect to refine
          let lo = prevT;
          let hi = t;
          let fLo = prevF;
          for (let j = 0; j < 32; j++) {
            const mid = 0.5 * (lo + hi);
            const fMid = sample(mid);
            if (fMid === null) {
              // Shouldn't happen between two in-range samples on a
              // continuous height field
              return null;
            }
            if ((fLo < 0) === (fMid < 0)) {
              lo = mid;
              fLo = fMid;
            } else {
              hi = mid;
            }
          }
          const tHit = 0.5 * (lo + hi);
          const xHit = origin.x + tHit * dir.x;
          if (!existsAt(xHit)) {
            // Real surface doesn't exist at this x — skip this hit and
            // keep walking forward looking for the next sign change.
            prevT = t;
            prevF = fT;
            continue;
          }
          const yHit = origin.y + tHit * dir.y;
          // Numerical derivative for normal
          const h = 0.01;
          const dydx = (f(xHit + h) - f(xHit - h)) / (2 * h);
          const invMag = 1 / Math.sqrt(dydx * dydx + 1);
          const normal: Vec2 = { x: -dydx * invMag, y: invMag };
          return {
            point: { x: xHit, y: yHit },
            t: tHit,
            normal,
            mediumPlus: mediumPlusAt(xHit),
            mediumMinus: mediumMinusAt(xHit),
          };
        }

        prevT = t;
        prevF = fT;
      }
      return null;
    },
  };
}

// ─── light source factories ─────────────────────────────────────────

/**
 * Horizontal Lambertian scattering surface at y=y₀, x ∈ [xMin, xMax].
 *
 * Geometrically a `horizontalSegment` between two media, but with a
 * custom `interact` that replaces Fresnel-split with diffuse scatter.
 * An incoming ray is partly absorbed (1 − albedo of its flux disappears)
 * and partly re-emitted as `scatterRayCount` rays distributed
 * cos-weighted (Lambertian) in the hemisphere on the SIDE THE RAY CAME
 * FROM. The medium of the scattered rays is the same as the medium the
 * incoming ray was in: scattered photons go back into the medium they
 * arrived through. Each scattered ray carries (albedo × intensity) /
 * scatterRayCount, so total reflected flux equals albedo × incoming
 * flux (energy-conserving up to the absorbed fraction).
 *
 * This is the physical model for a diffuse white floor, a piece of
 * matte polystyrene, a thick paper, a bacterial colony, etc. — any
 * surface whose roughness is large compared to the wavelength so that
 * specular reflection is averaged into a cos-weighted lobe.
 */
export function lambertianScatterer(
  name: string,
  y: number,
  xMin: number,
  xMax: number,
  mediumPlus: Medium,
  mediumMinus: Medium,
  albedo: number,
  scatterRayCount: number,
): Surface {
  const base = horizontalSegment(name, y, xMin, xMax, mediumPlus, mediumMinus);
  return {
    ...base,
    interact: (rayAtHit, hit, { selfIntersectEps }) => {
      const dotN = dot(rayAtHit.dir, hit.normal);
      // Ray approached from +normal side iff dotN < 0
      const fromPlus = dotN < 0;
      const outwardNormal: Vec2 = fromPlus
        ? hit.normal
        : { x: -hit.normal.x, y: -hit.normal.y };
      const baseAngle = Math.atan2(outwardNormal.y, outwardNormal.x);
      const mediumOut = fromPlus ? mediumPlus : mediumMinus;
      const perRay = (rayAtHit.intensity * albedo) / scatterRayCount;
      const children: Ray[] = [];
      for (let i = 0; i < scatterRayCount; i++) {
        // Cos-weighted stratified sample in the outward hemisphere.
        const u = (i + 0.5) / scatterRayCount;
        const theta = Math.asin(2 * u - 1);
        const angle = baseAngle + theta;
        children.push({
          origin: addScaled(hit.point, outwardNormal, selfIntersectEps),
          dir: { x: Math.cos(angle), y: Math.sin(angle) },
          intensity: perRay,
          medium: mediumOut,
          depth: rayAtHit.depth + 1,
          bornBy: 'scattered',
        });
      }
      return children;
    },
  };
}

// ─── light source factories ─────────────────────────────────────────

export type LightSource = () => Ray[];

/** Single ray, fixed direction. */
export function collimatedSource(
  position: Vec2,
  primaryDir: Vec2,
  ambient: Medium,
  totalIntensity = 1,
): LightSource {
  const dir = normalize(primaryDir);
  return () => [
    {
      origin: position,
      dir,
      intensity: totalIntensity,
      medium: ambient,
      depth: 0,
      bornBy: 'source',
    },
  ];
}

/**
 * Cone source: emits `rayCount` rays uniformly distributed in angle
 * across [-halfAngleDeg, +halfAngleDeg] of the primary direction.
 * Total flux is split equally across rays.
 */
export function coneSource(
  position: Vec2,
  primaryDir: Vec2,
  halfAngleDeg: number,
  rayCount: number,
  ambient: Medium,
  totalIntensity = 1,
): LightSource {
  if (rayCount <= 1 || halfAngleDeg <= 0) {
    return collimatedSource(position, primaryDir, ambient, totalIntensity);
  }
  const baseAngle = Math.atan2(primaryDir.y, primaryDir.x);
  return () => {
    const rays: Ray[] = [];
    for (let i = 0; i < rayCount; i++) {
      const tParam = -1 + (2 * i) / (rayCount - 1); // [-1, 1]
      const angle = baseAngle + (halfAngleDeg * tParam * Math.PI) / 180;
      rays.push({
        origin: position,
        dir: { x: Math.cos(angle), y: Math.sin(angle) },
        intensity: totalIntensity / rayCount,
        medium: ambient,
        depth: 0,
        bornBy: 'source',
      });
    }
    return rays;
  };
}

/**
 * Lambertian (cosine-weighted) hemispherical source.
 * `outwardNormal` is the surface normal of the emitter; rays go into
 * the hemisphere on the +normal side. In 2D the cos-weighted CDF gives
 * θ = asin(2u - 1) for uniform u, where θ is measured from the normal.
 * Each ray carries 1/N of the total flux (the importance-sampling
 * weight cancels the cosine).
 */
export function lambertianSource(
  position: Vec2,
  outwardNormal: Vec2,
  rayCount: number,
  ambient: Medium,
  totalIntensity = 1,
): LightSource {
  const n = normalize(outwardNormal);
  const baseAngle = Math.atan2(n.y, n.x);
  return () => {
    const rays: Ray[] = [];
    for (let i = 0; i < rayCount; i++) {
      const u = (i + 0.5) / rayCount; // stratified
      const theta = Math.asin(2 * u - 1); // ∈ [-π/2, +π/2]
      const angle = baseAngle + theta;
      rays.push({
        origin: position,
        dir: { x: Math.cos(angle), y: Math.sin(angle) },
        intensity: totalIntensity / rayCount,
        medium: ambient,
        depth: 0,
        bornBy: 'source',
      });
    }
    return rays;
  };
}

/**
 * Uniform diffuse hemispherical illumination ("sky").
 *
 * Models a distant horizontally extended emitter — like a ceiling
 * fluorescent panel or a brightly lit overcast sky — as a uniform-
 * radiance upper hemisphere. From a small receiver on the bench, this
 * is what diffuse overhead lighting actually looks like: rays arrive
 * from every direction in the upper hemisphere, and the source is far
 * enough that rays from any given direction are parallel to each other.
 *
 * Sampling:
 *   • `numDirections` directions are sampled cos-weighted on the upper
 *     hemisphere. In 2D this gives θ = asin(2u - 1) for stratified u,
 *     where θ is measured from the +y (vertical) axis. Cos-weighted
 *     sampling makes each ray represent an equal share of the
 *     IRRADIANCE on a horizontal receiver (the cosine in dE = L cosθ dΩ
 *     is folded into the sample weights).
 *   • For each direction, `raysPerDirection` parallel rays are emitted.
 *     Their paths cross y = `aimY` at evenly spaced x-positions across
 *     [`aimXMin`, `aimXMax`]. Ray origins are placed at `originDistance`
 *     back along the incoming direction from each aim point.
 *
 * The `originDistance` is a VISUAL parameter (controls where the rays'
 * starting dots appear on the canvas); the physics treats the source as
 * effectively at infinity (parallel rays per direction). Total flux is
 * split equally across all rays.
 */
export function diffuseSky(opts: {
  aimXMin: number;
  aimXMax: number;
  aimY: number;
  originDistance: number;
  numDirections: number;
  raysPerDirection: number;
  ambient: Medium;
  totalIntensity?: number;
}): LightSource {
  const {
    aimXMin,
    aimXMax,
    aimY,
    originDistance,
    numDirections,
    raysPerDirection,
    ambient,
    totalIntensity = 1,
  } = opts;
  return () => {
    const rays: Ray[] = [];
    const totalRays = numDirections * raysPerDirection;
    for (let i = 0; i < numDirections; i++) {
      // Cos-weighted stratified sample: θ ∈ (-π/2, +π/2) measured from
      // the +y axis (vertical, "straight down").
      const u = (i + 0.5) / numDirections;
      const theta = Math.asin(2 * u - 1);
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta); // > 0 over (-π/2, π/2)
      // Incoming direction: pointing down and tilted by θ from -y.
      // For θ = 0 → (0, -1); for θ > 0 → tilted to the left of vertical
      // (negative x). The ray TRAVELS in this direction.
      const dir: Vec2 = { x: -sinT, y: -cosT };
      for (let j = 0; j < raysPerDirection; j++) {
        const v = (j + 0.5) / raysPerDirection;
        const xAim = aimXMin + v * (aimXMax - aimXMin);
        // Origin is `originDistance` back along -dir from (xAim, aimY).
        const origin: Vec2 = {
          x: xAim - originDistance * dir.x,
          y: aimY - originDistance * dir.y,
        };
        rays.push({
          origin,
          dir,
          intensity: totalIntensity / totalRays,
          medium: ambient,
          depth: 0,
          bornBy: 'source',
        });
      }
    }
    return rays;
  };
}

// ─── scene + tracer ─────────────────────────────────────────────────

export interface SceneBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface Scene {
  surfaces: Surface[];
  bounds: SceneBounds;
}

export interface TraceOptions {
  /** Maximum bounce depth. 0 = no bounces (rays just travel until first hit and stop). */
  maxDepth?: number;
  /** Rays below this intensity are pruned. */
  minIntensity?: number;
}

// Offset applied to a hit point along the surface normal before spawning
// child rays, to avoid self-intersection with the surface just hit.
const SELF_INTERSECT_EPS = 1e-3;

/**
 * Forward-trace a set of initial rays through the scene. At each surface
 * hit, the ray splits into a Snell-refracted transmitted branch and a
 * Fresnel-weighted reflected branch; both are pushed back into the queue.
 * Beer-Lambert attenuation is applied along each segment in its medium.
 * Returns all segments traversed, suitable for visualization or analysis.
 */
export function trace(
  scene: Scene,
  initialRays: Ray[],
  options: TraceOptions = {},
): RaySegment[] {
  const maxDepth = options.maxDepth ?? 6;
  const minIntensity = options.minIntensity ?? 1e-3;

  const segments: RaySegment[] = [];
  const queue: Ray[] = [...initialRays];

  while (queue.length > 0) {
    const ray = queue.shift();
    if (!ray) break;
    if (ray.depth > maxDepth) continue;
    if (ray.intensity < minIntensity) continue;

    // Find nearest hit among all surfaces.
    let nearestHit: SurfaceHit | null = null;
    let nearestSurface: Surface | null = null;
    for (const surface of scene.surfaces) {
      const h = surface.intersect(ray.origin, ray.dir, SELF_INTERSECT_EPS, Infinity);
      if (h && (nearestHit === null || h.t < nearestHit.t)) {
        nearestHit = h;
        nearestSurface = surface;
      }
    }

    if (!nearestHit) {
      // Ray escapes the scene. Emit a terminal segment to the bounding
      // box edge so visualization shows the ray's path leaving.
      const { xMin, xMax, yMin, yMax } = scene.bounds;
      const ts: number[] = [];
      if (ray.dir.x > 1e-12) ts.push((xMax - ray.origin.x) / ray.dir.x);
      else if (ray.dir.x < -1e-12) ts.push((xMin - ray.origin.x) / ray.dir.x);
      if (ray.dir.y > 1e-12) ts.push((yMax - ray.origin.y) / ray.dir.y);
      else if (ray.dir.y < -1e-12) ts.push((yMin - ray.origin.y) / ray.dir.y);
      const positiveTs = ts.filter((t) => t > 0);
      if (positiveTs.length === 0) continue;
      const tEscape = Math.min(...positiveTs);
      const end = addScaled(ray.origin, ray.dir, tEscape);
      const attenuation = Math.exp(-ray.medium.alpha * tEscape);
      segments.push({
        start: ray.origin,
        end,
        intensityStart: ray.intensity,
        intensityEnd: ray.intensity * attenuation,
        medium: ray.medium,
        depth: ray.depth,
        bornBy: ray.bornBy,
        terminatedBy: 'escape',
      });
      continue;
    }

    // Beer-Lambert through the current medium for distance nearestHit.t.
    const distTraversed = nearestHit.t;
    const intensityAtHit =
      ray.intensity * Math.exp(-ray.medium.alpha * distTraversed);

    segments.push({
      start: ray.origin,
      end: nearestHit.point,
      intensityStart: ray.intensity,
      intensityEnd: intensityAtHit,
      medium: ray.medium,
      depth: ray.depth,
      bornBy: ray.bornBy,
      terminatedBy: 'hit',
      surfaceName: nearestSurface?.name,
    });

    // If the surface defines a custom interaction (e.g. Lambertian
    // scatter), delegate to it. Otherwise do the default Fresnel split.
    if (nearestSurface && nearestSurface.interact) {
      const rayAtHit: Ray = {
        origin: nearestHit.point,
        dir: ray.dir,
        intensity: intensityAtHit,
        medium: ray.medium,
        depth: ray.depth,
        bornBy: ray.bornBy,
      };
      const children = nearestSurface.interact(rayAtHit, nearestHit, {
        selfIntersectEps: SELF_INTERSECT_EPS,
      });
      for (const child of children) {
        if (child.intensity >= minIntensity && child.depth <= maxDepth) {
          queue.push(child);
        }
      }
      continue;
    }

    // Determine the working normal (pointing INTO the ray's current
    // medium) and the indices n1 (current) → n2 (other side).
    const dotN = dot(ray.dir, nearestHit.normal);
    let workingNormal: Vec2;
    let n1: number;
    let n2: number;
    let otherMedium: Medium;
    if (dotN < 0) {
      // Ray going against canonical normal: it came from the +normal side.
      workingNormal = nearestHit.normal;
      n1 = nearestHit.mediumPlus.n;
      n2 = nearestHit.mediumMinus.n;
      otherMedium = nearestHit.mediumMinus;
    } else {
      // Ray going along canonical normal: it came from the -normal side.
      workingNormal = { x: -nearestHit.normal.x, y: -nearestHit.normal.y };
      n1 = nearestHit.mediumMinus.n;
      n2 = nearestHit.mediumPlus.n;
      otherMedium = nearestHit.mediumPlus;
    }

    const cosI = -dot(ray.dir, workingNormal);
    const R = fresnelR(cosI, n1, n2);

    // Reflected branch: stays in the same medium, offset out along
    // workingNormal to avoid re-hitting the surface we just left.
    const reflectedIntensity = intensityAtHit * R;
    if (reflectedIntensity >= minIntensity) {
      queue.push({
        origin: addScaled(nearestHit.point, workingNormal, SELF_INTERSECT_EPS),
        dir: reflect(ray.dir, workingNormal),
        intensity: reflectedIntensity,
        medium: ray.medium,
        depth: ray.depth + 1,
        bornBy: 'reflected',
      });
    }

    // Transmitted branch: null on TIR. Offset into the other medium.
    const refractedDir = refract(ray.dir, workingNormal, n1, n2);
    const transmittedIntensity = intensityAtHit * (1 - R);
    if (refractedDir && transmittedIntensity >= minIntensity) {
      queue.push({
        origin: addScaled(nearestHit.point, workingNormal, -SELF_INTERSECT_EPS),
        dir: refractedDir,
        intensity: transmittedIntensity,
        medium: otherMedium,
        depth: ray.depth + 1,
        bornBy: 'transmitted',
      });
    }
  }

  return segments;
}
