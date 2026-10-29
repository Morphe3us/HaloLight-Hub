import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import * as orm from "drizzle-orm";

type Exposure = typeof import("./dataApiExposure");

function load(results: ({ rows: Record<string, unknown>[] } | Error)[], logs: { level: string; args: unknown[] }[]): Exposure {
  const module = { exports: {} };
  const code = transformSync(readFileSync(new URL("./dataApiExposure.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
  const db = { execute: async () => { const next = results.shift(); if (next instanceof Error) throw next; return next ?? { rows: [] }; } };
  const deps: Record<string, unknown> = {
    "drizzle-orm": orm,
    "@workspace/db": { db },
    "./logger": { logger: {
      error: (...args: unknown[]) => logs.push({ level: "error", args }),
      warn: (...args: unknown[]) => logs.push({ level: "warn", args }),
    } },
  };
  new Function("require", "module", "exports", code)((name: string) => {
    assert.ok(Object.hasOwn(deps, name), `Forbidden dependency: ${name}`);
    return deps[name];
  }, module, module.exports);
  return module.exports as Exposure;
}

const supabaseRoles = { rows: [{ rolname: "anon" }, { rolname: "authenticated" }] };

test("exposed tables are reported by name with the lock-down script", async () => {
  const logs: { level: string; args: unknown[] }[] = [];
  const { warnIfDataApiExposed } = load([supabaseRoles, { rows: [{ name: "invoices" }, { name: "users" }] }], logs);
  await warnIfDataApiExposed();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].level, "error");
  assert.deepEqual((logs[0].args[0] as { tables: string[] }).tables, ["invoices", "users"]);
  assert.match(String(logs[0].args[1]), /lock-down-data-api\.sql/);
});

test("a locked-down database and a plain Postgres stay silent", async () => {
  const logs: { level: string; args: unknown[] }[] = [];
  await load([supabaseRoles, { rows: [] }], logs).warnIfDataApiExposed();
  const plain = load([{ rows: [] }], logs);
  assert.deepEqual(await plain.findDataApiExposedTables(), []);
  assert.equal(logs.length, 0);
});

test("a failing catalog query is a warning, never a crash", async () => {
  const logs: { level: string; args: unknown[] }[] = [];
  await assert.doesNotReject(load([new Error("permission denied")], logs).warnIfDataApiExposed());
  assert.equal(logs[0]?.level, "warn");
});
