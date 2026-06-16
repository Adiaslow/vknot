/**
 * category-graph.ts — the shared-category graph over the technical posts.
 *
 * Nodes are articles; an edge joins two articles that share one or more
 * arXiv categories, weighted by how many they share. The same force
 * configuration is used at build time (to emit a settled layout for the
 * no-JS / first-paint fallback) and on the client (to keep dragging and
 * settling interactive), so the graph never jumps on hydration.
 *
 * Deterministic by construction: a seeded RNG + seeded circular start
 * means the same posts always settle to the same layout.
 */
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
} from 'd3-force';

export interface GraphPost {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly date: Date;
  readonly tags: ReadonlyArray<string>;
}

export interface GraphNode {
  id: string;
  title: string;
  href: string;
  /** compact mono label, e.g. "2025·03·10" */
  dateLabel: string;
  /** number of categories on this article (node weight) */
  degree: number;
  /** home position the node gravitates back to (set by the client island) */
  ox?: number;
  oy?: number;
  // d3-force mutates these in place:
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  /** number of shared categories */
  weight: number;
  /** the shared category ids */
  shared: string[];
  /** continuous similarity = |shared| / |union of both tag sets| (Jaccard) */
  strength: number;
  /** strength min-max normalized to [0,1] across all edges in the graph */
  norm: number;
}

export interface Graph {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface LayoutOptions {
  width: number;
  height: number;
  /** ticks to run when settling headlessly (SSR) */
  ticks?: number;
  /** PRNG seed; same seed → same layout */
  seed?: number;
  /**
   * Homing mode (client): instead of pulling toward the canvas centre,
   * each node gravitates back to its own origin (node.ox/oy). This holds
   * the graph's shape and springs dragged nodes home. Used after the SSR
   * settle has supplied each node's origin.
   */
  homing?: boolean;
}

const fmtDate = (d: Date) =>
  `${d.getFullYear()}·${String(d.getMonth() + 1).padStart(2, '0')}·${String(
    d.getDate(),
  ).padStart(2, '0')}`;

/** Build the (position-free) graph from a list of posts. */
export function buildCategoryGraph(posts: ReadonlyArray<GraphPost>): Graph {
  const nodes: GraphNode[] = posts.map((p) => ({
    id: p.id,
    title: p.title,
    href: p.href,
    dateLabel: fmtDate(p.date),
    degree: p.tags.length,
  }));

  const links: GraphLink[] = [];
  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      const a = new Set(posts[i].tags);
      const shared = posts[j].tags.filter((t) => a.has(t));
      if (shared.length > 0) {
        // Jaccard over the full tag sets — a continuous similarity that
        // varies between pairs even at equal share counts (because tag-set
        // sizes differ), so edge strength is not just 1/2/3 buckets.
        const union = posts[i].tags.length + posts[j].tags.length - shared.length;
        links.push({
          source: posts[i].id,
          target: posts[j].id,
          weight: shared.length,
          shared,
          strength: shared.length / union,
          norm: 0,
        });
      }
    }
  }
  // Normalize strength across the whole set so thickness spans the full range.
  const strengths = links.map((l) => l.strength);
  const lo = Math.min(...strengths);
  const hi = Math.max(...strengths);
  const span = hi - lo;
  for (const l of links) {
    l.norm = span > 1e-9 ? (l.strength - lo) / span : 1;
  }
  return { nodes, links };
}

/** Deterministic PRNG (mulberry32) in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Configure (but do not start) a force simulation. Shared by SSR settle
 * and the client island so both agree on the layout. Edge weight pulls
 * strongly-shared pairs tight and lets single-category links hang loose,
 * which is what separates the real clusters from the generic-tag halo.
 */
export function createSimulation(
  nodes: GraphNode[],
  links: GraphLink[],
  opts: LayoutOptions,
): Simulation<GraphNode, undefined> {
  const { width, height, seed = 0x9e3779b9, homing = false } = opts;
  const cx = width / 2;
  const cy = height / 2;
  const rng = mulberry32(seed);

  // Seed deterministic circular start positions for any unplaced node.
  const R = Math.min(width, height) * 0.32;
  nodes.forEach((n, i) => {
    if (n.x == null || n.y == null) {
      const a = (i / nodes.length) * Math.PI * 2;
      n.x = cx + R * Math.cos(a);
      n.y = cy + R * Math.sin(a);
    }
  });

  const sim = forceSimulation(nodes)
    .randomSource(rng)
    .force(
      'link',
      forceLink<GraphNode, GraphLink>(links)
        .id((d) => d.id)
        // higher weight → shorter rest length (pulls shared pairs close)
        .distance((l) => Math.max(70, 190 - l.weight * 34))
        // higher weight → stiffer spring
        .strength((l) => Math.min(0.9, 0.16 * l.weight)),
    )
    .force('charge', forceManyBody().strength(homing ? -380 : -540))
    .force('collide', forceCollide<GraphNode>().radius(34).strength(0.9));

  if (homing) {
    // gravitate each node back to its own origin (holds the shape; a
    // dragged node eases home on release)
    sim
      .force('x', forceX<GraphNode>((n) => n.ox ?? cx).strength(0.09))
      .force('y', forceY<GraphNode>((n) => n.oy ?? cy).strength(0.09));
  } else {
    sim.force('center', forceCenter(cx, cy));
  }

  sim.stop();
  return sim;
}

/** Run the simulation headlessly and return nodes with settled x/y, clamped. */
export function settleCategoryGraph(graph: Graph, opts: LayoutOptions): Graph {
  const { width, height, ticks = 420 } = opts;
  const nodes = graph.nodes.map((n) => ({ ...n }));
  const links = graph.links.map((l) => ({ ...l }));
  const sim = createSimulation(nodes, links, opts);
  sim.tick(ticks);

  const pad = 46;
  for (const n of nodes) {
    n.x = Math.round(Math.max(pad, Math.min(width - pad, n.x ?? width / 2)));
    n.y = Math.round(Math.max(pad, Math.min(height - pad, n.y ?? height / 2)));
  }
  // links still reference node objects after forceLink; normalise back to ids
  const idLinks: GraphLink[] = links.map((l) => ({
    source: typeof l.source === 'string' ? l.source : l.source.id,
    target: typeof l.target === 'string' ? l.target : l.target.id,
    weight: l.weight,
    shared: l.shared,
    strength: l.strength,
    norm: l.norm,
  }));
  return { nodes, links: idLinks };
}
