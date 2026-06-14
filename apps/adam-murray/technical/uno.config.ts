import { defineConfig, presetUno } from 'unocss';

/**
 * UnoCSS theme is bound to the design tokens declared in
 * src/styles/tokens.css (the single source of truth). Utilities such as
 * `bg-surface`, `text-ink`, `border-rule`, `font-serif` resolve to the
 * CSS variables, so they automatically follow the active theme
 * (Paper / Ink) with no per-component `dark:` colour variants.
 *
 * Add a new colour ONCE in tokens.css, mirror its name here, and it is
 * available as a utility everywhere.
 */
export default defineConfig({
  // Long-form prose is hand-authored in src/styles/prose.css against the
  // design tokens, so presetTypography() is intentionally NOT used — it would
  // emit a second, gray-defaulted `.prose` system competing with the tokens.
  presets: [
    presetUno({ dark: 'class' }),
  ],
  content: {
    filesystem: [
      './src/**/*.{astro,html,md,mdx,svelte,vue,js,jsx,ts,tsx}',
      '../../packages/ui/src/**/*.{ts,tsx,astro}',
    ],
  },
  theme: {
    colors: {
      paper:       'var(--paper)',
      surface:     'var(--surface)',
      'surface-2': 'var(--surface-2)',
      ink:         'var(--ink)',
      'ink-soft':  'var(--ink-soft)',
      muted:       'var(--muted)',
      faint:       'var(--faint)',
      rule:        'var(--rule)',
      'rule-strong': 'var(--rule-strong)',
      accent:      'var(--accent)',
      'accent-soft': 'var(--accent-soft)',
      'accent-ink': 'var(--accent-ink)',
    },
    fontFamily: {
      serif: 'var(--font-serif)',
      mono:  'var(--font-mono)',
    },
  },
  // No colour safelist needed: math environments are styled in
  // environments.css via hue tokens, not generated utility classes.
});
