# Content Collections + Cloudflare Build — Plan

## The core problem

Astro content loaders run in **Node.js at build time**, not inside the Cloudflare Workers
runtime. This means the two env systems never overlap:

| When | Env source | Available? |
|---|---|---|
| `astro build` (Node.js) | `process.env`, `import.meta.env` (from .env.local) | ✅ build-time |
| CF Workers request | `Astro.locals.runtime.env`, `astro:env/server` (CF adapter) | ✅ request-time |
| CF Pages CI build | `process.env` injected from CF "Build environment variables" | ✅ only if set as build vars |
| `.dev.vars` | Wrangler runtime only — NOT visible to `astro build` | ❌ never at build time |

**Root cause of `build:cf` failure**: `.dev.vars` is read by Wrangler at *runtime*.
The `astro build` step inside `build:cf` runs first in plain Node.js and never sees `.dev.vars`.
So the content loader finds nothing in `process.env` or `import.meta.env`.

---

## Target architecture — hybrid static + SSR

```
src/pages/work/
  index.astro         ← prerender = true  (first N items from collection, static)
  [slug].astro        ← prerender = true  (individual items from collection, static)
  [...slug].astro     ← prerender = false (SSR fallback for items not in collection)

src/pages/api/
  work.ts             ← SSR JSON endpoint for "load more" (pagination beyond N)
```

### Work listing (`work/index.astro`)
- Rendered statically at build time from `getCollection('work')` (first N items, e.g. 12)
- Includes a "Load more" button that calls `/api/work?page=2` via client-side fetch
- Appends new items to the masonry grid in the browser
- No page reload needed; SSR only for the extra pages

### Individual work pages (`work/[slug].astro` + `work/[...slug].astro`)
- `[slug].astro` with `prerender = true` + `getStaticPaths` prebuilds the first N items
- `[...slug].astro` with `prerender = false` is the SSR fallback for any slug not prerendered
  (e.g. new content published after the last build, or items beyond N)
- Both files share the same rendering logic via a shared helper component

---

## Fix 1 — `content.config.ts` env reading (the blocker)

Use Vite's `loadEnv` helper. This explicitly reads `.env`, `.env.local`,
`.env.production` etc. from the project root before the loader runs — works in all
four contexts (local Node build, local CF build, CF Pages CI, `astro dev`).

```ts
// src/content.config.ts
import { loadEnv } from 'vite';

// '' = load ALL vars (not just VITE_-prefixed)
const rawEnv = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');

const DRUPAL_BASE_URL = rawEnv.DRUPAL_BASE_URL ?? process.env.DRUPAL_BASE_URL;
const DRUPAL_API_BASE = rawEnv.DRUPAL_API_BASE  ?? process.env.DRUPAL_API_BASE;

export const collections = {
  work: defineCollection({
    loader: drupalWorkLoader({ baseUrl: DRUPAL_BASE_URL, apiBase: DRUPAL_API_BASE }),
    schema: workSchema,
  }),
};
```

Change `drupalWorkLoader` signature to accept options instead of reading env itself:

```ts
export function drupalWorkLoader(options: {
  baseUrl: string | undefined;
  apiBase: string | undefined;
}): Loader { ... }
```

---

## Fix 2 — CF Pages CI build environment variables

In the Cloudflare Pages dashboard:
- Go to project → **Settings → Environment variables**
- Add `DRUPAL_BASE_URL` and `DRUPAL_API_BASE` under **"Build"** scope
- These are the same values as in `.dev.vars` / `.env.local`
- The CF Workers runtime vars (for `astro:env/server` at request time) stay separate

---

## Fix 3 — `work/index.astro` static + load-more

```astro
---
// src/pages/work/index.astro
import { getCollection } from 'astro:content';
export const prerender = true;
const PAGE_SIZE = 12;

// The collection holds all work items (up to page[limit]=100 set in loader)
const allWorks = await getCollection('work');
const initial = allWorks.slice(0, PAGE_SIZE);
const hasMore = allWorks.length > PAGE_SIZE;
---
<ul id="work-grid"> {initial.map(...)} </ul>
{hasMore && <button id="load-more" data-page="2">Load more</button>}

<script>
  // Fetches /api/work?page=N and appends items to the grid
  document.getElementById('load-more')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const page = Number(btn.dataset.page ?? 2);
    const res = await fetch(`/api/work?page=${page}`);
    const { items, hasMore } = await res.json();
    // append items to #work-grid ...
    btn.dataset.page = String(page + 1);
    if (!hasMore) btn.remove();
  });
</script>
```

---

## Fix 4 — `/api/work.ts` SSR load-more endpoint

