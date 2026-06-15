import { defineConfig } from 'astro/config';
import UnoCSS from '@unocss/astro';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://vknot.love',
  base: '/adam-murray/projects',
  output: 'static',
  integrations: [UnoCSS(), mdx(), react(), sitemap()],
  markdown: {
    shikiConfig: {
      theme: 'github-dark'
    }
  }
});
