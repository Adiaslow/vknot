import { defineConfig, presetUno, presetTypography } from 'unocss';
import { vknotTheme, vknotContent } from '@vknot/ui/uno.preset';

/**
 * UnoCSS config for the research subsite.
 *
 * Uses the shared @vknot/ui design-system theme so utility classes
 * like text-ink, bg-surface, border-rule resolve to the same CSS
 * variables that drive the Paper / Ink theme across every subsite.
 */
export default defineConfig({
  presets: [
    presetUno({ dark: 'class' }),
    presetTypography(),
  ],
  content: {
    filesystem: [
      './src/**/*.{astro,html,md,mdx,svelte,vue,js,jsx,ts,tsx}',
      ...vknotContent(),
    ],
  },
  theme: vknotTheme,
});
