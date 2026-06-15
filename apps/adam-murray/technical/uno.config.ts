import { defineConfig, presetUno } from 'unocss';
import { vknotTheme, vknotContent } from '@vknot/ui/uno.preset';

/**
 * UnoCSS config for the technical subsite.
 *
 * Long-form prose is hand-authored in `@vknot/ui/styles/prose.css` against
 * the design tokens, so presetTypography() is intentionally NOT used — it
 * would emit a second, gray-defaulted `.prose` system competing with the
 * tokens. Math environments are styled in `environments.css` via hue
 * tokens, not generated utility classes, so no color safelist is needed.
 */
export default defineConfig({
  presets: [
    presetUno({ dark: 'class' }),
  ],
  content: {
    filesystem: [
      './src/**/*.{astro,html,md,mdx,svelte,vue,js,jsx,ts,tsx}',
      ...vknotContent(),
    ],
  },
  theme: vknotTheme,
});
