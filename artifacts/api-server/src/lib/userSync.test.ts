import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { usersTable, type User } from "@workspace/db/schema";
import * as supabaseProfile from "./supabaseProfile";
import * as env from "./env";

// Compile the real sync module with an in-memory DB and Supabase transport. Never
// import @workspace/db's connection initializer or use the developer's env.
const compiled = ts.transpileModule(readFileSync(new URL("./userSync.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const require = createRequire(import.meta.url);
const dialect = new PgDialect();
const profile: supabaseProfile.SupabaseUserProfile = {
  email: "ada@example.com", emailVerified: true,
  firstName: "Ada", lastName: "Lovelace", fullName: "Ada Lovelace",
};

function user(overrides: Partial<User> = {}): User {
  return {
    id: "local_1", authId: "manual_invite", email: profile.email,
    firstName: null, lastName: null, fullName: null,
    role: "admin", isActive: true, language: "fr",
    ...overrides,
  } as User;
}

function matches(row: User, condition: SQL): boolean {
  const { sql, params } = dialect.sqlToQuery(condition);
  const columns = { id: "id", clerk_id: "authId", is_active: "isActive", email: "email" } as const;
  for (const match of sql.matchAll(/"users"\."(id|clerk_id|is_active|email)" = \$(\d+)/g)) {
    if (row[columns[match[1] as keyof typeof columns]] !== params[Number(match[2]) - 1]) return false;
  }
  const email = sql.match(/lower\("users"\."email"\) = \$(\d+)/);
  return !email || row.email.toLowerCase() === params[Number(email[1]) - 1];
}

function harness(initial: User[], options: {
  apiProfile?: Partial<supabaseProfile.SupabaseUserProfile> | null;
  apiError?: boolean;
  publicSignups?: boolean;
  nodeEnv?: string;
  beforeUpdate?: (rows: User[], updates: Partial<User>) => void;
} = {}) {
  const rows = initial.map((row) => ({ ...row }));
  let fetches = 0;
  let writes = 0;
  let now = 1_000_000;
  const db = {
    select: () => ({ from: () => ({ where: async (condition: SQL) =>
      rows.filter((row) => matches(row, condition)).map((row) => ({ ...row })) }) }),
    update: () => ({ set: (updates: Partial<User>) => ({ where: (condition: SQL) => ({
      returning: async () => {
        writes++;
        options.beforeUpdate?.(rows, updates);
        return rows.filter((row) => matches(row, condition)).map((row) => ({ ...Object.assign(row, updates) }));
      },
    }) }) }),
    insert: () => ({ values: (values: Partial<User>) => ({ returning: async () => {
      writes++;
      const created = user({ id: "new_user", role: "client", ...values });
      rows.push(created);
      return [created];
    } }) }),
  };
  const module = { exports: {} as typeof import("./userSync") };
  runInNewContext(compiled, {
    module, exports: module.exports,
    Date: class extends Date { static now() { return now; } },
    process: { env: { NODE_ENV: options.nodeEnv ?? "production", ALLOW_PUBLIC_SIGNUPS: options.publicSignups === undefined ? undefined : String(options.publicSignups) } },
    require: (id: string) => {
      if (id === "@workspace/db") return { db, usersTable };
      if (id === "../middlewares/supabaseAuth") return { getAuth: (req: unknown) => req };
      if (id === "./logger") return { logger: { warn() {}, info() {} } };
      if (id === "./env") return { ...env, isExplicitDevelopment: () => false };
      if (id === "./supabaseProfile") return {
        ...supabaseProfile,
        fetchSupabaseUserProfile: async () => {
          fetches++;
          if (options.apiError) throw new Error("upstream unavailable");
          return options.apiProfile === undefined ? profile : options.apiProfile;
        },
      };
      if (id === "drizzle-orm") return require(id);
      throw new Error(`Unexpected dependency: ${id}`);
    },
  });
  const sync = (id = "user_google", claims: Record<string, unknown> = {}) => module.exports.getOrCreateUser({
    userId: id, sessionClaims: claims, accessToken: "verified-token",
  } as unknown as Parameters<typeof module.exports.getOrCreateUser>[0]);
  return {
    sync, rows, advanceClock: (ms: number) => { now += ms; },
    get fetches() { return fetches; }, get writes() { return writes; },
  };
}

test("Google login without custom claims links exactly one verified manual invite", async () => {
  const h = harness([user()]);
  const linked = await h.sync();
  assert.equal(linked?.authId, "user_google");
  assert.equal(linked?.fullName, "Ada Lovelace");
  assert.equal(linked?.role, "admin");
  assert.equal(linked?.language, "fr");
  assert.equal(h.fetches, 1);
});

test("concurrent identities cannot steal an invite claimed by the other", async () => {
  const h = harness([user()]);
  const results = await Promise.all([h.sync("user_a"), h.sync("user_b")]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(h.rows[0].authId, results.find(Boolean)?.authId);
});

test("concurrent requests for one Supabase identity share the sync", async () => {
  const h = harness([user()]);
  const results = await Promise.all([h.sync(), h.sync(), h.sync()]);
  assert.ok(results.every((result) => result?.id === "local_1"));
  assert.equal(h.fetches, 1);
  assert.equal(h.writes, 1);
});

test("an invite disabled between lookup and claim cannot authenticate", async () => {
  const h = harness([user()], { beforeUpdate: (rows) => { rows[0].isActive = false; } });
  assert.equal(await h.sync(), null);
  assert.equal(h.rows[0].authId, "manual_invite");
});

test("an invite whose email changes between lookup and claim cannot authenticate", async () => {
  const h = harness([user()], { beforeUpdate: (rows) => { rows[0].email = "another@example.com"; } });
  assert.equal(await h.sync(), null);
  assert.equal(h.rows[0].authId, "manual_invite");
});

test("existing linked, disabled, ambiguous and unverified email matches fail closed", async () => {
  for (const rows of [
    [user({ authId: "user_elsewhere" })],
    [user({ isActive: false })],
    [user(), user({ id: "local_2", authId: "manual_other" })],
  ]) {
    const h = harness(rows);
    assert.equal(await h.sync(), null);
    assert.equal(h.writes, 0);
  }
  const h = harness([user()], { apiProfile: { ...profile, emailVerified: false } });
  assert.equal(await h.sync(), null);
  assert.equal(h.writes, 0);
  assert.equal(h.fetches, 1);
});

test("no manual invite means public provisioning stays off in production", async () => {
  const h = harness([]);
  assert.equal(await h.sync(), null);
  assert.equal(h.writes, 0);
});

test("invitation-only remains the default in development too", async () => {
  const h = harness([], { nodeEnv: "development" });
  assert.equal(await h.sync(), null);
  assert.equal(h.writes, 0);
});

test("complete local profiles do not fetch provider profiles and later deactivation is honored", async () => {
  const h = harness([user({ authId: "user_google", ...profile })]);
  assert.equal((await h.sync())?.id, "local_1");
  assert.equal((await h.sync())?.id, "local_1");
  assert.equal(h.fetches, 0); assert.equal(h.writes, 0);
  h.rows[0].isActive = false;
  assert.equal(await h.sync(), null);
  assert.equal(h.fetches, 0);
});

test("old provider identities require explicit migration even with a trusted matching email", async () => {
  const h = harness([user({ authId: "user_old_provider" })], { publicSignups: true });
  assert.equal(await h.sync(), null);
  assert.equal(h.rows[0].authId, "user_old_provider");
  assert.equal(h.writes, 0);
});

test("explicit public provisioning still requires verified real email", async () => {
  const allowed = harness([], { publicSignups: true });
  assert.equal((await allowed.sync())?.role, "client");
  const denied = harness([], { publicSignups: true, apiProfile: { ...profile, emailVerified: false } });
  assert.equal(await denied.sync(), null);
  assert.equal(denied.writes, 0);
});

test("missing Supabase transport never trusts signed email or metadata for linking", async () => {
  const h = harness([user()], { apiProfile: null });
  assert.equal(await h.sync("user_google", {
    email: profile.email, email_verified: true, user_metadata: { email: profile.email, email_verified: true },
  }), null);
  assert.equal(h.writes, 0);
});

test("existing profile repair does not change local names, role, or preferences", async () => {
  const h = harness([user({
    authId: "user_google", email: "user_google@placeholder.com",
    fullName: "Local Owner", firstName: "Local", lastName: "Owner",
  })]);
  const repaired = await h.sync();
  assert.equal(repaired?.email, profile.email);
  assert.equal(repaired?.fullName, "Local Owner");
  assert.equal(repaired?.role, "admin");
  assert.equal(repaired?.language, "fr");
});

test("a disabled local account is never repaired or provisioned", async () => {
  const h = harness([user({ authId: "user_google", isActive: false })]);
  assert.equal(await h.sync(), null);
  assert.equal(h.fetches, 0);
  assert.equal(h.writes, 0);
});

test("single-name Google profiles do not retain a generated Member surname", async () => {
  const h = harness([user({
    authId: "user_google", firstName: "User", lastName: "Member", fullName: "User Member",
  })], { apiProfile: { ...profile, firstName: "Ada", lastName: null, fullName: "Ada" } });
  const repaired = await h.sync();
  assert.equal(repaired?.firstName, "Ada");
  assert.equal(repaired?.lastName, null);
  assert.equal(repaired?.fullName, "Ada");
});

test("deactivation during profile repair fails closed without a second repair", async () => {
  const h = harness([user({ authId: "user_google" })], {
    beforeUpdate: (rows) => { rows[0].isActive = false; },
  });
  assert.equal(await h.sync("user_google", { user_metadata: { given_name: "Ada" } }), null);
  assert.equal(h.fetches, 0);
});

test("profile repair recognizes Drizzle-wrapped email uniqueness conflicts", async () => {
  let attempted = false;
  const h = harness([user({ authId: "user_google", email: "user_google@placeholder.com" })], {
    beforeUpdate: (_rows, updates) => {
      if (updates.email && !attempted) {
        attempted = true;
        throw new Error("query failed", { cause: { code: "23505" } });
      }
    },
  });
  const repaired = await h.sync();
  assert.equal(repaired?.email, "user_google@placeholder.com");
  assert.equal(repaired?.fullName, profile.fullName);
});

test("unavailable Supabase API does not lock out an existing active local user", async () => {
  const h = harness([user({ authId: "user_google" })], { apiError: true });
  assert.equal((await h.sync())?.id, "local_1");
  assert.equal((await h.sync())?.id, "local_1");
  assert.equal(h.fetches, 1);
});

test("failed profile refresh retries after 15 seconds, without a request per navigation", async () => {
  const options = { apiError: true };
  const h = harness([user({ authId: "user_google", email: "user_google@placeholder.com" })], options);
  assert.equal((await h.sync())?.email, "user_google@placeholder.com");
  h.advanceClock(14_999);
  await h.sync();
  await h.sync();
  assert.equal(h.fetches, 1);
  options.apiError = false;
  h.advanceClock(1);
  assert.equal((await h.sync())?.email, profile.email);
  assert.equal(h.fetches, 2);
});

test("successful incomplete profiles retain the five-minute refresh cooldown", async () => {
  const h = harness([user({ authId: "user_google" })], {
    apiProfile: { ...profile, lastName: null, fullName: "Ada" },
  });
  await h.sync();
  h.advanceClock(299_999);
  await h.sync();
  assert.equal(h.fetches, 1);
  h.advanceClock(1);
  await h.sync();
  assert.equal(h.fetches, 2);
});
