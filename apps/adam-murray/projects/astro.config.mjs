import { defineConfig } from 'astro/config';
import UnoCSS from '@unocss/astro';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import image from '@astrojs/image';

export default defineConfig({
  site: 'https://vknot.love',
  base: '/adam-murray/projects',
  output: 'static',
  integrations: [UnoCSS(), image(), mdx(), react({ experimentalReactChildren: true }), sitemap()],
  markdown: {
    shikiConfig: {
      theme: 'github-dark'
    }
  }
});

