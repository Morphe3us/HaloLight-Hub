import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import * as crypto from "node:crypto";
import express from "express";
import { transformSync } from "esbuild";
import * as orm from "drizzle-orm";
import { usersTable } from "../../../../lib/db/src/schema/users";
import { normalizeProfileEmail, isPlaceholderEmail } from "../lib/supabaseProfile";

test("explicit admin invitation validates local eligibility, sanitizes provider failures and never sends on create", { timeout: 10000 }, async t => {
  const targetId = "a1234567-1234-4123-8123-123456789abc";
  let now = 100000;
  let target: Record<string, unknown> | undefined;
  let providerError: { status?: number; code?: string; message?: string } | null = null;
  let providerThrows = false;
  let configured = true;
  let providerUser = true;
  let release: (() => void) | undefined;
  let hold = false;
  let sends = 0;
  let writes = 0;
  let queries = 0;
  const dependencies: Record<string, unknown> = {
    express, "node:crypto": crypto, "drizzle-orm": orm,
    "@workspace/db": { usersTable, db: {
      select: () => ({ from: () => ({ where: async () => { queries++; return target ? [{ ...target }] : []; } }) }),
      insert: () => ({ values: (value: Record<string, unknown>) => ({ returning: async () => { writes++; return [{ id: targetId, ...value }]; } }) }),
      update: () => assert.fail("Sending an invitation must never change identity or role"),
    } },
    "../middlewares/requireAuth": { requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!req.headers["x-role"]) { res.status(401).json({ error: "Unauthorized" }); return; } next();
    } },
    "../lib/userSync": { getOrCreateUser: async (req: express.Request) => ({ id: "local-admin", role: req.headers["x-role"], accessStatus: "approved", isActive: req.headers["x-active"] !== "false" }) },
    "../lib/userConsentPolicy": {}, "../lib/userCompliance": {}, "../lib/userDashboardPreferences": {},
    "../lib/supabaseProfile": { normalizeProfileEmail, isPlaceholderEmail },
    "../lib/supabase": {
      invitationRedirectUrl: () => { if (!configured) throw new Error("private secret config"); return "https://portal.example.com/auth/invite"; },
      getSupabaseAdmin: () => ({ auth: { admin: { inviteUserByEmail: async (email: string, options: unknown) => {
        sends++;
        assert.equal(email, "invite@example.com");
        assert.deepEqual(options, { redirectTo: "https://portal.example.com/auth/invite" });
        if (hold) await new Promise<void>(resolve => { release = resolve; });
        if (providerThrows) throw new Error("private provider secret");
        return { data: { user: providerUser ? { id: "provider-user" } : null }, error: providerError };
      } } } }),
    },
  };
  const code = transformSync(readFileSync(new URL("./users.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
  const module = { exports: {} as { default: express.Router } };
  new Function("require", "module", "exports", "Date", code)((name: string) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name];
  }, module, module.exports, class extends Date { static now() { return now; } });
  const app = express(); app.use(express.json()); app.use(module.exports.default);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (role = "admin", id = targetId, headers: Record<string, string> = {}) => fetch(`${base}/users/${id}/invite`, {
    method: "POST", headers: { "content-type": "application/json", ...(role ? { "x-role": role } : {}), ...headers },
    body: JSON.stringify({ email: "attacker@example.com", redirectTo: "https://evil.example.com", role: "admin" }),
  });
  const eligible = () => ({ id: targetId, authId: "manual_fixture", isActive: true, accessStatus: "approved", email: "Invite@Example.com", role: "client" });
  target = eligible();
  assert.equal((await request("")).status, 401);
  for (const role of ["client", "coach", "sales_rep"]) assert.equal((await request(role)).status, 403);
  assert.equal((await request("admin", targetId, { "x-active": "false" })).status, 401);
  assert.equal(queries, 0); assert.equal(sends, 0);
  assert.equal((await request("admin", "not-a-local-uuid")).status, 404); assert.equal(queries, 0);
  target = undefined; assert.equal((await request()).status, 404);
  for (const patch of [{ accessStatus: "pending" }, { accessStatus: "rejected" }, { isActive: false }, { authId: "user_legacy" }, { authId: targetId }, { email: "bad" }, { email: "user@placeholder.com" }]) {
    target = { ...eligible(), ...patch }; assert.equal((await request()).status, 409);
  }
  assert.equal(sends, 0); assert.equal(writes, 0);
  target = eligible(); configured = false;
  const unavailable = await request(); assert.equal(unavailable.status, 503); assert.doesNotMatch(await unavailable.text(), /secret|private/);
  assert.equal(sends, 0); configured = true;
  const sent = await request(); assert.equal(sent.status, 200); assert.deepEqual(await sent.json(), { sent: true });
  assert.equal(sent.headers.get("cache-control"), "private, no-store");
  assert.equal((await request()).status, 429); assert.equal(sends, 1);
  now += 60000; assert.equal((await request()).status, 200); assert.equal(sends, 2);
  for (const error of [{ code: "email_exists", message: "private provider email" }, { code: "user_already_exists" }, { status: 429, message: "private" }, { status: 500, message: "secret" }]) {
    now += 60000; providerError = error;
    const response = await request();
    assert.equal(response.status, error.code ? 409 : error.status === 429 ? 429 : 503);
    assert.doesNotMatch(await response.text(), /secret|private/);
  }
  providerError = null; now += 60000; providerThrows = true;
  assert.equal((await request()).status, 503); providerThrows = false;
  now += 60000; providerUser = false; assert.equal((await request()).status, 503); providerUser = true;
  now += 60000; hold = true;
  const pending = request();
  for (let i = 0; i < 100 && !release; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(release);
  assert.equal((await request()).status, 429); release(); assert.equal((await pending).status, 200); hold = false;
  const before = sends; target = undefined;
  const created = await fetch(`${base}/users`, { method: "POST", headers: { "content-type": "application/json", "x-role": "admin" }, body: JSON.stringify({ email: "new@example.com", fullName: "New Invite", role: "client" }) });
  assert.equal(created.status, 201); assert.equal(writes, 1); assert.equal(sends, before);
  assert.match((await created.json() as { authId: string }).authId, /^manual_/);
});
