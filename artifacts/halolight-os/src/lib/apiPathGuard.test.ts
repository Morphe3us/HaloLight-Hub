import assert from "node:assert/strict";
import test from "node:test";
import { assertNoDotSegments, customFetch } from "../../../../lib/api-client-react/src/custom-fetch";

test("API requests refuse dot segments that would retarget another endpoint", async () => {
  for (const url of ["/api/leads/../exports/workspace-zip", "/api/leads/%2e%2E/exports", "/api/leads/.%2e/x", "/api/leads/..\\exports", "/api/leads/./x"]) {
    assert.throws(() => assertNoDotSegments(url), TypeError, url);
  }
  await assert.rejects(customFetch("/api/leads/../exports/workspace-zip"), TypeError);
});

test("ordinary ids, file names and query strings still pass", () => {
  for (const url of ["/api/leads/3f0c2a4e-8b1d-4c6e-9a7f-2d5b8e1c0f9a", "/api/files/report.v2.pdf", "/api/kb?search=../x", "https://hub.example/api/users/me", "/api/a..b"]) {
    assert.doesNotThrow(() => assertNoDotSegments(url), url);
  }
});
