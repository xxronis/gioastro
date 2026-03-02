import { defineCollection } from 'astro:content';
import { loadEnv } from 'vite';
import { z } from 'astro/zod';
import type { Loader, LoaderContext } from 'astro/loaders';
import { getImagesFromEntity } from './lib/jsonapi-images';
import { resolveStatusLabel } from './lib/field-utils';

// loadEnv reads .env, .env.local, .env.production etc. from the project root.
// '' = load ALL vars (not just VITE_-prefixed ones).
// Falls back to process.env for CI/shell-injected vars (CF Pages build env vars).
const rawEnv = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
const DRUPAL_BASE_URL = rawEnv.DRUPAL_BASE_URL ?? process.env.DRUPAL_BASE_URL;
const DRUPAL_API_BASE = rawEnv.DRUPAL_API_BASE  ?? process.env.DRUPAL_API_BASE;

// ─── Shared helpers ────────────────────────────────────────────────────────────

function asBaseUrl(raw: string): URL {
  const url = new URL(raw);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

/** Build an included-resource lookup map from a JSON:API response. */
function buildIncludedMap(included: any[] = []): Map<string, any> {
  const map = new Map<string, any>();
  for (const e of included) map.set(`${e.type}::${e.id}`, e);
  return map;
}

// ─── Work collection ──────────────────────────────────────────────────────────

export const workSchema = z.object({
  title: z.string(),
  alias: z.string(),
  promoted: z.boolean().optional(),
  body: z.string().optional(),
  images: z.array(z.object({
    src: z.string(),
    alt: z.string(),
    width: z.number().optional(),
    height: z.number().optional(),
  })),
  categories: z.array(z.object({
    name: z.string(),
    slug: z.string(),
  })).optional(),
  tags: z.array(z.object({
    name: z.string(),
    slug: z.string(),
  })).optional(),
  statuses: z.array(z.string()).optional(),
  created: z.string().optional(),
  metatag: z.array(z.object({
    tag: z.string(),
    attributes: z.record(z.string(), z.string()),
  })).optional().default([]),
});

export function drupalWorkLoader(options: {
  baseUrl: string | undefined;
  apiBase: string | undefined;
}): Loader {
  return {
    name: 'drupal-work-loader',
    async load({ store, parseData, logger }: LoaderContext) {
      if (!options.baseUrl || !options.apiBase) {
        logger.warn('DRUPAL_BASE_URL / DRUPAL_API_BASE not set — skipping work collection load.');
        return;
      }

      logger.info('Fetching work entries from Drupal JSON:API...');
      store.clear();

      const apiBase = asBaseUrl(options.apiBase);
      let response: { data: any[]; included?: any[] };
      try {
        const url = new URL('node/work', apiBase);
        url.searchParams.set('sort', '-created');
        url.searchParams.set('page[limit]', '100');
        url.searchParams.set('include', 'field_category,field_tags,field_media,field_media.field_media_image');
        url.searchParams.set('fields[node--work]', 'title,path,body,created,promote,field_category,field_tags,field_status,field_media,metatag');

        const res = await fetch(url.toString(), { headers: { Accept: 'application/vnd.api+json' } });
        if (!res.ok) throw new Error(`JSON:API ${res.status}: ${url.pathname}`);
        response = await res.json();
      } catch (err) {
        logger.warn(`Could not fetch work from Drupal API: ${err}`);
        return;
      }

      const includedMap = buildIncludedMap(response.included);

      for (const node of response.data) {
        const alias = node.attributes?.path?.alias ?? `/node/${node.id}`;
        const images = getImagesFromEntity(node, response.included, options.baseUrl);

        // Resolve field_category taxonomy terms from included
        const categoryRels: any[] = node.relationships?.field_category?.data ?? [];
        const categories = categoryRels
          .map((rel: any) => {
            const term = includedMap.get(`${rel.type}::${rel.id}`);
            const name: string = term?.attributes?.name ?? '';
            const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            return name ? { name, slug } : null;
          })
          .filter(Boolean) as { name: string; slug: string }[];

        // Resolve field_tags taxonomy terms from included
        const tagRels: any[] = node.relationships?.field_tags?.data ?? [];
        const tags = tagRels
          .map((rel: any) => {
            const term = includedMap.get(`${rel.type}::${rel.id}`);
            const name: string = term?.attributes?.name ?? '';
            const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            return name ? { name, slug } : null;
          })
          .filter(Boolean) as { name: string; slug: string }[];

        // field_status is a list_string field — resolve key to human-readable label
        const rawStatuses: any = node.attributes?.field_status;
        const statuses: string[] = (Array.isArray(rawStatuses) ? rawStatuses : [])
          .map((v: any) => {
            const key = typeof v === 'string' ? v : (v?.value ?? '');
            return key ? resolveStatusLabel(key) : '';
          })
          .filter(Boolean);

        const entry = await parseData({
          id: node.id,
          data: {
            title: node.attributes?.title ?? '',
            alias,
            promoted: node.attributes?.promote ?? false,
            body: node.attributes?.body?.processed ?? undefined,
            images,
            categories: categories.length ? categories : undefined,
            tags: tags.length ? tags : undefined,
            statuses: statuses.length ? statuses : undefined,
            metatag: node.attributes?.metatag ?? [],
          },
        });

        store.set({ id: node.id, data: entry });
      }

      logger.info(`Loaded ${response.data.length} work entries.`);
    },
    schema: workSchema,
  };
}

// ─── Pages collection ─────────────────────────────────────────────────────────

export const pagesSchema = z.object({
  title: z.string(),
  alias: z.string(),
  body: z.string().optional(),
  summary: z.string().optional(),
  images: z.array(z.object({
    src: z.string(),
    alt: z.string(),
    width: z.number().optional(),
    height: z.number().optional(),
  })).optional(),
  metatag: z.array(z.object({
    tag: z.string(),
    attributes: z.record(z.string(), z.string()),
  })).optional().default([]),
});

export function drupalPagesLoader(options: {
  baseUrl: string | undefined;
  apiBase: string | undefined;
}): Loader {
  return {
    name: 'drupal-pages-loader',
    async load({ store, parseData, logger }: LoaderContext) {
      if (!options.baseUrl || !options.apiBase) {
        logger.warn('DRUPAL_BASE_URL / DRUPAL_API_BASE not set — skipping pages collection load.');
        return;
      }

      logger.info('Fetching page entries from Drupal JSON:API...');
      store.clear();

      let response: { data: any[]; included?: any[] };
      try {
        const apiBase = asBaseUrl(options.apiBase);
        const url = new URL('node/page', apiBase);
        url.searchParams.set('page[limit]', '50');
        url.searchParams.set('include', 'field_media,field_media.field_media_image');
        url.searchParams.set('fields[node--page]', 'title,path,body,field_media,metatag');

        const res = await fetch(url.toString(), { headers: { Accept: 'application/vnd.api+json' } });
        if (!res.ok) throw new Error(`JSON:API ${res.status}: ${url.pathname}`);
        response = await res.json();
      } catch (err) {
        logger.warn(`Could not fetch pages from Drupal API: ${err}`);
        return;
      }

      for (const node of response.data) {
        const alias = node.attributes?.path?.alias ?? `/node/${node.id}`;
        const images = getImagesFromEntity(node, response.included, options.baseUrl);

        const entry = await parseData({
          id: node.id,
          data: {
            title: node.attributes?.title ?? '',
            alias,
            body: node.attributes?.body?.processed ?? undefined,
            summary: node.attributes?.body?.summary ?? undefined,
            images: images.length ? images : undefined,
            metatag: node.attributes?.metatag ?? [],
          },
        });

        store.set({ id: node.id, data: entry });
      }

      logger.info(`Loaded ${response.data.length} page entries.`);
    },
    schema: pagesSchema,
  };
}

// ─── Collections export ───────────────────────────────────────────────────────

export const collections = {
  work: defineCollection({
    loader: drupalWorkLoader({ baseUrl: DRUPAL_BASE_URL, apiBase: DRUPAL_API_BASE }),
    schema: workSchema,
  }),
  pages: defineCollection({
    loader: drupalPagesLoader({ baseUrl: DRUPAL_BASE_URL, apiBase: DRUPAL_API_BASE }),
    schema: pagesSchema,
  }),
};
