import assert from "node:assert/strict";
import test from "node:test";
import { createDatabasePool, createPoolConfig } from "@workspace/db/poolConfig";

const connectionString = "postgres://test:test@127.0.0.1:1/test";

test("database pool config bounds connection, query and idle lifetimes", () => {
  assert.deepEqual(createPoolConfig(connectionString), {
    connectionString,
    connectionTimeoutMillis: 5_000,
    query_timeout: 15_000,
    idleTimeoutMillis: 30_000,
  });
});

test("idle pool errors are handled without logging errors, queries, or credentials", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  const pool = createDatabasePool(connectionString);
  t.after(() => pool.end());

  assert.equal(pool.options.connectionTimeoutMillis, 5_000);
  assert.equal(pool.options.query_timeout, 15_000);
  assert.equal(pool.totalCount, 0);
  assert.equal(pool.listenerCount("error"), 1);
  assert.doesNotThrow(() =>
    pool.emit(
      "error",
      Object.assign(
        new Error(
          "Tenant/user postgres.private-ref not found: SELECT email FROM users",
        ),
        { code: "XX000", detail: "private@example.invalid", connectionString },
      ),
    ),
  );
  assert.deepEqual(
    log.mock.calls.map((call) => call.arguments),
    [["DATABASE_UNAVAILABLE: idle database connection failed"]],
  );
  assert.equal(pool.totalCount, 0);
});
