import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  parseRelinkOptions, validateSupabaseConfig, runRelink, safeRelinkError, verifiedEmail,
  type RelinkDependencies, type RelinkOptions, type Runner,
} from "./relink";

const localId = "12345678-1234-4234-8234-123456789abc";
const oldId = "user_devFixture";
const newId = "abcdef12-1234-4234-8234-123456789abc";
const secret = "sb_secret_fixture";
const supabaseUrl = "https://abcdefghijklmnopqrst.supabase.co";
const legacyKey = (payload = {}, header = {}) => [
  { alg: "HS256", typ: "JWT", ...header },
  { iss: "supabase", ref: "abcdefghijklmnopqrst", role: "service_role", exp: 4102444800, ...payload },
].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".") + ".fixtureSignature";
const options: RelinkOptions = { localUserId: localId, expectedAuthId: oldId, newAuthId: newId, apply: false };
const args = ["--local-user-id", localId, "--expected-auth-id", oldId, "--new-auth-id", newId];
const identity = {
  id: newId, is_anonymous: false, email_confirmed_at: "2020-01-01T00:00:00Z",
  email: "owner@example.invalid",
};
const initialRows = () => [{
  id: localId, clerk_id: oldId, email: " Owner@Example.invalid ", role: "admin", is_active: false,
  full_name: "Local Owner", company_name: "Local Company", language: "fr",
  created_at: new Date("2020-01-01"), updated_at: new Date("2021-01-01"),
  logo_url: "private-fixture", provider_signature: "Existing signature",
}, { id: "other", clerk_id: "user_other", email: "other@example.invalid", role: "client", is_active: true }];
type Row = Record<string, unknown>;
const dialect = new PgDialect();

function fixture() {
  let rows: Row[] = initialRows();
  let body: unknown = structuredClone(identity);
  let status = 200;
  let networkError: unknown;
  let updateError: unknown;
  let commitError: unknown;
  let acknowledgmentError: unknown;
  let beforeUpdate: ((draft: Row[]) => void) | undefined;
  let afterUpdate: ((row: Row) => void) | undefined;
  let afterReturning: ((row: Row) => void) | undefined;
  const statements: string[] = [];
  const events: string[] = [];
  const configs: unknown[] = [];
  const dependencies: RelinkDependencies = {
    supabaseUrl,
    secretKey: secret,
    fetch: async (url, init) => {
      events.push("supabase");
      assert.equal(url, `${supabaseUrl}/auth/v1/admin/users/${newId}`);
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers.apikey, dependencies.secretKey);
      assert.equal(headers.Authorization, dependencies.secretKey?.startsWith("sb_secret_") ? undefined : `Bearer ${dependencies.secretKey}`);
      assert.equal(headers.Accept, "application/json");
      assert.equal(init?.method, "GET");
      assert.equal(init?.redirect, "error");
      assert.ok(init?.signal instanceof AbortSignal);
      if (networkError) throw networkError;
      return new Response(JSON.stringify(body), { status });
    },
    transaction: async (work, config) => {
      configs.push(config);
      events.push("begin");
      const draft = structuredClone(rows);
      const tx: Runner = { execute: async query => {
        const { sql, params } = dialect.sqlToQuery(query);
        const statement = sql.trim().replace(/\s+/g, " ");
        statements.push(statement);
        if (statement.startsWith("SET LOCAL")) return { rows: [] };
        if (statement.startsWith("SELECT * FROM public.users WHERE id")) {
          assert.equal(statement.endsWith("FOR UPDATE"), config.accessMode === "read write");
          return { rows: structuredClone(draft.filter(row => row.id === params[0])) };
        }
        if (statement === "SELECT id, email FROM public.users") {
          return { rows: draft.map(row => ({ id: row.id, email: row.email })) };
        }
        if (statement.startsWith("SELECT id FROM public.users WHERE clerk_id")) {
          return { rows: draft.filter(row => row.clerk_id === params[0]).map(row => ({ id: row.id })) };
        }
        assert.equal(config.accessMode, "read write");
        assert.equal(statement, "UPDATE public.users SET clerk_id = $1 WHERE id = $2 AND clerk_id = $3 AND email = $4 AND NOT EXISTS (SELECT 1 FROM public.users WHERE clerk_id = $5) RETURNING *");
        assert.equal(params[0], params[4]);
        events.push("update");
        if (updateError) throw updateError;
        beforeUpdate?.(draft);
        const row = draft.find(row => row.id === params[1] && row.clerk_id === params[2] && row.email === params[3]);
        if (!row || draft.some(row => row.clerk_id === params[4])) return { rows: [] };
        row.clerk_id = params[0];
        afterUpdate?.(row);
        const returned = structuredClone(row);
        afterReturning?.(row);
        return { rows: [returned] };
      } };
      let result;
      try {
        result = await work(tx);
        if (commitError) throw commitError;
        if (config.accessMode === "read write") rows = draft;
        events.push("commit");
      } catch (error) { events.push("rollback"); throw error; }
      if (acknowledgmentError) { events.push("ack-lost"); throw acknowledgmentError; }
      return result;
    },
  };
  return {
    dependencies, statements, events, configs,
    get rows() { return rows; },
    set body(value: unknown) { body = value; },
    set status(value: number) { status = value; },
    set networkError(value: unknown) { networkError = value; },
    set updateError(value: unknown) { updateError = value; },
    set commitError(value: unknown) { commitError = value; },
    set acknowledgmentError(value: unknown) { acknowledgmentError = value; },
    set beforeUpdate(value: (draft: Row[]) => void) { beforeUpdate = value; },
    set afterUpdate(value: (row: Row) => void) { afterUpdate = value; },
    set afterReturning(value: (row: Row) => void) { afterReturning = value; },
    run: (overrides: Partial<RelinkOptions> = {}) => runRelink({ ...options, ...overrides }, dependencies),
  };
}

