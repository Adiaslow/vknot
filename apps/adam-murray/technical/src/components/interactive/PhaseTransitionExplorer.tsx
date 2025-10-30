import { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';

// Standard normal CDF approximation (error < 7.5e-8)
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

// Poisson CDF: P(X ≤ k) for X ~ Poisson(lambda)
// Uses exact calculation for small lambda, normal approximation for large lambda
function poissonCDF(k: number, lambda: number): number {
  if (lambda === 0) return 1;
  if (k < 0) return 0;

  const kFloor = Math.floor(k);

  // For large lambda, use normal approximation to avoid numerical issues
  // Poisson(λ) ≈ Normal(λ, λ) for large λ
  if (lambda > 100) {
    // Continuity correction: P(X ≤ k) ≈ Φ((k + 0.5 - λ) / √λ)
    const z = (kFloor + 0.5 - lambda) / Math.sqrt(lambda);
    return normalCDF(z);
  }

  // For small lambda, use exact iterative formula
  let sum = 0;
  let term = Math.exp(-lambda);

  for (let i = 0; i <= kFloor; i++) {
    sum += term;
    if (i < kFloor) {
      term *= lambda / (i + 1);
    }
  }

  return Math.min(1, sum); // Clamp to [0, 1] for numerical stability
}

export default function PhaseTransitionExplorer() {
  const svgRef = useRef<SVGSVGElement>(null);

  // Parameters
  const [U, setU] = useState(10000); // Unique entities
  const [R, setR] = useState(100); // Redundancy
  const [epsilon, setEpsilon] = useState(0.05); // Target coverage (1 - epsilon)

  // Computed values
  const S = useMemo(() => U * R, [U, R]); // Synthesis space size

  // Probability function: P(C(α) > 1-ε)
  // Exact formula from Theorem 4.1 using Poisson approximation
  const probabilityFunction = useMemo(() => {
    return (alpha: number) => {
      // Expected number of uncovered coupons (from proof)
      const lambda = U * Math.exp(-alpha * R);

      // P(uncovered ≤ ε|U|) = P(coverage ≥ 1-ε)
      // Using Poisson CDF (exact from coupon collector theory)
      return poissonCDF(epsilon * U, lambda);
    };
  }, [U, R, epsilon]);

  // Critical sampling fraction: α_c = log(1/ε) / R
  // (Exact from Theorem 4.1 after simplification)
  const alphaCritical = useMemo(() => {
    return Math.log(1 / epsilon) / R;
  }, [epsilon, R]);

  // Sample count at critical point
  const samplesCritical = useMemo(() => {
    return Math.ceil(alphaCritical * S);
  }, [alphaCritical, S]);

  // Speedup factor vs complete enumeration
  // Complete enumeration: process all |S| synthesis instances
  // Sampling: alphaCritical × |S| samples needed
  // Speedup: |S| / (alphaCritical × |S|) = 1/alphaCritical = R/log(1/ε)
  const speedup = useMemo(() => {
    return S / samplesCritical;
  }, [S, samplesCritical]);

  // Diagnostic: Probability at critical point (should be ≈ 0.5)
  const probabilityAtCritical = useMemo(() => {
    return probabilityFunction(alphaCritical);
  }, [probabilityFunction, alphaCritical]);

  // True inflection point: λ = k + 1 (from calculus)
  // α_inflection = log(1/(ε + 1/|U|)) / R
  const alphaInflection = useMemo(() => {
    return Math.log(1 / (epsilon + 1/U)) / R;
  }, [epsilon, U, R]);

  // Offset between theoretical and actual inflection point
  const inflectionOffset = useMemo(() => {
    return ((alphaInflection - alphaCritical) / alphaCritical) * 100; // percentage
  }, [alphaInflection, alphaCritical]);

  // Generate probability curve data
  const curveData = useMemo(() => {
    const points: Array<{ alpha: number; probability: number }> = [];
    const numPoints = 200;
    const maxAlpha = Math.min(alphaCritical * 3, 1); // Show up to 3× critical or 100%

    for (let i = 0; i <= numPoints; i++) {
      const alpha = (i / numPoints) * maxAlpha;
      points.push({
        alpha,
        probability: probabilityFunction(alpha)
      });
    }

    return points;
  }, [alphaCritical, probabilityFunction]);

  // D3 Visualization
  useEffect(() => {
    if (!svgRef.current || curveData.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous render

    const margin = { top: 40, right: 40, bottom: 60, left: 70 };
    const width = 700 - margin.left - margin.right;
    const height = 450 - margin.top - margin.bottom;

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const maxAlpha = Math.max(...curveData.map(d => d.alpha));
    const xScale = d3.scaleLinear()
      .domain([0, maxAlpha])
      .range([0, width]);

    const yScale = d3.scaleLinear()
      .domain([0, 1])
      .range([height, 0]);

    // Axes
    const xAxis = d3.axisBottom(xScale)
      .ticks(10)
      .tickFormat(d => d3.format('.3f')(d as number));

    const yAxis = d3.axisLeft(yScale)
      .ticks(10)
      .tickFormat(d => d3.format('.0%')(d as number));

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis)
      .style('font-size', '12px');

    g.append('g')
      .call(yAxis)
      .style('font-size', '12px');

    // Axis labels
    g.append('text')
      .attr('x', width / 2)
      .attr('y', height + 45)
      .attr('text-anchor', 'middle')
      .style('font-size', '14px')
      .style('font-weight', '600')
      .text('Sampling Fraction α = n/|S|');

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -50)
      .attr('text-anchor', 'middle')
      .style('font-size', '14px')
      .style('font-weight', '600')
      .text('Probability P(Coverage ≥ 1-ε)');

    // Phase transition shaded region (around α_c)
    const transitionWidth = 0.15; // Width of transition region
    const transitionStart = Math.max(0, alphaCritical - alphaCritical * transitionWidth);
    const transitionEnd = Math.min(maxAlpha, alphaCritical + alphaCritical * transitionWidth);

    g.append('rect')
      .attr('x', xScale(transitionStart))
      .attr('y', 0)
      .attr('width', xScale(transitionEnd) - xScale(transitionStart))
      .attr('height', height)
      .attr('fill', 'rgba(250, 204, 21, 0.1)') // Yellow, like contested territory
      .attr('stroke', 'rgba(250, 204, 21, 0.3)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '5,5');

    // Probability curve (S-curve phase transition)
    const line = d3.line<{ alpha: number; probability: number }>()
      .x(d => xScale(d.alpha))
      .y(d => yScale(d.probability))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(curveData)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6') // Blue
      .attr('stroke-width', 3)
      .attr('d', line);

    // Critical threshold line
    g.append('line')
      .attr('x1', xScale(alphaCritical))
      .attr('x2', xScale(alphaCritical))
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', '#ef4444') // Red
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '8,4');

    // Critical point marker
    const criticalProbability = probabilityFunction(alphaCritical);
    g.append('circle')
      .attr('cx', xScale(alphaCritical))
      .attr('cy', yScale(criticalProbability))
      .attr('r', 6)
      .attr('fill', '#ef4444')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Label for critical point
    g.append('text')
      .attr('x', xScale(alphaCritical))
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('font-weight', '600')
      .style('fill', '#ef4444')
      .text(`α_c = ${alphaCritical.toExponential(2)}`);

    // True inflection point line (if significantly different)
    if (Math.abs(alphaInflection - alphaCritical) / alphaCritical > 0.001) {
      g.append('line')
        .attr('x1', xScale(alphaInflection))
        .attr('x2', xScale(alphaInflection))
        .attr('y1', 0)
        .attr('y2', height)
        .attr('stroke', '#f97316') // Orange
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,4');

      const inflectionProbability = probabilityFunction(alphaInflection);
      g.append('circle')
        .attr('cx', xScale(alphaInflection))
        .attr('cy', yScale(inflectionProbability))
        .attr('r', 5)
        .attr('fill', '#f97316')
        .attr('stroke', '#fff')
        .attr('stroke-width', 2);

      g.append('text')
        .attr('x', xScale(alphaInflection))
        .attr('y', -25)
        .attr('text-anchor', 'middle')
        .style('font-size', '11px')
        .style('font-weight', '600')
        .style('fill', '#f97316')
        .text(`α_infl = ${alphaInflection.toExponential(2)}`);
    }

    // Tooltip group (initially hidden)
    const tooltip = g.append('g')
      .attr('class', 'tooltip')
      .style('display', 'none');

    tooltip.append('circle')
      .attr('r', 4)
      .attr('fill', '#3b82f6');

    const tooltipText = tooltip.append('text')
      .attr('x', 10)
      .attr('y', -10)
      .style('font-size', '12px')
      .style('font-weight', '600');

    // Interaction overlay
    g.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .on('mousemove', function(event) {
        const [mouseX] = d3.pointer(event);
        const alpha = xScale.invert(mouseX);

        if (alpha >= 0 && alpha <= maxAlpha) {
          const probability = probabilityFunction(alpha);

          tooltip
            .style('display', null)
            .attr('transform', `translate(${xScale(alpha)},${yScale(probability)})`);

          tooltipText.text(`α=${alpha.toFixed(4)}, P=${(probability * 100).toFixed(1)}%`);
        }
      })
      .on('mouseout', function() {
        tooltip.style('display', 'none');
      });

  }, [curveData, alphaCritical, alphaInflection, probabilityFunction]);

  return (
    <div className="my-8 p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          Phase Transition Explorer
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
          Explore the sharp phase transition in probability P(Coverage ≥ 1-ε) at critical threshold α_c.
          Adjust parameters to see the dramatic S-curve behavior predicted by Theorem 4.1.
        </p>

        {/* Parameter Guide */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-slate-700 dark:text-slate-300">
          <p className="font-semibold mb-2">Parameter Guide:</p>
          <ul className="space-y-1 ml-2">
            <li><strong>|U|</strong> (Unique entities): Number of distinct chemical entities in the library</li>
            <li><strong>R</strong> (Redundancy): Average number of synthesis paths per unique entity (|S|/|U|)</li>
            <li><strong>ε</strong> (Tolerance): Maximum acceptable fraction of uncovered entities (target coverage = 1-ε)</li>
            <li><strong>α_c</strong> (Critical point): Sampling fraction where phase transition occurs = log(1/ε)/R</li>
          </ul>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Unique Entities (|U|): {U.toLocaleString()}
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            Larger |U| makes phase transition sharper
          </p>
          <input
            type="range"
            min="1000"
            max="1000000"
            step="1000"
            value={U}
            onChange={(e) => setU(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-500 mt-1">
            <span>10³</span>
            <span>10⁶</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Redundancy (R = |S|/|U|): {R.toLocaleString()}
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            Higher R moves α_c left (fewer samples needed)
          </p>
          <input
            type="range"
            min="10"
            max="100000"
            step="10"
            value={R}
            onChange={(e) => setR(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-500 mt-1">
            <span>10</span>
            <span>10⁵</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Coverage Tolerance (ε): {epsilon.toFixed(3)}
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            Smaller ε moves α_c right (stricter coverage)
          </p>
          <input
            type="range"
            min="0.001"
            max="0.5"
            step="0.001"
            value={epsilon}
            onChange={(e) => setEpsilon(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-500 mt-1">
            <span>0.001</span>
            <span>0.5</span>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-300 dark:border-slate-600">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Synthesis Space (|S| = |U|×R)</div>
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {S.toExponential(2)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-300 dark:border-slate-600">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Samples Needed (α_c × |S|)</div>
          <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
            {samplesCritical.toLocaleString()}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-300 dark:border-slate-600">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Speedup (|S|/samples)</div>
          <div className="text-lg font-bold text-green-600 dark:text-green-400">
            {speedup >= 100 ? Math.round(speedup).toLocaleString() : speedup.toFixed(1)}×
          </div>
        </div>
      </div>

      {/* Diagnostic Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-300 dark:border-yellow-700">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Critical Point (α_c = log(1/ε)/R)</div>
          <div className="text-lg font-bold text-red-600 dark:text-red-400">
            {alphaCritical.toExponential(3)}
          </div>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-300 dark:border-yellow-700">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">True Inflection (α_infl)</div>
          <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
            {alphaInflection.toExponential(3)}
          </div>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-300 dark:border-yellow-700">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Probability at α_c (P)</div>
          <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
            {(probabilityAtCritical * 100).toFixed(1)}%
          </div>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-300 dark:border-yellow-700">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Inflection Offset (%)</div>
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {Math.abs(inflectionOffset) < 0.01 ? '< 0.01' : inflectionOffset.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Visualization */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-300 dark:border-slate-600">
        <svg
          ref={svgRef}
          width={700}
          height={450}
          className="mx-auto"
        />
      </div>

      {/* Legend */}
      <div className="mt-4 text-sm text-slate-600 dark:text-slate-400">
        <p><strong>Interpretation:</strong></p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li><span className="text-blue-600 dark:text-blue-400 font-semibold">Blue curve</span>: Probability P(Coverage ≥ 1-ε) using exact Poisson CDF from Theorem 4.1</li>
          <li><span className="text-red-600 dark:text-red-400 font-semibold">Red line</span>: Theoretical critical threshold α_c = log(1/ε)/R (where E[uncovered] = ε|U|)</li>
          <li><span className="text-orange-600 dark:text-orange-400 font-semibold">Orange line</span>: True inflection point α_infl = log(1/(ε + 1/|U|))/R (from calculus, shown if different)</li>
          <li><span className="text-yellow-600 dark:text-yellow-400 font-semibold">Yellow region</span>: Phase transition zone exhibiting sharp S-curve behavior</li>
          <li>For large |U|, α_c ≈ α_infl (offset → 0%). For small |U|, the offset is measurable.</li>
          <li>Hover over the curve to see exact probability values at each sampling fraction</li>
        </ul>
      </div>
    </div>
  );
}
