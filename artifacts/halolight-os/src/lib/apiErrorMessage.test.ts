import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { academyErrorMessage, apiErrorMessage, apiErrorStatus } from "./apiErrorMessage";
import { getVideoEmbedUrl, resolveLessonVideoUrl } from "../pages/AcademyLesson";

test("apiErrorMessage uses response body error when available", () => {
  assert.equal(
    apiErrorMessage(
      { status: 500, message: "HTTP 500 Internal Server Error", data: { error: "Broken catalog" } },
      "Fallback",
    ),
    "Broken catalog",
  );
});

test("apiErrorMessage hides raw HTTP-only messages", () => {
  assert.equal(
    apiErrorMessage(
      { status: 500, message: "HTTP 500 Internal Server Error", data: null },
      "Fallback",
    ),
    "Fallback",
  );
});

test("apiErrorStatus returns numeric API status", () => {
  assert.equal(apiErrorStatus({ status: 404 }), 404);
  assert.equal(apiErrorStatus(new Error("No status")), null);
});

test("malformed messages never throw while rendering an error", () => {
  for (const message of [null, undefined, 42, {}, [], true]) {
    assert.equal(apiErrorMessage({ message }, "Fallback"), "Fallback");
  }
  assert.equal(apiErrorMessage({ data: { error: {}, message: "Try later" } }, "Fallback"), "Try later");
});

test("raw HTML, JSON and parser diagnostics use the fallback", () => {
  for (const message of [
    "HTTP 502 Bad Gateway: <!doctype html><h1>Bad gateway</h1>",
    "HTTP 500: <html>internal details</html>",
    "HTTP 500 : {\"error\":\"truncated",
    "HTTP 500 Internal Server Error: [invalid JSON",
    "HTTP 502 Bad Gateway: &lt;html&gt;upstream failure",
    "Failed to parse response from GET /api/academy (200 OK) as JSON",
    "Failed to fetch",
  ]) {
    assert.equal(apiErrorMessage({ message }, "Fallback"), "Fallback", message);
    assert.equal(apiErrorMessage({ data: { error: message } }, "Fallback"), "Fallback", message);
  }
});

test("plain HTTP detail works with or without a status text", () => {
  for (const message of ["HTTP 400 Bad Request: Try again", "HTTP 400: Try again", "HTTP 400 : Try again"]) {
    assert.equal(apiErrorMessage({ message }, "Fallback"), "Try again");
  }
});

test("invalid status values are not treated as HTTP statuses", () => {
  for (const status of [NaN, Infinity, 404.5, 0, 600, "404"]) {
    assert.equal(apiErrorStatus({ status }), null);
  }
});

test("Academy translates only recognized public error codes in all eight locales", () => {
  for (const language of ["en", "fr", "es", "de", "it", "nl", "pl", "pt"]) {
    const locale = JSON.parse(readFileSync(new URL(`../i18n/locales/${language}.json`, import.meta.url), "utf8"));
    const translate = (key: string) => key.split(".").reduce((value, part) => value[part], locale);
    for (const [code, key] of [["PLAYBACK_UNAVAILABLE", "playback_unavailable"], ["DATABASE_UNAVAILABLE", "database_unavailable"]]) {
      assert.equal(academyErrorMessage({ data: { code, error: "PRIVATE_CONFIG" } }, translate), locale.academy[key]);
      assert.equal(typeof locale.academy[key], "string");
    }
    for (const error of [
      { data: { code: "INTERNAL_ERROR", error: "Set BUNNY_PLAYBACK_SECURITY_CONFIRMED=true" } },
      { message: "HTTP 500: <html>private stack trace</html>" },
      { message: {} }, null,
    ]) {
      assert.equal(academyErrorMessage(error, translate), locale.academy.error_message);
    }
    for (const key of ["retry", "retry_video", "course_unavailable", "lesson_unavailable"]) {
      assert.ok(locale.academy[key]?.trim(), `${language}.${key}`);
    }
    assert.ok(locale.academy_lesson.no_video?.trim(), `${language}.no_video`);
  }
});

test("Bunny play URLs retain signed parameters when converted to iframe embeds", () => {
  for (const host of ["video.bunnycdn.com", "iframe.mediadelivery.net"]) {
    const embed = new URL(getVideoEmbedUrl(`https://${host}/play/123/video-id?token=a%2Fb%2Bc%3D&expires=2000000000#player`));
    assert.equal(embed.origin, "https://iframe.mediadelivery.net");
    assert.equal(embed.pathname, "/embed/123/video-id");
    assert.equal(embed.searchParams.get("token"), "a/b+c=");
    assert.equal(embed.searchParams.get("expires"), "2000000000");
    assert.ok(embed.search.startsWith("?token=a%2Fb%2Bc%3D&expires=2000000000&"));
    assert.equal(embed.hash, "#player");
  }
});

test("Bunny defaults preserve existing controls and signed URL encoding", () => {
  const source = "https://iframe.mediadelivery.net/embed/123/video?token=a%2fb%2bc%3d&expires=2000000000&controls=false&autoplay=true";
  const result = getVideoEmbedUrl(source);
  assert.ok(result.startsWith(`${source}&`));
  const embed = new URL(result);
  assert.equal(embed.searchParams.get("controls"), "false");
  assert.equal(embed.searchParams.get("autoplay"), "true");
  assert.equal(embed.searchParams.get("responsive"), "true");
  assert.equal(embed.searchParams.getAll("token").length, 1);
  assert.equal(getVideoEmbedUrl(result), result);
});

test("both Bunny embed hosts preserve one-hour playback credentials", () => {
  for (const host of ["iframe.mediadelivery.net", "player.mediadelivery.net"]) {
    const source = `https://${host}/embed/123/video?token=signed-value&expires=2000003600`;
    const result = new URL(getVideoEmbedUrl(source));
    assert.equal(result.hostname, host);
    assert.equal(result.searchParams.get("token"), "signed-value");
    assert.equal(result.searchParams.get("expires"), "2000003600");
  }
});

test("malformed and executable iframe URLs are rejected", () => {
  for (const url of ["", "not a URL", "javascript:alert(1)", "data:text/html,<h1>Oops</h1>", "https://user:password@example.com/video"]) {
    assert.equal(getVideoEmbedUrl(url), "");
  }
  const lookalike = "https://notyoutube.com/watch?v=123";
  assert.equal(getVideoEmbedUrl(lookalike), lookalike);
  assert.equal(new URL(getVideoEmbedUrl("https://youtu.be/video-id")).pathname, "/embed/video-id");
});

test("requested-language URLs take priority over English assets", () => {
  assert.equal(resolveLessonVideoUrl({
    videoAssets: { en: { embedUrl: "https://example.com/en" } },
    videoUrls: { fr: "https://example.com/fr" },
  }, "fr"), "https://example.com/fr");
});

test("thumbnail-only or empty assets still allow English playback fallback", () => {
  for (const asset of [{ thumbnailUrl: "https://example.com/fr.jpg" }, { embedUrl: " " }]) {
    assert.equal(resolveLessonVideoUrl({ videoAssets: { fr: asset, en: { embedUrl: "https://example.com/en" } } }, "fr"), "https://example.com/en");
  }
});

test("legacy playback never overrides a different-language map", () => {
  assert.equal(resolveLessonVideoUrl({ videoUrl: "https://example.com/de", videoUrls: { de: "https://example.com/de" } }, "fr"), "");
  assert.equal(resolveLessonVideoUrl({ videoUrl: "https://example.com/legacy" }, "fr"), "https://example.com/legacy");
});
