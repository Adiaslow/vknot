import { defineConfig } from 'astro/config';
import UnoCSS from '@unocss/astro';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import image from '@astrojs/image';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  site: 'https://vknot.love',
  base: '/adam-murray/technical',
  output: 'static',
  integrations: [UnoCSS(), image(), mdx(), react({ experimentalReactChildren: true }), sitemap()],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
    shikiConfig: {
      theme: 'github-dark'
    }
  }
});

