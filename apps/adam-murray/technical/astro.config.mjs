import { defineConfig } from 'astro/config';
import UnoCSS from '@unocss/astro';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { remarkMathBlocks } from './src/plugins/remark-math-blocks.mjs';

// Dual-theme syntax highlighting. `defaultColor: false` makes Shiki emit a
// `--shiki-light` / `--shiki-dark` CSS variable on every token instead of a
// single baked-in colour, so the class-based Paper/Ink toggle can switch code
// colours with pure CSS — no JS, no invert() filter. Applied to both the mdx
// integration (all posts are .mdx) and markdown so the two stay in sync.
const shikiConfig = {
  themes: { light: 'github-light', dark: 'github-dark' },
  defaultColor: false,
};

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
      shikiConfig,
    }),
    react(),
    sitemap()
  ],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
    shikiConfig
  }
});

