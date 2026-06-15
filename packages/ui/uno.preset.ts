/**
 * @vknot/ui UnoCSS preset.
 *
 * Maps the design-token CSS variables declared in `src/styles/tokens.css`
 * onto UnoCSS theme entries. Utility classes like `bg-surface`, `text-ink`,
 * `border-rule`, `font-serif`, `text-accent-ink` therefore resolve directly
 * to the variables and follow the active Paper / Ink theme without
 * per-component `dark:` variants.
 *
 * The preset is imported by each subsite's `uno.config.ts`. Adding a new
 * design token is a two-step change: declare the variable in tokens.css,
 * mirror its name here, and the utility becomes available everywhere.
 *
 * Usage:
 *   import { defineConfig, presetUno } from 'unocss';
 *   import { vknotTheme, vknotContent } from '@vknot/ui/uno.preset';
 *
 *   export default defineConfig({
 *     presets: [presetUno({ dark: 'class' })],
 *     content: { filesystem: vknotContent() },
 *     theme: vknotTheme,
 *   });
 */

/** Token-bound color and typography entries for UnoCSS `theme`. */
export const vknotTheme = {
  colors: {
    paper:         'var(--paper)',
    surface:       'var(--surface)',
    'surface-2':   'var(--surface-2)',
    ink:           'var(--ink)',
    'ink-soft':    'var(--ink-soft)',
    muted:         'var(--muted)',
    faint:         'var(--faint)',
    rule:          'var(--rule)',
    'rule-strong': 'var(--rule-strong)',
    accent:        'var(--accent)',
    'accent-soft': 'var(--accent-soft)',
    'accent-ink':  'var(--accent-ink)',
  },
  fontFamily: {
    serif: 'var(--font-serif)',
    mono:  'var(--font-mono)',
  },
} as const;

/**
 * Filesystem globs every subsite should scan for class usage. Each subsite
 * passes its own local glob plus this one so utility classes used inside
 * @vknot/ui shared components are also discovered by UnoCSS.
 *
 *   content: { filesystem: ['./src/**\/*.{astro,...}', ...vknotContent()] }
 */
export function vknotContent(): string[] {
  return ['../../packages/ui/src/**/*.{ts,tsx,astro}'];
}
