import { defineConfig, presetUno, presetTypography } from 'unocss';

export default defineConfig({
  presets: [
    presetUno(),
    presetTypography(),
  ],
  content: {
    filesystem: [
      './src/**/*.{astro,html,md,mdx,svelte,vue,js,jsx,ts,tsx}',
      '../../packages/ui/src/**/*.{ts,tsx,astro}'
    ]
  },
  theme: {
    colors: {
      primary: {
        50: '#f0f9ff',
        500: '#0ea5e9',
        600: '#0284c7',
        700: '#0369a1',
      },
      // Warm indie color palette
      cream: {
        50: '#fdfcfa',
        100: '#f5f1ea',
        200: '#e8dcc8',
        300: '#d9c9ab',
      },
      warmGray: {
        400: '#b3a28a',
        500: '#a39074',
        600: '#8a7a5f',
      },
      terracotta: {
        400: '#d89178',
        500: '#c97a5f',
        600: '#b56548',
      }
    },
    fontFamily: {
      sans: ['Space Grotesk', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
    }
  }
});

