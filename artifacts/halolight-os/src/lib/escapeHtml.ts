const HTML_ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapes a value for safe interpolation in HTML text or quoted attribute values. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]!);
}

const SAFE_DATA_IMAGE = /^data:image\/(png|jpeg|webp|gif);base64,/i;

/** Returns an escaped image URL only for https, same-origin paths or base64 raster data URIs; otherwise "". */
export function safeImageUrl(url: unknown): string {
  if (typeof url !== "string") return "";
  const value = url.trim();
  const allowed = value.startsWith("https:")
    || value.startsWith("/api/files/")
    || (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\"))
    || SAFE_DATA_IMAGE.test(value);
  return allowed ? escapeHtml(value) : "";
}
