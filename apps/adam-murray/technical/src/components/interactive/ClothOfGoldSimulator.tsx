import { useEffect, useRef, useState, useMemo, useTransition } from 'react';
import {
  useThemeTokens,
  VizFigure,
  VizSurface,
  Slider,
  Button,
  StatCard,
  Legend,
} from './_viz';

const PLAYER_B = '#ef4444'; // semantic: Player B
const CONTESTED = 'rgba(250, 204, 21, 0.2)'; // semantic: contested territory
const DEATH = '#a855f7'; // semantic: competitive death

type CellState = 0 | 1 | 2; // 0 = empty, 1 = Player A, 2 = Player B
type Grid = CellState[][];
type TerritoryState = 'neutral' | 'playerA' | 'playerB' | 'contested';

const GRID_SIZE = 60;
const CELL_SIZE = 8;
const INFLUENCE_RADIUS = 10;
const TERRITORY_THRESHOLD = 1.0;
const CONTESTED_EPSILON = 1.5;

export default function ClothOfGoldSimulator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [grid, setGrid] = useState<Grid>(() => createEmptyGrid());
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [generation, setGeneration] = useState(0);
  const [recentlyConverted, setRecentlyConverted] = useState<Set<string>>(new Set());
  const animationRef = useRef<number>();
  const lastFrameTimeRef = useRef<number>(0);

  // React 18 concurrent features for performance
  const [, startTransition] = useTransition();
  const [gridVersion, setGridVersion] = useState(0);

  // Influence cache (useRef to avoid re-render cost on cache update)
  const influenceCacheRef = useRef<Map<string, { influenceA: number; influenceB: number }>>(new Map());

  // Resolved design tokens — drive the canvas palette and re-render on theme toggle.
  const tokens = useThemeTokens();

  // Create empty grid
  function createEmptyGrid(): Grid {
    return Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(0));
  }

  // Create random grid
  function createRandomGrid(): Grid {
    const newGrid = createEmptyGrid();
    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        const rand = Math.random();
        if (rand < 0.15) newGrid[i][j] = 1; // Player A
        else if (rand < 0.3) newGrid[i][j] = 2; // Player B
      }
    }
    return newGrid;
  }

  // Create symmetric grid
  function createSymmetricGrid(): Grid {
    const newGrid = createEmptyGrid();
    const midpoint = Math.floor(GRID_SIZE / 2);

    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < midpoint; j++) {
        const rand = Math.random();
        if (rand < 0.2) {
          newGrid[i][j] = 1; // Player A on left
          newGrid[i][GRID_SIZE - 1 - j] = 2; // Player B on right (mirrored)
        }
      }
    }
    return newGrid;
  }

  // Count neighbors by type
  function countNeighbors(grid: Grid, i: number, j: number): { total: number; playerA: number; playerB: number } {
    let total = 0;
    let playerA = 0;
    let playerB = 0;

    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (di === 0 && dj === 0) continue;

        const ni = i + di;
        const nj = j + dj;

        if (ni >= 0 && ni < GRID_SIZE && nj >= 0 && nj < GRID_SIZE) {
          const neighbor = grid[ni][nj];
          if (neighbor === 1) {
            total++;
            playerA++;
          } else if (neighbor === 2) {
            total++;
            playerB++;
          }
        }
      }
    }

    return { total, playerA, playerB };
  }

  // Apply competitive Conway's Game of Life rules (cells can convert ownership)
  function evolveGrid(currentGrid: Grid): { newGrid: Grid; converted: Set<string> } {
    const newGrid = createEmptyGrid();
    const converted = new Set<string>(); // Tracks cells killed by opposing team

    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        const cell = currentGrid[i][j];
        const { total, playerA, playerB } = countNeighbors(currentGrid, i, j);

        // Standard Conway's Game of Life rules

        // Rule 1: Death by isolation (< 2 neighbors)
        if (total < 2) {
          newGrid[i][j] = 0;
          continue;
        }

        // Rule 2: Death by overcrowding (> 3 neighbors)
        if (total > 3) {
          newGrid[i][j] = 0;

          // Track competitive deaths: more enemies than friendlies
          if (cell === 1 && playerB > playerA) {
            converted.add(`${i},${j}`);
          } else if (cell === 2 && playerA > playerB) {
            converted.add(`${i},${j}`);
          }

          continue;
        }

        // At this point: total is 2 or 3

        // Rule 3 & 4: Competitive survival/birth - ownership determined by majority
        // Living cells can CONVERT ownership, empty cells can BIRTH
        if (cell !== 0 || total === 3) {
          if (playerA > playerB) {
            newGrid[i][j] = 1; // Becomes/stays A
          } else if (playerB > playerA) {
            newGrid[i][j] = 2; // Becomes/stays B
          } else {
            // Tie: living cells keep current state, empty cells stay empty
            newGrid[i][j] = cell;
          }
        }
        // Otherwise: living cell with 2 neighbors but tied (stays empty by default)
      }
    }

    return { newGrid, converted };
  }

  // Calculate metaball influence for a player
  // Optimized: Only check cells within INFLUENCE_RADIUS
  function calculateInfluence(grid: Grid, i: number, j: number, player: 1 | 2): number {
    let influence = 0;
    const R = INFLUENCE_RADIUS;
    const R2 = R * R;

    // Bound search to cells within radius (optimization: O(n²) → O(R²))
    const minI = Math.max(0, i - R);
    const maxI = Math.min(GRID_SIZE - 1, i + R);
    const minJ = Math.max(0, j - R);
    const maxJ = Math.min(GRID_SIZE - 1, j + R);

    for (let ci = minI; ci <= maxI; ci++) {
      for (let cj = minJ; cj <= maxJ; cj++) {
        if (grid[ci][cj] === player) {
          const dx = i - ci;
          const dy = j - cj;
          const dist2 = dx * dx + dy * dy;

          // Skip cells outside circular radius
          if (dist2 <= R2) {
            influence += Math.max(0, 1 - dist2 / R2);
          }
        }
      }
    }

    return influence;
  }

  // Pre-compute influence maps when grid changes (React 18 concurrent rendering)
  useEffect(() => {
    startTransition(() => {
      const newCache = new Map<string, { influenceA: number; influenceB: number }>();

      for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
          const key = `${i},${j}`;
          newCache.set(key, {
            influenceA: calculateInfluence(grid, i, j, 1),
            influenceB: calculateInfluence(grid, i, j, 2),
          });
        }
      }

      influenceCacheRef.current = newCache;
      setGridVersion(v => v + 1); // Trigger re-render with new cache
    });
  }, [grid]);

  // Get territory state for a cell (optimized with cache lookup)
  function getTerritoryState(i: number, j: number): TerritoryState {
    const cached = influenceCacheRef.current.get(`${i},${j}`);
    const influenceA = cached?.influenceA ?? 0;
    const influenceB = cached?.influenceB ?? 0;

    if (influenceA > TERRITORY_THRESHOLD && influenceB > TERRITORY_THRESHOLD) {
      if (Math.abs(influenceA - influenceB) < CONTESTED_EPSILON) {
        return 'contested';
      }
    }

    if (influenceA > TERRITORY_THRESHOLD && influenceA > influenceB) {
      return 'playerA';
    }

    if (influenceB > TERRITORY_THRESHOLD && influenceB > influenceA) {
      return 'playerB';
    }

    return 'neutral';
  }

  // Render canvas when grid or cache changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas can't consume CSS vars, so use the resolved tokens (Player A = brand accent).
    const accent = tokens.accent;

    const width = GRID_SIZE * CELL_SIZE;
    const height = GRID_SIZE * CELL_SIZE;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw territory underlay
    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        const territory = getTerritoryState(i, j);

        switch (territory) {
          case 'playerA':
            ctx.fillStyle = 'color-mix(in oklch, ' + accent + ' 15%, transparent)'; // accent
            break;
          case 'playerB':
            ctx.fillStyle = 'rgba(239, 68, 68, 0.15)'; // red
            break;
          case 'contested':
            ctx.fillStyle = CONTESTED; // yellow
            break;
          default:
            ctx.fillStyle = 'rgba(255, 255, 255, 0)'; // transparent
        }

        ctx.fillRect(j * CELL_SIZE, i * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }

    // Draw grid lines (token hairline)
    ctx.strokeStyle = tokens.rule;
    ctx.lineWidth = 1;

    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE);
      ctx.lineTo(width, i * CELL_SIZE);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE, 0);
      ctx.lineTo(i * CELL_SIZE, height);
      ctx.stroke();
    }

    // Draw cells
    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        const cell = grid[i][j];

        if (cell === 1) {
          ctx.fillStyle = accent; // accent - Player A
          ctx.beginPath();
          ctx.arc(
            j * CELL_SIZE + CELL_SIZE / 2,
            i * CELL_SIZE + CELL_SIZE / 2,
            CELL_SIZE / 3,
            0,
            2 * Math.PI
          );
          ctx.fill();
        } else if (cell === 2) {
          ctx.fillStyle = PLAYER_B; // red - Player B
          ctx.beginPath();
          ctx.arc(
            j * CELL_SIZE + CELL_SIZE / 2,
            i * CELL_SIZE + CELL_SIZE / 2,
            CELL_SIZE / 3,
            0,
            2 * Math.PI
          );
          ctx.fill();
        }
      }
    }

    // Draw purple dots for cells that died while outnumbered by opposing team
    for (const key of recentlyConverted) {
      const [i, j] = key.split(',').map(Number);

      ctx.fillStyle = DEATH; // purple
      ctx.beginPath();
      ctx.arc(
        j * CELL_SIZE + CELL_SIZE / 2,
        i * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE / 4, // smaller than regular cells
        0,
        2 * Math.PI
      );
      ctx.fill();
    }
  }, [grid, recentlyConverted, gridVersion, tokens]); // re-render on grid/cache/theme change

  // Animation loop
  useEffect(() => {
    if (!isRunning) return;

    const animate = (timestamp: number) => {
      if (!lastFrameTimeRef.current) {
        lastFrameTimeRef.current = timestamp;
      }

      const elapsed = timestamp - lastFrameTimeRef.current;
      const frameInterval = 1000 / speed;

      if (elapsed >= frameInterval) {
        setGrid(prevGrid => {
          const { newGrid, converted } = evolveGrid(prevGrid);
          setRecentlyConverted(converted);
          return newGrid;
        });
        setGeneration(prev => prev + 1);
        lastFrameTimeRef.current = timestamp;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRunning, speed]);

  // Handle cell click
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || isRunning) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const j = Math.floor(x / CELL_SIZE);
    const i = Math.floor(y / CELL_SIZE);

    if (i >= 0 && i < GRID_SIZE && j >= 0 && j < GRID_SIZE) {
      setGrid(prevGrid => {
        const newGrid = prevGrid.map(row => [...row]);
        // Cycle: 0 -> 1 -> 2 -> 0
        newGrid[i][j] = ((newGrid[i][j] + 1) % 3) as CellState;
        return newGrid;
      });
    }
  };

  // Count populations
  const populations = grid.flat().reduce((acc, cell) => {
    if (cell === 1) acc.playerA++;
    if (cell === 2) acc.playerB++;
    return acc;
  }, { playerA: 0, playerB: 0 });

  // Count territory (memoized for performance)
  const territory = useMemo(() => {
    const result = { playerA: 0, playerB: 0 };
    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        const territoryState = getTerritoryState(i, j);
        if (territoryState === 'playerA') result.playerA++;
        if (territoryState === 'playerB') result.playerB++;
      }
    }
    return result;
  }, [gridVersion]); // Only recalculate when cache updates

  const reset = (next: Grid) => {
    setIsRunning(false);
    setGrid(next);
    setGeneration(0);
    setRecentlyConverted(new Set());
    lastFrameTimeRef.current = 0;
  };

  return (
    <VizFigure
      footer={
        <Legend
          items={[
            { color: tokens.accent, label: 'Player A — cells & territory' },
            { color: PLAYER_B, label: 'Player B — cells & territory' },
            { color: 'rgba(202,138,4,0.7)', label: 'Contested territory' },
            { color: DEATH, label: 'Competitive death' },
          ]}
        />
      }
    >
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Button onClick={() => setIsRunning(!isRunning)}>{isRunning ? 'Pause' : 'Start'}</Button>
        <Button variant="secondary" onClick={() => reset(createEmptyGrid())}>
          Reset
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" onClick={() => reset(createEmptyGrid())}>
          Empty
        </Button>
        <Button variant="ghost" onClick={() => reset(createRandomGrid())}>
          Random
        </Button>
        <Button variant="ghost" onClick={() => reset(createSymmetricGrid())}>
          Symmetric
        </Button>
      </div>

      <div className="mb-6">
        <Slider
          label="Speed"
          value={speed}
          min={1}
          max={60}
          display={`${speed} gen/sec`}
          onChange={setSpeed}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Generation" value={generation} />
        <StatCard
          label="Player A"
          tone="accent"
          value={
            <>
              {populations.playerA}
              <div className="viz-stat-sub">Territory {territory.playerA}</div>
            </>
          }
        />
        <StatCard
          label="Player B"
          valueColor={PLAYER_B}
          value={
            <>
              {populations.playerB}
              <div className="viz-stat-sub">Territory {territory.playerB}</div>
            </>
          }
        />
      </div>

      <VizSurface>
        <canvas
          ref={canvasRef}
          width={GRID_SIZE * CELL_SIZE}
          height={GRID_SIZE * CELL_SIZE}
          onClick={handleCanvasClick}
          style={{ imageRendering: 'pixelated', cursor: 'pointer' }}
        />
        {!isRunning && (
          <p className="text-center text-sm mt-3" style={{ color: 'var(--muted)' }}>
            Click cells to cycle: empty → Player A → Player B
          </p>
        )}
      </VizSurface>
    </VizFigure>
  );
}
