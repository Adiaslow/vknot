import { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';

export default function TemporalOptimizationFlow() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const animationRef = useRef<number>();

  // Parameters
  const [lambda, setLambda] = useState(0.01); // Decay rate
  const [I0, setI0] = useState(100); // Initial information
  const [maxTime, setMaxTime] = useState(300); // Time horizon

  // Optimal sampling rate: n*(t) ∝ exp(-λt/2)
  const optimalRate = useMemo(() => {
    return (t: number) => {
      // Normalize so peak is reasonable
      const peak = 50;
      return peak * Math.exp(-lambda * t / 2);
    };
  }, [lambda]);

  // Uniform sampling rate for comparison
  const uniformRate = useMemo(() => {
    // Constant rate equal to average of optimal
    const integral = (2 * 50 / lambda) * (1 - Math.exp(-lambda * maxTime / 2));
    return integral / maxTime;
  }, [lambda, maxTime]);

  // Information decay: I(t) = I₀ × exp(-λt)
  const informationDecay = useMemo(() => {
    return (t: number) => I0 * Math.exp(-lambda * t);
  }, [I0, lambda]);

  // Generate trajectory data
  const trajectoryData = useMemo(() => {
    const points: Array<{ t: number; rate: number; info: number }> = [];
    const numPoints = 200;

    for (let i = 0; i <= numPoints; i++) {
      const t = (i / numPoints) * maxTime;
      points.push({
        t,
        rate: optimalRate(t),
        info: informationDecay(t)
      });
    }

    return points;
  }, [maxTime, optimalRate, informationDecay]);

  // Total samples (area under curve)
  const totalSamples = useMemo(() => {
    const integral = trajectoryData.reduce((sum, point, i) => {
      if (i === 0) return 0;
      const prev = trajectoryData[i - 1];
      const dt = point.t - prev.t;
      const avg = (point.rate + prev.rate) / 2;
      return sum + avg * dt;
    }, 0);
    return integral;
  }, [trajectoryData]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying) return;

    const animate = () => {
      setCurrentTime(prev => {
        if (prev >= maxTime) {
          setIsPlaying(false);
          return maxTime;
        }
        return prev + 0.5; // Increment time
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, maxTime]);

  // Reset animation
  const handleReset = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // D3 Visualization
  useEffect(() => {
    if (!svgRef.current || trajectoryData.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 40, right: 40, bottom: 60, left: 70 };
    const width = 700 - margin.left - margin.right;
    const height = 450 - margin.top - margin.bottom;

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleLinear()
      .domain([0, maxTime])
      .range([0, width]);

    const yScale = d3.scaleLinear()
      .domain([0, Math.max(...trajectoryData.map(d => d.rate)) * 1.1])
      .range([height, 0]);

    // Axes
    const xAxis = d3.axisBottom(xScale)
      .ticks(10)
      .tickFormat(d => d3.format('.0f')(d as number));

    const yAxis = d3.axisLeft(yScale)
      .ticks(10)
      .tickFormat(d => d3.format('.1f')(d as number));

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
      .text('Time t');

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -50)
      .attr('text-anchor', 'middle')
      .style('font-size', '14px')
      .style('font-weight', '600')
      .text('Sampling Rate n(t)');

    // Area under optimal curve (total samples)
    const area = d3.area<{ t: number; rate: number }>()
      .x(d => xScale(d.t))
      .y0(height)
      .y1(d => yScale(d.rate))
      .curve(d3.curveMonotoneX);

    // Only show area up to current time if animating
    const currentData = trajectoryData.filter(d => d.t <= currentTime || !isPlaying);

    g.append('path')
      .datum(currentData)
      .attr('fill', 'rgba(59, 130, 246, 0.2)')
      .attr('d', area);

    // Optimal trajectory curve
    const line = d3.line<{ t: number; rate: number }>()
      .x(d => xScale(d.t))
      .y(d => yScale(d.rate))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(trajectoryData)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 3)
      .attr('d', line);

    // Uniform rate comparison line
    g.append('line')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', yScale(uniformRate))
      .attr('y2', yScale(uniformRate))
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '8,4');

    // Current time marker (if animating)
    if (isPlaying && currentTime < maxTime) {
      const currentRate = optimalRate(currentTime);

      g.append('line')
        .attr('x1', xScale(currentTime))
        .attr('x2', xScale(currentTime))
        .attr('y1', 0)
        .attr('y2', height)
        .attr('stroke', '#10b981')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,5');

      g.append('circle')
        .attr('cx', xScale(currentTime))
        .attr('cy', yScale(currentRate))
        .attr('r', 6)
        .attr('fill', '#10b981')
        .attr('stroke', '#fff')
        .attr('stroke-width', 2);
    }

    // Vector field (showing decay direction)
    const numVectors = 10;
    const vectorSpacing = maxTime / numVectors;

    for (let i = 1; i < numVectors; i++) {
      const t = i * vectorSpacing;
      const rate = optimalRate(t);
      const derivative = -lambda / 2 * optimalRate(t); // Slope

      const arrowLength = 20;
      const angle = Math.atan2(-derivative * (height / maxTime), arrowLength);

      g.append('line')
        .attr('x1', xScale(t))
        .attr('y1', yScale(rate))
        .attr('x2', xScale(t) + arrowLength * Math.cos(angle))
        .attr('y2', yScale(rate) + arrowLength * Math.sin(angle))
        .attr('stroke', 'rgba(100, 100, 100, 0.5)')
        .attr('stroke-width', 1.5)
        .attr('marker-end', 'url(#arrow)');
    }

    // Arrow marker definition
    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', 'rgba(100, 100, 100, 0.5)');

    // Labels
    g.append('text')
      .attr('x', xScale(maxTime * 0.7))
      .attr('y', yScale(uniformRate) - 10)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('fill', '#ef4444')
      .style('font-weight', '600')
      .text('Uniform rate');

    g.append('text')
      .attr('x', xScale(maxTime * 0.2))
      .attr('y', yScale(optimalRate(maxTime * 0.2)) - 15)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('fill', '#3b82f6')
      .style('font-weight', '600')
      .text('Optimal n*(t) ∝ exp(-λt/2)');

  }, [trajectoryData, uniformRate, maxTime, optimalRate, currentTime, isPlaying]);

  return (
    <div className="my-8 p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          Temporal Optimization Flow
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Phase-space trajectory showing optimal sampling rate over time with exponential decay.
          The "front-loading principle": sample heavily early, then taper off.
        </p>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Decay Rate λ: {lambda.toFixed(4)}
          </label>
          <input
            type="range"
            min="0.001"
            max="0.1"
            step="0.001"
            value={lambda}
            onChange={(e) => {
              setLambda(Number(e.target.value));
              handleReset();
            }}
            className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-500 mt-1">
            <span>0.001</span>
            <span>0.1</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Time Horizon: {maxTime}
          </label>
          <input
            type="range"
            min="100"
            max="500"
            step="10"
            value={maxTime}
            onChange={(e) => {
              setMaxTime(Number(e.target.value));
              handleReset();
            }}
            className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-500 mt-1">
            <span>100</span>
            <span>500</span>
          </div>
        </div>
      </div>

      {/* Animation Controls */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
        >
          {isPlaying ? 'Pause' : currentTime >= maxTime ? 'Replay' : 'Play'}
        </button>

        <button
          onClick={handleReset}
          className="px-6 py-2 bg-slate-600 hover:bg-slate-700 text-white font-semibold rounded-lg transition-colors"
        >
          Reset
        </button>

        <div className="flex-1"></div>

        <div className="flex items-center text-sm text-slate-700 dark:text-slate-300">
          <span className="font-semibold mr-2">Time:</span>
          <span>{currentTime.toFixed(1)} / {maxTime}</span>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-300 dark:border-slate-600">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Total Samples (Optimal)</div>
          <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
            {totalSamples.toFixed(1)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-300 dark:border-slate-600">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Uniform Rate</div>
          <div className="text-lg font-bold text-red-600 dark:text-red-400">
            {uniformRate.toFixed(2)}/time
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-300 dark:border-slate-600">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Decay Half-life</div>
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {(Math.log(2) / lambda).toFixed(1)}
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
          <li><span className="text-blue-600 dark:text-blue-400 font-semibold">Blue curve</span>: Optimal sampling rate n*(t) ∝ exp(-λt/2)</li>
          <li><span className="text-red-600 dark:text-red-400 font-semibold">Red dashed line</span>: Constant uniform sampling rate</li>
          <li><span className="text-blue-600 dark:text-blue-400 font-semibold">Shaded area</span>: Total samples acquired (area under curve)</li>
          <li><span className="text-green-600 dark:text-green-400 font-semibold">Green marker</span>: Current time position (during animation)</li>
          <li>Gray arrows show flow direction (exponential decay)</li>
          <li><strong>Front-loading principle:</strong> Sample heavily when information is fresh, reduce rate as it decays</li>
        </ul>
      </div>
    </div>
  );
}
