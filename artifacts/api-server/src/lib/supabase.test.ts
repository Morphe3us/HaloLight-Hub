import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const projectRef = "abcdefghijklmnopqrst";
const projectUrl = `https://${projectRef}.supabase.co`;
const publicKey = "sb_publishable_synthetic";
const secretKey = "sb_secret_synthetic";

function legacyKey(payload: Record<string, unknown> = {}, header: unknown = { alg: "HS256", typ: "JWT" }): string {
  return [header, { iss: "supabase", ref: projectRef, role: "anon", exp: 4102444800, ...payload }]
    .map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".") + ".synthetic-signature";
}

function harness(env: Record<string, string | undefined>) {
  const calls: Array<{ url: string; key: string; options: any }> = [];
  const module = { exports: {} as typeof import("./supabase") };
  const code = transformSync(readFileSync(new URL("./supabase.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
  new Function("require", "module", "exports", "process", code)((name: string) => {
    assert.equal(name, "@supabase/supabase-js");
    return { createClient: (url: string, key: string, options: unknown) => {
      const client = { url, key, options }; calls.push(client); return client;
    } };
  }, module, module.exports, { env });
  return { ...module.exports, calls };
}

test("verification client reuses JWKS-capable instance and never uses the admin secret", () => {
  const h = harness({ SUPABASE_URL: `${projectUrl}/`, SUPABASE_PUBLISHABLE_KEY: publicKey, SUPABASE_SECRET_KEY: secretKey });
  assert.equal(h.getSupabase(), h.getSupabase());
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].key, publicKey);
  assert.deepEqual(h.calls[0].options.auth, { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
  assert.equal(h.getSupabaseAdmin(), h.getSupabaseAdmin());
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].key, secretKey);
  assert.throws(() => harness({ SUPABASE_URL: projectUrl, SUPABASE_SECRET_KEY: secretKey }).getSupabase());
  assert.throws(() => harness({ SUPABASE_URL: projectUrl, SUPABASE_PUBLISHABLE_KEY: publicKey }).getSupabaseAdmin());
});

test("hosted URLs must match the trusted project shape before any client is created", () => {
  for (const NODE_ENV of [undefined, "production", "staging", "development", "test"]) {
    const good = harness({ NODE_ENV, SUPABASE_URL: projectUrl, SUPABASE_PUBLISHABLE_KEY: publicKey });
    assert.equal(good.supabaseUrl(), projectUrl);
    good.getSupabase(); assert.equal(good.calls.length, 1);
    for (const SUPABASE_URL of [
      undefined, "", "bad", `http://${projectRef}.supabase.co`, "http://attacker.example.com", "https://attacker.example.com",
      "https://supabase.co", "https://short.supabase.co", `${projectUrl}.evil.example`,
      `https://user:secret@${projectRef}.supabase.co`, `${projectUrl}:443`, `${projectUrl}:8443`,
      `${projectUrl}/auth/v1`, `${projectUrl}/ignored/..`, `${projectUrl}?key=secret`, `${projectUrl}#fragment`,
      ` ${projectUrl}`, `${projectUrl}\n`, `https://%61${projectRef.slice(1)}.supabase.co`,
    ]) {
      const h = harness({ NODE_ENV, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: publicKey, SUPABASE_SECRET_KEY: secretKey });
      for (const create of [h.getSupabase, h.getSupabaseAdmin]) {
        assert.throws(create, { message: "Authentication is not configured" });
      }
      assert.equal(h.calls.length, 0, `${NODE_ENV}: ${SUPABASE_URL}`);
    }
  }
});

test("loopback HTTP requires explicit development or test; lookalikes never qualify", () => {
  for (const NODE_ENV of [undefined, "production", "staging", "Development", "development", "test"]) {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      for (const protocol of ["http", "https"]) {
        const url = `${protocol}://${host}:54321`;
        const h = harness({ NODE_ENV, SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publicKey });
        if (NODE_ENV === "development" || NODE_ENV === "test") {
          assert.equal(h.supabaseUrl(), url); h.getSupabase(); assert.equal(h.calls.length, 1);
        } else { assert.throws(h.getSupabase); assert.equal(h.calls.length, 0); }
      }
    }
  }
  for (const url of ["http://localhost.evil.example", "http://127.0.0.1.evil.example", "http://localhost@evil.example", "http://127.1", "http://2130706433", "http://0.0.0.0", "http://192.168.1.1", "http://localhost:65536", "http://localhost/path/..", "http://localhost?x=1"]) {
    const h = harness({ NODE_ENV: "development", SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publicKey });
    assert.throws(h.getSupabase); assert.equal(h.calls.length, 0);
  }
});

test("legacy keys must have the correct role, issuer, project, algorithm and expiry", () => {
  for (const admin of [false, true]) {
    const role = admin ? "service_role" : "anon";
    const key = legacyKey({ role });
    const env = (value: string) => ({ SUPABASE_URL: projectUrl, [admin ? "SUPABASE_SECRET_KEY" : "SUPABASE_PUBLISHABLE_KEY"]: value });
    const h = harness(env(key));
    (admin ? h.getSupabaseAdmin : h.getSupabase)();
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].key, key);
    const rejected = [
      admin ? publicKey : secretKey, "sb_secret_", "sb_publishable_", "not-a-key", "a.b.c", "a.W10.c", "a.e30.c", "x".repeat(4097),
      legacyKey({ role: admin ? "anon" : "service_role" }), legacyKey({ role: "authenticated" }),
      legacyKey({ role, ref: "anotherprojectrefxxxx" }), legacyKey({ role, ref: undefined }),
      legacyKey({ role, iss: "attacker" }), legacyKey({ role, exp: 1 }), legacyKey({ role, exp: "4102444800" }),
      legacyKey({ role, exp: undefined }), legacyKey({ role, exp: 4102444800.5 }),
      legacyKey({ role }, { alg: "none", typ: "JWT" }), legacyKey({ role }, { alg: "HS256" }),
      legacyKey({ role }, []), ` ${key}`, `${key}\n`,
    ];
    for (const value of rejected) {
      const denied = harness(env(value));
      assert.throws(admin ? denied.getSupabaseAdmin : denied.getSupabase, { message: "Authentication is not configured" });
      assert.equal(denied.calls.length, 0);
    }
  }
});

test("local legacy demo keys remain isolated to explicit loopback environments", () => {
  const key = legacyKey({ iss: "supabase-demo", ref: undefined, role: "service_role" });
  const local = harness({ NODE_ENV: "test", SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SECRET_KEY: key });
  local.getSupabaseAdmin(); assert.equal(local.calls.length, 1);
  assert.throws(() => harness({ NODE_ENV: "test", SUPABASE_URL: projectUrl, SUPABASE_SECRET_KEY: key }).getSupabaseAdmin());
});

test("invite URL is fixed configured HTTPS origin, never a request-controlled redirect", () => {
  assert.equal(harness({ APP_PUBLIC_URL: "https://portal.example.com/" }).invitationRedirectUrl(), "https://portal.example.com/auth/invite");
  for (const value of [undefined, "", "bad", "http://portal.example.com", "https://user:pass@portal.example.com", "https://portal.example.com/subpath", "https://portal.example.com?redirect=evil", "https://portal.example.com/#evil", "//evil.example.com"]) {
    assert.throws(() => harness({ APP_PUBLIC_URL: value }).invitationRedirectUrl(), String(value));
  }
  assert.throws(() => harness({ APP_URL: "https://wrong.example.com" }).invitationRedirectUrl());
});
