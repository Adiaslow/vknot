import { useEffect, useRef, useState } from 'react';
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

  // Compute intervals and detect overlaps
  const computeIntervals = (): { intervals: Interval[]; overlaps: Set<string>; n: number; delta: number; kappa: number } => {
    if (activeAdducts.length === 0) {
      return { intervals: [], overlaps: new Set(), n: 0, delta: 0, kappa: 0 };
    }

    // Sort adducts by mass
    const sortedAdducts = [...activeAdducts].sort((a, b) => a.mass - b.mass);
    const a1 = sortedAdducts[0].mass;
    const ak = sortedAdducts[sortedAdducts.length - 1].mass;

    // Calculate spacing and number of peptides
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

    const n = Math.floor((U - L - (ak - a1) - 2 * T) / delta) + 1;

    // Additional safety check: ensure n is positive
    if (n <= 0) {
      return { intervals: [], overlaps: new Set(), n: 0, delta, kappa: 0 };
    }

    // Generate masses
    const masses: number[] = [];
    for (let i = 0; i < n; i++) {
      const m = L + (2 * i + 1) * T - a1;
      masses.push(m);
    }

    // Generate intervals
    const intervals: Interval[] = [];
    masses.forEach((m, i) => {
      activeAdducts.forEach(adduct => {
        intervals.push({
          peptideIndex: i,
          adduct,
          lower: m + adduct.mass - T,
          upper: m + adduct.mass + T,
          mass: m,
        });
      });
    });

    // Detect overlaps (with small numerical tolerance for floating point errors)
    const EPSILON = 1e-6; // tolerance for touching intervals
    const overlaps = new Set<string>();
    for (let i = 0; i < intervals.length; i++) {
      for (let j = i + 1; j < intervals.length; j++) {
        const int1 = intervals[i];
        const int2 = intervals[j];
        // Two intervals overlap if: int1.upper > int2.lower AND int1.lower < int2.upper
        // We add EPSILON tolerance to avoid false positives from floating point errors
        if (int1.upper > int2.lower + EPSILON && int1.lower < int2.upper - EPSILON) {
          overlaps.add(`${i}`);
          overlaps.add(`${j}`);
        }
      }
    }

    // Calculate kappa (critical separation)
    // κ = ceil((a_k - a_1 + 2T) / (2T)) from Section 3.2
    const kappa = Math.ceil((ak - a1 + 2 * T) / delta);

    return { intervals, overlaps, n, delta, kappa };
  };

  // D3 visualization
  useEffect(() => {
    if (!svgRef.current) return;

    const { intervals, overlaps, n } = computeIntervals();
    if (intervals.length === 0) return;

    // Clear previous content
    d3.select(svgRef.current).selectAll('*').remove();

    // Dimensions
    const width = 900;
    const height = 400;
    const margin = { top: 40, right: 40, bottom: 60, left: 60 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    // Create SVG
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleLinear()
      .domain([L, U])
      .range([0, plotWidth]);

    const colorScale = d3.scaleOrdinal(d3.schemeCategory10)
      .domain(activeAdducts.map(a => a.symbol));

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${plotHeight})`)
      .call(d3.axisBottom(xScale).ticks(10))
      .style('font-size', '12px');

    g.append('text')
      .attr('x', plotWidth / 2)
      .attr('y', plotHeight + 45)
      .attr('text-anchor', 'middle')
      .style('font-size', '14px')
      .style('font-weight', '600')
      .text('m/z (Da)');

    // Title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .style('font-weight', '700')
      .text('Adduct Interval Visualization');

    // Sample intervals for visualization (show first 20 peptides)
    const maxPeptidesToShow = Math.min(20, n);
    const visibleIntervals = intervals.filter(int => int.peptideIndex < maxPeptidesToShow);

    // Calculate y positions for intervals
    const yScale = d3.scaleBand()
      .domain(visibleIntervals.map((_, i) => String(i)))
      .range([0, plotHeight])
      .padding(0.1);

    const intervalHeight = Math.min(15, plotHeight / visibleIntervals.length);

    // Draw intervals
    const rects = g.selectAll('.interval')
      .data(visibleIntervals)
      .join('rect')
      .attr('class', 'interval')
      .attr('x', d => xScale(d.lower))
      .attr('y', (d, i) => i * (plotHeight / visibleIntervals.length))
      .attr('width', d => xScale(d.upper) - xScale(d.lower))
      .attr('height', intervalHeight)
      .attr('fill', d => overlaps.has(String(visibleIntervals.indexOf(d))) ? '#ef4444' : colorScale(d.adduct.symbol))
      .attr('opacity', 0.7)
      .attr('stroke', d => overlaps.has(String(visibleIntervals.indexOf(d))) ? '#dc2626' : '#333')
      .attr('stroke-width', 1)
      .style('transition', 'all 300ms ease')
      .on('mouseover', function(event, d) {
        d3.select(this)
          .attr('opacity', 1)
          .attr('stroke-width', 2);

        // Tooltip
        const tooltip = g.append('g')
          .attr('class', 'tooltip')
          .attr('transform', `translate(${xScale((d.lower + d.upper) / 2)}, ${visibleIntervals.indexOf(d) * (plotHeight / visibleIntervals.length) - 10})`);

        tooltip.append('rect')
          .attr('x', -80)
          .attr('y', -30)
          .attr('width', 160)
          .attr('height', 28)
          .attr('fill', 'white')
          .attr('stroke', '#333')
          .attr('rx', 4);

        tooltip.append('text')
          .attr('text-anchor', 'middle')
          .attr('y', -10)
          .style('font-size', '11px')
          .style('font-weight', '600')
          .text(`Peptide ${d.peptideIndex}: ${d.adduct.symbol} [${d.lower.toFixed(3)}, ${d.upper.toFixed(3)}]`);
      })
      .on('mouseout', function() {
        d3.select(this)
          .attr('opacity', 0.7)
          .attr('stroke-width', 1);
        g.selectAll('.tooltip').remove();
      });

    // Animate entrance
    rects
      .attr('opacity', 0)
      .transition()
      .duration(300)
      .attr('opacity', d => overlaps.has(String(visibleIntervals.indexOf(d))) ? 0.9 : 0.7);

  }, [L, U, T, activeAdducts]);

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

  const { intervals, overlaps, n, delta, kappa } = computeIntervals();
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
              min="0.01"
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
        {intervals.length > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2">
            Showing first {Math.min(20, n)} peptides of {n} total. Hover over intervals for details.
          </p>
        )}
      </div>
    </div>
  );
}
