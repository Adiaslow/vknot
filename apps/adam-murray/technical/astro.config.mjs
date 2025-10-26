import { defineConfig } from 'astro/config';
import UnoCSS from '@unocss/astro';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { remarkMathBlocks } from './src/plugins/remark-math-blocks.mjs';

export default defineConfig({
  site: 'https://vknot.love',
  base: '/adam-murray/technical',
  output: 'static',
  integrations: [
    UnoCSS(),
    mdx({
      remarkPlugins: [remarkMath, remarkMathBlocks],
      rehypePlugins: [rehypeKatex],
      extendMarkdownConfig: false,
    }),
    react(),
    sitemap()
  ],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
    shikiConfig: {
      theme: 'github-light'
    }
  }
});

