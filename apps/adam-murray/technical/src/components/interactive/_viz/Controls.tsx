import type { ReactNode, ChangeEvent } from 'react';

/**
 * Shared, token-styled chrome for the interactive figures: frame, controls,
 * stat cards and legend. Keeps every visualiser visually consistent and drives
 * all colour from design tokens (see viz.css). Layout-only utility classes
 * (grids, gaps) are left to each caller.
 */

export function VizFigure({
  title,
  description,
  children,
  footer,
  className,
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <figure className={`viz-figure ${className ?? ''}`}>
      {(title || description) && (
        <figcaption className="viz-head">
          {title && <div className="viz-title">{title}</div>}
          {description && <p className="viz-desc">{description}</p>}
        </figcaption>
      )}
      {children}
      {footer && <div className="viz-foot">{footer}</div>}
    </figure>
  );
}

/** A chart/canvas surface (paper card with a hairline border). */
export function VizSurface({ children }: { children: ReactNode }) {
  return <div className="viz-surface">{children}</div>;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  display,
  hint,
  scale,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** formatted current value shown beside the label */
  display?: ReactNode;
  hint?: string;
  /** [minLabel, maxLabel] shown under the track */
  scale?: [string, string];
}) {
  return (
    <div className="viz-control">
      <div className="viz-control-row">
        <span className="viz-label">{label}</span>
        {display != null && <span className="viz-value">{display}</span>}
      </div>
      {hint && <p className="viz-hint">{hint}</p>}
      <input
        type="range"
        className="viz-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
      />
      {scale && (
        <div className="viz-scale">
          <span>{scale[0]}</span>
          <span>{scale[1]}</span>
        </div>
      )}
    </div>
  );
}

export function Button({
  variant = 'primary',
  onClick,
  children,
}: {
  variant?: 'primary' | 'secondary' | 'ghost';
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={`viz-btn viz-btn--${variant}`} onClick={onClick}>
      {children}
    </button>
  );
}

export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="viz-control">
      <span className="viz-label">{label}</span>
      <select
        className="viz-select"
        value={value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function StatCard({
  label,
  value,
  tone,
  valueColor,
}: {
  label: ReactNode;
  value: ReactNode;
  /** 'accent' tints the value with the brand colour; otherwise ink */
  tone?: 'accent';
  /** explicit semantic colour for the value (e.g. to mirror a chart element) */
  valueColor?: string;
}) {
  return (
    <div className="viz-stat">
      <div className="viz-stat-label">{label}</div>
      <div
        className="viz-stat-value"
        data-tone={tone}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

export function Legend({
  items,
}: {
  items: ReadonlyArray<{ color: string; label: ReactNode }>;
}) {
  return (
    <div className="viz-legend">
      {items.map((it, i) => (
        <span className="viz-legend-item" key={i}>
          <span className="viz-legend-swatch" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
