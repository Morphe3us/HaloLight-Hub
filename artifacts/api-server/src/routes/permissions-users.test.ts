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
import { usersTable } from "../../../../lib/db/src/schema/users";

function load<T>(file: URL, dependencies: Record<string, unknown>): T {
  const module = { exports: {} };
  const code = transformSync(readFileSync(file, "utf8"), { loader: "ts", format: "cjs" }).code;
  new Function("require", "module", "exports", "process", code)((name: string) => {
    assert.ok(Object.hasOwn(dependencies, name), `Forbidden dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports, { env: {} });
  return module.exports as T;
}

test("four roles: real auth/sync, disabled users, profile privilege injection and admin role changes", async t => {
  const roles = ["admin", "client", "coach", "sales_rep"] as const;
  const rows: Record<string, any>[] = roles.flatMap(role => [true, false].map(isActive => ({
    id: `${role}-${isActive}`, authId: `auth-${role}-${isActive}`, role, isActive, accessStatus: "approved",
    email: `${role}-${isActive}@example.invalid`, fullName: "Fixture User", companyName: "Fixture",
    language: "en", currency: "EUR", createdAt: new Date("2026-01-01"),
  })));
  rows.push({ ...rows[2], id: "target", authId: "auth-target", email: "target@example.invalid" });
  const dialect = new PgDialect();
  let writes = 0;
  function matches(row: Record<string, any>, condition?: orm.SQL) {
    if (!condition) return true;
    const query = dialect.sqlToQuery(condition);
    const fields: Record<string, string> = { id: "id", clerk_id: "authId", role: "role", is_active: "isActive", access_status: "accessStatus" };
    let evaluated = 0;
    const result = Array.from(query.sql.matchAll(/"users"\."(\w+)" = \$(\d+)/g)).every(match => {
      assert.ok(fields[match[1]], `Unsupported predicate ${query.sql}`);
      evaluated++;
      return row[fields[match[1]]] === query.params[Number(match[2]) - 1];
    });
    assert.ok(evaluated, `No predicate evaluated: ${query.sql}`);
    return result;
  }
  const db = {
    select(selection?: Record<string, unknown>) {
      let condition: orm.SQL | undefined;
      const chain = {
        from(table: unknown) { assert.equal(table, usersTable); return chain; },
        where(value: orm.SQL) { condition = value; return chain; },
        orderBy() { return chain; }, limit() { return chain; }, offset() { return chain; },
        then(resolve: (rows: any[]) => unknown) {
          const selected = rows.filter(row => matches(row, condition)).map(row => ({ ...row }));
          return Promise.resolve(selection?.count ? [{ count: selected.length }] : selected).then(resolve);
        },
      };
      return chain;
    },
    update(table: unknown) {
      assert.equal(table, usersTable);
      return { set: (value: Record<string, unknown>) => ({ where: (condition: orm.SQL) => ({ returning: async () => {
        writes++;
        return rows.filter(row => matches(row, condition)).map(row => ({ ...Object.assign(row, value) }));
      } }) }) };
    },
    insert() { assert.fail("Account creation/provisioning is forbidden in this fixture"); },
  };
  const auth = { getAuth: (req: express.Request) => ({ userId: req.headers["x-identity"] }) };
  const requireAuth = load(new URL("../middlewares/requireAuth.ts", import.meta.url), { "../middlewares/supabaseAuth": auth });
  const sync = load(new URL("../lib/userSync.ts", import.meta.url), {
    "../middlewares/supabaseAuth": auth, "@workspace/db": { db, usersTable }, "drizzle-orm": orm,
    "./logger": { logger: { warn() {}, info() {} } },
    "./env": { isExplicitDevelopment: () => false, parseBooleanEnv: () => false },
    "./supabaseProfile": { buildSupabaseUserProfile: () => ({}), needsSupabaseProfileRepair: () => false,
      fetchSupabaseUserProfile: () => assert.fail("No Supabase network calls"), isPlaceholderEmail: () => false, isPlaceholderProfileName: () => false },
  });
  const router = load<{ default: express.Router }>(new URL("./users.ts", import.meta.url), {
    express, "node:crypto": crypto, "drizzle-orm": orm, "@workspace/db": { db, usersTable },
    "../middlewares/supabaseAuth": auth, "../middlewares/requireAuth": requireAuth, "../lib/userSync": sync,
    "../lib/userConsentPolicy": {}, "../lib/userCompliance": {}, "../lib/userDashboardPreferences": {},
    "../lib/supabase": {}, "../lib/supabaseProfile": {},
  }).default;
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, identity: string, method = "GET", body?: unknown) => fetch(base + path, {
    method, headers: { "content-type": "application/json", ...(identity ? { "x-identity": identity } : {}), "x-role": "admin" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  await t.test("anonymous and disabled identities cannot read or change roles", async () => {
    for (const identity of ["", ...roles.map(role => `auth-${role}-false`)]) {
      for (const [path, method, body] of [["/users/me", "GET", undefined], ["/users", "GET", undefined], ["/users/target", "PATCH", { role: "admin" }]] as const)
        assert.equal((await request(path, identity, method, body)).status, 401, `${identity} ${method} ${path}`);
    }
    assert.equal(writes, 0);
  });
  for (const role of roles) await t.test(`${role}: self profile and administrative boundary`, async () => {
    const identity = `auth-${role}-true`;
    assert.equal((await request("/users/me", identity)).status, 200);
    assert.equal((await request("/users", identity)).status, role === "admin" ? 200 : 403);
    const before = writes;
    if (role !== "admin") {
      assert.equal((await request("/users/target", identity, "PATCH", { role: "admin" })).status, 403);
      assert.equal((await request("/users", identity, "POST", { email: "blocked@example.invalid", fullName: "Blocked", role: "admin" })).status, 403);
      assert.equal(writes, before);
    }
    const self = rows.find(row => row.authId === identity)!;
    const response = await request("/users/me", identity, "PATCH", { fullName: "Edited fixture", role: "admin", isActive: false, id: "target", authId: "auth-target", userId: "target" });
    assert.equal(response.status, 200);
    assert.equal(self.role, role); assert.equal(self.isActive, true); assert.equal(self.authId, identity);
    assert.equal(self.fullName, "Edited fixture"); assert.equal(rows.find(row => row.id === "target")!.fullName, "Fixture User");
  });
  await t.test("admin changes every supported role but cannot demote/deactivate self", async () => {
    for (const role of roles) {
      assert.equal((await request("/users/target", "auth-admin-true", "PATCH", { role })).status, 200);
      assert.equal(rows.find(row => row.id === "target")!.role, role);
    }
    const before = writes;
    for (const body of [{ role: "owner" }, { role: "" }]) assert.equal((await request("/users/target", "auth-admin-true", "PATCH", body)).status, 400);
    for (const body of [{ role: "client" }, { isActive: false }]) assert.equal((await request("/users/admin-true", "auth-admin-true", "PATCH", body)).status, 400);
    assert.equal(writes, before);
    assert.equal((await request("/users/target", "auth-admin-true", "PATCH", { isActive: false })).status, 200);
    assert.equal((await request("/users/me", "auth-target")).status, 401);
  });
});
