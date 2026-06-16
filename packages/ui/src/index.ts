// Legacy navigation (used by older subsites; superseded by SiteHeader + SiteShell).
export { Navigation } from './navigation/Navigation';
export type {
  NavigationProps,
  NavLink,
  NavCta,
  NavigationTheme,
} from './navigation/Navigation';

// Shared design system: page chrome and primitives.
// Astro components are exposed both via the wildcard subpath export
// ("@vknot/ui/components/X.astro") and as named re-exports here for
// convenience — pick whichever import style suits the call site.
export { default as SEO } from './components/SEO.astro';
export { default as SiteShell } from './layouts/SiteShell.astro';
export { default as SiteHeader } from './components/SiteHeader.astro';
export { default as NodeRing } from './components/NodeRing.astro';
export { default as ThemeToggle } from './components/ThemeToggle.astro';
export { default as Colophon } from './components/Colophon.astro';
export { default as HeadEssentials } from './components/HeadEssentials.astro';
export { default as CategoryTag } from './components/CategoryTag.astro';

export type { SiteHeaderLink } from './components/SiteHeader.astro';

// arXiv category taxonomy (cached; see scripts/sync-taxonomy.mjs).
export {
  getCategory,
  isValidCategory,
  allCategories,
  categoryIds,
} from './lib/arxiv-taxonomy';
export type { ArxivCategory } from './lib/arxiv-taxonomy';
