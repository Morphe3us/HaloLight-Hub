import { createHmac } from "node:crypto";

const THUMBNAIL_PATH = /^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/thumbnail\.jpg$/i;

export function signBunnyThumbnailUrl(
  rawUrl: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const key = process.env.BUNNY_STREAM_TOKEN_AUTH_KEY?.trim();
  const configuredHost = process.env.BUNNY_STREAM_CDN_HOSTNAME?.trim();
  const expires = nowSeconds + 3600;
  if (!key || !configuredHost || !Number.isSafeInteger(nowSeconds) || nowSeconds < 0 ||
    !Number.isSafeInteger(expires)) return rawUrl;

  // Inspect the raw authority and path before URL parsing can normalize them.
  if (/[\u0000-\u0020\u007f\\]/.test(rawUrl)) return rawUrl;
  const parts = rawUrl.match(/^https:\/\/([^/?#]+)(\/[^?#]*)(?:\?[^#]*)?$/i);
  if (!parts || !THUMBNAIL_PATH.test(parts[2]) || !parts[2].endsWith("/thumbnail.jpg")) return rawUrl;

  try {
    const cdn = new URL(/^https?:\/\//i.test(configuredHost)
      ? configuredHost
      : `https://${configuredHost}`);
    const url = new URL(rawUrl);
    if (cdn.username || cdn.password || cdn.port || cdn.search || cdn.hash || cdn.pathname !== "/" ||
      url.protocol !== "https:" || url.username || url.password || url.port || url.hash ||
      url.hostname !== cdn.hostname || parts[1].toLowerCase() !== url.hostname ||
      url.pathname !== parts[2]) return rawUrl;

    for (const name of url.searchParams.keys()) {
      if (name !== "token" && name !== "expires") return rawUrl;
    }

    const token = createHmac("sha256", key)
      .update(url.pathname + expires)
      .digest("base64url");
    url.search = "";
    url.searchParams.set("token", `HS256-${token}`);
    url.searchParams.set("expires", String(expires));
    return url.toString();
  } catch {
    return rawUrl;
  }
}
