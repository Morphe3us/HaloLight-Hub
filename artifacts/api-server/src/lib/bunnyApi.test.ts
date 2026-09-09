import test from "node:test";
import assert from "node:assert/strict";
import { fetchBunnyJson, getBunnyLibrarySecurity } from "./bunnyApi";

test("Bunny errors never forward upstream HTML or credentials", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    assert.ok(init.signal);
    return new Response("<html>secret-provider-diagnostics</html>", { status: 401 });
  });
  await assert.rejects(fetchBunnyJson("/library/123", "secret-key"), {
    message: "Bunny API request failed (401)",
  });
});

test("Bunny security uses the management API and returns only allowlisted fields", async (t) => {
  const previous = process.env.BUNNY_API_KEY;
  t.after(() => {
    if (previous === undefined) delete process.env.BUNNY_API_KEY;
    else process.env.BUNNY_API_KEY = previous;
  });
  delete process.env.BUNNY_API_KEY;
  assert.equal(await getBunnyLibrarySecurity("123"), null);
  process.env.BUNNY_API_KEY = "management-test-key";
  t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.equal(url, "https://api.bunny.net/videolibrary/123");
    return Response.json({
      PlayerTokenAuthenticationEnabled: true,
      AllowedReferrers: ["hub.example.com", 123],
      BlockNoneReferrer: true,
      AllowDirectPlay: false,
      ApiKey: "secret", TokenAuthenticationKey: "secret", ReadOnlyApiKey: "secret",
    });
  });
  assert.deepEqual(await getBunnyLibrarySecurity("123"), {
    playerTokenAuthenticationEnabled: true,
    blockNoneReferrer: true,
    allowedReferrers: ["hub.example.com"],
    allowDirectPlay: false,
  });
});