test("CLI defaults to dry-run and requires an explicit, unambiguous single mapping", () => {
  assert.deepEqual(parseRelinkOptions(args), { ...options, backupReference: undefined });
  assert.deepEqual(parseRelinkOptions([...args, "--apply", "--backup-reference", "backup-fixture"]), {
    ...options, apply: true, backupReference: "backup-fixture",
  });
  for (const invalid of [[], [...args, "--apply"], [...args, "--apply=false"], [...args, "--dry-run"],
    [...args, "extra"], [...args, "--new-auth-id", "user_other"], [...args, "--backup-reference", " "],
    [...args, "--apply", "--apply"], [...args, "--backup-reference", "bad\nreference"],
    args.map(value => value === localId ? "not-a-uuid" : value),
    args.map(value => value === newId ? oldId : value),
    args.map(value => value === oldId ? "manual_../123" : value),
    args.map(value => value === newId ? "user_../other" : value),
    args.map(value => value === newId ? newId.toUpperCase() : value),
    args.map(value => value === oldId ? newId : value),
    args.map(value => value === oldId ? "" : value),
    args.map(value => value === oldId ? "x".repeat(256) : value),
    [...args, "--expected-clerk-id", oldId], [...args, "--new-clerk-id", newId],
  ]) assert.throws(() => parseRelinkOptions(invalid));
});

test("missing backup or non-admin credentials fail before any I/O", async () => {
  for (const key of [undefined, "", "sk_test_fixture", "sk_live_fixture", "sb_secret_", " sb_secret_fixture", "sb_secret_fixture\n",
    "sb_publishable_fixture", "not.a.jwt", "a.W10.c", "a.e30.c", "x".repeat(4097),
    legacyKey({ role: "anon" }), legacyKey({ role: "authenticated" }), legacyKey({ role: undefined }),
    legacyKey({ ref: "differentprojectrefxx" }), legacyKey({ ref: undefined }),
    legacyKey({ iss: "other" }), legacyKey({ exp: 1 }), legacyKey({ exp: "4102444800" }),
    legacyKey({}, { alg: "none" }), legacyKey({}, { typ: undefined }),
  ]) {
    assert.throws(() => validateSupabaseConfig(supabaseUrl, key));
    const h = fixture();
    h.dependencies.secretKey = key;
    await assert.rejects(h.run());
    assert.deepEqual(h.events, []);
  }
  const h = fixture();
  await assert.rejects(h.run({ apply: true }));
  assert.deepEqual(h.events, []);
});

