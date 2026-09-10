import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { transformSync } from "esbuild";
import * as drizzle from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../../../../lib/db/src/schema";
import * as csv from "../lib/csv";

test("personal export includes only the authenticated user's consent history and dashboard preferences", async (t) => {
  const reads: Array<{ table: unknown; userId?: unknown }> = [];
  const db = {
    select() {
      const record: typeof reads[number] = { table: null }; reads.push(record);
      const chain = {
        from(table: unknown) { record.table = table; return chain; },
        where(condition: drizzle.SQL) { record.userId = new PgDialect().sqlToQuery(condition).params[0]; return chain; },
        orderBy() { return chain; }, limit() { return chain; },
        then(resolve: (rows: unknown[]) => unknown) {
          const rows = record.table === schema.userConsentEvents ? [{ id: "proof-a", userId: record.userId, termsVersion: "fixture-v1" }] :
            record.table === schema.userDashboardPreferences ? [{ userId: record.userId, widgets: { onboarding: false } }] : [];
          return Promise.resolve(rows).then(resolve);
        },
      };
      return chain;
    },
    insert: () => ({ values: async () => undefined }),
  };
  const dependencies: Record<string, unknown> = {
    express, "drizzle-orm": drizzle, archiver: { ZipArchive: class {} }, "@workspace/db": { ...schema, db },
    "../lib/userSync": { getOrCreateUser: async () => ({ id: "a", email: "a@example.test" }) },
    "../middlewares/requireAuth": { requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next() },
    "../lib/csv": csv,
  };
  const module = { exports: {} as { default: express.Router } };
  const code = transformSync(readFileSync(new URL("./exports.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
  new Function("require", "module", "exports", code)((name: string) => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; }, module, module.exports);
  const app = express(); app.use(module.exports.default);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }));
  const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/exports/personal?userId=b`);
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json() as Record<string, any>;
  assert.equal(body.consentEvents[0].userId, "a"); assert.equal(body.dashboardPreferences.userId, "a");
  assert.equal(body.dashboardPreferences.widgets.onboarding, false);
  assert.ok(reads.every((read) => read.userId === "a"));
});
