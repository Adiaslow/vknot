import { defineConfig } from 'astro/config';
import UnoCSS from '@unocss/astro';

export default defineConfig({
  site: 'https://vknot.love',
  base: '/',
  output: 'static',
  integrations: [UnoCSS()]
});

