import { DRUPAL_BASE_URL, DRUPAL_API_BASE } from 'astro:env/server';

function asBaseUrl(raw: string): URL {
    const url = new URL(raw);
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url;
}

export const drupal = {
    async api<T>(path: string, params: Record<string, string> = {}): Promise<T> {
        const apiBase = asBaseUrl(DRUPAL_API_BASE);
        const url = new URL(path.replace(/^\//, ''), apiBase);
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

        const res = await fetch(url.toString(), {
            headers: { Accept: 'application/vnd.api+json' },
        });

        if (!res.ok) throw new Error(`JSON:API ${res.status}: ${url.pathname}`);
        return res.json() as Promise<T>;
    },

    async resolveAlias(alias: string) {
        const baseUrl = asBaseUrl(DRUPAL_BASE_URL);
        const url = new URL('router/translate-path', baseUrl);
        url.searchParams.set('path', alias);
        const res = await fetch(url.toString());
        const resJson = await res.json();
        if (!res.ok) return null;
        return resJson;
    },

    get baseUrl() {
        return DRUPAL_BASE_URL;
    },
};
