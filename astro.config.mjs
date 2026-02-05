// @ts-check
import { defineConfig } from 'astro/config';
// import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  // adapter: cloudflare(),
  adapter: node({
    mode: 'standalone' // or 'middleware' if you embed in your own server
  }),
  vite: {
    plugins: [tailwindcss()]
  }
});