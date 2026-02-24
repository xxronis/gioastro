# Copilot / AI contributor instructions — gioastro

This file contains short, actionable notes for AI coding agents working on this Astro + Drupal starter.
Keep edits concise and reference the files below when you need to understand patterns or make changes.

Key things to know
- Framework: Astro (v5), server output via `@astrojs/node` adapter (see `astro.config.mjs`). Build output is a server bundle (output: 'server').
- Dev/build commands: use `npm run dev`, `npm run build`, and `npm run preview` (see `package.json`).
- Styling: Tailwind is wired through a Vite plugin (`@tailwindcss/vite`) in `astro.config.mjs`. Global CSS lives at `src/styles/global.css` and is imported from `Layout.astro`.

Data & integration patterns (Drupal JSON:API)
- Data helpers: `src/lib/drupal.ts` exposes two helpers:
  - `api<T>(path, params?)` — server-side helper that builds a URL from `import.meta.env.DRUPAL_API_BASE`, sets Accept header to `application/vnd.api+json`, and returns parsed JSON or throws on non-OK responses.
  - `resolveAlias(alias)` — resolves a Drupal path using `DRUPAL_BASE_URL` + `/router/translate-path`.
- Examples:
  - `src/components/Latest.drupal.astro` calls `await api('/node/work', { 'sort': '-created', 'page[limit]': '10' })` and maps `articles.data`.
  - Image fields are accessed from the JSON:API response as `n.attributes.field_image?.uri.url` and alt text at `n.attributes.field_image?.resourceIdObjMeta.alt` — follow this shape when rendering images.
- Naming convention: files with `.drupal.astro` indicate data-driven components that call the JSON:API server at component top-level frontmatter (run on the server during build/dev). Use `await` in frontmatter for server-side fetches.

Assets & imports
- Static assets (images, video) are imported via ES imports in pages/components. Example from `src/pages/index.astro`:
  - import mp4 from "../assets/watercolor-640.mp4";
  - import poster from "../assets/watercolor-poster.webp";
  - When using a poster import, the code uses `poster.src` (the imported object includes a `src` property). Video imports (mp4/webm) are passed directly to the `<video>` sources.
- Keep file-relative imports consistent with existing code (relative to the importing file under `src/`).

Component patterns
- `LoopVideo.astro` is a reusable video background component. Props: `mp4`, optional `webm`, `poster`, optional `className`. It sets `autoplay muted loop playsinline` and uses absolute positioning with Tailwind utility classes — follow this approach for full-bleed backgrounds.
- `Layout.astro` provides the minimal page shell; pages import it and place content in the `<slot />`.

Runtime & environment
- Required env vars (used at build/dev/runtime):
  - `DRUPAL_API_BASE` — base URL for JSON:API endpoints (e.g. `https://cms.example.org/jsonapi`)
  - `DRUPAL_BASE_URL` — site base for `resolveAlias` (used for router translations)
- These are referenced via `import.meta.env`. Ensure they are provided for local dev (e.g., `export DRUPAL_API_BASE=...` in your shell or use a `.env` loader if you add one).

Error handling and conventions
- `api()` throws when the fetch response is not OK — wrap calls in try/catch in pages/components where you want graceful degradation.
- Keep data fetching in top-level frontmatter of `.astro` files (server-side) rather than inside client-side scripts, unless you intentionally want client-side fetch behavior.

Developer workflows & checks
- No test runner is configured in the repo. Focus on manual smoke checks:
  1. `npm install`
  2. `npm run dev` — verify server starts and pages render locally.
  3. `npm run build` and `npm run preview` — ensure build succeeds and preview serves the server bundle.
- If switching adapter (Cloudflare vs Node), update `astro.config.mjs` accordingly; the current chosen adapter is Node with `mode: 'standalone'`.

Quick examples to follow when adding features
- New data-driven page: create `src/pages/yourpage.astro`, import `Layout.astro`, then in frontmatter call `const data = await api('/node/yourtype', { 'page[limit]': '5' })` and render `data.data.map(...)`.
- When adding images from Drupal JSON:API responses, prefer `n.attributes.field_image?.uri.url` for `src` and `resourceIdObjMeta.alt` for alt text — this mirrors existing templates.

Files to inspect first
- `src/lib/drupal.ts` — API helpers and env usage
- `src/components/Latest.drupal.astro` — example JSON:API query + rendering
- `src/components/LoopVideo.astro` — asset import/usage pattern
- `src/pages/index.astro` and `src/layouts/Layout.astro` — page composition / layout

If anything is unclear or you need additional rules (branching/PR style, tests, or env file patterns) tell me which area you want expanded and I will iterate.
