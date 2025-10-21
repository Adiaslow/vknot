import { defineConfig } from 'astro/config';
import UnoCSS from '@unocss/astro';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import image from '@astrojs/image';
import partytown from '@astrojs/partytown';

export default defineConfig({
  site: 'https://vknot.love',
  base: '/tender_circuits',
  output: 'static',
  integrations: [UnoCSS(), react(), image(), partytown({}) , sitemap()]
});

