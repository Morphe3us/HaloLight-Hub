import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

test("global JSON limit is 1mb, large routes accept bigger bodies, security headers are set", async (t) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:1/test";
  t.after(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  const { pool } = await import("@workspace/db");
  t.after(() => pool.end());
  const connect = t.mock.method(pool, "connect", async () => {
    throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
  });
  const { default: app } = await import("./app");
  const server = app.listen(0, "127.0.0.1");
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const body = (bytes: number) => JSON.stringify({ title: "x", content: "a".repeat(bytes) });

  const oversized = await fetch(`${base}/support/tickets/00000000-0000-4000-8000-000000000000/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body(1.5 * 1024 * 1024),
  });
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { error: "Payload Too Large" });

  // Parsed successfully by the route-specific parser, then rejected only by auth.
  const largeAllowed = await fetch(`${base}/support/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body(3 * 1024 * 1024),
  });
  assert.equal(largeAllowed.status, 401);
  assert.deepEqual(await largeAllowed.json(), { error: "Unauthorized" });

  const tooLargeEvenForRoute = await fetch(`${base}/users/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body(5 * 1024 * 1024),
  });
  assert.equal(tooLargeEvenForRoute.status, 413);

  const urlencoded = await fetch(`${base}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `a=${"b".repeat(1.5 * 1024 * 1024)}`,
  });
  assert.equal(urlencoded.status, 413);

  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);
  const csp = health.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /frame-src [^;]*https:\/\/iframe\.mediadelivery\.net/);
  assert.match(csp, /font-src [^;]*https:\/\/fonts\.gstatic\.com/);
  assert.equal(
    health.headers.get("strict-transport-security"),
    "max-age=31536000; includeSubDomains",
  );
  assert.equal(health.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(health.headers.get("x-frame-options"), "DENY");
  assert.equal(health.headers.get("cross-origin-embedder-policy"), null);
  assert.equal(connect.mock.callCount(), 0);
});
