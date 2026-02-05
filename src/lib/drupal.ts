const API = import.meta.env.DRUPAL_API_BASE!;
const BASE = import.meta.env.DRUPAL_BASE_URL!;

export async function api<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${API}${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), {
        headers: { Accept: 'application/vnd.api+json' }
    });
    if (!res.ok) throw new Error(`JSON:API ${res.status}: ${url.pathname}`);
    return res.json() as Promise<T>;
}

export async function resolveAlias(alias: string) {
    const url = new URL('/router/translate-path', BASE);
    url.searchParams.set('path', alias);
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    return res.json();
}
