const SUPPORTED_PLAYBACK_LANGS = new Set([
  "en",
  "fr",
  "de",
  "nl",
  "es",
  "it",
  "pt",
  "pl",
]);

type VideoAsset = {
  embedUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  videoId?: string;
};

type LessonPlaybackFields = {
  videoUrl?: string | null;
  videoUrls?: Record<string, string> | null | unknown;
  videoAssets?: Record<string, VideoAsset> | null | unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeStringMap(values: unknown): Record<string, string> | null {
  if (!isRecord(values)) return null;
  const sanitized = Object.fromEntries(
    Object.entries(values)
      .map(([lang, value]) => [
        lang,
        typeof value === "string" ? value.trim() : "",
      ])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function sanitizeVideoAsset(value: unknown): VideoAsset | null {
  if (!isRecord(value)) return null;
  const asset: VideoAsset = {};
  for (const field of ["embedUrl", "thumbnailUrl", "previewUrl", "videoId"] as const) {
    const fieldValue = value[field];
    if (typeof fieldValue === "string" && fieldValue.trim()) {
      asset[field] = fieldValue.trim();
    }
  }
  return Object.keys(asset).length > 0 ? asset : null;
}

function sanitizeVideoAssetMap(values: unknown): Record<string, VideoAsset> | null {
  if (!isRecord(values)) return null;
  const sanitized = Object.fromEntries(
    Object.entries(values)
      .map(([lang, value]) => [lang, sanitizeVideoAsset(value)] as const)
      .filter((entry): entry is readonly [string, VideoAsset] => entry[1] !== null),
  );
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function hasUsableValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim() !== "";
  if (!value || typeof value !== "object") return value != null;
  return Object.values(value as Record<string, unknown>).some(hasUsableValue);
}

function hasAnyUsableMapValue(values: Record<string, unknown> | null | undefined): boolean {
  return Object.values(values ?? {}).some(hasUsableValue);
}

export function normalizePlaybackLang(lang: unknown): string {
  const code =
    typeof lang === "string" ? lang.split("-")[0]?.toLowerCase() : undefined;
  return code && SUPPORTED_PLAYBACK_LANGS.has(code) ? code : "en";
}

export function selectLocalizedPlaybackMap<T>(
  values: Record<string, T> | null | undefined,
  lang: unknown,
): Record<string, T> | null {
  if (!values || typeof values !== "object") return null;

  const requested = normalizePlaybackLang(lang);
  const selected: Record<string, T> = {};
  for (const code of requested === "en" ? ["en"] : [requested, "en"]) {
    const value = values[code];
    if (hasUsableValue(value)) selected[code] = value;
  }

  return Object.keys(selected).length > 0 ? selected : null;
}

export function localizedLessonPlayback(
  lesson: LessonPlaybackFields,
  lang: unknown,
): {
  videoUrl: string;
  videoUrls: Record<string, string> | null;
  videoAssets: Record<string, VideoAsset> | null;
} {
  const sanitizedVideoUrls = sanitizeStringMap(lesson.videoUrls);
  const sanitizedVideoAssets = sanitizeVideoAssetMap(lesson.videoAssets);
  const videoUrls = selectLocalizedPlaybackMap(sanitizedVideoUrls, lang);
  const videoAssets = selectLocalizedPlaybackMap(sanitizedVideoAssets, lang);
  const hasAnyLocalizedPlayback = Boolean(
    hasAnyUsableMapValue(sanitizedVideoUrls) ||
      hasAnyUsableMapValue(sanitizedVideoAssets),
  );

  return {
    videoUrl: hasAnyLocalizedPlayback ? "" : (lesson.videoUrl ?? ""),
    videoUrls,
    videoAssets,
  };
}
