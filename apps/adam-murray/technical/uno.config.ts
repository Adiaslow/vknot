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
      }
    }
  },
  safelist: [
    // Math component colors
    'border-blue-600', 'bg-blue-50', 'text-blue-900',
    'border-amber-600', 'bg-amber-50', 'text-amber-900',
    'border-emerald-600', 'bg-emerald-50', 'text-emerald-900',
    'border-purple-600', 'bg-purple-50', 'text-purple-900',
    'border-cyan-600', 'bg-cyan-50', 'text-cyan-900',
    'border-teal-600', 'bg-teal-50', 'text-teal-900',
    'border-rose-600', 'bg-rose-50', 'text-rose-900',
    'border-slate-400', 'bg-slate-50', 'text-slate-700',
    // Dark mode variants
    'dark:bg-blue-950/20', 'dark:border-blue-500', 'dark:text-blue-100',
    'dark:bg-amber-950/20', 'dark:border-amber-500', 'dark:text-amber-100',
    'dark:bg-emerald-950/20', 'dark:border-emerald-500', 'dark:text-emerald-100',
    'dark:bg-purple-950/20', 'dark:border-purple-500', 'dark:text-purple-100',
    'dark:bg-cyan-950/20', 'dark:border-cyan-500', 'dark:text-cyan-100',
    'dark:bg-teal-950/20', 'dark:border-teal-500', 'dark:text-teal-100',
    'dark:bg-rose-950/20', 'dark:border-rose-500', 'dark:text-rose-100',
    'dark:bg-slate-900/20', 'dark:border-slate-600', 'dark:text-slate-300',
  ]
});

