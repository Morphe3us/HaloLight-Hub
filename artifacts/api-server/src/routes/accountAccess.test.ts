import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import * as crypto from "node:crypto";
import express from "express";
import { transformSync } from "esbuild";
import * as orm from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { usersTable, type User } from "../../../../lib/db/src/schema/users";

function load<T>(relative: string, dependencies: Record<string, unknown>): T {
  const code = transformSync(readFileSync(new URL(relative, import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name: string) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name];
  }, module, module.exports);
  return module.exports as T;
}

test("account approval integration uses real middleware order and route guards without external services", { timeout: 15000 }, async t => {
  const actorId = "11111111-1111-4111-8111-111111111111";
  const targetId = "22222222-2222-4222-8222-222222222222";
  const makeUser = (patch: Partial<User> = {}) => ({
    id: targetId, authId: "fixture-auth", email: "fixture@example.invalid", role: "client",
    isActive: true, accessStatus: "pending", fullName: "Fixture", updatedAt: new Date(0), ...patch,
  } as User);
  let rows: User[] = [];
  let writes = 0;
  let privateCalls = 0;
  let consentCalls = 0;
  let readinessCalls = 0;
  let listFilters: string[] = [];
  const dialect = new PgDialect();
  function matches(row: User, condition?: orm.SQL) {
    if (!condition) return true;
    const { sql, params } = dialect.sqlToQuery(condition);
    const columns = { id: "id", is_active: "isActive", access_status: "accessStatus", role: "role", clerk_id: "authId" } as const;
    for (const match of sql.matchAll(/"users"\."(id|is_active|access_status|role|clerk_id)" = \$(\d+)/g)) {
      if (row[columns[match[1] as keyof typeof columns]] !== params[Number(match[2]) - 1]) return false;
    }
    return true;
  }
  const db = {
    select: (fields?: unknown) => {
      let condition: orm.SQL | undefined;
      let limit = 50; let offset = 0;
      const query = {
        from: () => query,
        where: (value: orm.SQL) => { condition = value; return query; },
        orderBy: () => query,
        limit: (value: number) => { limit = value; return query; },
        offset: (value: number) => { offset = value; return query; },
        then: (resolve: (value: unknown[]) => unknown) => {
          const selected = rows.filter(row => matches(row, condition));
          if (condition) listFilters.push(dialect.sqlToQuery(condition).sql);
          return Promise.resolve(fields ? [{ count: selected.length }] : selected.slice(offset, offset + limit).map(row => ({ ...row }))).then(resolve);
        },
      };
      return query;
    },
    update: () => ({ set: (updates: Partial<User>) => ({ where: (condition: orm.SQL) => ({ returning: async () => {
      const targets = rows.filter(row => matches(row, condition));
      writes += targets.length;
      return targets.map(row => ({ ...Object.assign(row, updates) }));
    } }) }) }),
  };
  const actor = (req: express.Request) => req.headers["x-auth"] ? makeUser({
    id: actorId, role: (req.headers["x-role"] ?? "client") as User["role"],
    accessStatus: (req.headers["x-status"] ?? "approved") as User["accessStatus"],
    isActive: req.headers["x-active"] !== "false",
  }) : null;
  const getAuth = (req: express.Request) => req.headers["x-auth"] ? { userId: "fixture-auth" } : null;
  const requireAuth: express.RequestHandler = (req, res, next) => {
    if (!getAuth(req)) { res.sendStatus(401); return; } next();
  };
  const sync = {
    resolveAccountUser: async (req: express.Request) => actor(req),
    getOrCreateUser: async (req: express.Request) => {
      const user = actor(req); return user?.isActive && user.accessStatus === "approved" ? user : null;
    },
  };
  const dependencies = {
    express, "node:crypto": crypto, "drizzle-orm": orm, "@workspace/db": { db, usersTable },
    "../middlewares/requireAuth": { requireAuth }, "../lib/userSync": sync,
    "../lib/userConsentPolicy": {}, "../lib/userCompliance": {}, "../lib/userDashboardPreferences": {},
    "../lib/supabase": {}, "../lib/supabaseProfile": {},
  };
  const access = load<{ default: express.Router }>("./accountAccess.ts", dependencies).default;
  const users = load<{ default: express.Router }>("./users.ts", dependencies).default;
  const gate = load<{ accountAccessGate: express.RequestHandler }>("../middlewares/accountAccessGate.ts", {
    "./supabaseAuth": { getAuth }, "../lib/userSync": sync,
  }).accountAccessGate;
  const health = express.Router(); health.get("/healthz", (_req, res) => res.json({ ok: true }));
  const readiness = express.Router(); readiness.get("/admin/operational-readiness", requireAuth, (_req, res) => { readinessCalls++; res.sendStatus(200); });
  const privateRouter = express.Router(); privateRouter.use(users);
  privateRouter.use(requireAuth, (_req, res) => { privateCalls++; res.json({ private: true }); });
  const pass: express.RequestHandler = (_req, _res, next) => next();
  const app = load<{ default: express.Express }>("../app.ts", {
    express, cors: () => pass, "pino-http": () => pass,
    "./middlewares/supabaseAuth": { supabaseAuth: pass }, "./routes": privateRouter,
    "./lib/logger": { logger: {} },
    "./lib/corsPolicy": { getAllowedCorsOrigins: () => [], isCorsOriginAllowed: () => true },
    "./lib/apiErrors": { createApiErrorHandler: () => ((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { assert.fail(String(err)); res.sendStatus(500); }), serializeApiError: () => ({}) },
    "./routes/health": health, "./routes/operational-readiness": readiness,
    "./lib/frontend": { createFrontendHandler: () => pass },
    "./middlewares/consentGate": { consentGate: ((_req, _res, next) => { consentCalls++; next(); }) as express.RequestHandler },
    "./middlewares/accountAccessGate": { accountAccessGate: gate }, "./routes/accountAccess": access,
  }).default;
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const request = (url: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) => fetch(base + url, {
    method, headers: { "content-type": "application/json", "x-auth": "yes", "x-role": "admin", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  await t.test("pending/rejected/disabled cannot reach private direct URLs, consent or readiness", async () => {
    const paths = ["/users/me", "/users/me/consent", "/academy/lessons/fixture", "/files/fixture.mp4", "/admin/bunny/status", "/exports/personal", "/admin/operational-readiness"];
    const blockedHeaders: Record<string, string>[] = [{ "x-status": "pending" }, { "x-status": "rejected" }, { "x-active": "false" }];
    for (const headers of blockedHeaders) {
      for (const url of paths) for (const method of ["GET", "HEAD"]) {
        const response = await request(url, method, undefined, { ...headers, range: "bytes=0-10" });
        assert.equal(response.status, 403, `${url} ${method}`);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
      }
      const response = await request("/users/me/access", "GET", undefined, headers);
      assert.equal(response.status, 200);
      const result = await response.json() as { status: string; email: string };
      assert.equal(result.status, headers["x-active"] ? "disabled" : headers["x-status"]);
      assert.deepEqual(Object.keys(result).sort(), ["email", "status"]);
    }
    assert.equal(privateCalls, 0); assert.equal(consentCalls, 0); assert.equal(readinessCalls, 0);
    for (const [path, method] of [["/users/me/access/", "GET"], ["/users/me/access", "HEAD"], ["/users/me/access", "POST"], ["/users/me/access/other", "GET"]]) {
      assert.equal((await request(path, method, undefined, { "x-status": "pending" })).status, 403);
    }
    assert.equal((await request("/healthz", "GET", undefined, { "x-status": "pending" })).status, 200);
    assert.equal((await request("/files/fixture.mp4", "GET", undefined, { "x-auth": "" })).status, 401);
    assert.equal((await request("/users/me/access", "GET", undefined, { "x-auth": "" })).status, 401);
  });

  await t.test("decision requires an approved active admin, forbids self-review and mass assignment", async () => {
    rows = [makeUser()]; writes = 0;
    const url = `/users/${targetId}/access`;
    const deniedHeaders: Record<string, string>[] = [{ "x-role": "client" }, { "x-status": "pending" }, { "x-status": "rejected" }, { "x-active": "false" }];
    for (const headers of deniedHeaders) {
      assert.equal((await request(url, "POST", { decision: "approved" }, headers)).status, 403);
    }
    assert.equal((await request(`/users/${actorId}/access`, "POST", { decision: "approved" })).status, 403);
    for (const body of [{ decision: "approved", role: "admin" }, { decision: "approved", email: "other@example.invalid" }, { decision: "pending" }, {}, []]) {
      assert.equal((await request(url, "POST", body)).status, 400);
    }
    assert.equal(writes, 0);
    const before = { ...rows[0] };
    const results = await Promise.all([request(url, "POST", { decision: "approved" }), request(url, "POST", { decision: "rejected" })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal(writes, 1);
    assert.deepEqual({ ...rows[0], accessStatus: before.accessStatus, updatedAt: before.updatedAt }, before);
    assert.equal(rows[0].role, "client");
  });

  await t.test("rejected, disabled and non-client targets never transition", async () => {
    for (const patch of [{ accessStatus: "rejected" as const }, { isActive: false }, { role: "admin" as const }, { accessStatus: "approved" as const }]) {
      rows = [makeUser(patch)]; const before = { ...rows[0] }; writes = 0;
      assert.equal((await request(`/users/${targetId}/access`, "POST", { decision: "approved" })).status, 409);
      assert.equal(writes, 0); assert.deepEqual(rows[0], before);
    }
    rows = [makeUser()];
    assert.equal((await request(`/users/${targetId}/access`, "POST", { decision: "rejected" })).status, 200);
    assert.equal((await request(`/users/${targetId}/access`, "POST", { decision: "approved" })).status, 409);
    assert.equal(rows[0].accessStatus, "rejected");
  });

  await t.test("ordinary admin edits cannot alter pending identity/role or set approval", async () => {
    rows = [makeUser()]; writes = 0;
    for (const body of [{ email: "other@example.invalid" }, { role: "admin" }, { role: "client" }]) {
      assert.equal((await request(`/users/${targetId}`, "PATCH", body)).status, 409);
    }
    for (const body of [{ accessStatus: "approved" }, { authId: "replacement" }]) {
      assert.equal((await request(`/users/${targetId}`, "PATCH", body)).status, 400);
    }
    assert.equal(writes, 0); assert.equal(rows[0].accessStatus, "pending");
  });

  await t.test("accessStatus filters both rows and total before pagination; invalid inputs rejected", async () => {
    rows = [makeUser(), makeUser({ id: "another", accessStatus: "approved" })]; listFilters = [];
    const response = await request("/users?accessStatus=pending&limit=1");
    assert.equal(response.status, 200);
    const result = await response.json() as { total: number; items: User[] };
    assert.equal(result.total, 1); assert.equal(result.items.length, 1); assert.equal(result.items[0].accessStatus, "pending");
    assert.equal(listFilters.length, 2); assert.ok(listFilters.every(sql => sql.includes('"access_status" =')));
    for (const query of ["accessStatus=invalid", "accessStatus=", "accessStatus=pending&accessStatus=approved"]) {
      assert.equal((await request(`/users?${query}`)).status, 400);
    }
  });
});
