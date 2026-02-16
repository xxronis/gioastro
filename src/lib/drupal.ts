import type { Env } from './env';

export function drupalClient(env: Env) {
    const BASE = env.DRUPAL_BASE_URL;
    const API = env.DRUPAL_API_BASE;

    function asBaseUrl(raw: string): URL {
        const baseUrl = new URL(raw);
        if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/';
        return baseUrl;
    }

    return {
        async api<T>(path: string, params: Record<string, string> = {}): Promise<T> {
            const apiBase = asBaseUrl(API);
            const url = new URL(path.replace(/^\//, ''), apiBase);
            for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

            const res = await fetch(url.toString(), {
                headers: { Accept: 'application/vnd.api+json' },
            });

            if (!res.ok) throw new Error(`JSON:API ${res.status}: ${url.pathname}`);
            return res.json() as Promise<T>;
        },

        async resolveAlias(alias: string) {
            const baseUrl = asBaseUrl(BASE);
            const url = new URL('router/translate-path', baseUrl);
            url.searchParams.set('path', alias);
            const res = await fetch(url.toString());
            const resJson = await res.json();
            if (!res.ok) return null;
            return resJson;
        },
    };
}