test("untrusted, implicit or noncanonical URLs fail before any I/O", async () => {
  for (const url of [undefined, "", "http://abcdefghijklmnopqrst.supabase.co", "https://localhost", "https://127.0.0.1",
    "https://abcdefghijklmnopqrst.supabase.co.evil.invalid", "https://evil.invalid/abcdefghijklmnopqrst.supabase.co",
    "https://secret@abcdefghijklmnopqrst.supabase.co", `${supabaseUrl}:443`, `${supabaseUrl}:8443`,
    `${supabaseUrl}/auth/v1`, `${supabaseUrl}/../`, `${supabaseUrl}?secret=value`, `${supabaseUrl}#fragment`,
    ` ${supabaseUrl}`, `${supabaseUrl}\n`, `${supabaseUrl}.`, "https://%61bcdefghijklmnopqrst.supabase.co",
    "https://nested.abcdefghijklmnopqrst.supabase.co", `${supabaseUrl}\\evil`, "https://api.supabase.com",
  ]) {
    const h = fixture(); h.dependencies.supabaseUrl = url;
    await assert.rejects(h.run(), /trusted hosted HTTPS/);
    assert.deepEqual(h.events, []);
  }
});

test("secret and legacy admin keys use documented headers; trailing project slash is accepted", async () => {
  for (const key of [secret, legacyKey()]) {
    const h = fixture();
    h.dependencies.secretKey = key;
    h.dependencies.supabaseUrl = `${supabaseUrl}/`;
    assert.deepEqual(await h.run(), { mode: "dry-run", validated: 1, updated: 0 });
    assert.deepEqual(h.events, ["begin", "supabase", "commit"]);
  }
});

test("manual and other exact legacy auth IDs are supported without trimming or case folding", async () => {
  for (const expectedAuthId of ["manual_seed_admin_001", `manual_${localId}`, "demo_champion_001", "legacy-ID", localId]) {
    const h = fixture(); h.rows[0].clerk_id = expectedAuthId;
    assert.equal(parseRelinkOptions(args.map(value => value === oldId ? expectedAuthId : value)).expectedAuthId, expectedAuthId);
    await assert.rejects(h.run({ expectedAuthId: expectedAuthId.toUpperCase() }), /exact local identity/);
    const before = structuredClone(h.rows);
    await h.run({ expectedAuthId, apply: true, backupReference: "fixture" });
    assert.deepEqual(h.rows, [{ ...before[0], clerk_id: newId }, before[1]]);
  }
});

test("dry-run verifies confirmed email inside a serializable read-only transaction without writes", async () => {
  const h = fixture();
  const before = structuredClone(h.rows);
  assert.deepEqual(await h.run(), { mode: "dry-run", validated: 1, updated: 0 });
  assert.deepEqual(h.rows, before);
  assert.deepEqual(h.configs, [{ isolationLevel: "serializable", accessMode: "read only" }]);
  assert.deepEqual(h.events, ["begin", "supabase", "commit"]);
  assert.ok(h.statements.every(statement => !/UPDATE|INSERT|DELETE|FOR UPDATE/.test(statement)));
  assert.ok(h.statements.includes("SET LOCAL statement_timeout = '10s'"));
  assert.ok(h.statements.includes("SET LOCAL lock_timeout = '3s'"));
});

test("apply changes only clerk_id, retaining disabled admin, timestamps and unrelated rows; replay fails", async () => {
  const h = fixture();
  const before = structuredClone(h.rows);
  assert.deepEqual(await h.run({ apply: true, backupReference: "backup-fixture" }), { mode: "apply", validated: 1, updated: 1 });
  assert.deepEqual(h.rows, [{ ...before[0], clerk_id: newId }, before[1]]);
  assert.deepEqual(h.configs, [{ isolationLevel: "serializable", accessMode: "read write" }]);
  assert.deepEqual(h.events, ["begin", "supabase", "update", "commit"]);
  assert.ok(h.statements.some(statement => statement.endsWith("FOR UPDATE")));
  await assert.rejects(h.run({ apply: true, backupReference: "backup-fixture" }), /exact local identity/);
  assert.equal(h.events.filter(event => event === "update").length, 1);
});

