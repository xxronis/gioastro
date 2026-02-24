import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import type { Loader, LoaderContext } from 'astro/loaders';
import { getImagesFromEntity } from './lib/jsonapi-images';

// The content loader runs in Vite's build-time context, not the Astro request
// runtime, so astro:env/server is not available here. Use process.env directly.
function getBuildEnv() {
  // Content config runs in Vite's SSR module context (not Astro request runtime),
  // so astro:env/server is unavailable here. Try import.meta.env first (set by
  // Vite from .env.local), then fall back to process.env (CI/shell env vars).
  const base = (import.meta.env?.DRUPAL_BASE_URL ?? process.env.DRUPAL_BASE_URL) as string | undefined;
  const api  = (import.meta.env?.DRUPAL_API_BASE  ?? process.env.DRUPAL_API_BASE)  as string | undefined;
  if (!base || !api) throw new Error('DRUPAL_BASE_URL and DRUPAL_API_BASE must be set for the content loader.');
  return { base, api };
}

function asBaseUrl(raw: string): URL {
  const url = new URL(raw);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

export const workSchema = z.object({
  title: z.string(),
  alias: z.string(),
  body: z.string().optional(),
  images: z.array(z.object({
    src: z.string(),
    alt: z.string(),
    width: z.number().optional(),
    height: z.number().optional(),
  })),
  created: z.string().optional(),
});

/** Drupal content loader for the `work` collection.
 *
 * Used only for prerendered (static) pages — e.g. when you set
 * `export const prerender = true` and call `getCollection('work')`.
 *
 * For SSR pages (prerender = false) keep calling drupal.api() directly
 * in the page frontmatter so data is always fresh per request.
 */
export function drupalWorkLoader(): Loader {
  return {
    name: 'drupal-work-loader',
    async load({ store, parseData, logger }: LoaderContext) {
      let env: ReturnType<typeof getBuildEnv>;
      try {
        env = getBuildEnv();
      } catch (err) {
        logger.warn(`Skipping Drupal work loader: ${err}`);
        return;
      }

      logger.info('Fetching work entries from Drupal JSON:API...');
      store.clear();

      let response: { data: any[]; included?: any[] };
      try {
        const apiBase = asBaseUrl(env.api);
        const url = new URL('node/work', apiBase);
        url.searchParams.set('sort', '-created');
        url.searchParams.set('page[limit]', '100');
        url.searchParams.set('include', 'field_media,field_media.field_media_image');
        url.searchParams.set('fields[node--work]', 'title,path,body,created,field_media');

        const res = await fetch(url.toString(), {
          headers: { Accept: 'application/vnd.api+json' },
        });
        if (!res.ok) throw new Error(`JSON:API ${res.status}: ${url.pathname}`);
        response = await res.json();
      } catch (err) {
        logger.warn(`Could not fetch from Drupal API: ${err}`);
        return;
      }

      for (const node of response.data) {
        const alias = node.attributes?.path?.alias ?? `/node/${node.id}`;
        const images = getImagesFromEntity(node, response.included, env.base);

        const entry = await parseData({
          id: node.id,
          data: {
            title: node.attributes?.title ?? '',
            alias,
            body: node.attributes?.body?.processed ?? undefined,
            images,
            created: node.attributes?.created ?? undefined,
          },
        });

        store.set({ id: node.id, data: entry });
      }

      logger.info(`Loaded ${response.data.length} work entries.`);
    },
    schema: workSchema,
  };
}

export const collections = {
  work: defineCollection({
    loader: drupalWorkLoader(),
    schema: workSchema,
  }),
};
