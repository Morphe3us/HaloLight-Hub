import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import * as crypto from "node:crypto";
import express from "express";
import { transformSync } from "esbuild";
import * as drizzle from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { usersTable } from "../../../../lib/db/src/schema/users";
import { userConsentEvents, userDashboardPreferences } from "../../../../lib/db/src/schema/compliance";
import * as policy from "../lib/userConsentPolicy";
import * as preferences from "../lib/userDashboardPreferences";

function load<T>(file: URL, dependencies: Record<string, unknown>): T {
  const module = { exports: {} };
  const code = transformSync(readFileSync(file, "utf8"), { loader: "ts", format: "cjs" }).code;
  new Function("require", "module", "exports", code)((name: string) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports as T;
}

test("consent gate, identity-bound evidence and dashboard persistence across fresh sessions", async (t) => {
  const documents = { termsVersion: "fixture-v1", privacyVersion: "fixture-v1", termsUrl: "https://legal.example.test/terms", privacyUrl: "https://legal.example.test/privacy" };
  let configured = false;
  let misconfigured = false;
  const events: Array<Record<string, any>> = [];
  const saved = new Map<string, Record<string, boolean>>();
  const writes: Record<string, any>[] = [];
  const db = {
    select() {
      let table: unknown; let userId: string;
      const chain = {
        from(value: unknown) { table = value; return chain; },
        where(value: drizzle.SQL) { userId = new PgDialect().sqlToQuery(value).params[0] as string; return chain; },
        orderBy() { return chain; }, limit() { return chain; },
        then(resolve: (rows: any[]) => unknown) {
          const rows = table === usersTable ? [{ id: userId }] : table === userDashboardPreferences ?
            (saved.has(userId) ? [{ userId, widgets: saved.get(userId) }] : []) : events.filter((event) => event.userId === userId).slice().reverse();
          return Promise.resolve(rows).then(resolve);
        },
      };
      return chain;
    },
    insert(table: unknown) {
      return { values(value: Record<string, any>) {
        writes.push(value);
        if (table === userConsentEvents) {
          events.push({ ...value, id: crypto.randomUUID(), acceptedAt: new Date() });
          return Promise.resolve();
        }
        return { onConflictDoUpdate(options: { set: { widgets: drizzle.SQL } }) {
          const query = new PgDialect().sqlToQuery(options.set.widgets);
          assert.match(query.sql, /coalesce\("user_dashboard_preferences"\."widgets"/);
          assert.match(query.sql, /\|\| \$1::jsonb/);
          saved.set(value.userId, { ...saved.get(value.userId), ...value.widgets });
          return { returning: async () => [{ widgets: saved.get(value.userId) }] };
        } };
      } };
    },
  };
  const policyDependency = { ...policy, legalConsentEnabled: () => configured || misconfigured, publishedLegalDocuments: () => configured && !misconfigured ? documents : null };
  const compliance = load<{ userConsentStatus: (id: string) => Promise<any> }>(new URL("../lib/userCompliance.ts", import.meta.url), {
    "drizzle-orm": drizzle, "@workspace/db": { db, userConsentEvents }, "./userConsentPolicy": policyDependency,
  });
  const userSync = { getOrCreateUser: async (req: express.Request) => req.headers["x-user"] ? { id: req.headers["x-user"], isActive: true, role: req.headers["x-role"] ?? "client" } : null };
  const auth = { getAuth: (req: express.Request) => ({ userId: req.headers["x-user"] }) };
  const gate = load<{ consentGate: express.RequestHandler; isConsentBootstrap: (method: string, path: string) => boolean }>(new URL("../middlewares/consentGate.ts", import.meta.url), {
    "../middlewares/supabaseAuth": auth, "../lib/userSync": userSync, "../lib/userConsentPolicy": policyDependency, "../lib/userCompliance": compliance,
  });
  const router = load<{ default: express.Router }>(new URL("./users.ts", import.meta.url), {
    express, "node:crypto": crypto, "drizzle-orm": drizzle,
    "@workspace/db": { db, usersTable, userConsentEvents, userDashboardPreferences }, "../middlewares/supabaseAuth": auth,
    "../lib/userSync": userSync, "../lib/userConsentPolicy": policyDependency,
    "../lib/userCompliance": compliance, "../lib/userDashboardPreferences": preferences,
    "../lib/supabase": {}, "../lib/supabaseProfile": {},
    "../middlewares/requireAuth": { requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!req.headers["x-user"]) { res.sendStatus(401); return; } next();
    } },
  }).default;
  const app = express(); app.use(express.json()); app.use(gate.consentGate); app.use(router);
  app.get("/business", (_req, res) => { res.json({ allowed: true }); });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, user = "a", method = "GET", body?: unknown, role = "client") => fetch(base + path, {
    method, headers: { "content-type": "application/json", "x-user": user, "x-role": role },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = async (response: Response) => response.json() as Promise<Record<string, any>>;
  assert.equal((await request("/users/me/consent", "")).status, 401);
  assert.equal((await json(await request("/users/me/consent"))).configured, false);
  assert.equal((await request("/business")).status, 200);
  misconfigured = true;
  assert.equal((await request("/business")).status, 503);
  assert.equal((await request("/users/me/consent")).status, 503);
  misconfigured = false;
  configured = true;
  assert.equal((await request("/business")).status, 428);
  assert.equal((await request("/users/me/dashboard-preferences")).status, 428);
  assert.equal((await request("/users/me", "a", "PATCH", { companyName: "bypass" })).status, 428);
  assert.ok(gate.isConsentBootstrap("GET", "/exports/personal"));
  assert.equal(gate.isConsentBootstrap("POST", "/exports/personal"), false);
  const body = { accepted: true, ...documents };
  assert.equal((await request("/users/me/consent", "a", "POST", { ...body, accepted: false })).status, 409);
  assert.equal(events.length, 0);
  assert.equal((await request("/users/me/consent", "a", "POST", { ...body, termsUrl: "https://stale.example.test/terms" })).status, 409);
  assert.equal(events.length, 0);
  await request("/users/me/consent", "a", "POST", { ...body, userId: "b", acceptedAt: "2000-01-01" });
  assert.equal(events[0]!.userId, "a"); assert.equal(events[0]!.termsUrl, documents.termsUrl);
  assert.equal(events[0]!.marketing, false); assert.equal(events[0]!.analytics, false); assert.equal(events[0]!.aiImprovement, false);
  assert.ok(!Object.hasOwn(writes[0]!, "acceptedAt"));
  assert.equal((await request("/business")).status, 200);
  assert.equal((await request("/business", "b")).status, 428);
  assert.equal((await request("/users/a/consent")).status, 403);
  assert.equal((await json(await request("/users/a/consent", "a", "GET", undefined, "admin"))).items.length, 1);
  await request("/users/me/consent", "b", "POST", body);
  await request("/users/me/dashboard-preferences", "a", "PATCH", { widgets: { onboarding: false, notifications: false, academy_stats: false }, userId: "b" });
  const a = await json(await request("/users/me/dashboard-preferences"));
  const b = await json(await request("/users/me/dashboard-preferences", "b"));
  assert.equal(a.widgets.onboarding, false); assert.equal(a.widgets.notifications, false); assert.equal(a.widgets.academy_stats, false);
  assert.equal(b.widgets.onboarding, true);
  await request("/users/me/dashboard-preferences", "a", "PATCH", { widgets: { sales_overview: false } });
  assert.equal((await json(await request("/users/me/dashboard-preferences"))).widgets.notifications, false);
  assert.equal((await request("/users/me/dashboard-preferences", "a", "PATCH", { widgets: { unknown: true } })).status, 400);
  documents.termsVersion = "fixture-v2";
  assert.equal((await request("/business")).status, 428);
  assert.equal((await request("/users/me/consent", "a", "POST", body)).status, 409);
  const response = await request("/users/me/consent"); assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await json(response)).required, true);
});
