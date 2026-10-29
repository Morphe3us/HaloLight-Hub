import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";

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

  // Large route limits are reserved for signed-in callers: anonymous bodies stay at 1mb.
  const anonymousLarge = await fetch(`${base}/support/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body(3 * 1024 * 1024),
  });
  assert.equal(anonymousLarge.status, 413);
  const anonymousSmall = await fetch(`${base}/support/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body(1024),
  });
  assert.equal(anonymousSmall.status, 401);
  assert.deepEqual(await anonymousSmall.json(), { error: "Unauthorized" });

  const { createBodyParsers } = await import("./lib/bodyLimits");
  const parsers = express();
  parsers.use((req, _res, next) => { (req as { signedIn?: boolean }).signedIn = req.headers["x-test-auth"] === "1"; next(); });
  parsers.use(createBodyParsers((req) => Boolean((req as { signedIn?: boolean }).signedIn)));
  parsers.post("/api/support/tickets", (req, res) => { res.json({ bytes: JSON.stringify(req.body).length }); });
  parsers.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.status ?? 500).end();
  });
  const parsersServer = parsers.listen(0, "127.0.0.1");
  t.after(() => new Promise<void>((resolve) => { parsersServer.close(() => resolve()); parsersServer.closeAllConnections(); }));
  await once(parsersServer, "listening");
  const parsersBase = `http://127.0.0.1:${(parsersServer.address() as AddressInfo).port}`;
  const post = (signedIn: boolean) => fetch(`${parsersBase}/api/support/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(signedIn ? { "x-test-auth": "1" } : {}) },
    body: body(3 * 1024 * 1024),
  });
  assert.equal((await post(true)).status, 200, "signed-in callers keep the route-specific limit");
  assert.equal((await post(false)).status, 413);

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
