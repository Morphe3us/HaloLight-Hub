import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { transformSync } from "esbuild";
import * as orm from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { usersTable } from "../../../../lib/db/src/schema/users";
import { operationalReadiness } from "../lib/operationalReadiness";

test("readiness GET performs only active-admin lookup and sanitizes failures", async (t) => {
  let reads = 0; let projections = 0; let fail = false;
  let user: { role: string; isActive: boolean } | undefined;
  const dependencies: Record<string, unknown> = {
    express, "drizzle-orm": orm,
    "../middlewares/supabaseAuth": { getAuth: (req: express.Request) => ({ userId: req.headers["x-auth"] }) },
    "@workspace/db": { usersTable, db: {
      select(fields: Record<string, unknown>) {
        reads++; assert.deepEqual(fields, { role: usersTable.role, isActive: usersTable.isActive });
        return { from(table: unknown) {
          assert.equal(table, usersTable);
          return { where(condition: orm.SQL) {
            const query = new PgDialect().sqlToQuery(condition);
            assert.match(query.sql, /"users"\."clerk_id" = \$1/); assert.deepEqual(query.params, ["auth-fixture"]);
            return { async limit(limit: number) {
              assert.equal(limit, 1);
              if (fail) throw new Error("secret-db-url-sentinel");
              return user ? [user] : [];
            } };
          } };
        } };
      },
      insert() { assert.fail("No provisioning"); }, update() { assert.fail("No profile refresh"); }, delete() { assert.fail("No deletion"); },
    } },
    "../lib/operationalReadiness": { operationalReadiness: () => { projections++; return operationalReadiness({ NODE_ENV: "production" }); } },
  };
  const module = { exports: {} as { default: express.Router } };
  const source = readFileSync(new URL("./operational-readiness.ts", import.meta.url), "utf8");
  const code = transformSync(source, { loader: "ts", format: "cjs" }).code;
  new Function("require", "module", "exports", code)((name: string) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name];
  }, module, module.exports);
  const app = express(); app.use(module.exports.default);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (authenticated = true, method = "GET", path = "/admin/operational-readiness") => fetch(base + path, { method, headers: authenticated ? { "x-auth": "auth-fixture" } : {} });
  assert.equal((await request(false)).status, 401); assert.equal(reads, 0);
  for (const candidate of [undefined, { role: "admin", isActive: false }, ...["client", "coach", "sales_rep"].map(role => ({ role, isActive: true }))]) {
    user = candidate; const response = await request();
    assert.equal(response.status, 403); assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(projections, 0);
  user = { role: "admin", isActive: true };
  const response = await request(); assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), operationalReadiness({ NODE_ENV: "production" }));
  fail = true;
  const unavailable = await request(); assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "Operational readiness unavailable" });
  const before = reads;
  assert.equal((await request(true, "POST")).status, 404);
  assert.equal((await request(true, "GET", "/admin/operational-readiness/other")).status, 404);
  assert.equal(reads, before);
});

test("exact readiness GET before consent gate does not exempt adjacent routes or other identities", async (t) => {
  let legalState: "malformed" | "unaccepted" | "accepted" = "malformed";
  let syncCalls = 0; let lookups = 0;
  const identities: Record<string, { role: string; isActive: boolean }> = {
    admin: { role: "admin", isActive: true }, inactive: { role: "admin", isActive: false },
    client: { role: "client", isActive: true }, coach: { role: "coach", isActive: true },
    sales_rep: { role: "sales_rep", isActive: true },
  };
  const getAuth = (req: express.Request) => ({ userId: req.headers["x-auth"] as string | undefined });
  function load<T>(path: string, dependencies: Record<string, unknown>): T {
    const module = { exports: {} };
    const code = transformSync(readFileSync(new URL(path, import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
    new Function("require", "module", "exports", code)((name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name];
    }, module, module.exports);
    return module.exports as T;
  }
  const readiness = load<{ default: express.Router }>("./operational-readiness.ts", {
    express, "drizzle-orm": orm, "../middlewares/supabaseAuth": { getAuth },
    "@workspace/db": { usersTable, db: {
      select() { return { from() { return { where(condition: orm.SQL) {
        const id = String(new PgDialect().sqlToQuery(condition).params[0]);
        return { async limit(value: number) {
          assert.equal(value, 1); lookups++; return identities[id] ? [identities[id]] : [];
        } };
      } }; } }; },
      insert() { assert.fail("No provisioning"); }, update() { assert.fail("No synchronization"); }, delete() { assert.fail("No deletion"); },
    } },
    "../lib/operationalReadiness": { operationalReadiness: () => operationalReadiness({ NODE_ENV: "production" }) },
  }).default;
  const gate = load<{ consentGate: express.RequestHandler }>("../middlewares/consentGate.ts", {
    "../middlewares/supabaseAuth": { getAuth },
    "../lib/userSync": { getOrCreateUser: async () => { syncCalls++; return { id: "local-user" }; } },
    "../lib/userConsentPolicy": {
      legalConsentEnabled: () => true,
      publishedLegalDocuments: () => legalState === "malformed" ? null : { termsVersion: "fixture" },
    },
    "../lib/userCompliance": { userConsentStatus: async () => ({ required: legalState === "unaccepted" }) },
  }).consentGate;
  const app = express();
  // Mirror the lead's exact-method/path mount; Express GET alone also matches HEAD.
  app.use("/api", (req, res, next) => {
    if (req.method === "GET" && req.path === "/admin/operational-readiness") readiness(req, res, next);
    else next();
  });
  app.use("/api", gate);
  app.use("/api", (req, res) => { res.status(getAuth(req).userId ? 200 : 401).json({ business: true }); });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const request = (path = "/admin/operational-readiness", id = "admin", method = "GET") => fetch(base + path, { method, headers: id ? { "x-auth": id } : {} });
  for (const state of ["malformed", "unaccepted"] as const) {
    legalState = state;
    const before = syncCalls;
    const response = await request(); assert.equal(response.status, 200);
    assert.equal(syncCalls, before, "readiness never enters JIT provisioning or consent status lookup");
    for (const id of ["inactive", "client", "coach", "sales_rep", "missing"]) assert.equal((await request(undefined, id)).status, 403);
    const beforeAnonymous = lookups;
    assert.equal((await request(undefined, "")).status, 401); assert.equal(lookups, beforeAnonymous);
    assert.equal(syncCalls, before);
    const blocked = state === "malformed" ? 503 : 428;
    assert.equal((await request("/business")).status, blocked);
    assert.equal((await request("/admin/operational-readiness/other")).status, blocked);
    assert.equal((await request("/admin/operational-readiness/")).status, blocked);
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) assert.equal((await request(undefined, "admin", method)).status, blocked);
  }
  legalState = "accepted";
  assert.equal((await request("/business")).status, 200);
  assert.equal((await request("/business", "")).status, 401);
});
