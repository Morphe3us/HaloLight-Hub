export function kbLinkTarget(href: string, origin: string): { href: string; authenticated: boolean } | null {
  if (!href || /[\u0000-\u0020\\]/.test(href)) return null;
  try {
    const url = new URL(href, origin);
    if (!["https:", "http:", "mailto:"].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    if (url.pathname.startsWith("/api/files/")) {
      if (url.origin !== origin || url.search || url.hash) return null;
      return { href: url.pathname, authenticated: true };
    }
    if (href.startsWith("/api/")) return null;
    return { href: url.href, authenticated: false };
  } catch { return null; }
}