test("missing, stale, duplicate-email and occupied-target mappings fail without Supabase calls or updates", async () => {
  for (const mutate of [
    (rows: Row[]) => { rows.splice(0, 1); },
    (rows: Row[]) => { rows[0].clerk_id = "user_changed"; },
    (rows: Row[]) => { rows[1].email = " OWNER@example.invalid "; },
    (rows: Row[]) => { rows[1].clerk_id = newId; },
    (rows: Row[]) => { rows[0].email = "user@placeholder.com"; },
    (rows: Row[]) => { rows[0].email = null; },
  ]) {
    const h = fixture(); mutate(h.rows);
    const before = structuredClone(h.rows);
    await assert.rejects(h.run({ apply: true, backupReference: "backup-fixture" }));
    assert.deepEqual(h.events, ["begin", "rollback"]);
    assert.deepEqual(h.rows, before);
  }
});

test("all local roles and active states survive relinking without data ownership changes", async () => {
  for (const role of ["admin", "client", "coach", "sales_rep"]) {
    for (const isActive of [true, false]) {
      const h = fixture();
      Object.assign(h.rows[0], { role, is_active: isActive });
      const ownedData = [{ id: "fixture-contract", user_id: localId, amount: 100 }];
      const before = structuredClone({ rows: h.rows, ownedData });
      await h.run({ apply: true, backupReference: "backup-fixture" });
      assert.deepEqual(h.rows, [{ ...before.rows[0], clerk_id: newId }, before.rows[1]]);
      assert.deepEqual(ownedData, before.ownedData);
      assert.equal(ownedData[0].user_id, h.rows[0].id);
    }
  }
});

test("duplicate detection shares JS normalization for spaces, tabs, newlines and NBSP", async () => {
  for (const whitespace of [" ", "\t", "\n", "\r\n", "\u00a0"]) {
    for (const apply of [false, true]) {
      const h = fixture();
      h.rows[1].email = `${whitespace}OWNER@EXAMPLE.INVALID${whitespace}`;
      const before = structuredClone(h.rows);
      await assert.rejects(h.run({ apply, backupReference: "backup-fixture" }), /email is invalid or ambiguous/);
      assert.deepEqual(h.rows, before);
      assert.deepEqual(h.events, ["begin", "rollback"]);
    }
  }
});

test("a committed change with a lost acknowledgment reports uncertainty without retry or claimed rollback", async () => {
  const h = fixture();
  h.acknowledgmentError = new Error(`${secret} owner@example.invalid private transport failure`);
  const before = structuredClone(h.rows);
  await assert.rejects(h.run({ apply: true, backupReference: "backup-fixture" }), error => {
    assert.equal(safeRelinkError(error), "RELINK_FAILED_OR_COMMIT_UNCERTAIN: Inspect the account before retrying; no automatic retry was performed.");
    return true;
  });
  assert.deepEqual(h.rows, [{ ...before[0], clerk_id: newId }, before[1]]);
  assert.deepEqual(h.events, ["begin", "supabase", "update", "commit", "ack-lost"]);
  await assert.rejects(h.run({ apply: true, backupReference: "backup-fixture" }), /exact local identity/);
  assert.equal(h.events.filter(event => event === "update").length, 1);
});

