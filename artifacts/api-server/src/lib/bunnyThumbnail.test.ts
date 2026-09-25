import test from "node:test";
import assert from "node:assert/strict";
import { signBunnyThumbnailUrl } from "./bunnyThumbnail";

const host = "vz-example.b-cdn.net";
const videoId = "32d140e2-e4f4-4eec-9d53-20371e9be607";
const path = `/${videoId}/thumbnail.jpg`;
const rawUrl = `https://${host}${path}`;
const now = 1700000000;
const expectedUrl = `${rawUrl}?token=HS256-L-QyOKLo0eM1tPEyDPaVBJEcm7rzxP7QNt_SmivHzWM&expires=1700003600`;
const originalConfig = {
  BUNNY_STREAM_TOKEN_AUTH_KEY: process.env.BUNNY_STREAM_TOKEN_AUTH_KEY,
  BUNNY_STREAM_CDN_HOSTNAME: process.env.BUNNY_STREAM_CDN_HOSTNAME,
};

test.beforeEach(() => {
  process.env.BUNNY_STREAM_TOKEN_AUTH_KEY = "test-signing-key";
  process.env.BUNNY_STREAM_CDN_HOSTNAME = host;
});

test.afterEach(() => {
  for (const [name, value] of Object.entries(originalConfig)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("thumbnail signing matches the Bunny HMAC-SHA256 known vector with a one-hour lifetime", () => {
  assert.equal(signBunnyThumbnailUrl(rawUrl, now), expectedUrl);
  assert.equal(signBunnyThumbnailUrl(rawUrl, now), expectedUrl);
  assert.ok(!expectedUrl.includes("test-signing-key"));
});

test("thumbnail signing defaults to the current whole Unix second", (t) => {
  t.mock.method(Date, "now", () => now * 1000 + 999);
  assert.equal(signBunnyThumbnailUrl(rawUrl), expectedUrl);
});

test("thumbnail signing normalizes configured hostnames and HTTPS hostname URLs", () => {
  for (const config of [host, ` ${host.toUpperCase()} `, `https://${host}`, ` HTTPS://${host.toUpperCase()}/ `]) {
    process.env.BUNNY_STREAM_CDN_HOSTNAME = config;
    assert.equal(signBunnyThumbnailUrl(rawUrl, now), expectedUrl);
    assert.equal(signBunnyThumbnailUrl(`https://${host.toUpperCase()}${path}`, now), expectedUrl);
  }
});

test("thumbnail signing refreshes only token and expires, collapsing duplicate values", () => {
  for (const query of [
    "token=old", "expires=1", "token=old&expires=1", "expires=1&token=old",
    "token=old&token=other&expires=1&expires=2",
  ]) assert.equal(signBunnyThumbnailUrl(`${rawUrl}?${query}`, now), expectedUrl);
  assert.equal(signBunnyThumbnailUrl(expectedUrl, now), expectedUrl);
  const refreshed = new URL(signBunnyThumbnailUrl(expectedUrl, now + 1800));
  assert.equal(refreshed.searchParams.get("expires"), "1700005400");
  assert.notEqual(refreshed.searchParams.get("token"), new URL(expectedUrl).searchParams.get("token"));
});

test("thumbnail signing rejects every query parameter other than token and expires", () => {
  for (const query of [
    "width=320", "token_path=%2F", "token=old&expires=1&download=true",
    "token=old&token_path=%2F", "Token=old", "expires=1&=value", "ignoreParams=true",
  ]) {
    const value = `${rawUrl}?${query}`;
    assert.equal(signBunnyThumbnailUrl(value, now), value);
  }
});

test("thumbnail signing never signs playback, sibling files, or non-UUID paths", () => {
  for (const pathname of [
    `/${videoId}/playlist.m3u8`, `/${videoId}/play_720p.mp4`, `/${videoId}/video.mp4`,
    `/${videoId}/preview.webp`, `/${videoId}/thumbnail_1.jpg`, `/${videoId}/thumbnail.webp`,
    `/${videoId}/Thumbnail.jpg`, `/${videoId}/thumbnail.jpg/`, `/${videoId}/thumbnail.jpg/extra`,
    `/${videoId}/nested/thumbnail.jpg`, `/prefix${path}`, "/thumbnail.jpg",
    "/not-a-uuid/thumbnail.jpg", `/${videoId.slice(1)}/thumbnail.jpg`,
  ]) {
    const value = `https://${host}${pathname}`;
    assert.equal(signBunnyThumbnailUrl(value, now), value);
  }
});

test("thumbnail signing rejects path normalization and encoded path tampering", () => {
  for (const pathname of [
    `/other/..${path}`, `/other/%2e%2e${path}`, `/${videoId}/./thumbnail.jpg`,
    `/${videoId}/%74humbnail.jpg`, `/${videoId}%2Fthumbnail.jpg`,
    `/${videoId}\\thumbnail.jpg`, `//${videoId}/thumbnail.jpg`,
  ]) {
    const value = `https://${host}${pathname}`;
    assert.equal(signBunnyThumbnailUrl(value, now), value);
  }
});

test("thumbnail signing requires HTTPS without credentials, explicit ports, or fragments", () => {
  for (const value of [
    `http://${host}${path}`, `ftp://${host}${path}`, `//${host}${path}`,
    `https://${host}:443${path}`, `https://${host}:8443${path}`, `https://${host}:${path}`,
    `https://user:pass@${host}${path}`, `https://user@${host}${path}`, `https://@${host}${path}`,
    `${rawUrl}#fragment`, `${rawUrl}#`, ` ${rawUrl}`, `${rawUrl}\n`,
    `https://${host}\t${path}`, `https:\\${host}${path}`, "not a URL", "", path,
  ]) assert.equal(signBunnyThumbnailUrl(value, now), value);
});

test("thumbnail signing leaves unrelated and lookalike hosts unchanged", () => {
  for (const hostname of [
    "vz-other.b-cdn.net", "example.com", "iframe.mediadelivery.net",
    `${host}.evil.example`, `subdomain.${host}`, `${host}.`, "b-cdn.net",
  ]) {
    const value = `https://${hostname}${path}`;
    assert.equal(signBunnyThumbnailUrl(value, now), value);
  }
});

test("thumbnail signatures bind the exact UUID path", () => {
  const otherUrl = rawUrl.replace(videoId, "32d140e2-e4f4-4eec-9d53-20371e9be608");
  const signed = new URL(signBunnyThumbnailUrl(otherUrl, now));
  assert.equal(signed.pathname, new URL(otherUrl).pathname);
  assert.notEqual(signed.searchParams.get("token"), new URL(expectedUrl).searchParams.get("token"));
});

test("missing or blank signing configuration preserves raw URLs", () => {
  for (const name of Object.keys(originalConfig)) {
    const configured = process.env[name];
    for (const value of [undefined, "", "   "]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
      assert.equal(signBunnyThumbnailUrl(rawUrl, now), rawUrl);
      assert.equal(signBunnyThumbnailUrl(expectedUrl, now), expectedUrl);
    }
    process.env[name] = configured;
  }
});

test("invalid CDN configuration leaves thumbnails unchanged", () => {
  for (const config of [
    "not a hostname", "https://", `https://user:pass@${host}`, `https://${host}:8443`,
    `https://${host}/other`, `https://${host}?other=1`, `https://${host}#fragment`,
  ]) {
    process.env.BUNNY_STREAM_CDN_HOSTNAME = config;
    assert.equal(signBunnyThumbnailUrl(rawUrl, now), rawUrl);
  }
});

test("invalid timestamps never produce signed URLs", () => {
  for (const timestamp of [NaN, Infinity, -Infinity, -1, now + 0.5, Number.MAX_SAFE_INTEGER]) {
    assert.equal(signBunnyThumbnailUrl(rawUrl, timestamp), rawUrl);
  }
});
