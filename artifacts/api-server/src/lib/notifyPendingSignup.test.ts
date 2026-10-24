import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import * as orm from "drizzle-orm";
import { usersTable } from "../../../../lib/db/src/schema/users";

type Notifier = typeof import("./notifyPendingSignup");

function load(admins: { id: string }[] | Error, sent: Record<string, unknown>[], warnings: unknown[]): Notifier {
  const module = { exports: {} };
  const code = transformSync(readFileSync(new URL("./notifyPendingSignup.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
  const db = { select: () => ({ from: () => ({ where: async () => { if (admins instanceof Error) throw admins; return admins; } }) }) };
  const deps: Record<string, unknown> = {
    "drizzle-orm": orm,
    "@workspace/db": { db, usersTable },
    "./createOrdinaryNotification": { createOrdinaryNotification: async (n: Record<string, unknown>) => { sent.push(n); return true; } },
    "./logger": { logger: { warn: (...args: unknown[]) => warnings.push(args) } },
  };
  new Function("require", "module", "exports", code)((name: string) => {
    assert.ok(Object.hasOwn(deps, name), `Forbidden dependency: ${name}`);
    return deps[name];
  }, module, module.exports);
  return module.exports as Notifier;
}

test("each approved active admin is told about a pending signup, linking to user review", async () => {
  const sent: Record<string, unknown>[] = [];
  const { notifyAdminsOfPendingSignup } = load([{ id: "admin-1" }, { id: "admin-2" }], sent, []);
  await notifyAdminsOfPendingSignup({ id: "new", email: "ada@example.invalid", fullName: "Ada Lovelace" });
  assert.deepEqual(sent.map((n) => n.userId), ["admin-1", "admin-2"]);
  assert.equal(sent[0].type, "signup_pending");
  assert.equal(sent[0].link, "/admin");
  assert.match(String(sent[0].body), /Ada Lovelace · ada@example\.invalid/);
});

test("a failing admin lookup is logged and never blocks the registration", async () => {
  const warnings: unknown[] = [];
  const { notifyAdminsOfPendingSignup } = load(new Error("db down"), [], warnings);
  await assert.doesNotReject(notifyAdminsOfPendingSignup({ id: "new", email: null, fullName: null }));
  assert.equal(warnings.length, 1);
});
