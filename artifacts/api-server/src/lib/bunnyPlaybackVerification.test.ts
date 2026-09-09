import test from "node:test";
import assert from "node:assert/strict";
import { verifyBunnyPlaybackProtection } from "./bunnyPlaybackVerification";
import { BunnyPlaybackConfigurationError } from "./bunnySecurity";

const url = "https://iframe.mediadelivery.net/embed/123/video-id";
function configure(t: test.TestContext) {
  const overrides = {
    NODE_ENV: "production", BUNNY_STREAM_TOKEN_AUTH_KEY: t.name,
    BUNNY_STREAM_LIBRARY_ID: "123", APP_PUBLIC_URL: "https://hub.example.com",
  };
  const original = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("production refuses playback when unsigned embeds are accepted despite local configuration", async (t) => {
  configure(t);
  t.mock.method(globalThis, "fetch", async () => new Response("", { status: 200 }));
  await assert.rejects(verifyBunnyPlaybackProtection(url), BunnyPlaybackConfigurationError);
});

test("production refuses a signing key that Bunny rejects", async (t) => {
  configure(t);
  t.mock.method(globalThis, "fetch", async () => new Response("", { status: 403 }));
  await assert.rejects(verifyBunnyPlaybackProtection(url), BunnyPlaybackConfigurationError);
});

test("verified remote protection deduplicates requests, expires and rechecks revocation", async (t) => {
  configure(t);
  let now = 1700000000000;
  t.mock.method(Date, "now", () => now);
  let calls = 0;
  let secured = true;
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    calls++;
    assert.equal(init.redirect, "error");
    assert.ok(init.signal);
    const signed = new URL(input).searchParams.has("token");
    return new Response("", { status: signed || !secured ? 200 : 403 });
  });
  await Promise.all([verifyBunnyPlaybackProtection(url), verifyBunnyPlaybackProtection(url)]);
  assert.equal(calls, 2);
  await verifyBunnyPlaybackProtection(url);
  assert.equal(calls, 2);
  now += 60_001;
  secured = false;
  await assert.rejects(verifyBunnyPlaybackProtection(url), BunnyPlaybackConfigurationError);
  assert.equal(calls, 4);
  secured = true;
  await verifyBunnyPlaybackProtection(url);
  assert.equal(calls, 6);
});

test("a failed network check returns a safe error and does not cache the failure", async (t) => {
  configure(t);
  let fail = true;
  t.mock.method(globalThis, "fetch", async (input: string) => {
    if (fail) throw new Error("secret provider details");
    return new Response("", { status: new URL(input).searchParams.has("token") ? 200 : 403 });
  });
  await assert.rejects(verifyBunnyPlaybackProtection(url), { message: "Video playback is temporarily unavailable." });
  fail = false;
  await verifyBunnyPlaybackProtection(url);
});
