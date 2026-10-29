import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import {
  RATE_LIMITED_RESPONSE,
  createApiRateLimiter,
  createFailedAuthRateLimiter,
  createRateLimiter,
  readLimit,
  resolveTrustProxy,
} from "./rateLimit";

async function serve(t: test.TestContext, app: express.Express): Promise<string> {
  const server = app.listen(0, "127.0.0.1");
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test("limiter returns JSON 429 with retry headers after N requests", async (t) => {
  const app = express();
  app.post("/ai", createRateLimiter({ windowMs: 60_000, limit: 3 }), (_req, res) => {
    res.json({ ok: true });
  });
  const base = await serve(t, app);

  for (let i = 0; i < 3; i++) {
    assert.equal((await fetch(`${base}/ai`, { method: "POST" })).status, 200);
  }
  const limited = await fetch(`${base}/ai`, { method: "POST" });
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), RATE_LIMITED_RESPONSE);
  assert.equal(limited.headers.get("cache-control"), "no-store");
  assert.ok(limited.headers.get("retry-after"));
  assert.ok(limited.headers.get("ratelimit"));
});

test("general API limiter never counts health probes and 0 disables it", async (t) => {
  const app = express();
  app.use("/api", createApiRateLimiter({ API_RATE_LIMIT_PER_MINUTE: "1" }));
  app.get("/api/healthz", (_req, res) => { res.json({ status: "ok" }); });
  app.get("/api/thing", (_req, res) => { res.json({ ok: true }); });
  const disabled = express();
  disabled.use("/api", createApiRateLimiter({ API_RATE_LIMIT_PER_MINUTE: "0" }));
  disabled.get("/api/thing", (_req, res) => { res.json({ ok: true }); });
  const base = await serve(t, app);
  const disabledBase = await serve(t, disabled);

  for (let i = 0; i < 3; i++) {
    assert.equal((await fetch(`${base}/api/healthz`)).status, 200);
  }
  assert.equal((await fetch(`${base}/api/thing`)).status, 200);
  assert.equal((await fetch(`${base}/api/thing`)).status, 429);
  for (let i = 0; i < 3; i++) {
    assert.equal((await fetch(`${disabledBase}/api/thing`)).status, 200);
  }
});

test("failed-auth limiter only counts 401s that carried a bearer token", async (t) => {
  const app = express();
  app.use(createFailedAuthRateLimiter({ FAILED_AUTH_RATE_LIMIT_PER_15_MINUTES: "2" }));
  app.get("/api/thing", (req, res) => {
    if (req.headers.authorization === "Bearer good") res.json({ ok: true });
    else res.status(401).json({ error: "Unauthorized" });
  });
  const base = await serve(t, app);
  const call = (token?: string) => fetch(`${base}/api/thing`, token ? { headers: { authorization: `Bearer ${token}` } } : {});

  for (let i = 0; i < 4; i++) {
    assert.equal((await call("good")).status, 200, "valid sessions are never counted");
    assert.equal((await call()).status, 401, "anonymous requests are never counted");
  }
  assert.equal((await call("forged")).status, 401);
  assert.equal((await call("forged")).status, 401);
  const limited = await call("forged");
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), RATE_LIMITED_RESPONSE);
  assert.equal(limited.headers.get("ratelimit"), null, "does not clobber the API limiter headers");
});

test("limit and trust proxy configuration parsing", () => {
  assert.equal(readLimit(undefined, 20), 20);
  assert.equal(readLimit("", 20), 20);
  assert.equal(readLimit("50", 20), 50);
  assert.equal(readLimit("0", 20), 0);
  assert.equal(readLimit("-1", 20), 20);
  assert.equal(readLimit("abc", 20), 20);
  assert.equal(resolveTrustProxy({ NODE_ENV: "production" }), 1);
  assert.equal(resolveTrustProxy({ NODE_ENV: "development" }), false);
  assert.equal(resolveTrustProxy({ NODE_ENV: "production", TRUST_PROXY: "2" }), 2);
  assert.equal(resolveTrustProxy({ NODE_ENV: "production", TRUST_PROXY: "true" }), 1);
  assert.equal(resolveTrustProxy({ NODE_ENV: "production", TRUST_PROXY: "false" }), false);
  assert.equal(resolveTrustProxy({ TRUST_PROXY: "loopback" }), "loopback");
});
