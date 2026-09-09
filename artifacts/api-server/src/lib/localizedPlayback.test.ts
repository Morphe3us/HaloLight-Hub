import test from "node:test";
import assert from "node:assert/strict";
import {
  localizedLessonPlayback,
  normalizePlaybackLang,
  selectLocalizedPlaybackMap,
} from "./localizedPlayback";

test("normalizePlaybackLang accepts supported app languages only", () => {
  assert.equal(normalizePlaybackLang("fr-CA"), "fr");
  assert.equal(normalizePlaybackLang("pt"), "pt");
  assert.equal(normalizePlaybackLang("unknown"), "en");
  assert.equal(normalizePlaybackLang(undefined), "en");
});

test("selectLocalizedPlaybackMap returns only requested language plus English fallback", () => {
  const selected = selectLocalizedPlaybackMap(
    {
      fr: "fr-url",
      en: "en-url",
      de: "de-url",
    },
    "fr",
  );

  assert.deepEqual(selected, { fr: "fr-url", en: "en-url" });
});

test("localizedLessonPlayback does not expose other language Bunny assets", () => {
  const playback = localizedLessonPlayback(
    {
      videoUrl: "https://iframe.mediadelivery.net/embed/library/legacy",
      videoUrls: {
        fr: "https://iframe.mediadelivery.net/embed/library/fr",
        en: "https://iframe.mediadelivery.net/embed/library/en",
        de: "https://iframe.mediadelivery.net/embed/library/de",
      },
      videoAssets: {
        fr: { embedUrl: "fr-embed", videoId: "fr-id" },
        en: { embedUrl: "en-embed", videoId: "en-id" },
        de: { embedUrl: "de-embed", videoId: "de-id" },
      },
    },
    "fr",
  );

  assert.equal(playback.videoUrl, "");
  assert.deepEqual(Object.keys(playback.videoUrls ?? {}).sort(), ["en", "fr"]);
  assert.deepEqual(Object.keys(playback.videoAssets ?? {}).sort(), [
    "en",
    "fr",
  ]);
});

test("localizedLessonPlayback keeps legacy videoUrl when no localized maps exist", () => {
  const playback = localizedLessonPlayback(
    { videoUrl: "https://example.com/video.mp4" },
    "fr",
  );

  assert.equal(playback.videoUrl, "https://example.com/video.mp4");
  assert.equal(playback.videoUrls, null);
  assert.equal(playback.videoAssets, null);
});

test("localizedLessonPlayback suppresses legacy videoUrl when only another language has assets", () => {
  const playback = localizedLessonPlayback(
    {
      videoUrl: "https://iframe.mediadelivery.net/embed/library/stale",
      videoAssets: {
        de: { embedUrl: "de-embed", videoId: "de-id" },
      },
    },
    "fr",
  );

  assert.equal(playback.videoUrl, "");
  assert.equal(playback.videoUrls, null);
  assert.equal(playback.videoAssets, null);
});

test("localizedLessonPlayback ignores malformed video maps", () => {
  const playback = localizedLessonPlayback(
    {
      videoUrl: "https://example.com/legacy.mp4",
      videoUrls: {
        fr: null,
        en: " https://iframe.mediadelivery.net/embed/library/en ",
      } as unknown,
      videoAssets: {
        fr: null,
        es: "not-an-object",
        en: {
          embedUrl: " https://iframe.mediadelivery.net/embed/library/en ",
          thumbnailUrl: "",
        },
      } as unknown,
    },
    "fr",
  );

  assert.equal(playback.videoUrl, "");
  assert.deepEqual(playback.videoUrls, {
    en: "https://iframe.mediadelivery.net/embed/library/en",
  });
  assert.deepEqual(playback.videoAssets, {
    en: { embedUrl: "https://iframe.mediadelivery.net/embed/library/en" },
  });
});
