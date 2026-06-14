import { useEffect, useState } from 'react';

/**
 * Resolved design-token values (the computed CSS custom properties), so JS-drawn
 * graphics — Observable Plot specs and the <canvas> simulator — can use the same
 * Paper / Ink palette as the rest of the site. SVG/Plot can lean on `currentColor`
 * for axes, but series colours and anything drawn to a canvas need real values.
 */
export interface ThemeTokens {
  paper: string;
  surface: string;
  surface2: string;
  ink: string;
  inkSoft: string;
  muted: string;
  faint: string;
  rule: string;
  ruleStrong: string;
  accent: string;
  accentSoft: string;
  accentInk: string;
  /** bumps on every re-read (mount + theme toggle); handy as a memo/effect dep */
  version: number;
}

// Fallbacks approximate Paper, used only during SSR / before first paint.
const FALLBACK: Omit<ThemeTokens, 'version'> = {
  paper: '#fbfbf9',
  surface: '#f6f5f2',
  surface2: '#efeee9',
  ink: '#2b2a27',
  inkSoft: '#56544e',
  muted: '#79766e',
  faint: '#a3a097',
  rule: '#e2ded5',
  ruleStrong: '#cfcabd',
  accent: '#3552c8',
  accentSoft: '#e6ebfb',
  accentInk: '#3346b8',
};

const MAP: Array<[keyof Omit<ThemeTokens, 'version'>, string]> = [
  ['paper', '--paper'],
  ['surface', '--surface'],
  ['surface2', '--surface-2'],
  ['ink', '--ink'],
  ['inkSoft', '--ink-soft'],
  ['muted', '--muted'],
  ['faint', '--faint'],
  ['rule', '--rule'],
  ['ruleStrong', '--rule-strong'],
  ['accent', '--accent'],
  ['accentSoft', '--accent-soft'],
  ['accentInk', '--accent-ink'],
];

function read(version: number): ThemeTokens {
  if (typeof window === 'undefined') return { ...FALLBACK, version };
  const cs = getComputedStyle(document.documentElement);
  const out = { version } as ThemeTokens;
  for (const [key, cssVar] of MAP) {
    out[key] = cs.getPropertyValue(cssVar).trim() || FALLBACK[key];
  }
  return out;
}

/**
 * Reads the design tokens after mount and re-reads whenever the Paper/Ink theme
 * toggles (a class change on <html>), returning a fresh object each time so it
 * can drive `useMemo`/`useEffect` dependencies.
 */
export function useThemeTokens(): ThemeTokens {
  const [tokens, setTokens] = useState<ThemeTokens>(() => read(0));

  useEffect(() => {
    let version = 0;
    const update = () => setTokens(read(++version));
    update(); // replace SSR fallbacks with the real computed values

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  return tokens;
}
