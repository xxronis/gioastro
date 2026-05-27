import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site, url }) => {
  const base = site ?? new URL(url.origin);
  const sitemapUrl = new URL('/sitemap-index.xml', base).toString();

  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
