import { useEffect, useRef, useState, useMemo } from 'react';
import * as Plot from '@observablehq/plot';
import {
  useThemeTokens,
  basePlot,
  PlotFigure,
  VizFigure,
  VizSurface,
  Slider,
  Button,
  StatCard,
  Legend,
} from './_viz';

const UNIFORM = '#ef4444'; // semantic: comparison baseline
const MARKER = '#10b981'; // semantic: current-time marker

export default function TemporalOptimizationFlow() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const animationRef = useRef<number>();

  // Parameters
  const [lambda, setLambda] = useState(0.01); // Decay rate
  const [I0] = useState(100); // Initial information
  const [maxTime, setMaxTime] = useState(300); // Time horizon

  const tokens = useThemeTokens();

  // Optimal sampling rate: n*(t) ∝ exp(-λt/2)
  const optimalRate = useMemo(() => {
    return (t: number) => {
      const peak = 50;
      return peak * Math.exp(-lambda * t / 2);
    };
  }, [lambda]);

  // Uniform sampling rate for comparison (constant rate equal to average of optimal)
  const uniformRate = useMemo(() => {
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
      points.push({ t, rate: optimalRate(t), info: informationDecay(t) });
    }
    return points;
  }, [maxTime, optimalRate, informationDecay]);

  // Total samples (area under curve)
  const totalSamples = useMemo(() => {
    return trajectoryData.reduce((sum, point, i) => {
      if (i === 0) return 0;
      const prev = trajectoryData[i - 1];
      const dt = point.t - prev.t;
      const avg = (point.rate + prev.rate) / 2;
      return sum + avg * dt;
    }, 0);
  }, [trajectoryData]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying) return;
    const animate = () => {
      setCurrentTime((prev) => {
        if (prev >= maxTime) {
          setIsPlaying(false);
          return maxTime;
        }
        return prev + 0.5;
      });
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, maxTime]);

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // Plot spec — rebuilt when data, animation state, or theme tokens change.
  const options = useMemo(() => {
    const yMax = Math.max(...trajectoryData.map((d) => d.rate)) * 1.1;
    const areaData = trajectoryData.filter((d) => d.t <= currentTime || !isPlaying);

    // Vector field along the tangent (showing exponential-decay direction)
    const numVectors = 10;
    const dt = maxTime * 0.025;
    const vectors = Array.from({ length: numVectors - 1 }, (_, idx) => {
      const t = (idx + 1) * (maxTime / numVectors);
      const rate = optimalRate(t);
      const slope = (-lambda / 2) * rate; // dn/dt
      return { t, rate, t2: t + dt, rate2: rate + slope * dt };
    });

    const marks: Plot.Markish[] = [
      Plot.areaY(areaData, {
        x: 't',
        y: 'rate',
        fill: tokens.accent,
        fillOpacity: 0.16,
        curve: 'monotone-x',
      }),
      Plot.arrow(vectors, {
        x1: 't',
        y1: 'rate',
        x2: 't2',
        y2: 'rate2',
        stroke: tokens.muted,
        strokeWidth: 1.2,
        headLength: 5,
      }),
      Plot.lineY(trajectoryData, {
        x: 't',
        y: 'rate',
        stroke: tokens.accent,
        strokeWidth: 3,
        curve: 'monotone-x',
      }),
      Plot.ruleY([uniformRate], {
        stroke: UNIFORM,
        strokeWidth: 2,
        strokeDasharray: '8,4',
      }),
      Plot.text([{ x: maxTime * 0.72, y: uniformRate, label: 'Uniform rate' }], {
        x: 'x',
        y: 'y',
        text: 'label',
        fill: UNIFORM,
        dy: -8,
        fontWeight: 600,
      }),
      Plot.text(
        [{ x: maxTime * 0.22, y: optimalRate(maxTime * 0.22), label: 'Optimal n*(t) ∝ exp(-λt/2)' }],
        { x: 'x', y: 'y', text: 'label', fill: tokens.accent, dy: -12, fontWeight: 600 },
      ),
    ];

    if (isPlaying && currentTime < maxTime) {
      marks.push(
        Plot.ruleX([currentTime], { stroke: MARKER, strokeWidth: 2, strokeDasharray: '5,5' }),
        Plot.dot([{ t: currentTime, rate: optimalRate(currentTime) }], {
          x: 't',
          y: 'rate',
          r: 5,
          fill: MARKER,
          stroke: tokens.surface,
          strokeWidth: 2,
        }),
      );
    }

    return basePlot(tokens, {
      width: 700,
      height: 420,
      marginLeft: 64,
      marginBottom: 48,
      x: { label: 'Time t →', domain: [0, maxTime] },
      y: { label: '↑ Sampling rate n(t)', domain: [0, yMax], grid: true },
      marks,
    });
  }, [trajectoryData, uniformRate, maxTime, currentTime, isPlaying, lambda, optimalRate, tokens]);

  return (
    <VizFigure
      title="Temporal Optimization Flow"
      description={
        'Phase-space trajectory showing the optimal sampling rate over time under exponential decay. ' +
        'The "front-loading principle": sample heavily early, then taper off.'
      }
      footer={
        <div className="mt-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <p style={{ margin: '0 0 0.5rem' }}>
            <strong>Front-loading principle:</strong> sample heavily when information is fresh, reduce
            the rate as it decays.
          </p>
          <Legend
            items={[
              { color: tokens.accent, label: 'Optimal rate n*(t) ∝ exp(-λt/2) + acquired samples' },
              { color: UNIFORM, label: 'Constant uniform sampling rate' },
              { color: MARKER, label: 'Current time position (during animation)' },
              { color: tokens.muted, label: 'Flow direction (decay)' },
            ]}
          />
        </div>
      }
    >
      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Slider
          label="Decay rate λ"
          value={lambda}
          min={0.001}
          max={0.1}
          step={0.001}
          display={lambda.toFixed(4)}
          scale={['0.001', '0.1']}
          onChange={(v) => {
            setLambda(v);
            handleReset();
          }}
        />
        <Slider
          label="Time horizon"
          value={maxTime}
          min={100}
          max={500}
          step={10}
          display={maxTime}
          scale={['100', '500']}
          onChange={(v) => {
            setMaxTime(v);
            handleReset();
          }}
        />
      </div>

      {/* Animation controls */}
      <div className="flex items-center gap-3 mb-6">
        <Button onClick={() => setIsPlaying(!isPlaying)}>
          {isPlaying ? 'Pause' : currentTime >= maxTime ? 'Replay' : 'Play'}
        </Button>
        <Button variant="secondary" onClick={handleReset}>
          Reset
        </Button>
        <div className="flex-1" />
        <span className="viz-value">
          Time: {currentTime.toFixed(1)} / {maxTime}
        </span>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total samples (optimal)" value={totalSamples.toFixed(1)} tone="accent" />
        <StatCard label="Uniform rate" value={`${uniformRate.toFixed(2)}/time`} />
        <StatCard label="Decay half-life" value={(Math.log(2) / lambda).toFixed(1)} />
      </div>

      <VizSurface>
        <PlotFigure options={options} />
      </VizSurface>
    </VizFigure>
  );
}
