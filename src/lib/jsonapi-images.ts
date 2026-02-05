// src/lib/jsonapi-images.ts
type Doc = { data: any; included?: any[] };

function key(t: string, id: string) { return `${t}::${id}`; }

// Accepts either a JSON:API document ({ data, included }) OR a single resource (node/media/etc).
// If you pass a single resource, also pass the response `included` array via `includedOverride`.
export function getImagesFromWork(
  docOrNode: Doc | any,
  baseUrl: string,
  field = 'field_media',
  includedOverride?: any[]
) {
  const included = new Map<string, any>();
  const includedArr: any[] = includedOverride ?? docOrNode?.included ?? [];
  for (const e of includedArr) included.set(key(e.type, e.id), e);

  const node = docOrNode?.data ?? docOrNode;

  const rels: any[] = node?.relationships?.[field]?.data ?? [];
  const out: Array<{ src: string; alt: string; width?: number; height?: number }> = [];

  for (const rel of rels) {
    // media entity
    const media = included.get(key(rel.type, rel.id));
    if (!media) continue;

    // file relation on media (commonly field_media_image)
    const fileRel = media?.relationships?.field_media_image?.data;
    if (!fileRel) continue;

    const file = included.get(key(fileRel.type, fileRel.id));
    if (!file) continue;

    // URL can be site-relative; make it absolute
    const relUrl = file?.attributes?.uri?.url || file?.attributes?.url;
    if (!relUrl) continue;
    const src = relUrl.startsWith('http')
      ? relUrl
      : new URL(relUrl, baseUrl).toString();

    // alt/size come from the relation meta
    const meta = media?.relationships?.field_media_image?.data?.meta ?? {};
    out.push({
      src,
      alt: meta.alt ?? '',
      width: meta.width,
      height: meta.height,
    });
  }
  return out;
}

// Convenience helper for the “I have a node and the response included[]” case.
export function getImagesFromEntity(
  node: any,
  included: any[] | undefined,
  baseUrl: string,
  field = 'field_media'
) {
  return getImagesFromWork(node, baseUrl, field, included);
}