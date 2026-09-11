import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { transformSync } from "esbuild";
import * as operators from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { notificationsTable, notificationPreferencesTable } from "../../../../lib/db/src/schema/notifications";
import { upsellOpportunities } from "../../../../lib/db/src/schema/success";
import * as preferences from "../lib/notificationPreferences";
import { automationRules, automationExecutions, automationLogs } from "../../../../lib/db/src/schema/automation";

function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const module = { exports: {} };
  const code = transformSync(readFileSync(new URL(path, import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
  new Function("require", "module", "exports", code)((name: string) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports as T;
}

test("preferences validate strict booleans and preserve arbitrary override objects", () => {
  for (const body of [null, [], "x", { emailEnabled: "false" }, { inAppEnabled: 0 }, { emailEnabled: null }, { typeOverrides: [] }, { typeOverrides: null }, { userId: "other" }, { extra: true }]) {
    assert.equal(preferences.parsePreferenceUpdate(body), null);
  }
  const overrides = { anything: { nested: [true, 2, null] }, unknown: "unchanged" };
  assert.deepEqual(preferences.parsePreferenceUpdate({ inAppEnabled: false, typeOverrides: overrides }), {
    inAppEnabled: false, typeOverrides: JSON.stringify(overrides),
  });
  assert.deepEqual(preferences.parsePreferenceUpdate({}), {});
  for (const typeOverrides of ["broken", "null", "[]"]) {
    assert.deepEqual(preferences.preferenceResponse("a", { emailEnabled: false, inAppEnabled: false, typeOverrides }).typeOverrides, {});
  }
});

test("both automation runners log preference skips without errors, actions or cooldown", async () => {
  const logs: { status: string }[] = [];
  let suppressed = true;
  const rule = { id: "rule", name: "fixture", triggerType: "inactive_user", actionType: "in_app_notification", triggerConfig: {}, runCount: 0, matchCount: 0 };
  const db = {
    select() { return { from(table: unknown) { return { where(condition: operators.SQL) {
      if (table === automationRules) return Promise.resolve([rule]);
      assert.equal(table, automationLogs);
      assert.ok(new PgDialect().sqlToQuery(condition).params.includes("action_taken"));
      return { limit: async () => logs.filter((row) => row.status === "action_taken").slice(0, 1) };
    } }; } }; },
    insert(table: unknown) { return { values(value: { status: string }) {
      if (table === automationExecutions) return { returning: async () => [{ id: "execution" }] };
      assert.equal(table, automationLogs); logs.push(value); return Promise.resolve();
    } }; },
    update() { return { set() { return { where: async () => [] }; } }; },
  };
  const dependencies: Record<string, unknown> = {
    "@workspace/db": { db, automationRules, automationExecutions, automationLogs },
    "drizzle-orm": operators, "../logger": { logger: { warn() {}, info() {}, error() {} } },
  };
  const source = readFileSync(new URL("../lib/automation/engine.ts", import.meta.url), "utf8");
  for (const match of source.matchAll(/import \{ (\w+) \} from "(\.\/(?:evaluators|actions)\/[^\"]+)"/g)) {
    dependencies[match[2]] = { [match[1]]: match[2].includes("evaluators")
      ? async () => [{ targetUserId: "a", detail: {} }]
      : async () => ({ success: true, ...(suppressed ? { skipped: "preference" } : {}), detail: { notificationCreated: !suppressed } }) };
  }
  const engine = load<{ runAutomation: () => Promise<{ actionsFired: number; errors: number }>; runSingleRule: (id: string) => Promise<{ actionsFired: number; errors: number }> }>("../lib/automation/engine.ts", dependencies);
  for (const run of [() => engine.runAutomation(), () => engine.runSingleRule("rule")]) {
    const result = await run();
    assert.equal(result.actionsFired, 0); assert.equal(result.errors, 0);
    assert.equal(logs.at(-1)?.status, "skipped_preference");
  }
  suppressed = false;
  assert.equal((await engine.runAutomation()).actionsFired, 1, "preference skip does not start cooldown");
  assert.equal((await engine.runAutomation()).actionsFired, 0, "actual delivery still starts cooldown");
  assert.equal(logs.at(-1)?.status, "skipped_cooldown");
  assert.equal((await engine.runSingleRule("rule")).actionsFired, 1);
});

function assertLocalDatabase(value: string) {
  const url = new URL(value);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.equal(url.port, "55439");
  assert.ok(url.pathname.length > 1);
  assert.equal(url.search, ""); assert.equal(url.hash, "");
}

test("notification integration guard rejects remote databases and URL overrides", () => {
  for (const value of ["postgresql://remote:55439/db", "postgresql://localhost/db", "postgresql://localhost:5432/db", "postgresql://localhost:55439/db?host=remote", "https://localhost:55439/db"]) assert.throws(() => assertLocalDatabase(value));
  assertLocalDatabase("postgresql://127.0.0.1:55439/halohub_integration");
});

test("real local PostgreSQL concurrently upserts preferences through HTTP in a disposable schema", {
  skip: !process.env.IMPORT_TEST_DATABASE_URL && "Explicit isolated IMPORT_TEST_DATABASE_URL required",
  timeout: 30_000,
}, async (t) => {
  const connectionString = process.env.IMPORT_TEST_DATABASE_URL!;
  assertLocalDatabase(connectionString);
  const require = createRequire(new URL("../../../../lib/db/package.json", import.meta.url));
  const { Pool } = require("pg");
  const schema = `notification_test_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 });
  let created = false;
  t.after(async () => {
    try { if (created) await pool.query(`DROP SCHEMA "${schema}" CASCADE`); }
    finally { await pool.end(); }
  });
  await pool.query(`CREATE SCHEMA "${schema}"`); created = true;
  await pool.query(`CREATE TABLE "${schema}".notification_preferences (
    id text PRIMARY KEY, user_id text NOT NULL UNIQUE,
    email_enabled boolean NOT NULL DEFAULT true, in_app_enabled boolean NOT NULL DEFAULT true,
    type_overrides text NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  const db = drizzle(pool);
  const router = load<{ default: express.Router }>("./notifications.ts", {
    express, "drizzle-orm": operators, "@workspace/db": { db, notificationPreferencesTable, notificationsTable },
    "../lib/notificationPreferences": preferences,
    "../middlewares/requireAuth": { requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next() },
    "../lib/userSync": { getOrCreateUser: async () => ({ id: "fixture-user" }) },
  }).default;
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/notifications/preferences`;
  const put = async (body: unknown) => {
    const response = await fetch(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(response.status, 200); return response.json();
  };
  for (let iteration = 0; iteration < 5; iteration++) {
    await pool.query(`TRUNCATE "${schema}".notification_preferences`);
    await Promise.all([put({ emailEnabled: false }), put({ inAppEnabled: false }), put({ typeOverrides: { arbitrary: [1, false] } })]);
    const result = await pool.query(`SELECT * FROM "${schema}".notification_preferences`);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].email_enabled, false); assert.equal(result.rows[0].in_app_enabled, false);
    assert.deepEqual(JSON.parse(result.rows[0].type_overrides), { arbitrary: [1, false] });
    await put({ inAppEnabled: true });
    const prefs = await (await fetch(url)).json() as Record<string, unknown>;
    assert.equal(prefs.emailEnabled, false); assert.equal(prefs.inAppEnabled, true);
    assert.deepEqual(prefs.typeOverrides, { arbitrary: [1, false] });
  }
});

test("preferences HTTP routes isolate users, avoid GET writes and use partial atomic upserts", async (t) => {
  type Row = { userId: string; emailEnabled: boolean; inAppEnabled: boolean; typeOverrides: string };
  const rows = new Map<string, Row>();
  const sqlDb = drizzle.mock();
  let writes = 0; let reads = 0;
  const db = {
    select() {
      reads++;
      return { from(table: unknown) {
        assert.equal(table, notificationPreferencesTable);
        return { where(condition: operators.SQL) {
          const query = new PgDialect().sqlToQuery(condition);
          assert.match(query.sql, /"notification_preferences"\."user_id" = \$1/);
          return Promise.resolve(rows.has(String(query.params[0])) ? [rows.get(String(query.params[0]))] : []);
        } };
      } };
    },
    insert(table: typeof notificationPreferencesTable) {
      assert.equal(table, notificationPreferencesTable);
      return { values(values: Partial<Row> & { userId: string }) {
        return { onConflictDoUpdate(config: { target: typeof notificationPreferencesTable.userId; set: Partial<Row> }) {
          assert.equal(config.target, notificationPreferencesTable.userId);
          const query = sqlDb.insert(table).values(values).onConflictDoUpdate(config).returning().toSQL();
          assert.match(query.sql, /on conflict \("user_id"\) do update set/);
          const updateSql = query.sql.split("do update set")[1].split(" returning ")[0];
          if (!Object.hasOwn(config.set, "emailEnabled")) assert.doesNotMatch(updateSql, /"email_enabled"/);
          if (!Object.hasOwn(config.set, "inAppEnabled")) assert.doesNotMatch(updateSql, /"in_app_enabled"/);
          return { async returning() {
            writes++;
            const existing = rows.get(values.userId);
            const row = existing ? { ...existing, ...config.set } : { emailEnabled: true, inAppEnabled: true, typeOverrides: "{}", ...values };
            rows.set(values.userId, row);
            return [row];
          } };
        } };
      } };
    },
  };
  const router = load<{ default: express.Router }>("./notifications.ts", {
    express, "drizzle-orm": operators,
    "@workspace/db": { db, notificationsTable, notificationPreferencesTable },
    "../lib/notificationPreferences": preferences,
    "../middlewares/requireAuth": { requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next() },
    "../lib/userSync": { getOrCreateUser: async (req: express.Request) => req.headers["x-user"] ? { id: String(req.headers["x-user"]) } : null },
  }).default;
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/notifications/preferences`;
  const request = (method = "GET", body?: unknown, user = "a") => fetch(url, {
    method, headers: { "content-type": "application/json", ...(user ? { "x-user": user } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal((await request("GET", undefined, "")).status, 401);
  assert.equal((await request("PUT", { inAppEnabled: false }, "")).status, 401);
  assert.equal(reads + writes, 0);
  const initial = await request();
  assert.equal(initial.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await initial.json(), { userId: "a", emailEnabled: true, inAppEnabled: true, typeOverrides: {} });
  assert.equal(writes, 0);
  for (const body of [{ inAppEnabled: "false" }, { typeOverrides: null }, { typeOverrides: [] }, { userId: "b" }, { isAdmin: true }]) {
    assert.equal((await request("PUT", body)).status, 400);
  }
  assert.equal(writes, 0);
  const before = reads;
  const responses = await Promise.all([request("PUT", { inAppEnabled: false }), request("PUT", { emailEnabled: false })]);
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal(reads, before, "PUT does not select before inserting");
  assert.deepEqual(await (await request()).json(), { userId: "a", emailEnabled: false, inAppEnabled: false, typeOverrides: {} });
  const overrides = { custom: { anything: [false, "x"] } };
  assert.equal((await request("PUT", { typeOverrides: overrides })).status, 200);
  assert.deepEqual((await (await request("PUT", {})).json() as Row).typeOverrides, overrides);
  assert.deepEqual(await (await request("GET", undefined, "b")).json(), { userId: "b", emailEnabled: true, inAppEnabled: true, typeOverrides: {} });
});

test("all ordinary producers respect global preference without dropping business recommendations", async () => {
  let enabled: boolean | undefined;
  const inserted: unknown[] = []; let opportunities = 0;
  const db = {
    select() { return { from(table: unknown) {
      assert.equal(table, notificationPreferencesTable);
      return { where(condition: operators.SQL) {
        assert.deepEqual(new PgDialect().sqlToQuery(condition).params, ["a"]);
        return enabled === undefined ? [] : [{ inAppEnabled: enabled, typeOverrides: '{"ignored":false}', emailEnabled: false }];
      } };
    } }; },
    insert(table: unknown) { return { values(value: unknown) {
      if (table === notificationsTable) inserted.push(value);
      else { assert.equal(table, upsellOpportunities); opportunities++; }
      return Promise.resolve();
    } }; },
  };
  const helper = load<{ createOrdinaryNotification: (value: unknown) => Promise<boolean> }>("../lib/createOrdinaryNotification.ts", {
    "drizzle-orm": operators, "@workspace/db": { db, notificationsTable, notificationPreferencesTable },
  });
  type Action = (rule: unknown, match: unknown) => Promise<{ success: boolean; skipped?: string; detail: Record<string, unknown> }>;
  const dependencies = { "../../createOrdinaryNotification": helper, "@workspace/db": { db, upsellOpportunities } };
  const actions = [
    load<{ actionInAppNotification: Action }>("../lib/automation/actions/in-app-notification.ts", dependencies).actionInAppNotification,
    load<{ actionConsumableReorder: Action }>("../lib/automation/actions/consumable-reorder.ts", dependencies).actionConsumableReorder,
    load<{ actionUpsellRecommendation: Action }>("../lib/automation/actions/upsell-recommendation.ts", dependencies).actionUpsellRecommendation,
  ];
  for (const preference of [undefined, false, true]) {
    enabled = preference;
    const before = inserted.length;
    for (const action of actions) {
      const result = await action({ actionConfig: {}, triggerType: "inactive_user" }, { targetUserId: "a", detail: {} });
      assert.equal(result.success, true);
      assert.equal(result.detail.notificationCreated, preference !== false);
      assert.equal(result.skipped, preference === false && action !== actions[2] ? "preference" : undefined,
        "pure alerts skip; persisted upsell opportunity remains a successful business action");
    }
    assert.equal(inserted.length - before, preference === false ? 0 : 3);
  }
  assert.equal(opportunities, 3, "disabling alerts preserves upsell records");
  assert.equal(inserted.length, 6, "previous notifications remain untouched");
});
