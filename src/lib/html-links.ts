export function decorateExternalLinks(html: string, siteHostnames: string[] = []): string {
  if (!html) return html;

  const allowedHosts = new Set(siteHostnames.filter(Boolean).map((hostname) => hostname.toLowerCase()));

  return html.replace(/<a\b([^>]*?)href=(['"])(.*?)\2([^>]*)>/gi, (match, before, quote, href, after) => {
    if (!shouldDecorateHref(href, allowedHosts)) return match;

    const attrs = `${before}${after}`
      .replace(/\srel=(['"]).*?\1/gi, '')
      .replace(/\starget=(['"]).*?\1/gi, '');

    return `<a${attrs} href=${quote}${href}${quote} target="_blank" rel="nofollow noopener noreferrer">`;
  });
}

function shouldDecorateHref(href: string, allowedHosts: Set<string>): boolean {
  const value = href.trim();
  if (!value) return false;
  if (value.startsWith('#') || value.startsWith('/') || value.startsWith('mailto:') || value.startsWith('tel:')) {
    return false;
  }

  try {
    const url = new URL(value);
    return !allowedHosts.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