test("only the exact non-anonymous, unbanned user's confirmed email is accepted", async () => {
  for (const body of [null, {}, [], { user: identity }, { ...identity, id: oldId },
    ...[true, null, undefined, "false", 0].map(is_anonymous => ({ ...identity, is_anonymous })),
    ...[null, undefined, "", "invalid", 1, "2020-01-01", "2020-99-99T00:00:00Z", "2999-01-01T00:00:00Z"]
      .map(email_confirmed_at => ({ ...identity, email_confirmed_at, confirmed_at: identity.email_confirmed_at,
        phone_confirmed_at: identity.email_confirmed_at, user_metadata: { email_verified: true } })),
    ...["", "invalid", false, 1, "2999-01-01T00:00:00Z"].map(banned_until => ({ ...identity, banned_until })),
    ...["2020-01-01T00:00:00Z", "invalid", false].map(deleted_at => ({ ...identity, deleted_at })),
    ...[null, undefined, "", "another@example.invalid", "user@placeholder.com", "no-at-sign", "a b@example.invalid"]
      .map(email => ({ ...identity, email, new_email: identity.email,
        identities: [{ identity_data: { email: identity.email, email_verified: true } }] })),
  ]) {
    const h = fixture(); h.body = body;
    const before = structuredClone(h.rows);
    await assert.rejects(h.run({ apply: true, backupReference: "backup-fixture" }));
    assert.deepEqual(h.rows, before);
    assert.deepEqual(h.events, ["begin", "supabase", "rollback"]);
  }
  for (const banned_until of [undefined, null, "2020-01-01T00:00:00Z"]) {
    assert.equal(verifiedEmail({ ...identity, banned_until, email: " Owner@Example.invalid " }, newId), "owner@example.invalid");
  }
});

test("lookup failures, timeouts and upstream errors roll back and never disclose raw diagnostics", async () => {
  const sensitive = `${secret} owner@example.invalid postgres://private-user:private-password@private-host/db`;
  for (const setup of [
    (h: ReturnType<typeof fixture>) => { h.status = 302; h.body = { location: "https://evil.invalid" }; },
    (h: ReturnType<typeof fixture>) => { h.status = 403; },
    (h: ReturnType<typeof fixture>) => { h.status = 404; },
    (h: ReturnType<typeof fixture>) => { h.status = 401; h.body = { error: sensitive }; },
    (h: ReturnType<typeof fixture>) => { h.status = 429; },
    (h: ReturnType<typeof fixture>) => { h.status = 503; },
    (h: ReturnType<typeof fixture>) => { h.networkError = new Error(sensitive); },
    (h: ReturnType<typeof fixture>) => { h.networkError = new DOMException(sensitive, "TimeoutError"); },
    (h: ReturnType<typeof fixture>) => { h.dependencies.fetch = async () => new Response("malformed private body"); },
  ]) {
    const h = fixture(); setup(h);
    const before = structuredClone(h.rows);
    await assert.rejects(h.run(), error => {
      assert.equal(safeRelinkError(error), "SUPABASE_LOOKUP_FAILED: Supabase identity lookup failed.");
      return true;
    });
    assert.deepEqual(h.rows, before);
    assert.equal(h.events.at(-1), "rollback");
  }
  assert.equal(safeRelinkError(new Error(sensitive)), "RELINK_FAILED_OR_COMMIT_UNCERTAIN: Inspect the account before retrying; no automatic retry was performed.");
});

test("both admin key formats and private account/backup/database values are redacted at every error boundary", async () => {
  for (const key of [secret, legacyKey()]) {
    const privateValues = [key, "private-backup-reference", "owner@example.invalid", "postgres://private:password@host/db"];
    const raw = privateValues.join(" ");
    for (const failure of ["lookup", "identity", "update", "commit", "ack"] as const) {
      const h = fixture();
      h.dependencies.secretKey = key;
      if (failure === "lookup") h.networkError = new Error(raw);
      if (failure === "identity") h.body = { ...identity, email: raw };
      if (failure === "update") h.updateError = new Error(raw);
      if (failure === "commit") h.commitError = new Error(raw);
      if (failure === "ack") h.acknowledgmentError = new Error(raw);
      await assert.rejects(h.run({ apply: true, backupReference: privateValues[1] }), error => {
        const output = safeRelinkError(error);
        for (const value of privateValues) assert.ok(!output.includes(value));
        assert.match(output, /^(SUPABASE_IDENTITY_MISMATCH|SUPABASE_LOOKUP_FAILED|RELINK_FAILED_OR_COMMIT_UNCERTAIN):/);
        return true;
      });
      assert.equal(h.events.filter(event => event === "supabase").length, 1);
      assert.equal(h.configs.length, 1);
    }
    const h = fixture(); h.dependencies.secretKey = key;
    const output = JSON.stringify(await h.run({ apply: true, backupReference: privateValues[1] }));
    assert.equal(output, '{"mode":"apply","validated":1,"updated":1}');
  }
});

