import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import test from "node:test";
import express, { type Request, type Response } from "express";
import pino from "pino";
import pinoHttp from "pino-http";
import { DrizzleQueryError } from "drizzle-orm";
import {
  classifyApiError,
  createApiErrorHandler,
  DATABASE_UNAVAILABLE_RESPONSE,
  isDatabaseUnavailable,
  serializeApiError,
} from "./apiErrors";

function queryError(cause: unknown) {
  return new DrizzleQueryError(
    "SELECT secret FROM users WHERE email = $1",
    ["private@example.invalid"],
    cause as Error,
  );
}

test("classifies the Supabase XX000 tenant/user outage, including nested Drizzle errors", () => {
  for (const message of [
    "Tenant or user not found",
    "(ENOTFOUND) tenant/user postgres.private-ref not found",
    "Tenant/user postgres.private-ref not found",
  ]) {
    const cause = Object.assign(new Error(message), { code: "XX000" });
    for (const error of [
      cause,
      queryError(cause),
      new Error("Wrapped", { cause: queryError(cause) }),
    ]) {
      assert.equal(isDatabaseUnavailable(error), true);
      assert.deepEqual(classifyApiError(error), {
        statusCode: 503,
        ...DATABASE_UNAVAILABLE_RESPONSE,
      });
    }
  }
});

test("handles database authentication, network, pool, and query timeouts", () => {
  for (const code of [
    "08006",
    "08001",
    "28P01",
    "28000",
    "3D000",
    "53300",
    "57P01",
    "57P02",
    "57P03",
    "ECONNREFUSED",
    "ECONNRESET",
    "EPIPE",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ETIMEDOUT",
    "ENETUNREACH",
    "EHOSTUNREACH",
  ]) {
    assert.equal(
      isDatabaseUnavailable(
        queryError(Object.assign(new Error("private detail"), { code })),
      ),
      true,
      code,
    );
  }
  for (const message of [
    "Query read timeout",
    "timeout expired",
    "timeout exceeded when trying to connect",
    "Connection terminated",
    "Connection terminated unexpectedly",
    "Connection terminated due to connection timeout",
    "Client has encountered a connection error and is not queryable",
  ]) {
    assert.equal(
      isDatabaseUnavailable(queryError(new Error(message))),
      true,
      message,
    );
  }
});

test("does not misclassify SQL mistakes, constraint errors, or unrelated XX000 errors", () => {
  for (const code of ["42601", "42P01", "23505", "23503", "57014", "XX000"]) {
    assert.equal(
      isDatabaseUnavailable(
        queryError(Object.assign(new Error("SQL failed"), { code })),
      ),
      false,
      code,
    );
  }
  assert.equal(
    isDatabaseUnavailable(queryError(new Error("Tenant or user not found"))),
    false,
  );
  assert.equal(
    isDatabaseUnavailable(
      new Error("Failed query: SELECT 'Query read timeout'"),
    ),
    false,
  );
});

test("traverses aggregate errors and safely handles cyclic causes and non-errors", () => {
  const cyclic: { cause?: unknown } = {};
  cyclic.cause = cyclic;
  for (const value of [null, undefined, "ECONNRESET", 503, cyclic]) {
    assert.equal(isDatabaseUnavailable(value), false);
  }
  assert.equal(
    isDatabaseUnavailable(
      new AggregateError([cyclic, { code: "ECONNREFUSED" }]),
    ),
    true,
  );
});

test("pino's wrapped Drizzle errors are serialized as classification only", () => {
  const raw = queryError(
    Object.assign(new Error("Tenant or user not found"), { code: "XX000" }),
  );
  assert.deepEqual(
    serializeApiError({
      raw,
      message: raw.message,
      stack: raw.stack,
      params: raw.params,
    }),
    {
      code: "DATABASE_UNAVAILABLE",
    },
  );
});

test("preserves safe 4xx statuses without exposing error messages or request bodies", () => {
  for (const status of [400, 401, 403, 404, 413, 415, 422, 429]) {
    const error = Object.assign(new Error("private@example.invalid"), {
      status,
      body: "secret body",
    });
    const classified = classifyApiError(error);
    assert.equal(classified.statusCode, status);
    assert.equal(classified.code, "CLIENT_ERROR");
    assert.doesNotMatch(JSON.stringify(classified), /private|secret/);
  }
  assert.equal(classifyApiError({ statusCode: 400 }).statusCode, 400);
  for (const status of [200, 302, 500, 600, 400.5, "400", NaN]) {
    assert.equal(classifyApiError({ status }).statusCode, 500);
  }
});

test("forwards a sanitized error when headers are already sent instead of swallowing it", () => {
  const logs: unknown[] = [];
  const nextErrors: unknown[] = [];
  const error = queryError({ code: "ECONNREFUSED" });
  createApiErrorHandler({
    error: (...args) => {
      logs.push(args);
    },
  })(
    error,
    {} as Request,
    {
      headersSent: true,
      status() {
        assert.fail("must not write headers");
      },
    } as unknown as Response,
    (forwarded) => {
      nextErrors.push(forwarded);
    },
  );
  assert.equal(nextErrors.length, 1);
  const forwarded = nextErrors[0] as Error & { status: number; code: string };
  assert.ok(forwarded instanceof Error);
  assert.equal(forwarded.message, "Service Unavailable");
  assert.equal(forwarded.status, 503);
  assert.equal(forwarded.code, "DATABASE_UNAVAILABLE");
  assert.doesNotMatch(forwarded.stack ?? "", /private@example|SELECT|secret/);
  assert.equal(forwarded.cause, undefined);
  assert.deepEqual(logs, [
    [{ code: "DATABASE_UNAVAILABLE", statusCode: 503 }, "API request failed"],
  ]);
});

test("real Express requests preserve parser errors and return safe JSON and logs for database outages", async (t) => {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
  const logger = pino({}, stream);
  const app = express();
  app.use(
    pinoHttp({
      logger,
      serializers: {
        err: serializeApiError,
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(express.json({ limit: "64b" }));
  app.post("/body", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/database", async (_req, res) => {
    const error = queryError(
      Object.assign(new Error("Tenant/user postgres.private-ref not found"), {
        code: "XX000",
      }),
    );
    res.err = error;
    throw error;
  });
  app.get("/bug", () => {
    throw queryError({ code: "42601" });
  });
  app.use(createApiErrorHandler(logger));
  const server = app.listen(0, "127.0.0.1");
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  for (const [body, status, error] of [
    ['{"secret":"private@example.invalid",', 400, "Bad Request"],
    [JSON.stringify({ secret: "x".repeat(100) }), 413, "Payload Too Large"],
  ] as const) {
    const response = await fetch(`${base}/body`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error });
  }
  const outage = await fetch(`${base}/database`);
  assert.equal(outage.status, 503);
  assert.match(outage.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(await outage.json(), DATABASE_UNAVAILABLE_RESPONSE);
  const bug = await fetch(`${base}/bug`);
  assert.equal(bug.status, 500);
  assert.deepEqual(await bug.json(), { error: "Internal Server Error" });

  const logs = chunks.join("");
  assert.match(logs, /DATABASE_UNAVAILABLE/);
  assert.match(logs, /"err":\{"code":"DATABASE_UNAVAILABLE"\}/);
  assert.doesNotMatch(
    logs,
    /private@example|private-ref|SELECT|secret|Failed query|params|\"stack\"/,
  );
});
