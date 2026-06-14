import { useEffect, useState, useMemo } from 'react';
import * as Plot from '@observablehq/plot';
import {
  useThemeTokens,
  basePlot,
  PlotFigure,
  VizFigure,
  VizSurface,
  Slider,
  Select,
  Button,
} from './_viz';

// Adduct library organized by ionization mode and method
const ADDUCT_LIBRARY = {
  positive: {
    ESI: [
      { symbol: 'H⁺', name: 'Proton', mass: 1.008 },
      { symbol: 'Na⁺', name: 'Sodium', mass: 22.990 },
      { symbol: 'K⁺', name: 'Potassium', mass: 38.964 },
      { symbol: 'NH₄⁺', name: 'Ammonium', mass: 18.034 },
    ],
    APCI: [
      { symbol: 'H⁺', name: 'Proton', mass: 1.008 },
      { symbol: 'H⁺+H₂O', name: 'Proton + Water', mass: 19.018 },
    ],
    MALDI: [
      { symbol: 'H⁺', name: 'Proton', mass: 1.008 },
      { symbol: 'Na⁺', name: 'Sodium', mass: 22.990 },
      { symbol: 'K⁺', name: 'Potassium', mass: 38.964 },
    ],
    'ESI-Orbitrap': [
      { symbol: 'H⁺', name: 'Proton', mass: 1.008 },
      { symbol: 'Na⁺', name: 'Sodium', mass: 22.990 },
      { symbol: 'K⁺', name: 'Potassium', mass: 38.964 },
      { symbol: 'NH₄⁺', name: 'Ammonium', mass: 18.034 },
      { symbol: 'ACN+H⁺', name: 'Acetonitrile', mass: 42.034 },
    ],
  },
  negative: {
    ESI: [
      { symbol: 'H⁻', name: 'Deprotonation', mass: -1.008 },
      { symbol: 'Cl⁻', name: 'Chloride', mass: 34.969 },
      { symbol: 'HCOO⁻', name: 'Formate', mass: 44.998 },
      { symbol: 'CH₃COO⁻', name: 'Acetate', mass: 59.013 },
    ],
    APCI: [
      { symbol: 'H⁻', name: 'Deprotonation', mass: -1.008 },
      { symbol: 'Cl⁻', name: 'Chloride', mass: 34.969 },
    ],
  },
};

// Categorical palette (no red — red is reserved for overlaps)
const ADDUCT_COLORS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b',
  '#06b6d4', '#6366f1', '#14b8a6', '#a855f7',
];

type Adduct = {
  symbol: string;
  name: string;
  mass: number;
};

type Interval = {
  peptideIndex: number;
  adduct: Adduct;
  lower: number;
  upper: number;
  mass: number;
};

