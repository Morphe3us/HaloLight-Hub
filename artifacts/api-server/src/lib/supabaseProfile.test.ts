import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { buildSupabaseUserProfile, needsSupabaseProfileRepair } from "./supabaseProfile";

const authId = "a1234567-1234-4123-8123-123456789abc";

test("metadata and signed email claims cannot verify an email or supply permissions", () => {
  const p = buildSupabaseUserProfile(authId, {
    email: "victim@example.com", email_verified: true, role: "admin",
    user_metadata: { email: "victim@example.com", email_verified: true, role: "admin", isActive: true, full_name: "Ada Lovelace" },
  });
  assert.equal(p.emailVerified, false); assert.equal(p.email, `${authId}@placeholder.com`);
  assert.equal(p.fullName, "Ada Lovelace"); assert.equal(p.firstName, "Ada"); assert.equal(p.lastName, "Lovelace");
  assert.equal("role" in p, false); assert.equal("isActive" in p, false);
});

test("cosmetic metadata is type checked, stripped and bounded", () => {
  const p = buildSupabaseUserProfile(authId, { user_metadata: { first_name: "<" + "a".repeat(300) + ">\u0000", last_name: {}, full_name: "n".repeat(500) } });
  assert.equal(p.firstName?.length, 100); assert.equal(p.lastName, null); assert.equal(p.fullName?.length, 200);
  assert.doesNotMatch(p.firstName!, /[<>\u0000]/);
  assert.equal(needsSupabaseProfileRepair(p), true);
  assert.equal(buildSupabaseUserProfile(authId, { user_metadata: [] }).fullName, null);
});

test("getUser identity and server email confirmation are required; metadata confirmation is ignored", async () => {
  let user: Record<string, unknown> | null = null;
  let error: unknown = null;
  let calls = 0;
  const module = { exports: {} as typeof import("./supabaseProfile") };
  const code = transformSync(readFileSync(new URL("./supabaseProfile.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
  new Function("require", "module", "exports", code)((name: string) => {
    assert.equal(name, "./supabase");
    return { getSupabase: () => ({ auth: { getUser: async (token: string) => {
      calls++; assert.equal(token, "verified-token"); return { data: { user }, error };
    } } }) };
  }, module, module.exports);
  const fetchProfile = () => module.exports.fetchSupabaseUserProfile(authId, "verified-token");
  assert.equal(await fetchProfile(), null);
  user = { id: authId, email: "ADA@EXAMPLE.COM", user_metadata: { email_verified: true, role: "admin" } };
  assert.equal((await fetchProfile())?.emailVerified, false);
  user.email_confirmed_at = "invalid";
  assert.equal((await fetchProfile())?.emailVerified, false);
  user.email_confirmed_at = "2026-01-01T00:00:00Z";
  assert.equal((await fetchProfile())?.emailVerified, true);
  assert.equal((await fetchProfile())?.email, "ada@example.com");
  user.is_anonymous = true; assert.equal(await fetchProfile(), null);
  user.is_anonymous = false; user.id = "other"; assert.equal(await fetchProfile(), null);
  user.id = authId; error = { message: "provider error" }; assert.equal(await fetchProfile(), null);
  assert.equal(calls, 8);
});
