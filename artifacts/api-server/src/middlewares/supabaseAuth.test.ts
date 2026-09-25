import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import type { Request, Response } from "express";

const userId = "a1234567-1234-4123-8123-123456789abc";
const issuer = "https://fixture.supabase.co/auth/v1";
const valid = () => ({ sub: userId, iss: issuer, aud: "authenticated", role: "authenticated", is_anonymous: false, exp: Math.floor(Date.now() / 1000) + 60 });

function harness(claims: Record<string, unknown> = valid(), options: { error?: boolean; throws?: boolean; configured?: boolean } = {}) {
  let calls = 0;
  const module = { exports: {} as typeof import("./supabaseAuth") };
  const code = transformSync(readFileSync(new URL("./supabaseAuth.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
  new Function("require", "module", "exports", code)((name: string) => {
    assert.equal(name, "../lib/supabase");
    return {
      supabaseUrl: () => { if (options.configured === false) throw new Error("secret"); return "https://fixture.supabase.co"; },
      getSupabase: () => ({ auth: { getClaims: async (token: string) => {
        calls++; assert.equal(token, "verified-token");
        if (options.throws) throw new Error("provider secret");
        return { data: { claims }, error: options.error ? { message: "provider secret" } : null };
      } } }),
    };
  }, module, module.exports);
  return { ...module.exports, get calls() { return calls; } };
}

test("only verified bearer claims populate request auth; request properties are untrusted", async () => {
  const h = harness();
  const req = { headers: { authorization: "Bearer verified-token" }, auth: { userId: "attacker" } } as unknown as Request;
  let next = 0;
  await h.supabaseAuth(req, {} as Response, () => { next++; });
  assert.equal(next, 1); assert.equal(h.calls, 1);
  assert.equal(h.getAuth(req)?.userId, userId);
  assert.equal(h.getAuth({ auth: { userId } } as unknown as Request), undefined);
  delete req.headers.authorization;
  await h.supabaseAuth(req, {} as Response, () => { next++; });
  assert.equal(h.getAuth(req), undefined); assert.equal(h.calls, 1);
});

test("reject invalid issuer, audience, user identity, anonymity, service tokens and time claims", async () => {
  for (const patch of [
    { iss: "https://other.supabase.co/auth/v1" }, { iss: undefined }, { aud: "anon" }, { aud: ["service_role"] },
    { sub: "user_legacy" }, { sub: "00000000-0000-0000-0000-000000000000" }, { sub: undefined },
    { is_anonymous: true }, { is_anonymous: undefined }, { is_anonymous: "false" },
    { role: "service_role" }, { role: "admin" }, { role: undefined },
    { exp: 1 }, { exp: undefined }, { exp: "99999999999" }, { nbf: 99999999999 }, { nbf: "0" },
  ]) {
    const h = harness({ ...valid(), ...patch });
    const req = { headers: { authorization: "Bearer verified-token" } } as Request;
    let status = 0;
    const res = { status(value: number) { status = value; return this; }, json(value: unknown) { assert.deepEqual(value, { error: "Unauthorized" }); } } as Response;
    await h.supabaseAuth(req, res, () => assert.fail("must not authenticate"));
    assert.equal(status, 401, JSON.stringify(patch)); assert.equal(h.getAuth(req), undefined);
  }
});

test("malformed headers and provider failures fail closed without leaking errors", async () => {
  for (const header of ["", "Basic abc", "Bearer a b", "Bearer a, Bearer b", "Bearer " + "x".repeat(16385)]) {
    const h = harness(); let status = 0;
    await h.supabaseAuth({ headers: { authorization: header } } as Request, {
      status(value: number) { status = value; return this; }, json() {},
    } as Response, () => assert.fail("must reject"));
    assert.equal(status, 401); assert.equal(h.calls, 0);
  }
  for (const options of [{ error: true }, { throws: true }, { configured: false }]) {
    const h = harness(valid(), options); let status = 0;
    await h.supabaseAuth({ headers: { authorization: "Bearer verified-token" } } as Request, {
      status(value: number) { status = value; return this; }, json(value: unknown) { assert.doesNotMatch(JSON.stringify(value), /secret|provider/); },
    } as Response, () => assert.fail("must reject"));
    assert.equal(status, options.configured === false ? 503 : 401);
  }
});
