import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as orm from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { usersTable, userRoleEnum, languageEnum, type User } from "../../../../lib/db/src/schema/users";
import * as profile from "./supabaseProfile";

const require = createRequire(import.meta.url);
const localId = "12345678-1234-4234-8234-123456789abc";
const authA = "abcdef12-1234-4234-8234-123456789abc";
const authB = "abcdef12-1234-4234-8234-123456789abd";
const email = "owner@example.invalid";

type WorkerOptions = { authId: string; email?: string; publicSignups?: boolean };
type WorkerConfig = WorkerOptions & { socketRoot: string; pgModule: string };
type WorkerResult = { user: User | null; pid: number; errors: string[]; constraints: string[]; writes: number[] };

async function runWorker(): Promise<void> {
  const config = await new Promise<WorkerConfig>(resolve => process.once("message", resolve));
  assert.match(config.socketRoot, /^\/tmp\/supabase-user-sync-[^/]+$/);
  const { Client } = require(config.pgModule);
  // Every connection parameter is synthetic and explicit. No developer env,
  // DATABASE_URL, TCP listener, auth service or production DB initializer is used.
  const client = new Client({
    host: config.socketRoot, port: 5432, database: "postgres", user: "fixture", password: "fixture",
    connectionTimeoutMillis: 3000, statement_timeout: 10000, query_timeout: 12000,
  });
  const errors: string[] = [];
  const constraints: string[] = [];
  const writes: number[] = [];
  let paused = false;
  const query = client.query.bind(client);
  client.query = async (...args: any[]) => {
    const text = typeof args[0] === "string" ? args[0] : args[0].text;
    const write = /^(?:update "users" set|insert into "users")/i.test(text);
    if (write && !paused) {
      paused = true;
      const released = new Promise<void>(resolve => process.once("message", message => {
        assert.equal(message, "release"); resolve();
      }));
      process.send!({ type: "ready", pid: process.pid });
      await released;
    }
    try {
      const result = await query(...args);
      if (write) writes.push(result.rowCount);
      return result;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error) errors.push(String(error.code));
      if (error && typeof error === "object" && "constraint" in error) constraints.push(String(error.constraint));
      throw error;
    }
  };
  try {
    await client.connect();
    const code = ts.transpileModule(readFileSync(new URL("./userSync.ts", import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} as typeof import("./userSync") };
    const db = drizzle(client);
    runInNewContext(code, {
      module, exports: module.exports,
      process: { env: { NODE_ENV: "test", ALLOW_PUBLIC_SIGNUPS: String(config.publicSignups ?? false) } },
      require: (name: string) => {
        if (name === "@workspace/db") return { db, usersTable };
        if (name === "drizzle-orm") return orm;
        if (name === "../middlewares/supabaseAuth") return { getAuth: (req: unknown) => req };
        if (name === "./logger") return { logger: { warn() {}, info() {} } };
        if (name === "./env") return { parseBooleanEnv: (value: string) => value === "true" };
        if (name === "./supabaseProfile") return {
          ...profile,
          fetchSupabaseUserProfile: async () => ({
            email: config.email ?? email, emailVerified: true,
            firstName: "Verified", lastName: "Profile", fullName: "Verified Profile",
          }),
        };
        assert.fail(`Unexpected dependency: ${name}`);
      },
    });
    const user = await module.exports.getOrCreateUser({
      userId: config.authId, accessToken: "synthetic-verified-token",
      sessionClaims: { role: "admin", user_metadata: { role: "admin", isActive: true } },
    } as unknown as Parameters<typeof module.exports.getOrCreateUser>[0]);
    process.send!({ type: "result", value: { user, pid: process.pid, errors, constraints, writes } });
  } finally {
    await client.end();
  }
}

