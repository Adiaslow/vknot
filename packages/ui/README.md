# @vknot/ui

The shared design system for the adam-murray subsites
(`/adam-murray/technical`, `/adam-murray/research`, `/adam-murray/projects`,
`/adam-murray/software`). Every visible piece of chrome — typography,
colour, header, footer, theme toggle, page shell, math environments,
code blocks — lives here so the sites stay visually unified by
construction and a change to the design language is a single-file edit.

## What's in the box

```
packages/ui/
├── uno.preset.ts                 ← shared UnoCSS theme + content globs
├── src/
│   ├── index.ts                  ← named exports (SiteShell, SiteHeader, …)
│   ├── styles/                   ← design-system CSS, themable
│   │   ├── tokens.css            ← the single source of truth: variables
│   │   ├── base.css              ← element defaults bound to tokens
│   │   ├── prose.css             ← long-form reading column
│   │   ├── environments.css      ← Theorem / Lemma / Proof callouts
│   │   ├── code-blocks.css       ← Shiki frame, both Paper/Ink palettes
│   │   └── index.css             ← the entry point that imports the above
│   ├── components/               ← Astro primitives
│   │   ├── SEO.astro             ← head <meta> tags
│   │   ├── NodeRing.astro        ← brand mark (deterministic SVG)
│   │   ├── ThemeToggle.astro     ← Paper / Ink switch
│   │   ├── HeadEssentials.astro  ← font links + flash-free theme bootstrap
│   │   ├── SiteHeader.astro      ← themed top nav (per-site links via props)
│   │   └── Colophon.astro        ← footer (NodeRing + copyright)
│   ├── layouts/
│   │   └── SiteShell.astro       ← full page chrome with named slots
│   ├── lib/
│   │   └── node-ring.ts          ← pure deterministic ring generator
│   └── navigation/               ← (legacy <Navigation>; superseded by SiteHeader)
```

## How to consume it

### From an Astro layout

```astro
---
import { SiteShell, SiteHeader } from '@vknot/ui';
---

<SiteShell title="My Page" description="…">
  <SiteHeader
    slot="header"
    siteName="My Site"
    baseUrl="/my/base"
    links={[
      { href: "/my/base",      label: "Home" },
      { href: "/my/base/about", label: "About" },
    ]}
  />

  <p>page body</p>
</SiteShell>
```

`SiteShell` imports `styles/index.css` itself, so consumers don't import
CSS manually. The shell exposes three named slots:

| Slot     | Purpose                                                 |
|----------|---------------------------------------------------------|
| `header` | Per-site nav. Pass `<SiteHeader />` with site-specific props. |
| (default) | Page body. Rendered inside `<main class="page">`.       |
| `footer` | Optional. Defaults to `<Colophon />` if not supplied.   |

### From an Astro UnoCSS config

```ts
import { defineConfig, presetUno } from 'unocss';
import { vknotTheme, vknotContent } from '@vknot/ui/uno.preset';

export default defineConfig({
  presets: [presetUno({ dark: 'class' })],
  content: {
    filesystem: [
      './src/**/*.{astro,html,md,mdx,svelte,vue,js,jsx,ts,tsx}',
      ...vknotContent(),
    ],
  },
  theme: vknotTheme,
});
```

This wires up utility classes like `text-ink`, `bg-surface`,
`border-rule`, `text-accent-ink`, `font-mono`, … so they resolve to the
design tokens and follow the Paper / Ink theme automatically.

## Design tokens

All theme values are CSS variables declared in `src/styles/tokens.css`.
Token names are the single source of truth — they are mirrored by the
UnoCSS preset (`uno.preset.ts`) and consumed by every component, layout,
and per-subsite page. Adding a colour or geometry value is a two-step
change: declare it in `tokens.css`, mirror its name in `uno.preset.ts`.

### Foundation colours

| Token            | Paper                 | Ink                   | Use                |
|------------------|-----------------------|-----------------------|--------------------|
| `--paper`        | page background       | page background       | the canvas         |
| `--surface`      | raised panel          | raised panel          | cards, code frames |
| `--surface-2`    | sunk / code           | sunk / code           | pre, inline code   |
| `--ink`          | primary text          | primary text          | h1, p              |
| `--ink-soft`     | secondary text        | secondary text        | summaries          |
| `--muted`        | metadata              | metadata              | dates, captions    |
| `--faint`        | very subtle           | very subtle           | tertiary captions  |
| `--rule`         | hairlines             | hairlines             | borders            |
| `--rule-strong`  | stronger hairlines    | stronger hairlines    | emphasised borders |
| `--accent`       | deep plate accent     | (brighter)            | active states, links |
| `--accent-soft`  | accent tint           | accent tint           | hover backgrounds  |
| `--accent-ink`   | accent text           | accent text           | anchor colour      |

### Geometry

| Token             | Default     | Meaning                                    |
|-------------------|-------------|--------------------------------------------|
| `--prose-measure` | `68ch`      | width cap for `.prose` long-form columns   |
| `--maxw`          | `56rem`     | maximum page-column width                  |

A layout can override `--prose-measure` on its `<article class="prose">`
to widen or narrow its reading column — the technical subsite does this
to fit math environments and the interactive simulator:

```astro
<article class="prose" style="--prose-measure: var(--maxw)">
  <slot />
</article>
```

### Typography

| Token          | Default                                       |
|----------------|-----------------------------------------------|
| `--font-serif` | `Spectral, Georgia, Cambria, "Times New Roman", serif` |
| `--font-mono`  | `IBM Plex Mono, ui-monospace, "SF Mono", Menlo, monospace` |

### Math-environment hues

`environments.css` reads per-kind hue tokens (`--h-theorem`,
`--h-definition`, `--h-lemma`, `--h-corollary`, `--h-conjecture`,
`--h-example`, `--h-assumption`, `--h-remark`) and builds matching
background + foreground in `oklch()` from them. Adjust a hue in
`tokens.css` and every theorem block on every page picks up the change.

## Theme toggle

The Paper / Ink theme is controlled by the `.dark` class on
`<html>`, persisted to `localStorage["am-theme"]`. The
`HeadEssentials.astro` component (included automatically by SiteShell)
ships an inline boot script that sets the class before first paint
based on saved preference or `prefers-color-scheme`, so there is no
flash of incorrect theme. `ThemeToggle.astro` provides the in-page UI.