export default function AdductIntervalsVisualizer() {
  const [mode, setMode] = useState<'positive' | 'negative'>('positive');
  const [method, setMethod] = useState<string>('ESI');
  const [L, setL] = useState(100);
  const [U, setU] = useState(1000);
  const [T, setT] = useState(0.5);
  const [activeAdducts, setActiveAdducts] = useState<Adduct[]>([]);
  const [customAdducts, setCustomAdducts] = useState<Adduct[]>([]);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customMass, setCustomMass] = useState('');

  const tokens = useThemeTokens();

  // Initialize active adducts when mode or method changes
  useEffect(() => {
    const adducts = ADDUCT_LIBRARY[mode][method as keyof typeof ADDUCT_LIBRARY['positive' | 'negative']] || [];
    setActiveAdducts([...adducts]);
  }, [mode, method]);

  // Helper: Compute forbidden zones for a candidate position
  const computeForbiddenZones = (
    placedMasses: number[],
    adductMasses: number[],
    halfWidth: number
  ): Array<[number, number]> => {
    const zones: Array<[number, number]> = [];

    // For each placed mass and all adduct pairs, compute forbidden zone
    for (const m_ell of placedMasses) {
      for (const aj of adductMasses) {
        for (const aj_prime of adductMasses) {
          // Forbidden zone: [m_ell + a_j' - a_j - 2T, m_ell + a_j' - a_j + 2T]
          const center = m_ell + aj_prime - aj;
          const lower = center - 2 * halfWidth;
          const upper = center + 2 * halfWidth;
          zones.push([lower, upper]);
        }
      }
    }

    return zones;
  };

  // Helper: Merge overlapping intervals
  const mergeIntervals = (intervals: Array<[number, number]>): Array<[number, number]> => {
    if (intervals.length === 0) return [];

    // Sort by lower bound
    const sorted = intervals.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const lastMerged = merged[merged.length - 1];

      // If current overlaps or touches last merged, extend it
      if (current[0] <= lastMerged[1]) {
        lastMerged[1] = Math.max(lastMerged[1], current[1]);
      } else {
        merged.push(current);
      }
    }

    return merged;
  };

  // Helper: Find next valid position given forbidden zones
  const findNextValidPosition = (
    minPos: number,
    forbiddenZones: Array<[number, number]>,
    maxPos: number
  ): number | null => {
    const EPSILON = 1e-9; // Small tolerance for floating point

    // Merge overlapping forbidden zones
    const merged = mergeIntervals(forbiddenZones);

    let candidate = minPos;

    // Check each forbidden zone
    for (const [lower, upper] of merged) {
      // If candidate is before this forbidden zone, we're done
      if (candidate < lower - EPSILON) {
        break;
      }

      // If candidate is inside this forbidden zone, jump past it
      if (candidate >= lower - EPSILON && candidate <= upper + EPSILON) {
        candidate = upper + EPSILON;
      }
    }

    // Check if candidate exceeds maximum position
    if (candidate > maxPos) {
      return null;
    }

    return candidate;
  };

  // Compute intervals using greedy algorithm (memoized for performance)
  const { intervals, overlaps, n, delta, kappa } = useMemo(() => {
    if (activeAdducts.length === 0) {
      return { intervals: [], overlaps: new Set(), n: 0, delta: 0, kappa: 0 };
    }

    // Sort adducts by mass
    const sortedAdducts = [...activeAdducts].sort((a, b) => a.mass - b.mass);
    const a1 = sortedAdducts[0].mass;
    const ak = sortedAdducts[sortedAdducts.length - 1].mass;
    const adductMasses = sortedAdducts.map(a => a.mass);

    // Calculate spacing
    const delta = 2 * T;

    // Validity check 1: Range must be large enough (Section 2.3)
    if (U - L <= ak - a1 + 2 * T) {
      return { intervals: [], overlaps: new Set(), n: 0, delta, kappa: 0 };
    }

    // Validity check 2: Adducts must be well-separated (Section 2.1)
    for (let i = 0; i < sortedAdducts.length - 1; i++) {
      if (sortedAdducts[i + 1].mass - sortedAdducts[i].mass <= 2 * T) {
        return { intervals: [], overlaps: new Set(), n: 0, delta, kappa: 0 };
      }
    }

    // Greedy algorithm: place masses at earliest valid positions
    const masses: number[] = [];

    // Initialize first mass: m_0 = L + T - a_1
    let currentMass = L + T - a1;

    // Check if first mass fits
    if (currentMass + ak + T > U) {
      return { intervals: [], overlaps: new Set(), n: 0, delta, kappa: 0 };
    }

    masses.push(currentMass);

    // Place subsequent masses greedily
    const MAX_ITERATIONS = 10000; // Safety limit
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      // Compute forbidden zones based on all previously placed masses
      const forbiddenZones = computeForbiddenZones(masses, adductMasses, T);

      // Find next valid position (at least 2T away from previous mass)
      const minNextPos = masses[masses.length - 1] + 2 * T;
      const maxNextPos = U - ak - T; // Ensure all adduct intervals fit

      const nextMass = findNextValidPosition(minNextPos, forbiddenZones, maxNextPos);

      // If no valid position found, terminate
      if (nextMass === null || nextMass + ak + T > U) {
        break;
      }

      masses.push(nextMass);
    }

    const n = masses.length;

    // Generate intervals
    const intervals: Interval[] = [];
    masses.forEach((m, i) => {
      sortedAdducts.forEach(adduct => {
        intervals.push({
          peptideIndex: i,
          adduct,
          lower: m + adduct.mass - T,
          upper: m + adduct.mass + T,
          mass: m,
        });
      });
    });

    // No overlap detection needed - greedy algorithm guarantees no overlaps
    const overlaps = new Set<string>();

    // Calculate kappa (for reference, not used in greedy algorithm)
    const kappa = Math.ceil((ak - a1) / delta + 1);

    return { intervals, overlaps, n, delta, kappa };
  }, [L, U, T, activeAdducts]); // Memoize based on input parameters

  // Memoize row packing computation
  const { intervalToRow, totalRows } = useMemo(() => {
    if (intervals.length === 0) {
      return { intervalsByPeptide: {}, intervalToRow: new Map(), totalRows: 0 };
    }

    const EPSILON = 1e-6;

    // Group intervals by peptide index
    const intervalsByPeptide: { [key: number]: Interval[] } = {};
    intervals.forEach(int => {
      if (!intervalsByPeptide[int.peptideIndex]) {
        intervalsByPeptide[int.peptideIndex] = [];
      }
      intervalsByPeptide[int.peptideIndex].push(int);
    });

    // Track which intervals are on each row and their bounding boxes
    const rowIntervals: Interval[][] = [];
    const rowBoundingBoxes: Array<Array<{ lower: number; upper: number }>> = [];
    const intervalToRow = new Map<Interval, number>();

    // Helper: get bounding box for an interval set (continuous span from leftmost to rightmost)
    const getBoundingBox = (intervalSet: Interval[]): { lower: number; upper: number } => {
      const lower = Math.min(...intervalSet.map(int => int.lower));
      const upper = Math.max(...intervalSet.map(int => int.upper));
      return { lower, upper };
    };

    // Helper: check if two bounding boxes overlap
    const boundingBoxesOverlap = (
      box1: { lower: number; upper: number },
      box2: { lower: number; upper: number }
    ): boolean => {
      return box1.upper > box2.lower + EPSILON && box1.lower < box2.upper - EPSILON;
    };

    // Helper: check if an interval set's bounding box can fit on a row
    const canFitOnRow = (intervalSet: Interval[], rowBoundingBoxes: Array<{ lower: number; upper: number }>): boolean => {
      const boundingBox = getBoundingBox(intervalSet);
      return rowBoundingBoxes.every(otherBox => !boundingBoxesOverlap(boundingBox, otherBox));
    };

    // Pack interval sets into rows (greedy first-fit using bounding boxes)
    for (let peptideIdx = 0; peptideIdx < n; peptideIdx++) {
      const intervalSet = intervalsByPeptide[peptideIdx];
      const boundingBox = getBoundingBox(intervalSet);

      // Try to place on existing rows (starting from row 0 = lowest/closest to x-axis)
      let placed = false;
      for (let rowIdx = 0; rowIdx < rowIntervals.length; rowIdx++) {
        if (canFitOnRow(intervalSet, rowBoundingBoxes[rowIdx])) {
          // Place all intervals of this peptide on this row
          rowIntervals[rowIdx].push(...intervalSet);
          rowBoundingBoxes[rowIdx].push(boundingBox);
          intervalSet.forEach(int => intervalToRow.set(int, rowIdx));
          placed = true;
          break;
        }
      }

      // If couldn't fit on any existing row, create a new row
      if (!placed) {
        const newRowIdx = rowIntervals.length;
        rowIntervals.push([...intervalSet]);
        rowBoundingBoxes.push([boundingBox]);
        intervalSet.forEach(int => intervalToRow.set(int, newRowIdx));
      }
    }

    const totalRows = rowIntervals.length;

    return { intervalsByPeptide, intervalToRow, totalRows };
  }, [intervals, n]); // Memoize based on intervals

  // Plot spec — interval rectangles packed into rows, bare-mass ticks beneath.
  const options = useMemo(() => {
    if (intervals.length === 0) return null;

    const rectData = intervals.map((int) => {
      const row = intervalToRow.get(int) ?? 0;
      return {
        lower: int.lower,
        upper: int.upper,
        y0: row,
        y1: row + 0.82,
        symbol: int.adduct.symbol,
        mass: int.mass,
        peptide: int.peptideIndex,
        row,
      };
    });
    const uniqueMasses = Array.from(new Set(intervals.map((int) => int.mass)));

    return basePlot(tokens, {
      width: 880,
      height: Math.max(170, totalRows * 26 + 96),
      marginLeft: 52,
      marginRight: 24,
      marginBottom: 46,
      marginTop: 12,
      x: { label: 'm/z (Da) →', nice: true },
      y: { axis: null, domain: [-0.6, totalRows] },
      color: { domain: activeAdducts.map((a) => a.symbol), range: ADDUCT_COLORS, legend: true },
      marks: [
        Plot.rect(rectData, {
          x1: 'lower',
          x2: 'upper',
          y1: 'y0',
          y2: 'y1',
          fill: 'symbol',
          fillOpacity: 0.78,
          rx: 1,
          tip: true,
          title: (d: { peptide: number; symbol: string; lower: number; upper: number }) =>
            `m${d.peptide} · ${d.symbol}\n[${d.lower.toFixed(3)}, ${d.upper.toFixed(3)}] Da`,
        }),
        Plot.ruleX(uniqueMasses, {
          x: (d: number) => d,
          y1: -0.5,
          y2: 0.1,
          stroke: tokens.inkSoft,
          strokeWidth: 0.7,
        }),
      ],
    });
  }, [intervals, intervalToRow, totalRows, activeAdducts, tokens]);

  const toggleAdduct = (adduct: Adduct) => {
    setActiveAdducts(prev =>
      prev.find(a => a.symbol === adduct.symbol)
        ? prev.filter(a => a.symbol !== adduct.symbol)
        : [...prev, adduct]
    );
  };

  const addCustomAdduct = () => {
    if (customName && customMass) {
      const newAdduct: Adduct = {
        symbol: customName,
        name: customName,
        mass: parseFloat(customMass),
      };
      setCustomAdducts(prev => [...prev, newAdduct]);
      setActiveAdducts(prev => [...prev, newAdduct]);
      setCustomName('');
      setCustomMass('');
      setShowCustomForm(false);
    }
  };

  const isValid = overlaps.size === 0;

  const availableAdducts = ADDUCT_LIBRARY[mode][method as keyof typeof ADDUCT_LIBRARY['positive' | 'negative']] || [];

  const renderAdductCheck = (adduct: Adduct) => (
    <label key={adduct.symbol} className="viz-check">
      <input
        type="checkbox"
        checked={activeAdducts.some((a) => a.symbol === adduct.symbol)}
        onChange={() => toggleAdduct(adduct)}
      />
      <span className="viz-check-sym">{adduct.symbol}</span>
      <span className="viz-check-mass">({adduct.mass.toFixed(3)} Da)</span>
    </label>
  );

  return (
    <VizFigure
      title="Adduct Interval Visualization"
      description="Greedy placement of peptide masses so every adduct interval stays separated. Each row is one peptide; coloured bars are its adduct m/z windows; ticks beneath mark the bare masses."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Left column: mode / method / adducts */}
        <div className="flex flex-col gap-4">
          <Select
            label="Ionization mode"
            value={mode}
            onChange={(v) => setMode(v as 'positive' | 'negative')}
            options={[
              { value: 'positive', label: 'Positive ion mode' },
              { value: 'negative', label: 'Negative ion mode' },
            ]}
          />
          <Select
            label="Ionization method"
            value={method}
            onChange={setMethod}
            options={Object.keys(ADDUCT_LIBRARY[mode]).map((m) => ({ value: m, label: m }))}
          />

          <div className="viz-control">
            <span className="viz-label">Active adducts</span>
            <div className="viz-panel viz-check-list">
              {availableAdducts.map(renderAdductCheck)}
              {customAdducts.map(renderAdductCheck)}
            </div>

            {!showCustomForm ? (
              <button type="button" className="viz-link-btn" onClick={() => setShowCustomForm(true)}>
                + Add custom adduct
              </button>
            ) : (
              <div className="viz-panel flex flex-col gap-2" style={{ background: 'var(--surface-2)' }}>
                <input
                  className="viz-input"
                  type="text"
                  placeholder="Name (e.g. Ca²⁺)"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
                <input
                  className="viz-input"
                  type="number"
                  step="0.001"
                  placeholder="Mass (Da)"
                  value={customMass}
                  onChange={(e) => setCustomMass(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button onClick={addCustomAdduct}>Add</Button>
                  <Button variant="ghost" onClick={() => setShowCustomForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column: range / resolution / read-out */}
        <div className="flex flex-col gap-4">
          <Slider
            label="Lower bound (L)"
            value={L}
            min={50}
            max={500}
            step={10}
            display={`${L} Da`}
            onChange={setL}
          />
          <Slider
            label="Upper bound (U)"
            value={U}
            min={500}
            max={2000}
            step={50}
            display={`${U} Da`}
            onChange={setU}
          />
          <Slider
            label="Resolution (T)"
            value={T}
            min={0.25}
            max={2}
            step={0.01}
            display={`${T.toFixed(2)} Da`}
            onChange={setT}
          />

          <div className="viz-panel">
            <div className="viz-label" style={{ marginBottom: '0.4rem' }}>
              Computed parameters
            </div>
            <div className="viz-readout">
              <span className="viz-readout-key">Number of peptides (n)</span>
              <span className="viz-readout-val">{n}</span>
            </div>
            <div className="viz-readout">
              <span className="viz-readout-key">Spacing (δ)</span>
              <span className="viz-readout-val">{delta.toFixed(3)} Da</span>
            </div>
            <div className="viz-readout">
              <span className="viz-readout-key">Critical separation (κ)</span>
              <span className="viz-readout-val">{kappa}</span>
            </div>
            <hr className="viz-divider" />
            <div className="viz-readout">
              <span className="viz-readout-key">Valid configuration</span>
              <span className="viz-readout-val" style={{ color: isValid ? '#16a34a' : '#ef4444' }}>
                {isValid ? '✓ No overlaps' : '✗ Overlaps detected'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <VizSurface>
        {options ? (
          <PlotFigure options={options} />
        ) : (
          <div className="viz-empty">
            No valid configuration for these parameters — widen the range, lower the resolution T, or
            select better-separated adducts.
          </div>
        )}
      </VizSurface>
    </VizFigure>
  );
}