function startWorker(config: WorkerConfig) {
  const child = fork(fileURLToPath(import.meta.url), ["--user-sync-postgres-worker"], {
    execArgv: ["--import", require.resolve("tsx")], env: { NODE_ENV: "test" },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  let resolveResult!: (value: WorkerResult) => void;
  let rejectResult!: (error: Error) => void;
  let received = false;
  let stderr = "";
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const result = new Promise<WorkerResult>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  // A failed worker may exit before the coordinator begins awaiting its result.
  void ready.catch(() => {});
  void result.catch(() => {});
  const fail = (error: Error) => { rejectReady(error); rejectResult(error); };
  child.stderr!.on("data", chunk => { stderr = (stderr + String(chunk)).slice(-4000); });
  child.on("message", (message: any) => {
    if (message.type === "ready") resolveReady();
    if (message.type === "result") { received = true; resolveResult(message.value); }
    if (message.type === "failure") fail(new Error(message.message));
  });
  child.on("error", fail);
  const timer = setTimeout(() => {
    fail(new Error("Disposable userSync worker exceeded 20 seconds")); child.kill("SIGKILL");
  }, 20000);
  const exited = new Promise<void>(resolve => child.once("exit", (code, signal) => {
    clearTimeout(timer);
    if (!received || code !== 0) fail(new Error(`Worker exit ${code}/${signal}: ${stderr}`));
    resolve();
  }));
  child.send(config);
  return { ready, result, exited, release: () => child.send("release"), stop: async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
  } };
}

if (process.argv.includes("--user-sync-postgres-worker")) {
  try { await runWorker(); } catch (error) {
    process.send!({ type: "failure", message: error instanceof Error ? error.stack : String(error) });
    process.exitCode = 1;
  } finally { process.disconnect?.(); }
} else {
  // Same opt-in tool directory convention as scripts/auth-migration/relink.postgres.test.ts.
  // The value locates binaries only; existing database URLs/directories are never accepted.
  test("disposable PostgreSQL cross-process userSync claims and unique-conflict recovery", {
    skip: !process.env.RELINK_TEST_TOOLS, timeout: 120000,
  }, async t => {
    const tools = createRequire(path.join(path.resolve(process.env.RELINK_TEST_TOOLS!), "package.json"));
    const { default: EmbeddedPostgres } = await import(pathToFileURL(tools.resolve("embedded-postgres")).href);
    const root = await mkdtemp("/tmp/supabase-user-sync-");
    const cluster = new EmbeddedPostgres({
      databaseDir: path.join(root, "data"), user: "fixture", password: "fixture",
      persistent: false, createPostgresUser: false,
      postgresFlags: ["-c", "listen_addresses=", "-c", `unix_socket_directories=${root}`],
      onLog() {}, onError() {},
    });
    const client = cluster.getPgClient("postgres", root);
    const workers: ReturnType<typeof startWorker>[] = [];
    const start = (options: WorkerOptions) => {
      const worker = startWorker({ ...options, socketRoot: root, pgModule: tools.resolve("pg") });
      workers.push(worker); return worker;
    };
    try {
      await cluster.initialise(); await cluster.start(); await client.connect();
      await client.query("SET statement_timeout = '10s'");
      const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
      const dialect = new PgDialect();
      const columns = getTableConfig(usersTable).columns.map(column => {
        let defaultSql = "";
        if (column.default instanceof orm.SQL) {
          const compiled = dialect.sqlToQuery(column.default);
          assert.equal(compiled.params.length, 0);
          defaultSql = ` DEFAULT ${compiled.sql}`;
        } else if (column.default !== undefined) {
          defaultSql = ` DEFAULT ${typeof column.default === "string" ? quote(column.default) : String(column.default)}`;
        }
        return `"${column.name}" ${column.getSQLType()}${column.notNull ? " NOT NULL" : ""}${column.primary ? " PRIMARY KEY" : ""}${column.isUnique ? " UNIQUE" : ""}${defaultSql}`;
      });
      await client.query(`
        CREATE TYPE user_role AS ENUM (${userRoleEnum.enumValues.map(quote).join(",")});
        CREATE TYPE language AS ENUM (${languageEnum.enumValues.map(quote).join(",")});
        CREATE TABLE public.users (${columns.join(",")});
        CREATE UNIQUE INDEX users_email_lower_unique ON public.users (lower(email));
        CREATE TABLE public.fixture_owned_data (id text PRIMARY KEY, user_id text REFERENCES users(id));
      `);
      const reset = async (invite = true) => {
        await client.query("TRUNCATE public.users, public.fixture_owned_data");
        if (!invite) return;
        await client.query(`INSERT INTO users (id, clerk_id, email, role, is_active, language, currency, first_name, last_name, full_name)
          VALUES ($1, 'manual_invite', $2, 'admin', true, 'fr', 'EUR', 'Local', 'Owner', 'Local Owner')`, [localId, email]);
        await client.query("INSERT INTO fixture_owned_data VALUES ('contract', $1)", [localId]);
      };
      const snapshot = async () => (await client.query("SELECT * FROM users ORDER BY id")).rows;
      const checkOwned = async () => assert.deepEqual((await client.query("SELECT * FROM fixture_owned_data")).rows, [{ id: "contract", user_id: localId }]);

      for (const sameIdentity of [false, true]) await t.test(`two processes claiming one invite: ${sameIdentity ? "same" : "different"} identity`, async () => {
        await reset();
        const a = start({ authId: authA });
        const b = start({ authId: sameIdentity ? authA : authB });
        await Promise.all([a.ready, b.ready]);
        a.release(); b.release();
        const results = await Promise.all([a.result, b.result]);
        await Promise.all([a.exited, b.exited]);
        assert.notEqual(results[0].pid, results[1].pid);
        assert.notEqual(results[0].pid, process.pid);
        assert.deepEqual(results.flatMap(value => value.writes).sort(), [0, 1]);
        assert.deepEqual(results.flatMap(value => value.errors), []);
        const successful = results.flatMap(value => value.user ? [value.user] : []);
        assert.equal(successful.length, sameIdentity ? 2 : 1);
        for (const user of successful) {
          assert.equal(user.id, localId); assert.equal(user.role, "admin");
          assert.equal(user.language, "fr"); assert.equal(user.fullName, "Local Owner"); assert.equal(user.isActive, true);
        }
        const rows = await snapshot(); assert.equal(rows.length, 1);
        assert.equal(rows[0].clerk_id, successful[0].authId); await checkOwned();
      });

      for (const active of [true, false]) await t.test(`real 23505 during invite claim ${active ? "recovers the active" : "rejects the inactive"} committed winner`, async () => {
        await reset();
        const [inviteBefore] = await snapshot();
        const claimant = start({ authId: authA });
        const creator = start({ authId: authA, email: "changed@example.invalid", publicSignups: true });
        await Promise.all([claimant.ready, creator.ready]);
        creator.release(); const created = await creator.result; await creator.exited;
        assert.ok(created.user); assert.equal(created.user.role, "client");
        assert.notEqual(created.user.id, localId);
        await client.query("UPDATE users SET role = 'coach', language = 'de', is_active = $1 WHERE id = $2", [active, created.user.id]);
        claimant.release(); const recovered = await claimant.result; await claimant.exited;
        assert.notEqual(recovered.pid, created.pid);
        assert.deepEqual(recovered.errors, ["23505"]);
        assert.deepEqual(recovered.constraints, ["users_clerk_id_key"]);
        if (active) {
          assert.equal(recovered.user?.id, created.user.id); assert.equal(recovered.user?.role, "coach");
          assert.equal(recovered.user?.language, "de"); assert.equal(recovered.user?.isActive, true);
        } else assert.equal(recovered.user, null);
        const rows = await snapshot(); assert.equal(rows.length, 2);
        assert.deepEqual(rows.find((row: { id: string }) => row.id === localId), inviteBefore);
        await checkOwned();
      });

      for (const sameIdentity of [true, false]) await t.test(`concurrent JIT inserts recover from real ${sameIdentity ? "identity" : "email"} uniqueness violation`, async () => {
        await reset(false);
        const a = start({ authId: authA, publicSignups: true });
        const b = start({ authId: sameIdentity ? authA : authB, publicSignups: true });
        await Promise.all([a.ready, b.ready]); a.release(); b.release();
        const results = await Promise.all([a.result, b.result]); await Promise.all([a.exited, b.exited]);
        assert.deepEqual(results.flatMap(value => value.errors), ["23505"]);
        assert.deepEqual(results.flatMap(value => value.constraints), [sameIdentity ? "users_clerk_id_key" : "users_email_lower_unique"]);
        const rows = await snapshot(); assert.equal(rows.length, 1);
        const successful = results.flatMap(value => value.user ? [value.user] : []);
        assert.equal(successful.length, sameIdentity ? 2 : 1);
        for (const user of successful) {
          assert.equal(user.id, rows[0].id); assert.equal(user.role, "client"); assert.equal(user.isActive, true);
        }
      });

      await t.test("deactivation committed after both lookups blocks both claims and preserves the local owner", async () => {
        await reset(); const [before] = await snapshot();
        const a = start({ authId: authA }); const b = start({ authId: authB });
        await Promise.all([a.ready, b.ready]);
        await client.query("UPDATE users SET is_active = false WHERE id = $1", [localId]);
        a.release(); b.release();
        const results = await Promise.all([a.result, b.result]); await Promise.all([a.exited, b.exited]);
        assert.deepEqual(results.map(value => value.user), [null, null]);
        assert.deepEqual(results.flatMap(value => value.writes), [0, 0]);
        assert.deepEqual(await snapshot(), [{ ...before, is_active: false }]); await checkOwned();
      });
    } finally {
      await Promise.all(workers.map(worker => worker.stop()));
      try { await client.end(); } finally {
        try { await cluster.stop(); } finally { await rm(root, { recursive: true, force: true }); }
      }
    }
  });
}
