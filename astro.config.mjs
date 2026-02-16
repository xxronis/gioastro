import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

const isCloudflare = process.env.ASTRO_ADAPTER === 'cloudflare';

export default defineConfig({
  output: 'server', // hybrid SSR + SSG still works; control per-route via prerender
  adapter: isCloudflare
    ? cloudflare()
    : node({ mode: 'standalone' }),
    // image: {
    //   service: { entrypoint: 'astro/assets/services/noop' } // disable sharp usage
    // },
  vite: { plugins: [tailwindcss()] },
});