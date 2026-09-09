import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";
import express from "express";
import {
  checkDatabaseReadiness,
  createHealthRouter,
  READINESS_TIMEOUT_MS,
} from "./health";

function clientMock(
  query: (text: string) => Promise<unknown> = async () => ({
    rows: [{ "?column?": 1 }],
  }),
) {
  const client = new EventEmitter();
  return Object.assign(client, {
    query: test.mock.fn(query),
    release: test.mock.fn((_destroy?: boolean) => {}),
  });
}

async function serve(
  t: TestContext,
  connect: Parameters<typeof createHealthRouter>[0],
  timeoutMs = 50,
) {
  const app = express();
  app.use("/api", createHealthRouter(connect, timeoutMs));
  app.use((_req, res) => {
    res.sendStatus(401);
  });
  const server = app.listen(0, "127.0.0.1");
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
}

test("liveness remains healthy without accessing the database", async (t) => {
  const connect = t.mock.fn(async () => {
    throw new Error("DB down");
  });
  const base = await serve(t, connect);
  const response = await fetch(`${base}/healthz`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(connect.mock.callCount(), 0);
});

test("readiness executes only SELECT 1 and releases a healthy connection", async (t) => {
  const client = clientMock();
  const base = await serve(t, async () => client);
  const response = await fetch(`${base}/readyz`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.deepEqual(
    client.query.mock.calls.map((call) => call.arguments),
    [["SELECT 1"]],
  );
  assert.deepEqual(
    client.release.mock.calls.map((call) => call.arguments),
    [[false]],
  );
  assert.equal(client.listenerCount("error"), 0);
});

test("readiness returns generic JSON 503 on Supabase connection failure without retries", async (t) => {
  const connect = t.mock.fn(async () => {
    throw Object.assign(
      new Error("(ENOTFOUND) tenant/user postgres.private-ref not found"),
      { code: "XX000" },
    );
  });
  const base = await serve(t, connect);
  const response = await fetch(`${base}/readyz`);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(await response.json(), {
    error: "Service Unavailable",
    code: "DATABASE_UNAVAILABLE",
  });
  assert.equal(connect.mock.callCount(), 1);
});

test("readiness bounds a stuck connection checkout and releases a late arrival without querying", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let resolveConnect!: (client: ReturnType<typeof clientMock>) => void;
  const connecting = new Promise<ReturnType<typeof clientMock>>((resolve) => {
    resolveConnect = resolve;
  });
  const probe = checkDatabaseReadiness(() => connecting);
  const rejected = assert.rejects(probe, /Database readiness check failed/);
  t.mock.timers.tick(READINESS_TIMEOUT_MS);
  await rejected;
  const client = clientMock();
  resolveConnect(client);
  await Promise.resolve();
  assert.equal(client.query.mock.callCount(), 0);
  assert.deepEqual(
    client.release.mock.calls.map((call) => call.arguments),
    [[true]],
  );
});

test("one readiness deadline includes connection acquisition and query time", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const client = clientMock(() => new Promise(() => {}));
  let resolveConnect!: (client: ReturnType<typeof clientMock>) => void;
  const connecting = new Promise<ReturnType<typeof clientMock>>((resolve) => {
    resolveConnect = resolve;
  });
  const probe = checkDatabaseReadiness(() => connecting);
  const rejected = assert.rejects(probe, /Database readiness check failed/);
  t.mock.timers.tick(READINESS_TIMEOUT_MS - 1);
  resolveConnect(client);
  await Promise.resolve();
  assert.equal(client.query.mock.callCount(), 1);
  assert.equal(client.release.mock.callCount(), 0);
  t.mock.timers.tick(1);
  await rejected;
  assert.deepEqual(
    client.release.mock.calls.map((call) => call.arguments),
    [[true]],
  );
  assert.equal(client.listenerCount("error"), 0);
});

test("query failure destroys the client and successful probes clear their deadline", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const failed = clientMock(async () => {
    throw new Error("private SQL details");
  });
  await assert.rejects(checkDatabaseReadiness(async () => failed));
  assert.deepEqual(
    failed.release.mock.calls.map((call) => call.arguments),
    [[true]],
  );
  const healthy = clientMock();
  await checkDatabaseReadiness(async () => healthy);
  t.mock.timers.tick(READINESS_TIMEOUT_MS * 2);
  assert.deepEqual(
    healthy.release.mock.calls.map((call) => call.arguments),
    [[false]],
  );
});

test("late query completion after the deadline never releases the client twice", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let resolveQuery!: () => void;
  const client = clientMock(
    () =>
      new Promise<void>((resolve) => {
        resolveQuery = resolve;
      }),
  );
  const probe = checkDatabaseReadiness(async () => client);
  const rejected = assert.rejects(probe);
  await Promise.resolve();
  t.mock.timers.tick(READINESS_TIMEOUT_MS);
  await rejected;
  resolveQuery();
  await Promise.resolve();
  assert.deepEqual(
    client.release.mock.calls.map((call) => call.arguments),
    [[true]],
  );
});

test("checked-out connection errors fail readiness and release exactly once", async () => {
  let rejectQuery!: (error: Error) => void;
  const client = clientMock(
    () =>
      new Promise((_resolve, reject) => {
        rejectQuery = reject;
      }),
  );
  const probe = checkDatabaseReadiness(async () => client);
  const rejected = assert.rejects(probe);
  await Promise.resolve();
  client.emit("error", new Error("connection reset with private details"));
  await rejected;
  rejectQuery(new Error("late rejection"));
  await Promise.resolve();
  assert.deepEqual(
    client.release.mock.calls.map((call) => call.arguments),
    [[true]],
  );
});

test("HTTP readiness deadline returns JSON 503 even when the query never settles", async (t) => {
  const client = clientMock(() => new Promise(() => {}));
  const base = await serve(t, async () => client, 20);
  const response = await fetch(`${base}/readyz`, {
    signal: AbortSignal.timeout(1_000),
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Service Unavailable",
    code: "DATABASE_UNAVAILABLE",
  });
  assert.deepEqual(
    client.release.mock.calls.map((call) => call.arguments),
    [[true]],
  );
});
