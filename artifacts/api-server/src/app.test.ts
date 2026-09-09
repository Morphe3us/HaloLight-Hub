import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

test("app probes bypass authentication and parser failures reach the safe global handler", async (t) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:1/test";
  t.after(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  const { pool } = await import("@workspace/db");
  t.after(() => pool.end());
  const connect = t.mock.method(pool, "connect", async () => {
    throw Object.assign(
      new Error("Tenant/user postgres.private-ref not found"),
      { code: "XX000" },
    );
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

  const alive = await fetch(`${base}/healthz`);
  assert.equal(alive.status, 200);
  assert.deepEqual(await alive.json(), { status: "ok" });
  assert.equal(connect.mock.callCount(), 0);

  const ready = await fetch(`${base}/readyz`);
  assert.equal(ready.status, 503);
  assert.deepEqual(await ready.json(), {
    error: "Service Unavailable",
    code: "DATABASE_UNAVAILABLE",
  });
  assert.equal(ready.headers.get("cache-control"), "no-store");
  assert.equal(connect.mock.callCount(), 1);

  const malformed = await fetch(`${base}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"secret":"private@example.invalid",',
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: "Bad Request" });
  assert.equal(connect.mock.callCount(), 1);
  assert.equal(pool.totalCount, 0);
});
