import { useEffect, useRef, useState, useCallback, useMemo, useTransition } from 'react';

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
  const [isPending, startTransition] = useTransition();
  const [gridVersion, setGridVersion] = useState(0);

  // Influence cache (useRef to avoid re-render cost on cache update)
  const influenceCacheRef = useRef<Map<string, { influenceA: number; influenceB: number }>>(new Map());

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
            ctx.fillStyle = 'rgba(59, 130, 246, 0.15)'; // blue
            break;
          case 'playerB':
            ctx.fillStyle = 'rgba(239, 68, 68, 0.15)'; // red
            break;
          case 'contested':
            ctx.fillStyle = 'rgba(250, 204, 21, 0.2)'; // yellow
            break;
          default:
            ctx.fillStyle = 'rgba(255, 255, 255, 0)'; // transparent
        }

        ctx.fillRect(j * CELL_SIZE, i * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }

    // Draw grid lines
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.3)';
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
          ctx.fillStyle = '#3b82f6'; // blue - Player A
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
          ctx.fillStyle = '#ef4444'; // red - Player B
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

      ctx.fillStyle = '#a855f7'; // purple
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
  }, [grid, recentlyConverted, gridVersion]); // Render when grid or cache updates

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

  return (
    <div className="my-8 p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
      {/* Controls */}
      <div className="flex flex-col gap-4 mb-6">
        {/* Primary controls */}
        <div className="flex gap-3">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            {isRunning ? 'Pause' : 'Start'}
          </button>

          <button
            onClick={() => {
              setIsRunning(false);
              setGrid(createEmptyGrid());
              setGeneration(0);
              setRecentlyConverted(new Set());
              lastFrameTimeRef.current = 0;
            }}
            className="px-6 py-2 bg-slate-600 hover:bg-slate-700 text-white font-semibold rounded-lg transition-colors"
          >
            Reset
          </button>

          <div className="flex-1"></div>

          {/* Preset buttons */}
          <button
            onClick={() => {
              setIsRunning(false);
              setGrid(createEmptyGrid());
              setGeneration(0);
              setRecentlyConverted(new Set());
            }}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 font-medium rounded-lg transition-colors"
          >
            Empty
          </button>

          <button
            onClick={() => {
              setIsRunning(false);
              setGrid(createRandomGrid());
              setGeneration(0);
              setRecentlyConverted(new Set());
            }}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 font-medium rounded-lg transition-colors"
          >
            Random
          </button>

          <button
            onClick={() => {
              setIsRunning(false);
              setGrid(createSymmetricGrid());
              setGeneration(0);
              setRecentlyConverted(new Set());
            }}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 font-medium rounded-lg transition-colors"
          >
            Symmetric
          </button>
        </div>

        {/* Speed control */}
        <div className="flex items-center gap-4">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 min-w-[60px]">
            Speed:
          </label>
          <input
            type="range"
            min="1"
            max="60"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <span className="text-sm font-mono text-slate-600 dark:text-slate-400 min-w-[80px]">
            {speed} gen/sec
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-300 dark:border-slate-600">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Generation</div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{generation}</div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-300 dark:border-slate-600">
          <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">Player A</div>
          <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{populations.playerA}</div>
          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">Territory: {territory.playerA}</div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-300 dark:border-slate-600">
          <div className="text-xs text-red-600 dark:text-red-400 mb-1">Player B</div>
          <div className="text-xl font-bold text-red-600 dark:text-red-400">{populations.playerB}</div>
          <div className="text-xs text-red-600 dark:text-red-400 mt-1">Territory: {territory.playerB}</div>
        </div>
      </div>

      {/* Canvas */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-300 dark:border-slate-600 shadow-sm">
        <canvas
          ref={canvasRef}
          width={GRID_SIZE * CELL_SIZE}
          height={GRID_SIZE * CELL_SIZE}
          onClick={handleCanvasClick}
          className="cursor-pointer mx-auto block"
          style={{ imageRendering: 'pixelated' }}
        />

        {!isRunning && (
          <p className="text-center text-sm text-slate-600 dark:text-slate-400 mt-3">
            Click cells to cycle: Empty → Player A (blue) → Player B (red)
          </p>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 text-sm text-slate-600 dark:text-slate-400">
        <p><strong>Territory colors (background):</strong></p>
        <div className="flex gap-4 mt-2 flex-wrap">
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)' }}></span>
            Player A territory
          </span>
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)' }}></span>
            Player B territory
          </span>
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(250, 204, 21, 0.2)' }}></span>
            Contested
          </span>
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-purple-500 opacity-70"></span>
            Competitive death
          </span>
        </div>
      </div>
    </div>
  );
}
