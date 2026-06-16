import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Simulation } from 'd3-force';
import { useThemeTokens } from './_viz';
import {
  createSimulation,
  type GraphNode,
  type GraphLink,
} from '../../lib/category-graph';

/**
 * CategoryGraph — a force-directed graph of the posts, linked where they
 * share arXiv categories (edge weight = number shared). Articles are nodes
 * (each an <a> to its post); drag to rearrange, hover/focus to light up a
 * post's neighbourhood. The layout arrives pre-settled from the server (so
 * there is no hydration jump and a real graph shows with JS off); on the
 * client d3-force keeps it live, then quiesces to rest.
 */

interface Props {
  readonly nodes: GraphNode[];
  readonly links: GraphLink[];
  readonly width: number;
  readonly height: number;
  /** tight crop around the settled nodes; defaults to the full canvas */
  readonly view?: { x: number; y: number; w: number; h: number };
}

const linkEnds = (l: GraphLink): [string, string] => [
  typeof l.source === 'string' ? l.source : l.source.id,
  typeof l.target === 'string' ? l.target : l.target.id,
];

function buildNeighbors(links: GraphLink[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const l of links) {
    const [s, t] = linkEnds(l);
    if (!m.has(s)) m.set(s, new Set());
    if (!m.has(t)) m.set(t, new Set());
    m.get(s)!.add(t);
    m.get(t)!.add(s);
  }
  return m;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

const nodeRadius = (n: GraphNode) => 5.5 + n.degree * 0.7;

// edge thickness spans this range across the normalized strength [0,1]
const EDGE_MIN_W = 1.2;
const EDGE_MAX_W = 5.5;

export default function CategoryGraph({
  nodes: initialNodes,
  links,
  width,
  height,
  view,
}: Props) {
  const t = useThemeTokens();
  const reduced = usePrefersReducedMotion();

  // working nodes mutated in place by d3; positions mirrored to state via tick
  const nodesRef = useRef<GraphNode[]>(initialNodes.map((n) => ({ ...n })));
  const simRef = useRef<Simulation<GraphNode, undefined> | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);

  const [, force] = useState(0);
  const rerender = useCallback(() => force((v) => v + 1), []);
  const [hovered, setHovered] = useState<string | null>(null);

  const neighbors = useMemo(() => buildNeighbors(links), [links]);

  // fixed home positions (the server-settled layout) each node gravitates to
  const originById = useMemo(
    () => new Map(initialNodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }])),
    [initialNodes],
  );

  useEffect(() => {
    if (reduced) return; // honour reduced-motion: keep the settled layout static
    nodesRef.current.forEach((n) => {
      const o = originById.get(n.id);
      if (o) {
        n.ox = o.x;
        n.oy = o.y;
      }
    });
    const sim = createSimulation(
      nodesRef.current,
      links.map((l) => ({ ...l })),
      { width, height, homing: true },
    );
    sim.on('tick', rerender);
    sim.alpha(0.4).restart();
    simRef.current = sim;
    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [links, width, height, reduced, rerender, originById]);

  const clientToSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent, node: GraphNode) => {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      dragRef.current = { id: node.id, moved: false };
      const { x, y } = clientToSvg(e.clientX, e.clientY);
      node.fx = x;
      node.fy = y;
      const sim = simRef.current;
      if (sim) sim.alphaTarget(0.2).restart();
    },
    [clientToSvg],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent, node: GraphNode) => {
      if (!dragRef.current || dragRef.current.id !== node.id) return;
      dragRef.current.moved = true;
      const { x, y } = clientToSvg(e.clientX, e.clientY);
      node.fx = x;
      node.fy = y;
      if (reduced) {
        node.x = x;
        node.y = y;
        rerender();
      }
    },
    [clientToSvg, reduced, rerender],
  );

  const onPointerUp = useCallback((e: ReactPointerEvent, node: GraphNode) => {
    const sim = simRef.current;
    if (sim) {
      node.fx = null;
      node.fy = null;
      sim.alphaTarget(0);
    }
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be gone */
    }
  }, []);

  const onClick = useCallback((e: React.MouseEvent) => {
    // suppress navigation when the pointer-down turned into a drag
    if (dragRef.current?.moved) e.preventDefault();
    dragRef.current = null;
  }, []);

  const pos = new Map(nodesRef.current.map((n) => [n.id, n]));

  return (
    <div className="category-graph" style={{ margin: '0 0 1rem' }}>
      <svg
        ref={svgRef}
        viewBox={
          view ? `${view.x} ${view.y} ${view.w} ${view.h}` : `0 0 ${width} ${height}`
        }
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Graph of posts linked by shared arXiv categories"
        style={{
          display: 'block',
          height: 'clamp(300px, 44vh, 460px)',
          width: 'auto',
          maxWidth: '100%',
          margin: '0 auto',
          overflow: 'visible',
          touchAction: 'none',
        }}
      >
          {/* edges */}
          <g>
            {links.map((l, i) => {
              const [s, t2] = linkEnds(l);
              const a = pos.get(s);
              const b = pos.get(t2);
              if (!a || !b) return null;
              const incident = hovered === s || hovered === t2;
              // thickness encodes strength (continuous, normalized); colour
              // carries only hover state. No opacity.
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={incident ? t.accent : t.ruleStrong}
                  strokeWidth={EDGE_MIN_W + (l.norm ?? 0) * (EDGE_MAX_W - EDGE_MIN_W)}
                  strokeLinecap="round"
                  style={{ transition: 'stroke .18s' }}
                />
              );
            })}
          </g>

          {/* nodes */}
          <g>
            {nodesRef.current.map((n) => {
              const r = nodeRadius(n);
              const active = hovered === n.id;
              const neighbor =
                hovered != null &&
                (neighbors.get(hovered)?.has(n.id) ?? false);
              const highlight = active || neighbor;
              return (
                <a
                  key={n.id}
                  href={n.href}
                  aria-label={n.title}
                  onClick={onClick}
                  onPointerDown={(e) => onPointerDown(e, n)}
                  onPointerMove={(e) => onPointerMove(e, n)}
                  onPointerUp={(e) => onPointerUp(e, n)}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered((h) => (h === n.id ? null : h))}
                  onFocus={() => setHovered(n.id)}
                  onBlur={() => setHovered((h) => (h === n.id ? null : h))}
                  style={{ cursor: 'pointer', outline: 'none' }}
                >
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={r + 5}
                    fill="transparent"
                    stroke={highlight ? t.accent : 'transparent'}
                    strokeWidth={1.4}
                    style={{ transition: 'stroke .18s' }}
                  />
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={r}
                    fill={active ? t.accent : t.ink}
                    style={{ transition: 'fill .18s' }}
                  />
                  <text
                    x={n.x}
                    y={(n.y ?? 0) + r + 13}
                    textAnchor="middle"
                    fill={t.muted}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '9.5px',
                      letterSpacing: '0.04em',
                      paintOrder: 'stroke',
                      stroke: t.paper,
                      strokeWidth: 3,
                      strokeLinejoin: 'round',
                      pointerEvents: 'none',
                    }}
                  >
                    {n.dateLabel}
                  </text>
                </a>
              );
            })}
          </g>

          {/* hovered title (drawn last so it sits above everything) */}
          {hovered != null &&
            (() => {
              const n = pos.get(hovered);
              if (!n) return null;
              const r = nodeRadius(n);
              const top = (n.y ?? 0) - r - 12 > 16;
              return (
                <text
                  x={n.x}
                  y={top ? (n.y ?? 0) - r - 12 : (n.y ?? 0) + r + 28}
                  textAnchor="middle"
                  fill={t.ink}
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: '13px',
                    fontWeight: 600,
                    paintOrder: 'stroke',
                    stroke: t.paper,
                    strokeWidth: 4.5,
                    strokeLinejoin: 'round',
                    pointerEvents: 'none',
                  }}
                >
                  {n.title}
                </text>
              );
            })()}
        </svg>
    </div>
  );
}
