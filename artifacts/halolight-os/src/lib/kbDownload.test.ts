import assert from "node:assert/strict";
import test from "node:test";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { fetchKbFile } from "./kbDownload";

test("KB PDF fetch uses authenticated client headers, credentials and blobs, never JWT URLs", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; setAuthTokenGetter(null); });
  setAuthTokenGetter(() => "test-session-token");
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(input, "/api/files/kb/guide.pdf");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-session-token");
    assert.equal(init?.credentials, "include");
    assert.equal(init?.redirect, "error");
    return new Response("%PDF-1.7", { headers: { "content-type": "application/pdf" } });
  };
  const blob = await fetchKbFile("/api/files/kb/guide.pdf", "https://hub.example");
  assert.ok(blob instanceof Blob);
  assert.equal(await blob.text(), "%PDF-1.7");
  await assert.rejects(fetchKbFile("https://evil.example/api/files/kb/guide.pdf", "https://hub.example"));
  await assert.rejects(fetchKbFile("/api/files/kb/guide.pdf?token=secret", "https://hub.example"));
  assert.equal(calls, 1);
  globalThis.fetch = async () => new Response("Denied", { status: 403 });
  await assert.rejects(fetchKbFile("/api/files/kb/guide.pdf", "https://hub.example"), /403/);
});
