import { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';

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
  const svgRef = useRef<SVGSVGElement>(null);
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
  const { intervalsByPeptide, intervalToRow, totalRows } = useMemo(() => {
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

  // D3 visualization
  useEffect(() => {
    if (!svgRef.current) return;

    if (intervals.length === 0) return;

    // Dimensions - make height dynamic based on number of rows
    const width = 900;
    const rowHeight = 20; // Fixed row height for consistency
    const rowSpacing = 4; // Fixed spacing between rows
    const baseMarkHeight = 8; // Height of base mass marker lines
    // Add extra rowSpacing at bottom for separation between lowest row and base mass ticks
    const plotHeight = totalRows * (rowHeight + rowSpacing) + rowSpacing + baseMarkHeight / 2;
    const margin = { top: 40, right: 40, bottom: 60, left: 60 };
    const plotWidth = width - margin.left - margin.right;
    const height = plotHeight + margin.top + margin.bottom;

    // Create or update SVG
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    // Use consistent g element instead of removing everything
    let g = svg.select<SVGGElement>('g.main-group');
    if (g.empty()) {
      g = svg.append('g')
        .attr('class', 'main-group');
    }
    g.attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleLinear()
      .domain([L, U])
      .range([0, plotWidth]);

    // Custom color scale without red (reserved for overlaps)
    const customColors = [
      '#3b82f6', // blue
      '#10b981', // green
      '#8b5cf6', // purple
      '#f59e0b', // amber
      '#06b6d4', // cyan
      '#6366f1', // indigo
      '#14b8a6', // teal
      '#a855f7', // violet
    ];
    const colorScale = d3.scaleOrdinal(customColors)
      .domain(activeAdducts.map(a => a.symbol));

    // X axis - generate tick values to ensure L and U are included
    const range = U - L;
    const step = Math.pow(10, Math.floor(Math.log10(range / 8))); // Nice round step
    const tickValues = [];

    // Start from L
    tickValues.push(L);

    // Add intermediate ticks
    let currentTick = Math.ceil(L / step) * step;
    while (currentTick < U) {
      if (currentTick > L) {
        tickValues.push(currentTick);
      }
      currentTick += step;
    }

    // Always end with U
    if (tickValues[tickValues.length - 1] !== U) {
      tickValues.push(U);
    }

    // X-axis (update or create)
    let xAxisGroup = g.select<SVGGElement>('g.x-axis');
    if (xAxisGroup.empty()) {
      xAxisGroup = g.append('g').attr('class', 'x-axis');
    }
    xAxisGroup
      .attr('transform', `translate(0,${plotHeight})`)
      .call(d3.axisBottom(xScale).tickValues(tickValues))
      .style('font-size', '12px');

    // X-axis label (update or create)
    let xLabel = g.select<SVGTextElement>('text.x-label');
    if (xLabel.empty()) {
      xLabel = g.append('text').attr('class', 'x-label');
    }
    xLabel
      .attr('x', plotWidth / 2)
      .attr('y', plotHeight + 45)
      .attr('text-anchor', 'middle')
      .style('font-size', '14px')
      .style('font-weight', '600')
      .text('m/z (Da)');

    // Title (update or create)
    let title = svg.select<SVGTextElement>('text.title');
    if (title.empty()) {
      title = svg.append('text').attr('class', 'title');
    }
    title
      .attr('x', width / 2)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .style('font-weight', '700')
      .text('Adduct Interval Visualization');

    // Show all peptides, grouped by mass
    // Each row represents one peptide with all its adduct intervals
    // Get unique bare masses
    const uniqueMasses = Array.from(new Set(intervals.map(int => int.mass)));

    // Draw intervals using row assignments (inverted so row 0 is at bottom)
    // Use a key function for better performance
    const rects = g.selectAll<SVGRectElement, Interval>('.interval')
      .data(intervals, d => `${d.peptideIndex}-${d.adduct.symbol}`)
      .join(
        enter => enter.append('rect')
          .attr('class', 'interval')
          .attr('x', d => xScale(d.lower))
          .attr('y', d => {
            const row = intervalToRow.get(d) || 0;
            return plotHeight - (row + 1) * (rowHeight + rowSpacing);
          })
          .attr('width', d => xScale(d.upper) - xScale(d.lower))
          .attr('height', rowHeight)
          .attr('fill', d => {
            const intervalIdx = intervals.indexOf(d);
            return overlaps.has(String(intervalIdx)) ? '#ef4444' : colorScale(d.adduct.symbol);
          })
          .attr('stroke', 'none')
          .attr('opacity', 0.7),
        update => update
          .attr('x', d => xScale(d.lower))
          .attr('y', d => {
            const row = intervalToRow.get(d) || 0;
            return plotHeight - (row + 1) * (rowHeight + rowSpacing);
          })
          .attr('width', d => xScale(d.upper) - xScale(d.lower))
          .attr('height', rowHeight)
          .attr('fill', d => {
            const intervalIdx = intervals.indexOf(d);
            return overlaps.has(String(intervalIdx)) ? '#ef4444' : colorScale(d.adduct.symbol);
          })
          .attr('opacity', 0.7),
        exit => exit.remove()
      )
      .on('mouseover', function(event, d) {
        d3.select(this)
          .attr('opacity', 1);

        // Tooltip
        const row = intervalToRow.get(d) || 0;
        const yPos = plotHeight - (row + 1) * (rowHeight + rowSpacing);
        const tooltip = g.append('g')
          .attr('class', 'tooltip')
          .attr('transform', `translate(${xScale((d.lower + d.upper) / 2)}, ${yPos - 10})`);

        tooltip.append('rect')
          .attr('x', -90)
          .attr('y', -30)
          .attr('width', 180)
          .attr('height', 28)
          .attr('fill', 'white')
          .attr('stroke', '#333')
          .attr('rx', 4);

        tooltip.append('text')
          .attr('text-anchor', 'middle')
          .attr('y', -10)
          .style('font-size', '11px')
          .style('font-weight', '600')
          .text(`m${d.peptideIndex} (row ${row}): ${d.adduct.symbol} [${d.lower.toFixed(3)}, ${d.upper.toFixed(3)}]`);
      })
      .on('mouseout', function() {
        d3.select(this)
          .attr('opacity', 0.7);
        g.selectAll('.tooltip').remove();
      });

    // Draw bare mass markers as very thin vertical lines crossing the x-axis
    const lineHeight = 8; // Total height of the line (4px above and below x-axis)
    const massMarkers = g.selectAll<SVGLineElement, number>('.mass-marker')
      .data(uniqueMasses, d => String(d))
      .join(
        enter => enter.append('line').attr('class', 'mass-marker'),
        update => update,
        exit => exit.remove()
      )
      .attr('x1', d => xScale(d))
      .attr('x2', d => xScale(d))
      .attr('y1', plotHeight - lineHeight / 2)
      .attr('y2', plotHeight + lineHeight / 2)
      .attr('stroke', '#000')
      .attr('stroke-width', 0.5)
      .attr('opacity', 0.7)
      .on('mouseover', function(event, d) {
        d3.select(this)
          .attr('opacity', 1);

        // Find the peptide index for this mass
        const peptideIdx = intervals.find(int => int.mass === d)?.peptideIndex;

        // Tooltip
        const tooltip = g.append('g')
          .attr('class', 'mass-tooltip')
          .attr('transform', `translate(${xScale(d)}, ${plotHeight + 20})`);

        tooltip.append('rect')
          .attr('x', -50)
          .attr('y', 0)
          .attr('width', 100)
          .attr('height', 28)
          .attr('fill', 'white')
          .attr('stroke', '#333')
          .attr('rx', 4);

        tooltip.append('text')
          .attr('text-anchor', 'middle')
          .attr('y', 18)
          .style('font-size', '11px')
          .style('font-weight', '600')
          .text(`m${peptideIdx}: ${d.toFixed(3)} Da`);
      })
      .on('mouseout', function() {
        d3.select(this)
          .attr('opacity', 0.7);
        g.selectAll('.mass-tooltip').remove();
      });

  }, [intervals, overlaps, intervalToRow, totalRows, L, U]);

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

  return (
    <div className="my-8 p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
      {/* Control Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Left Column: Mode and Method */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2 text-slate-700 dark:text-slate-300">
              Ionization Mode
            </label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as 'positive' | 'negative')}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 transition-all"
            >
              <option value="positive">Positive Ion Mode</option>
              <option value="negative">Negative Ion Mode</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-slate-700 dark:text-slate-300">
              Ionization Method
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 transition-all"
            >
              {Object.keys(ADDUCT_LIBRARY[mode]).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Adduct Toggles */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-slate-700 dark:text-slate-300">
              Active Adducts
            </label>
            <div className="space-y-2 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-300 dark:border-slate-600">
              {availableAdducts.map(adduct => (
                <label key={adduct.symbol} className="flex items-center space-x-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 p-2 rounded transition-colors">
                  <input
                    type="checkbox"
                    checked={activeAdducts.some(a => a.symbol === adduct.symbol)}
                    onChange={() => toggleAdduct(adduct)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm font-mono text-slate-900 dark:text-slate-100">
                    {adduct.symbol}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    ({adduct.mass.toFixed(3)} Da)
                  </span>
                </label>
              ))}

              {customAdducts.map(adduct => (
                <label key={adduct.symbol} className="flex items-center space-x-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 p-2 rounded transition-colors">
                  <input
                    type="checkbox"
                    checked={activeAdducts.some(a => a.symbol === adduct.symbol)}
                    onChange={() => toggleAdduct(adduct)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm font-mono text-slate-900 dark:text-slate-100">
                    {adduct.symbol}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    ({adduct.mass.toFixed(3)} Da)
                  </span>
                </label>
              ))}
            </div>

            {!showCustomForm && (
              <button
                onClick={() => setShowCustomForm(true)}
                className="mt-2 px-3 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
              >
                + Add Custom Adduct
              </button>
            )}

            {showCustomForm && (
              <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg space-y-2">
                <input
                  type="text"
                  placeholder="Name (e.g., Ca²⁺)"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full px-3 py-1 text-sm rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
                <input
                  type="number"
                  step="0.001"
                  placeholder="Mass (Da)"
                  value={customMass}
                  onChange={(e) => setCustomMass(e.target.value)}
                  className="w-full px-3 py-1 text-sm rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
                <div className="flex space-x-2">
                  <button
                    onClick={addCustomAdduct}
                    className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setShowCustomForm(false)}
                    className="px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Range and Resolution */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2 text-slate-700 dark:text-slate-300">
              Lower Bound (L): <span className="font-mono text-blue-600 dark:text-blue-400">{L} Da</span>
            </label>
            <input
              type="range"
              min="50"
              max="500"
              step="10"
              value={L}
              onChange={(e) => setL(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-slate-700 dark:text-slate-300">
              Upper Bound (U): <span className="font-mono text-blue-600 dark:text-blue-400">{U} Da</span>
            </label>
            <input
              type="range"
              min="500"
              max="2000"
              step="50"
              value={U}
              onChange={(e) => setU(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-slate-700 dark:text-slate-300">
              Resolution (T): <span className="font-mono text-blue-600 dark:text-blue-400">{T.toFixed(2)} Da</span>
            </label>
            <input
              type="range"
              min="0.25"
              max="2"
              step="0.01"
              value={T}
              onChange={(e) => setT(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          {/* Computed Output Panel */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-300 dark:border-slate-600 shadow-sm">
            <h3 className="text-sm font-bold mb-3 text-slate-700 dark:text-slate-300">Computed Parameters</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Number of peptides (n):</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{n}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Spacing (δ):</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{delta.toFixed(3)} Da</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Critical separation (κ):</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{kappa}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="text-slate-600 dark:text-slate-400">Valid configuration:</span>
                <span className={`font-semibold ${isValid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {isValid ? '✓ No overlaps' : '✗ Overlaps detected'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Visualization */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-300 dark:border-slate-600 shadow-sm">
        <svg ref={svgRef} className="w-full"></svg>
      </div>
    </div>
  );
}
