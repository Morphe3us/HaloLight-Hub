import { createHash } from "node:crypto";
import { isExplicitDevelopment, parseBooleanEnv } from "./env";
import type { localizedLessonPlayback } from "./localizedPlayback";

export function bunnyPlaybackSecurityConfirmed(): boolean {
  const configured = parseBooleanEnv(
    process.env.BUNNY_PLAYBACK_SECURITY_CONFIRMED,
  );
  if (configured === false) return false;
  if (isExplicitDevelopment()) return true;
  return configured === true && Boolean(
    process.env.BUNNY_STREAM_TOKEN_AUTH_KEY?.trim() &&
    process.env.BUNNY_STREAM_LIBRARY_ID?.trim(),
  );
}

export function isBunnyPlaybackUrl(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return (
      url.hostname === "iframe.mediadelivery.net" ||
      url.hostname === "player.mediadelivery.net" ||
      url.hostname.endsWith(".b-cdn.net") ||
      url.hostname === "video.bunnycdn.com"
    );
  } catch {
    return false;
  }
}

type LessonVideoAsset = {
  embedUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  videoId?: string;
};

export type BunnyPlaybackAsset = LessonVideoAsset;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asVideoAsset(value: unknown): LessonVideoAsset | null {
  return isRecord(value) ? (value as LessonVideoAsset) : null;
}

function mapValues(value: unknown): unknown[] {
  return isRecord(value) ? Object.values(value) : [];
}

function normalizeBunnyCdnHostname(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  try {
    return new URL(trimmed).hostname;
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  }
}

export function buildBunnyPlaybackAsset(options: {
  libraryId: string;
  pullZoneHostname?: string | null;
  videoId: string;
}): BunnyPlaybackAsset {
  const videoId = encodeURIComponent(options.videoId.trim());
  const libraryId = encodeURIComponent(options.libraryId.trim());
  const pullZoneHostname = normalizeBunnyCdnHostname(options.pullZoneHostname);
  return {
    embedUrl: `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`,
    ...(pullZoneHostname
      ? {
          thumbnailUrl: `https://${pullZoneHostname}/${videoId}/thumbnail.jpg`,
          previewUrl: `https://${pullZoneHostname}/${videoId}/preview.webp`,
        }
      : {}),
    videoId: options.videoId.trim(),
  };
}

export function lessonHasBunnyPlaybackFields(lesson: {
  videoUrl?: string | null;
  videoUrls?: Record<string, string> | null | unknown;
  videoAssets?: Record<string, LessonVideoAsset> | null | unknown;
}): boolean {
  if (isBunnyPlaybackUrl(lesson.videoUrl)) return true;
  if (mapValues(lesson.videoUrls).some(isBunnyPlaybackUrl)) {
    return true;
  }

  return mapValues(lesson.videoAssets).some((value) => {
    const asset = asVideoAsset(value);
    if (!asset) return false;
    return (
      Boolean(asset.videoId) ||
      isBunnyPlaybackUrl(asset.embedUrl) ||
      isBunnyPlaybackUrl(asset.previewUrl)
    );
  });
}

export function thumbnailOnlyVideoAssets(
  assets: Record<string, LessonVideoAsset> | null | undefined | unknown,
): Record<string, { thumbnailUrl: string }> | null {
  if (!isRecord(assets)) return null;

  const sanitized = Object.fromEntries(
    Object.entries(assets)
      .map(([lang, value]) => {
        const thumbnail = asVideoAsset(value)?.thumbnailUrl;
        return [lang, typeof thumbnail === "string" ? thumbnail.trim() : ""] as const;
      })
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
      .map(([lang, thumbnailUrl]) => [lang, { thumbnailUrl }]),
  );

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

export class BunnyPlaybackConfigurationError extends Error {
  constructor() {
    super("Video playback is temporarily unavailable.");
    this.name = "BunnyPlaybackConfigurationError";
  }
}

export function signBunnyEmbedUrl(
  rawUrl: string,
  options: { libraryId: string; tokenKey: string; expires: number },
): string {
  const url = new URL(rawUrl);
  const match = url.pathname.match(/^\/embed\/(\d+)\/([a-zA-Z0-9_-]+)\/?$/);
  if (
    url.protocol !== "https:" || url.username || url.password || url.port ||
    !["iframe.mediadelivery.net", "player.mediadelivery.net"].includes(url.hostname) ||
    !match || match[1] !== options.libraryId.trim() || !options.tokenKey.trim() ||
    !Number.isSafeInteger(options.expires) || options.expires <= 0
  ) throw new BunnyPlaybackConfigurationError();

  const token = createHash("sha256")
    .update(options.tokenKey + match[2] + options.expires)
    .digest("hex");
  url.searchParams.set("token", token);
  url.searchParams.set("expires", String(options.expires));
  return url.toString();
}

// Run after access checks and localization; never store signed URLs in the catalog.
export function secureLessonPlayback(
  playback: ReturnType<typeof localizedLessonPlayback>,
  nowSeconds = Math.floor(Date.now() / 1000),
): ReturnType<typeof localizedLessonPlayback> {
  if (!lessonHasBunnyPlaybackFields(playback)) return playback;
  if (!bunnyPlaybackSecurityConfirmed()) throw new BunnyPlaybackConfigurationError();

  const tokenKey = process.env.BUNNY_STREAM_TOKEN_AUTH_KEY?.trim();
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID?.trim();
  if (!tokenKey || !libraryId) {
    if (isExplicitDevelopment()) return playback;
    throw new BunnyPlaybackConfigurationError();
  }

  const options = { libraryId, tokenKey, expires: nowSeconds + 3600 };
  const sign = (value: string) => isBunnyPlaybackUrl(value)
    ? signBunnyEmbedUrl(value, options)
    : value;
  return {
    videoUrl: sign(playback.videoUrl),
    videoUrls: playback.videoUrls
      ? Object.fromEntries(Object.entries(playback.videoUrls).map(([lang, url]) => [lang, sign(url)]))
      : null,
    videoAssets: playback.videoAssets
      ? Object.fromEntries(Object.entries(playback.videoAssets).map(([lang, asset]) => {
          const rawUrl = asset.embedUrl || (asset.videoId
            ? buildBunnyPlaybackAsset({ libraryId, videoId: asset.videoId }).embedUrl
            : undefined);
          return [lang, {
            ...(asset.thumbnailUrl ? { thumbnailUrl: asset.thumbnailUrl } : {}),
            ...(rawUrl ? { embedUrl: sign(rawUrl) } : {}),
          }];
        }))
      : null,
  };
}
