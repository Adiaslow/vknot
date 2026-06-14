import { useMemo, useState } from 'react';
import * as Plot from '@observablehq/plot';
import {
  useThemeTokens,
  basePlot,
  PlotFigure,
  VizFigure,
  VizSurface,
  Slider,
  StatCard,
  Legend,
} from './_viz';

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

const CRIT = '#ef4444'; // semantic: theoretical critical threshold
const INFL = '#f97316'; // semantic: true inflection point
const ZONE = 'rgba(250, 204, 21, 0.14)'; // semantic: phase-transition zone
const ZONE_EDGE = 'rgba(202, 138, 4, 0.45)';

export default function PhaseTransitionExplorer() {
  // Parameters
  const [U, setU] = useState(10000); // Unique entities
  const [R, setR] = useState(100); // Redundancy
  const [epsilon, setEpsilon] = useState(0.05); // Target coverage (1 - epsilon)

  const tokens = useThemeTokens();

  // Computed values
  const S = useMemo(() => U * R, [U, R]); // Synthesis space size

  // Probability function: P(C(α) > 1-ε) — exact formula from Theorem 4.1 via Poisson
  const probabilityFunction = useMemo(() => {
    return (alpha: number) => {
      const lambda = U * Math.exp(-alpha * R); // expected uncovered coupons
      return poissonCDF(epsilon * U, lambda); // P(uncovered ≤ ε|U|) = P(coverage ≥ 1-ε)
    };
  }, [U, R, epsilon]);

  // Critical sampling fraction: α_c = log(1/ε) / R
  const alphaCritical = useMemo(() => Math.log(1 / epsilon) / R, [epsilon, R]);

  // Sample count at critical point
  const samplesCritical = useMemo(() => Math.ceil(alphaCritical * S), [alphaCritical, S]);

  // Speedup factor vs complete enumeration = |S| / samples
  const speedup = useMemo(() => S / samplesCritical, [S, samplesCritical]);

  // Diagnostic: probability at critical point (should be ≈ 0.5)
  const probabilityAtCritical = useMemo(
    () => probabilityFunction(alphaCritical),
    [probabilityFunction, alphaCritical],
  );

  // True inflection point: α_inflection = log(1/(ε + 1/|U|)) / R
  const alphaInflection = useMemo(
    () => Math.log(1 / (epsilon + 1 / U)) / R,
    [epsilon, U, R],
  );

  // Offset between theoretical and actual inflection point (percentage)
  const inflectionOffset = useMemo(
    () => ((alphaInflection - alphaCritical) / alphaCritical) * 100,
    [alphaInflection, alphaCritical],
  );

  // Generate probability curve data
  const curveData = useMemo(() => {
    const points: Array<{ alpha: number; probability: number }> = [];
    const numPoints = 200;
    const maxAlpha = Math.min(alphaCritical * 3, 1); // up to 3× critical or 100%
    for (let i = 0; i <= numPoints; i++) {
      const alpha = (i / numPoints) * maxAlpha;
      points.push({ alpha, probability: probabilityFunction(alpha) });
    }
    return points;
  }, [alphaCritical, probabilityFunction]);

  const showInflection =
    Math.abs(alphaInflection - alphaCritical) / alphaCritical > 0.001;

  // Plot spec
  const options = useMemo(() => {
    const maxAlpha = Math.max(...curveData.map((d) => d.alpha));
    const tw = 0.15; // transition half-width fraction
    const zoneStart = Math.max(0, alphaCritical - alphaCritical * tw);
    const zoneEnd = Math.min(maxAlpha, alphaCritical + alphaCritical * tw);

    const marks: Plot.Markish[] = [
      Plot.rect([{ x1: zoneStart, x2: zoneEnd }], {
        x1: 'x1',
        x2: 'x2',
        y1: 0,
        y2: 1,
        fill: ZONE,
        stroke: ZONE_EDGE,
        strokeWidth: 1,
        strokeDasharray: '5,5',
      }),
      Plot.lineY(curveData, {
        x: 'alpha',
        y: 'probability',
        stroke: tokens.accent,
        strokeWidth: 3,
        curve: 'monotone-x',
        tip: { format: { x: '.4f', y: '.1%' } },
      }),
      Plot.ruleX([alphaCritical], { stroke: CRIT, strokeWidth: 2, strokeDasharray: '8,4' }),
      Plot.dot([{ alpha: alphaCritical, probability: probabilityFunction(alphaCritical) }], {
        x: 'alpha',
        y: 'probability',
        r: 6,
        fill: CRIT,
        stroke: tokens.surface,
        strokeWidth: 2,
      }),
      Plot.text([{ x: alphaCritical, y: 1, label: `α_c = ${alphaCritical.toExponential(2)}` }], {
        x: 'x',
        y: 'y',
        text: 'label',
        fill: CRIT,
        dy: -6,
        fontWeight: 600,
      }),
    ];

    if (showInflection) {
      marks.push(
        Plot.ruleX([alphaInflection], { stroke: INFL, strokeWidth: 2, strokeDasharray: '4,4' }),
        Plot.dot([{ alpha: alphaInflection, probability: probabilityFunction(alphaInflection) }], {
          x: 'alpha',
          y: 'probability',
          r: 5,
          fill: INFL,
          stroke: tokens.surface,
          strokeWidth: 2,
        }),
        Plot.text([{ x: alphaInflection, y: 1, label: `α_infl = ${alphaInflection.toExponential(2)}` }], {
          x: 'x',
          y: 'y',
          text: 'label',
          fill: INFL,
          dy: -20,
          fontWeight: 600,
        }),
      );
    }

    return basePlot(tokens, {
      width: 700,
      height: 430,
      marginLeft: 60,
      marginBottom: 50,
      marginTop: 44,
      x: { label: 'Sampling fraction α = n/|S| →', domain: [0, maxAlpha], tickFormat: '.3f' },
      y: { label: '↑ P(coverage ≥ 1−ε)', domain: [0, 1], percent: true, grid: true },
      marks,
    });
  }, [curveData, alphaCritical, alphaInflection, showInflection, probabilityFunction, tokens]);

  const fmtSpeedup = speedup >= 100 ? Math.round(speedup).toLocaleString() : speedup.toFixed(1);

  return (
    <VizFigure
      title="Phase Transition Explorer"
      description="The sharp phase transition in P(coverage ≥ 1−ε) at the critical threshold α_c. Adjust the parameters to see the S-curve behaviour predicted by Theorem 4.1."
      footer={
        <Legend
          items={[
            { color: tokens.accent, label: 'P(coverage ≥ 1−ε), exact Poisson CDF' },
            { color: CRIT, label: 'Critical threshold α_c = log(1/ε)/R' },
            ...(showInflection ? [{ color: INFL, label: 'True inflection α_infl' }] : []),
            { color: 'rgba(202,138,4,0.6)', label: 'Phase-transition zone' },
          ]}
        />
      }
    >
      {/* Parameter guide */}
      <div
        className="mb-6 rounded-lg p-3 text-xs"
        style={{ background: 'var(--accent-soft)', border: '1px solid var(--rule)', color: 'var(--ink-soft)' }}
      >
        <p className="font-semibold mb-2">Parameter guide</p>
        <ul className="space-y-1 ml-2">
          <li><strong>|U|</strong> (unique entities): distinct chemical entities in the library</li>
          <li><strong>R</strong> (redundancy): synthesis paths per unique entity (|S|/|U|)</li>
          <li><strong>ε</strong> (tolerance): max fraction of uncovered entities (target coverage 1−ε)</li>
          <li><strong>α_c</strong> (critical point): sampling fraction at the transition = log(1/ε)/R</li>
        </ul>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Slider
          label="Unique entities |U|"
          value={U}
          min={1000}
          max={1000000}
          step={1000}
          display={U.toLocaleString()}
          hint="Larger |U| sharpens the transition"
          scale={['10³', '10⁶']}
          onChange={setU}
        />
        <Slider
          label="Redundancy R = |S|/|U|"
          value={R}
          min={10}
          max={100000}
          step={10}
          display={R.toLocaleString()}
          hint="Higher R moves α_c left"
          scale={['10', '10⁵']}
          onChange={setR}
        />
        <Slider
          label="Coverage tolerance ε"
          value={epsilon}
          min={0.001}
          max={0.5}
          step={0.001}
          display={epsilon.toFixed(3)}
          hint="Smaller ε moves α_c right"
          scale={['0.001', '0.5']}
          onChange={setEpsilon}
        />
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <StatCard label="Synthesis space (|S| = |U|×R)" value={S.toExponential(2)} />
        <StatCard label="Samples needed (α_c × |S|)" value={samplesCritical.toLocaleString()} tone="accent" />
        <StatCard label="Speedup (|S|/samples)" value={`${fmtSpeedup}×`} />
      </div>

      {/* Diagnostics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Critical point α_c" value={alphaCritical.toExponential(3)} valueColor={CRIT} />
        <StatCard label="True inflection α_infl" value={alphaInflection.toExponential(3)} valueColor={INFL} />
        <StatCard label="Probability at α_c" value={`${(probabilityAtCritical * 100).toFixed(1)}%`} />
        <StatCard
          label="Inflection offset"
          value={`${Math.abs(inflectionOffset) < 0.01 ? '< 0.01' : inflectionOffset.toFixed(2)}%`}
        />
      </div>

      <VizSurface>
        <PlotFigure options={options} />
      </VizSurface>
    </VizFigure>
  );
}
