import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { runRelink, safeRelinkError, type RelinkDependencies } from "./relink";

// Opt-in external test tooling only. Never accepts DATABASE_URL or existing
// database directories; the cluster is created and removed by this test.
test("disposable PostgreSQL normalization, rollback and target-collision regression", {
  skip: !process.env.RELINK_TEST_TOOLS,
}, async t => {
  const require = createRequire(path.join(path.resolve(process.env.RELINK_TEST_TOOLS!), "package.json"));
  const { default: EmbeddedPostgres } = await import(pathToFileURL(require.resolve("embedded-postgres")).href);
  const root = await mkdtemp("/tmp/supabase-relink-");
  const cluster = new EmbeddedPostgres({
    databaseDir: path.join(root, "data"), user: "fixture", password: "fixture",
    persistent: false, createPostgresUser: false,
    postgresFlags: ["-c", "listen_addresses=", "-c", `unix_socket_directories=${root}`],
    onLog() {}, onError() {},
  });
  const client = cluster.getPgClient("postgres", root);
  const competitor = cluster.getPgClient("postgres", root);
  try {
    await cluster.initialise();
    await cluster.start();
    await client.connect();
    await competitor.connect();
    await client.query(`CREATE TABLE public.users (
      id text PRIMARY KEY, clerk_id text UNIQUE NOT NULL, email text NOT NULL,
      role text NOT NULL, is_active boolean NOT NULL, updated_at timestamptz NOT NULL
    ); CREATE UNIQUE INDEX users_email_lower_unique ON public.users (lower(email));
    CREATE TABLE public.fixture_owned_data (
      id text PRIMARY KEY, user_id text REFERENCES public.users(id), payload jsonb NOT NULL
    );`);
    const localId = "12345678-1234-4234-8234-123456789abc";
    const options = {
      localUserId: localId, expectedAuthId: "user_old", newAuthId: "abcdef12-1234-4234-8234-123456789abc",
      apply: true, backupReference: "fixture-backup",
    };
    const database = drizzle(client);
    let duringLookup: (() => Promise<void>) | undefined;
    let lookups = 0;
    const dependencies: RelinkDependencies = {
      supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
      secretKey: "sb_secret_fixture",
      fetch: async (url, init) => {
        assert.equal(url, `https://abcdefghijklmnopqrst.supabase.co/auth/v1/admin/users/${options.newAuthId}`);
        assert.equal(init?.method, "GET");
        assert.equal(init?.redirect, "error");
        lookups++;
        await duringLookup?.();
        return Response.json({
          id: options.newAuthId, is_anonymous: false, email_confirmed_at: "2020-01-01T00:00:00Z",
          email: "owner@example.invalid",
        });
      },
      transaction: (work, config) => database.transaction(work, config),
    };
    const snapshot = async () => (await client.query("SELECT * FROM public.users ORDER BY id")).rows;
    const reset = async () => {
      duringLookup = undefined;
      lookups = 0;
      await client.query("TRUNCATE public.users, public.fixture_owned_data");
      await client.query("INSERT INTO public.users VALUES ($1, 'user_old', 'owner@example.invalid', 'admin', false, '2020-01-01'), ('other', 'user_other', 'other@example.invalid', 'client', true, '2020-01-01')", [localId]);
      await client.query("INSERT INTO public.fixture_owned_data VALUES ('contract', $1, '{\"amount\":100,\"private\":true}')", [localId]);
    };

    await t.test("dry-run is read-only; manual relink preserves local ID, roles, timestamps and owned data; replay fails", async () => {
      await reset();
      await client.query("UPDATE public.users SET clerk_id = 'manual_seed_admin_001' WHERE id = $1", [localId]);
      const mapping = { ...options, expectedAuthId: "manual_seed_admin_001" };
      const before = await snapshot();
      const ownedBefore = (await client.query("SELECT * FROM public.fixture_owned_data")).rows;
      duringLookup = async () => {
        assert.equal((await client.query("SHOW transaction_isolation")).rows[0].transaction_isolation, "serializable");
        assert.equal((await client.query("SHOW transaction_read_only")).rows[0].transaction_read_only, "on");
      };
      assert.deepEqual(await runRelink({ ...mapping, apply: false }, dependencies), { mode: "dry-run", validated: 1, updated: 0 });
      assert.deepEqual(await snapshot(), before);
      duringLookup = undefined;
      assert.deepEqual(await runRelink(mapping, dependencies), { mode: "apply", validated: 1, updated: 1 });
      assert.deepEqual(await snapshot(), [{ ...before[0], clerk_id: options.newAuthId }, before[1]]);
      assert.deepEqual((await client.query("SELECT * FROM public.fixture_owned_data")).rows, ownedBefore);
      await assert.rejects(runRelink(mapping, dependencies), /exact local identity/);
      assert.equal(lookups, 2);
    });

    await t.test("an already linked Supabase UUID is rejected before lookup", async () => {
      await reset();
      await client.query("UPDATE public.users SET clerk_id = $1 WHERE id = 'other'", [options.newAuthId]);
      const before = await snapshot();
      await assert.rejects(runRelink(options, dependencies), /already linked/);
      assert.deepEqual(await snapshot(), before);
      assert.equal(lookups, 0);
    });

    await t.test("real btrim retains tabs/newlines/NBSP; all JS-normalized duplicate variants are denied", async () => {
      for (const whitespace of ["\t", "\n", "\r\n", "\u00a0"]) {
        await reset();
        const value = `${whitespace}OWNER@EXAMPLE.INVALID${whitespace}`;
        const actual = await client.query("SELECT lower(btrim($1::text)) AS normalized", [value]);
        assert.notEqual(actual.rows[0].normalized, value.trim().toLowerCase());
        await client.query("UPDATE public.users SET email = $1 WHERE id = 'other'", [value]);
        const before = await snapshot();
        for (const apply of [false, true]) {
          await assert.rejects(runRelink({ ...options, apply }, dependencies), /email is invalid or ambiguous/);
          assert.deepEqual(await snapshot(), before);
        }
        assert.equal(lookups, 0);
      }
    });

    await t.test("a real trigger changing role causes full transaction rollback", async () => {
      await reset();
      await client.query(`CREATE FUNCTION fixture_role_change() RETURNS trigger LANGUAGE plpgsql AS
        $$ BEGIN NEW.role := 'client'; RETURN NEW; END $$;
        CREATE TRIGGER fixture_role_change BEFORE UPDATE ON public.users
        FOR EACH ROW EXECUTE FUNCTION fixture_role_change();`);
      const before = await snapshot();
      try {
        await assert.rejects(runRelink(options, dependencies), /field other than the identity binding changed/);
        assert.deepEqual(await snapshot(), before);
      } finally { await client.query("DROP TRIGGER fixture_role_change ON public.users; DROP FUNCTION fixture_role_change()"); }
    });

    await t.test("a competing committed target claim aborts relinking without changing the source", async () => {
      await reset();
      const before = await snapshot();
      duringLookup = async () => { await competitor.query("UPDATE public.users SET clerk_id = 'abcdef12-1234-4234-8234-123456789abc' WHERE id = 'other'"); };
      await assert.rejects(runRelink(options, dependencies));
      const after = await snapshot();
      assert.deepEqual(after[0], before[0]);
      assert.deepEqual(after[1], { ...before[1], clerk_id: "abcdef12-1234-4234-8234-123456789abc" });
      assert.equal(lookups, 1);
    });

    await t.test("a real AFTER trigger changing another field is caught by the persisted-row check", async () => {
      await reset();
      await client.query(`CREATE FUNCTION fixture_after_change() RETURNS trigger LANGUAGE plpgsql AS
        $$ BEGIN UPDATE public.users SET is_active = true WHERE id = NEW.id; RETURN NEW; END $$;
        CREATE TRIGGER fixture_after_change AFTER UPDATE OF clerk_id ON public.users
        FOR EACH ROW EXECUTE FUNCTION fixture_after_change();`);
      const before = await snapshot();
      try {
        await assert.rejects(runRelink(options, dependencies), /field other than the identity binding changed/);
        assert.deepEqual(await snapshot(), before);
      } finally { await client.query("DROP TRIGGER fixture_after_change ON public.users; DROP FUNCTION fixture_after_change()"); }
    });

    await t.test("lost acknowledgment after a real commit reports uncertainty; explicit replay fails closed", async () => {
      await reset();
      const before = await snapshot();
      const uncertain: RelinkDependencies = { ...dependencies, transaction: async (work, config) => {
        await database.transaction(work, config);
        throw new Error("private simulated acknowledgment failure");
      } };
      await assert.rejects(runRelink(options, uncertain), error => {
        assert.match(safeRelinkError(error), /^RELINK_FAILED_OR_COMMIT_UNCERTAIN:/);
        return true;
      });
      assert.deepEqual(await snapshot(), [{ ...before[0], clerk_id: "abcdef12-1234-4234-8234-123456789abc" }, before[1]]);
      await assert.rejects(runRelink(options, dependencies), /exact local identity/);
      assert.equal(lookups, 1);
    });
  } finally {
    await client.end();
    await competitor.end();
    await cluster.stop();
    await rm(root, { recursive: true, force: true });
  }
});
