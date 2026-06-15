/**
 * node-ring.ts — pure, deterministic generator for the cyclic
 * node-ring mark. No DOM, no dependencies: runs at build time in
 * the Astro component frontmatter and emits plain SVG path data.
 *
 * The mark: n nodes seated on a circle, joined edge-to-edge into a
 * closed cycle, folded by k interior chords, origin node accented.
 * A small seeded perturbation gives every edge one confident,
 * slightly-bowed stroke — the "quiet hand" — while staying stable
 * across renders (same seed → same shape).
 */

export interface RingOptions {
  /** number of nodes on the ring */
  nodes?: number;
  /** number of interior chords folding the loop */
  chords?: number;
  /** rng seed — change for a different hand, keep for stability */
  seed?: number;
  /** how much the pen wavers (viewBox units). 0 = perfectly crisp */
  roughness?: number;
}

export interface RingNode {
  x: number;
  y: number;
  origin: boolean;
}

export interface RingGeometry {
  /** 0..100 square viewBox */
  size: number;
  edges: string[];   // outer-cycle path d-strings (ink)
  chords: string[];  // interior chord path d-strings (accent)
  nodes: RingNode[];
  nodeRadius: number;
}

/** deterministic, dependency-free PRNG (mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** one confident, slightly-bowed stroke from A to B */
function stroke(
  ax: number, ay: number, bx: number, by: number,
  rand: () => number, rough: number,
): string {
  const jx = (rand() - 0.5) * rough * 0.6;
  const jy = (rand() - 0.5) * rough * 0.6;
  const sx = ax + jx, sy = ay + jy;
  const ex = bx + (rand() - 0.5) * rough * 0.6;
  const ey = by + (rand() - 0.5) * rough * 0.6;
  const mx = (sx + ex) / 2, my = (sy + ey) / 2;
  const dx = ex - sx, dy = ey - sy;
  const len = Math.hypot(dx, dy) || 1;
  const bow = (rand() - 0.5) * rough;       // perpendicular bow
  const cx = mx - (dy / len) * bow;
  const cy = my + (dx / len) * bow;
  return `M${sx.toFixed(2)} ${sy.toFixed(2)} Q${cx.toFixed(2)} ${cy.toFixed(2)} ${ex.toFixed(2)} ${ey.toFixed(2)}`;
}

export function buildRing(opts: RingOptions = {}): RingGeometry {
  const n = Math.max(3, opts.nodes ?? 7);
  const k = Math.max(0, Math.min(opts.chords ?? 2, Math.floor(n / 2)));
  const rough = opts.roughness ?? 1.0;
  const rand = rng(opts.seed ?? 7);

  const size = 100;
  const cx = 50, cy = 50, R = 38;

  const pts: RingNode[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), origin: i === 0 });
  }

  const edges: string[] = [];
  for (let i = 0; i < n; i++) {
    const A = pts[i], B = pts[(i + 1) % n];
    edges.push(stroke(A.x, A.y, B.x, B.y, rand, rough));
  }

  const chords: string[] = [];
  const step = Math.max(2, Math.floor(n / 2));
  for (let c = 0; c < k; c++) {
    const A = pts[c], B = pts[(c + step) % n];
    chords.push(stroke(A.x, A.y, B.x, B.y, rand, rough));
  }

  return { size, edges, chords, nodes: pts, nodeRadius: 3.2 };
}