test("changed old ID, email, target collision and unexpected field mutation roll back", async () => {
  for (const setup of [
    (h: ReturnType<typeof fixture>) => { h.beforeUpdate = rows => { rows[0].clerk_id = "user_race"; }; },
    (h: ReturnType<typeof fixture>) => { h.beforeUpdate = rows => { rows[0].email = "changed@example.invalid"; }; },
    (h: ReturnType<typeof fixture>) => { h.beforeUpdate = rows => { rows[1].clerk_id = newId; }; },
    (h: ReturnType<typeof fixture>) => { h.afterUpdate = row => { row.role = "client"; }; },
    (h: ReturnType<typeof fixture>) => { h.afterUpdate = row => { row.is_active = true; }; },
    (h: ReturnType<typeof fixture>) => { h.afterUpdate = row => { row.updated_at = new Date(); }; },
    (h: ReturnType<typeof fixture>) => { h.afterReturning = row => { row.role = "client"; }; },
    (h: ReturnType<typeof fixture>) => { h.afterReturning = row => { row.id = "changed-by-trigger"; }; },
    (h: ReturnType<typeof fixture>) => { h.updateError = { code: "23505", detail: "private database error" }; },
    (h: ReturnType<typeof fixture>) => { h.commitError = { code: "40001", detail: "private database error" }; },
  ]) {
    const h = fixture(); setup(h);
    const before = structuredClone(h.rows);
    await assert.rejects(h.run({ apply: true, backupReference: "backup-fixture" }));
    assert.deepEqual(h.rows, before);
    assert.deepEqual(h.events, ["begin", "supabase", "update", "rollback"]);
  }
});

test("CLI help and validation run with no credentials or live dependencies and redact malicious args", () => {
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  const run = (argv: string[], env: Record<string, string> = {}) => spawnSync(process.execPath,
    ["--import", "tsx", "src/supabase-auth-relink.ts", ...argv],
    { cwd, encoding: "utf8", timeout: 10_000, env: { TSX_DISABLE_CACHE: "1", ...env } });
  const help = run(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /dry-run by default/);
  const invalid = run([...args, "--unknown=secret-owner@example.invalid"]);
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, "");
  assert.equal(invalid.stderr.trim(), "ARGUMENTS_INVALID: Invalid migration arguments; use --help.");
  const missingBackup = run([...args, "--apply"], { SUPABASE_URL: supabaseUrl, SUPABASE_SECRET_KEY: secret });
  assert.equal(missingBackup.status, 1);
  assert.match(missingBackup.stderr, /^BACKUP_REFERENCE_REQUIRED:/);
  const testKey = run(args, { SUPABASE_URL: supabaseUrl, SUPABASE_SECRET_KEY: "sk_test_fixture" });
  assert.equal(testKey.status, 1);
  assert.match(testKey.stderr, /^ADMIN_KEY_REQUIRED:/);
  assert.match(help.stdout, /SUPABASE_URL/);
  assert.match(help.stdout, /physical clerk_id column/);
  for (const key of [secret, legacyKey()]) {
    const invalidUrl = run(args, { SUPABASE_URL: `https://${key}@evil.invalid`, SUPABASE_SECRET_KEY: key });
    assert.equal(invalidUrl.status, 1);
    assert.equal(invalidUrl.stdout, "");
    assert.match(invalidUrl.stderr, /^SUPABASE_URL_INVALID:/);
    assert.ok(!invalidUrl.stderr.includes(key));
    const noDatabase = run(args, { SUPABASE_URL: supabaseUrl, SUPABASE_SECRET_KEY: key });
    assert.equal(noDatabase.status, 1);
    assert.match(noDatabase.stderr, /^RELINK_FAILED_OR_COMMIT_UNCERTAIN:/);
    assert.ok(!noDatabase.stderr.includes(key));
  }
});
