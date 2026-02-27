export interface DrupalMetaTag {
  tag: string;
  attributes: Record<string, string>;
}

export interface ParsedMeta {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonical?: string;
}

export function parseMeta(tags: DrupalMetaTag[] = []): ParsedMeta {
  const attr = (name: string, key: 'name' | 'property') =>
    tags.find((t) => t.tag === 'meta' && t.attributes[key] === name)?.attributes.content;

  const link = (rel: string) =>
    tags.find((t) => t.tag === 'link' && t.attributes.rel === rel)?.attributes.href;

  return {
    title:         attr('title', 'name'),
    description:   attr('description', 'name'),
    ogTitle:       attr('og:title', 'property'),
    ogDescription: attr('og:description', 'property'),
    ogImage:       attr('og:image', 'property'),
    canonical:     link('canonical'),
  };
}
