import { defineConfig, envField } from 'astro/config';
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
  env: {
    schema: {
      DRUPAL_BASE_URL:           envField.string({ context: 'server', access: 'secret' }),
      DRUPAL_API_BASE:           envField.string({ context: 'server', access: 'secret' }),
      TURNSTILE_SECRET_KEY:      envField.string({ context: 'server', access: 'secret', optional: true }),
      RESEND_API_KEY:            envField.string({ context: 'server', access: 'secret', optional: true }),
      CONTACT_TO_EMAIL:          envField.string({ context: 'server', access: 'secret', optional: true }),
      CONTACT_FROM_EMAIL:        envField.string({ context: 'server', access: 'secret', optional: true }),
      CONTACT_SUBJECT_PREFIX:    envField.string({ context: 'server', access: 'secret', optional: true, default: '[Contact]' }),
      PUBLIC_TURNSTILE_SITE_KEY: envField.string({ context: 'client', access: 'public', optional: true }),
    },
  },
});
