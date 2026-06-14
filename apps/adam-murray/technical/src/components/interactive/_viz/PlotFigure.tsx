import { useEffect, useRef } from 'react';
import * as Plot from '@observablehq/plot';
import type { ThemeTokens } from './useThemeTokens';

/**
 * Token-driven defaults shared by every chart. Plot draws axes, ticks, grid and
 * labels with `currentColor`, so setting `color` on the root themes all of them
 * at once; series colours are passed per-mark by the caller (resolved token
 * values from useThemeTokens, or fixed semantic hues). Spread the result's
 * siblings after this call to override anything.
 */
export function basePlot(
  tokens: ThemeTokens,
  options: Plot.PlotOptions,
): Plot.PlotOptions {
  return {
    style: {
      background: 'transparent',
      color: tokens.inkSoft,
      fontFamily: 'var(--font-mono)',
      fontSize: '12px',
      overflow: 'visible',
    },
    ...options,
  };
}

export interface PlotFigureProps {
  /** A Plot spec (what you'd pass to Plot.plot). Memoize it with useMemo. */
  options: Plot.PlotOptions;
  className?: string;
}

/**
 * Renders an Observable Plot into the DOM and swaps it whenever `options`
 * changes. Memoize `options` so it only re-renders when its real inputs — data,
 * parameters, or theme tokens — change.
 */
export default function PlotFigure({ options, className }: PlotFigureProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const figure = Plot.plot(options);
    el.replaceChildren(figure);
    return () => figure.remove();
  }, [options]);

  return <div ref={ref} className={className} />;
}
