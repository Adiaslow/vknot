import { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';

// Poisson CDF: P(X ≤ k) for X ~ Poisson(lambda)
// Exact implementation from probability theory
function poissonCDF(k: number, lambda: number): number {
  if (lambda === 0) return 1;
  if (k < 0) return 0;

  let sum = 0;
  let term = Math.exp(-lambda);
  const kFloor = Math.floor(k);

  for (let i = 0; i <= kFloor; i++) {
    sum += term;
    if (i < kFloor) {
      term *= lambda / (i + 1);
    }
  }

  return sum;
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
  const speedup = useMemo(() => {
    return U / samplesCritical;
  }, [U, samplesCritical]);

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

  }, [curveData, alphaCritical, probabilityFunction]);

  return (
    <div className="my-8 p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          Phase Transition Explorer
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Explore the sharp phase transition in probability P(Coverage ≥ 1-ε) at critical threshold α_c.
          Adjust parameters to see the dramatic S-curve behavior predicted by Theorem 4.1.
        </p>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Library Size |U|: {U.toLocaleString()}
          </label>
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
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Redundancy R: {R.toLocaleString()}
          </label>
          <input
            type="range"
            min="10"
            max="10000"
            step="10"
            value={R}
            onChange={(e) => setR(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-500 mt-1">
            <span>10</span>
            <span>10⁴</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Target ε: {epsilon.toFixed(3)}
          </label>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-300 dark:border-slate-600">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Synthesis Space</div>
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {S.toExponential(2)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-300 dark:border-slate-600">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Critical α_c</div>
          <div className="text-lg font-bold text-red-600 dark:text-red-400">
            {alphaCritical.toExponential(2)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-300 dark:border-slate-600">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Samples Needed</div>
          <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
            {samplesCritical.toLocaleString()}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-300 dark:border-slate-600">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Speedup Factor</div>
          <div className="text-lg font-bold text-green-600 dark:text-green-400">
            {speedup.toFixed(1)}×
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
          <li><span className="text-red-600 dark:text-red-400 font-semibold">Red line</span>: Critical threshold α_c = log(1/ε)/R where phase transition occurs</li>
          <li><span className="text-yellow-600 dark:text-yellow-400 font-semibold">Yellow region</span>: Phase transition zone exhibiting sharp S-curve behavior</li>
          <li>Hover over the curve to see exact probability values at each sampling fraction</li>
        </ul>
      </div>
    </div>
  );
}
