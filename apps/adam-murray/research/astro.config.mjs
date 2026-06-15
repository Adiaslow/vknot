import { defineConfig } from 'astro/config';
import UnoCSS from '@unocss/astro';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  site: 'https://vknot.love',
  base: '/adam-murray/research',
  output: 'static',
  integrations: [UnoCSS(), react(), mdx(), sitemap()],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex]
  }
});