```ts
// src/pages/api/work.ts
import type { APIRoute } from 'astro';
import { drupal } from '../../lib/drupal';
import { cfImg, getImagesFromEntity } from '../../lib/jsonapi-images';

export const prerender = false;
const PAGE_SIZE = 12;

export const GET: APIRoute = async ({ url }) => {
  const page = Number(url.searchParams.get('page') ?? 1);
  const offset = (page - 1) * PAGE_SIZE;

  const works = await drupal.api<{ data: any[]; included?: any[]; meta: any }>(
    '/node/work',
    {
      sort: '-created',
      'page[limit]': String(PAGE_SIZE),
      'page[offset]': String(offset),
      include: 'field_media,field_media.field_media_image',
      'fields[node--work]': 'title,path,field_media',
    }
  );

  const total = works.meta?.count ?? 0;
  const items = works.data.map((n) => {
    const images = getImagesFromEntity(n, works.included, drupal.baseUrl);
    return {
      alias: n.attributes?.path?.alias ?? `/node/${n.id}`,
      title: n.attributes?.title,
      img: images[0] ? { src: cfImg(images[0].src, { width: 600 }), alt: images[0].alt } : null,
    };
  });

  return Response.json({
    items,
    hasMore: offset + PAGE_SIZE < total,
  });
};
```

---

## Fix 5 — `work/[slug].astro` prerendered + SSR fallback

Two files, both sharing rendering logic:

**`src/pages/work/[slug].astro`** (`prerender = true`):
```astro
---
import { getCollection } from 'astro:content';
export const prerender = true;

export async function getStaticPaths() {
  const works = await getCollection('work');
  return works.map((entry) => ({
    params: { slug: entry.data.alias.split('/').filter(Boolean).pop() },
    props: { entry },
  }));
}
// render using entry.data.title / entry.data.images etc.
---
```

**`src/pages/work/[...slug].astro`** (`prerender = false`) — SSR fallback:
```astro
---
export const prerender = false;
// Same rendering logic as today ([slug].astro) using drupal.resolveAlias + drupal.api
---
```

> Astro resolves more-specific routes first, so `[slug]` (prerendered) is served
> from the static edge for items in the collection; `[...slug]` (SSR) handles anything else.

---


---

## Fix 6 — Homepage (`/`) static + `Latest.drupal.astro` from collection

### The problem
`src/pages/index.astro` has no explicit `prerender` flag → it defaults to SSR.
`Latest.drupal.astro` is embedded in it and fetches 3 items at request time via
`drupal.api()`. If we want the homepage statically prerendered, the component can no
longer do a live Drupal fetch — it must receive data that was loaded at build time.

### Plan

**Step A** — add `promoted` to the collection schema and loader

```ts
// workSchema
promoted: z.boolean().optional(),

// loader — extend fields fetched
'fields[node--work]': 'title,path,body,created,promote,field_media',

// loader — map node
promoted: node.attributes?.promote ?? false,
```

**Step B** — refactor `Latest.drupal.astro` into a pure presentational component

Remove the frontmatter data fetch entirely. Accept an `items` prop instead:

```astro
---
// src/components/Latest.drupal.astro
import { cfImg } from "../lib/jsonapi-images";

interface WorkItem {
  alias: string;
  img?: { src: string; alt: string };
}
interface Props { items: WorkItem[] }
const { items } = Astro.props;
---
```

**Step C** — feed data from `getCollection` in the homepage

```astro
---
// src/pages/index.astro
import { getCollection } from 'astro:content';
import Latest from '../components/Latest.drupal.astro';
import { cfImg } from '../lib/jsonapi-images';
export const prerender = true;

// 3 most recent promoted items, with graceful fallback to any 3 if none are promoted
const allWorks = await getCollection('work');
const promoted = allWorks.filter((e) => e.data.promoted);
const featured = (promoted.length >= 3 ? promoted : allWorks).slice(0, 3);

const items = featured.map((e) => ({
  alias: e.data.alias,
  img: e.data.images[0]
    ? { src: cfImg(e.data.images[0].src, { width: 400, quality: 85 }), alt: e.data.images[0].alt }
    : undefined,
}));
---
<Layout>
  ...
  <Latest items={items} />
  ...
</Layout>
```

## Files to change when implementing

| File | Change |
|---|---|
| `src/content.config.ts` | Use `loadEnv`, pass `{ baseUrl, apiBase }` to loader; add `promoted` field |
| `src/pages/index.astro` | `prerender = true`; fetch from `getCollection`; pass items to Latest |
| `src/components/Latest.drupal.astro` | Remove SSR fetch; accept `items` prop |
| `src/pages/work/index.astro` | `prerender = true`, `getCollection`, load-more button |
| `src/pages/work/[slug].astro` | `prerender = true`, `getStaticPaths` from collection |
| `src/pages/work/[...slug].astro` | New SSR fallback (rename/copy from current `[slug].astro`) |
| `src/pages/api/work.ts` | New SSR pagination endpoint |
| CF Pages dashboard | Add `DRUPAL_BASE_URL`, `DRUPAL_API_BASE` as Build env vars |

## What does NOT change

- `src/lib/drupal.ts` — SSR singleton keeps using `astro:env/server` (correct for requests)
- `src/pages/contact.astro`, `src/pages/api/contact.ts` — untouched
- `.dev.vars`, `.env.local` — no format changes
