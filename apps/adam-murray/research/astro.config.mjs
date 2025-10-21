import { defineConfig } from 'astro/config';
import UnoCSS from '@unocss/astro';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://vknot.love',
  base: '/adam-murray/research',
  output: 'static',
  integrations: [UnoCSS(), react(), mdx(), sitemap()],
  markdown: {
    remarkPlugins: ['remark-math'],
    rehypePlugins: ['rehype-katex']
  }
});

