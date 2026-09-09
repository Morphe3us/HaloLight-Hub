import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBunnyPlaybackAsset,
  bunnyPlaybackSecurityConfirmed,
  isBunnyPlaybackUrl,
  lessonHasBunnyPlaybackFields,
  thumbnailOnlyVideoAssets,
  signBunnyEmbedUrl,
  secureLessonPlayback,
  BunnyPlaybackConfigurationError,
} from "./bunnySecurity";

const originalNodeEnv = process.env.NODE_ENV;
const originalConfirmed = process.env.BUNNY_PLAYBACK_SECURITY_CONFIRMED;
const originalToken = process.env.BUNNY_STREAM_TOKEN_AUTH_KEY;
const originalLibrary = process.env.BUNNY_STREAM_LIBRARY_ID;

test.afterEach(() => {
  for (const [name, value] of Object.entries({
    BUNNY_STREAM_TOKEN_AUTH_KEY: originalToken,
    BUNNY_STREAM_LIBRARY_ID: originalLibrary,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }

  if (originalConfirmed === undefined) {
    delete process.env.BUNNY_PLAYBACK_SECURITY_CONFIRMED;
  } else {
    process.env.BUNNY_PLAYBACK_SECURITY_CONFIRMED = originalConfirmed;
  }
});

test("bunnyPlaybackSecurityConfirmed fails closed outside explicit development", () => {
  delete process.env.NODE_ENV;
  delete process.env.BUNNY_PLAYBACK_SECURITY_CONFIRMED;
  delete process.env.BUNNY_STREAM_TOKEN_AUTH_KEY;
  delete process.env.BUNNY_STREAM_LIBRARY_ID;
  assert.equal(bunnyPlaybackSecurityConfirmed(), false);

  process.env.NODE_ENV = "production";
  assert.equal(bunnyPlaybackSecurityConfirmed(), false);

  process.env.BUNNY_PLAYBACK_SECURITY_CONFIRMED = "true";
  delete process.env.BUNNY_STREAM_TOKEN_AUTH_KEY;
  assert.equal(bunnyPlaybackSecurityConfirmed(), false);
  process.env.BUNNY_STREAM_TOKEN_AUTH_KEY = "test-key";
  process.env.BUNNY_STREAM_LIBRARY_ID = "123";
  assert.equal(bunnyPlaybackSecurityConfirmed(), true);
});

test("production signs playback regardless of the legacy confirmation flag", () => {
  process.env.NODE_ENV = "production";
  process.env.BUNNY_STREAM_TOKEN_AUTH_KEY = "test-signing-key";
  process.env.BUNNY_STREAM_LIBRARY_ID = "123";
  const playback = { videoUrl: "https://iframe.mediadelivery.net/embed/123/video", videoUrls: null, videoAssets: null };
  for (const flag of [undefined, "false", "true"]) {
    if (flag === undefined) delete process.env.BUNNY_PLAYBACK_SECURITY_CONFIRMED;
    else process.env.BUNNY_PLAYBACK_SECURITY_CONFIRMED = flag;
    assert.equal(bunnyPlaybackSecurityConfirmed(), true);
    const signed = new URL(secureLessonPlayback(playback, 1700000000).videoUrl);
    assert.match(signed.searchParams.get("token")!, /^[a-f0-9]{64}$/);
    assert.equal(signed.searchParams.get("expires"), "1700003600");
  }
});

test("production never falls back to unsigned playback with missing or invalid signing configuration", () => {
  process.env.NODE_ENV = "production";
  process.env.BUNNY_PLAYBACK_SECURITY_CONFIRMED = "true";
  const playback = { videoUrl: "https://iframe.mediadelivery.net/embed/123/video", videoUrls: null, videoAssets: null };
  for (const [library, token] of [["123", ""], ["123", "  "], ["", "test-key"], ["  ", "test-key"], ["invalid", "test-key"], ["456", "test-key"]]) {
    process.env.BUNNY_STREAM_LIBRARY_ID = library;
    process.env.BUNNY_STREAM_TOKEN_AUTH_KEY = token;
    assert.throws(() => secureLessonPlayback(playback), BunnyPlaybackConfigurationError);
  }
});

test("isBunnyPlaybackUrl detects Bunny playback hosts", () => {
  assert.equal(
    isBunnyPlaybackUrl("https://iframe.mediadelivery.net/embed/123/video"),
    true,
  );
  assert.equal(isBunnyPlaybackUrl("https://vz-example.b-cdn.net/id/play"), true);
  assert.equal(isBunnyPlaybackUrl("https://youtube.com/watch?v=x"), false);
});

test("lessonHasBunnyPlaybackFields detects Bunny assets", () => {
  assert.equal(
    lessonHasBunnyPlaybackFields({
      videoUrl: "",
      videoAssets: { en: { videoId: "video_123" } },
    }),
    true,
  );
  assert.equal(
    lessonHasBunnyPlaybackFields({
      videoUrl: "https://youtube.com/watch?v=x",
      videoAssets: { en: { thumbnailUrl: "https://example.com/thumb.jpg" } },
    }),
    false,
  );
});

test("lessonHasBunnyPlaybackFields ignores malformed video asset entries", () => {
  assert.equal(
    lessonHasBunnyPlaybackFields({
      videoAssets: {
        fr: null,
        es: "not-an-object",
        de: { embedUrl: "https://iframe.mediadelivery.net/embed/123/video" },
      } as unknown,
    }),
    true,
  );
  assert.equal(
    lessonHasBunnyPlaybackFields({
      videoAssets: { fr: null, es: "not-an-object" } as unknown,
    }),
    false,
  );
});

test("thumbnailOnlyVideoAssets removes playback fields", () => {
  assert.deepEqual(
    thumbnailOnlyVideoAssets({
      en: {
        embedUrl: "https://iframe.mediadelivery.net/embed/123/video",
        thumbnailUrl: "https://cdn.example.com/thumb.jpg",
        videoId: "video_123",
      },
      fr: { embedUrl: "https://iframe.mediadelivery.net/embed/123/video" },
    }),
    { en: { thumbnailUrl: "https://cdn.example.com/thumb.jpg" } },
  );
});

test("thumbnailOnlyVideoAssets ignores malformed asset entries", () => {
  assert.deepEqual(
    thumbnailOnlyVideoAssets({
      fr: null,
      es: "not-an-object",
      pl: { thumbnailUrl: 123 },
      en: { thumbnailUrl: " https://cdn.example.com/thumb.jpg " },
    } as unknown),
    { en: { thumbnailUrl: "https://cdn.example.com/thumb.jpg" } },
  );
});

test("Bunny signing follows the documented SHA256 key + video ID + seconds format", () => {
  const url = new URL(signBunnyEmbedUrl(
    "https://iframe.mediadelivery.net/embed/670736/32d140e2-e4f4-4eec-9d53-20371e9be607?autoplay=false&token=expired",
    { libraryId: "670736", tokenKey: "test-signing-key", expires: 1700003600 },
  ));
  assert.equal(url.searchParams.get("token"), "dc301018c5171a7c01ab3548750c064f06c0d2e92609fa6b48ef84832a540606");
  assert.equal(url.searchParams.get("expires"), "1700003600");
  assert.equal(url.searchParams.get("autoplay"), "false");
  assert.equal(url.searchParams.getAll("token").length, 1);
});

test("Bunny signing refuses another library, insecure URLs and lookalike hosts", () => {
  const options = { libraryId: "123", tokenKey: "key", expires: 1700003600 };
  for (const url of [
    "https://iframe.mediadelivery.net/embed/456/video",
    "http://iframe.mediadelivery.net/embed/123/video",
    "https://iframe.mediadelivery.net.evil.example/embed/123/video",
    "https://user:pass@iframe.mediadelivery.net/embed/123/video",
    "https://vz-example.b-cdn.net/video/playlist.m3u8",
  ]) assert.throws(() => signBunnyEmbedUrl(url, options), BunnyPlaybackConfigurationError);
  assert.ok(signBunnyEmbedUrl("https://player.mediadelivery.net/embed/123/video", options).includes("token="));
});

test("lesson playback signs only on delivery without mutating the cached catalog or exposing keys", () => {
  process.env.NODE_ENV = "production";
  process.env.BUNNY_PLAYBACK_SECURITY_CONFIRMED = "true";
  process.env.BUNNY_STREAM_TOKEN_AUTH_KEY = "test-signing-key";
  process.env.BUNNY_STREAM_LIBRARY_ID = "123";
  const playback = {
    videoUrl: "",
    videoUrls: { fr: "https://iframe.mediadelivery.net/embed/123/video-fr" },
    videoAssets: { en: { videoId: "video-en", previewUrl: "https://example.b-cdn.net/preview.webp", thumbnailUrl: "https://example.b-cdn.net/thumbnail.jpg" } },
  };
  const before = structuredClone(playback);
  const first = secureLessonPlayback(playback, 1700000000);
  const second = secureLessonPlayback(playback, 1700000100);
  assert.deepEqual(playback, before);
  assert.notEqual(first.videoUrls?.fr, second.videoUrls?.fr);
  assert.equal(new URL(first.videoAssets!.en.embedUrl!).searchParams.get("expires"), "1700003600");
  assert.equal(first.videoAssets!.en.previewUrl, undefined);
  assert.equal(first.videoAssets!.en.videoId, undefined);
  assert.ok(!JSON.stringify(first).includes("test-signing-key"));
});

test("the confirmation flag alone cannot unlock production Bunny playback", () => {
  process.env.NODE_ENV = "production";
  process.env.BUNNY_PLAYBACK_SECURITY_CONFIRMED = "true";
  delete process.env.BUNNY_STREAM_TOKEN_AUTH_KEY;
  const playback = { videoUrl: "https://iframe.mediadelivery.net/embed/123/video", videoUrls: null, videoAssets: null };
  assert.throws(() => secureLessonPlayback(playback), BunnyPlaybackConfigurationError);
  process.env.NODE_ENV = "development";
  assert.deepEqual(secureLessonPlayback(playback), playback);
  process.env.BUNNY_PLAYBACK_SECURITY_CONFIRMED = "false";
  assert.throws(() => secureLessonPlayback(playback), BunnyPlaybackConfigurationError);
});

test("buildBunnyPlaybackAsset derives playback URLs from trusted Bunny fields", () => {
  assert.deepEqual(
    buildBunnyPlaybackAsset({
      libraryId: "670736",
      pullZoneHostname: "https://vz-example.b-cdn.net/path",
      videoId: "video 123",
    }),
    {
      embedUrl: "https://iframe.mediadelivery.net/embed/670736/video%20123",
      thumbnailUrl: "https://vz-example.b-cdn.net/video%20123/thumbnail.jpg",
      previewUrl: "https://vz-example.b-cdn.net/video%20123/preview.webp",
      videoId: "video 123",
    },
  );
});
