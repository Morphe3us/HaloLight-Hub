import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { transformSync } from "esbuild";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";

const userId = "a1234567-1234-4123-8123-123456789abc";
const publicKey = "sb_publishable_offline_fixture";
const adminSecret = "sb_secret_must_never_be_sent";
const privateDiagnostic = "private provider diagnostic must not escape";
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const source = (path: string) => transformSync(readFileSync(new URL(path, import.meta.url), "utf8"), {
  loader: "ts", format: "cjs",
}).code;
const configSource = source("../lib/supabase.ts");
const middlewareSource = source("./supabaseAuth.ts");
let projectSequence = 0;

function signingKey(kid: string) {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    privateKey: pair.privateKey,
    jwk: { ...pair.publicKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig" },
  };
}

function esToken(privateKey: KeyObject, kid: string, claims: Record<string, unknown>): string {
  const body = `${encode({ alg: "ES256", typ: "JWT", kid })}.${encode(claims)}`;
  const signature = sign("sha256", Buffer.from(body), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${body}.${signature.toString("base64url")}`;
}

function hsToken(claims: Record<string, unknown>): string {
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}`;
  return `${body}.${createHmac("sha256", "offline-signing-fixture").update(body).digest("base64url")}`;
}

function tamperSignature(token: string): string {
  const [header, payload, encodedSignature] = token.split(".");
  const signature = Buffer.from(encodedSignature, "base64url");
  signature[0] ^= 1;
  return `${header}.${payload}.${signature.toString("base64url")}`;
}

function harness() {
  // auth-js shares JWKS by storage key across clients. Distinct synthetic project
  // refs keep cases independent without resetting private SDK state or live env.
  const projectRef = `offline${String(++projectSequence).padStart(13, "0")}`;
  const url = `https://${projectRef}.supabase.co`;
  const calls: string[] = [];
  const transportFailures: unknown[] = [];
  const acceptedByAuthServer = new Set<string>();
  let keys: ReturnType<typeof signingKey>["jwk"][] = [];
  let jwksUnavailable = false;
  const transport: typeof fetch = async (input, init) => {
    const address = input instanceof globalThis.Request ? input.url : String(input);
    calls.push(address);
    // Middleware catches thrown errors, including assertion failures. Remember
    // transport assertions so a broken fixture cannot falsely pass a 401 case.
    try {
      assert.equal(init?.method, "GET");
      assert.ok(init?.signal instanceof AbortSignal);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("apikey"), publicKey);
      assert.ok(!JSON.stringify([...headers]).includes(adminSecret));
      if (address === `${url}/auth/v1/.well-known/jwks.json`) {
        assert.equal(headers.get("authorization"), `Bearer ${publicKey}`);
        return jwksUnavailable
          ? Response.json({ msg: privateDiagnostic, code: "unexpected_failure" }, { status: 403 })
          : Response.json({ keys });
      }
      assert.equal(address, `${url}/auth/v1/user`);
      const authorization = headers.get("authorization");
      assert.ok(authorization && authorization.startsWith("Bearer "));
      // Explicit server-approved token fixtures model remote verification. The
      // real SDK must call /user, not locally trust a decoded HS/unknown-key JWT.
      if (acceptedByAuthServer.has(authorization.slice(7))) {
        return Response.json({ id: userId, aud: "authenticated", role: "authenticated",
          email: "offline@example.invalid", is_anonymous: false, app_metadata: {}, user_metadata: {} });
      }
      return Response.json({ msg: privateDiagnostic, code: "bad_jwt" }, { status: 401 });
    } catch (error) {
      transportFailures.push(error);
      throw error;
    }
  };

  // Load the real configuration and middleware with only environment/transport
  // replaced. getClaims, getUser, JWKS caching and WebCrypto remain real SDK code.
  const config = { exports: {} as typeof import("../lib/supabase") };
  new Function("require", "module", "exports", "process", "fetch", configSource)(
    (name: string) => { assert.equal(name, "@supabase/supabase-js"); return { createClient }; },
    config, config.exports,
    { env: { NODE_ENV: "production", SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publicKey, SUPABASE_SECRET_KEY: adminSecret } },
    transport,
  );
  const middleware = { exports: {} as typeof import("./supabaseAuth") };
  new Function("require", "module", "exports", middlewareSource)(
    (name: string) => { assert.equal(name, "../lib/supabase"); return config.exports; },
    middleware, middleware.exports,
  );
  const claims = (patch: Record<string, unknown> = {}) => ({
    sub: userId, iss: `${url}/auth/v1`, aud: "authenticated", role: "authenticated", is_anonymous: false,
    exp: Math.floor(Date.now() / 1000) + 300, ...patch,
  });
  const request = { headers: {} } as ExpressRequest;
  return {
    claims, calls, acceptedByAuthServer,
    publish(value: typeof keys) { keys = value; },
    failJwks() { jwksUnavailable = true; },
    paths: () => calls.map(value => new URL(value).pathname),
    async check(token: string, expected: 200 | 401) {
      let status = 200;
      let next = 0;
      let body: unknown;
      request.headers.authorization = `Bearer ${token}`;
      await middleware.exports.supabaseAuth(request, {
        status(value: number) { status = value; return this; },
        json(value: unknown) { body = value; return this; },
      } as ExpressResponse, () => { next++; });
      assert.deepEqual(transportFailures, []);
      assert.equal(status, expected);
      assert.equal(next, expected === 200 ? 1 : 0);
      if (expected === 200) {
        assert.equal(middleware.exports.getAuth(request)?.userId, userId);
        assert.equal(middleware.exports.getAuth(request)?.accessToken, token);
        assert.equal(body, undefined);
      } else {
        assert.deepEqual(body, { error: "Unauthorized" });
        assert.equal(middleware.exports.getAuth(request), undefined);
      }
    },
  };
}

test("real SDK verifies ES256 and reuses cached JWKS without calling the user endpoint", async () => {
  const h = harness();
  const key = signingKey("initial"); h.publish([key.jwk]);
  const token = esToken(key.privateKey, key.jwk.kid, h.claims());
  await h.check(token, 200);
  await h.check(token, 200);
  assert.deepEqual(h.paths(), ["/auth/v1/.well-known/jwks.json"]);
});

test("real SDK rejects altered payload, altered signature and wrong key under a known kid", async () => {
  const h = harness();
  const key = signingKey("trusted"); h.publish([key.jwk]);
  const token = esToken(key.privateKey, key.jwk.kid, h.claims());
  await h.check(token, 200);
  const parts = token.split(".");
  parts[1] = encode(h.claims({ sub: "b1234567-1234-4123-8123-123456789abc" }));
  await h.check(parts.join("."), 401);
  await h.check(tamperSignature(token), 401);
  await h.check(esToken(signingKey("attacker").privateKey, key.jwk.kid, h.claims()), 401);
  assert.deepEqual(h.paths(), ["/auth/v1/.well-known/jwks.json"]);
});

test("valid cryptographic signatures cannot bypass issuer, role, audience, identity or time policy", async () => {
  const h = harness();
  const key = signingKey("policy"); h.publish([key.jwk]);
  await h.check(esToken(key.privateKey, key.jwk.kid, h.claims()), 200);
  for (const patch of [
    { iss: "https://differentprojectrefx.supabase.co/auth/v1" }, { iss: undefined },
    { role: "service_role" }, { role: "admin" }, { role: "anon" },
    { aud: "anon" }, { aud: ["service_role"] }, { is_anonymous: true },
    { sub: "user_legacy" }, { exp: 1 }, { exp: undefined },
    { nbf: Math.floor(Date.now() / 1000) + 300 },
  ]) await h.check(esToken(key.privateKey, key.jwk.kid, h.claims(patch)), 401);
  assert.deepEqual(h.paths(), ["/auth/v1/.well-known/jwks.json"]);
});

test("unknown kid refetches JWKS and fails closed when remote user verification rejects it", async () => {
  const h = harness();
  const trusted = signingKey("trusted"); h.publish([trusted.jwk]);
  await h.check(esToken(trusted.privateKey, trusted.jwk.kid, h.claims()), 200);
  const unknown = signingKey("unknown");
  await h.check(esToken(unknown.privateKey, unknown.jwk.kid, h.claims()), 401);
  assert.deepEqual(h.paths(), ["/auth/v1/.well-known/jwks.json", "/auth/v1/.well-known/jwks.json", "/auth/v1/user"]);
});

test("rotated signing key is discovered on kid miss and then verified from the refreshed cache", async () => {
  const h = harness();
  const old = signingKey("old"); h.publish([old.jwk]);
  await h.check(esToken(old.privateKey, old.jwk.kid, h.claims()), 200);
  const rotated = signingKey("rotated"); h.publish([old.jwk, rotated.jwk]);
  const token = esToken(rotated.privateKey, rotated.jwk.kid, h.claims());
  await h.check(token, 200);
  await h.check(token, 200);
  await h.check(esToken(old.privateKey, rotated.jwk.kid, h.claims()), 401);
  assert.deepEqual(h.paths(), ["/auth/v1/.well-known/jwks.json", "/auth/v1/.well-known/jwks.json"]);
});

test("unknown-key fallback requires an explicit successful Auth response and still enforces issuer policy", async () => {
  const h = harness();
  const key = signingKey("not-published");
  const token = esToken(key.privateKey, key.jwk.kid, h.claims());
  h.acceptedByAuthServer.add(token);
  await h.check(token, 200);
  const foreign = esToken(key.privateKey, key.jwk.kid, h.claims({ iss: "https://foreign.example.invalid/auth/v1" }));
  h.acceptedByAuthServer.add(foreign);
  await h.check(foreign, 401);
  assert.deepEqual(h.paths(), ["/auth/v1/.well-known/jwks.json", "/auth/v1/user", "/auth/v1/.well-known/jwks.json", "/auth/v1/user"]);
});

test("HS256 uses real SDK getUser fallback on every verification and rejects server-denied or privileged tokens", async () => {
  const h = harness();
  const token = hsToken(h.claims()); h.acceptedByAuthServer.add(token);
  await h.check(token, 200);
  await h.check(token, 200);
  await h.check(tamperSignature(token), 401);
  const privileged = hsToken(h.claims({ role: "service_role" }));
  h.acceptedByAuthServer.add(privileged);
  await h.check(privileged, 401);
  h.acceptedByAuthServer.delete(token);
  await h.check(token, 401);
  assert.deepEqual(h.paths(), Array(5).fill("/auth/v1/user"));
  await h.check(hsToken(h.claims({ exp: 1 })), 401);
  assert.equal(h.calls.length, 5);
});

test("JWKS errors fail closed and do not disclose transport diagnostics or leave prior request auth", async () => {
  const h = harness();
  const old = signingKey("old"); h.publish([old.jwk]);
  await h.check(esToken(old.privateKey, old.jwk.kid, h.claims()), 200);
  h.failJwks();
  const unknown = signingKey("unknown");
  await h.check(esToken(unknown.privateKey, unknown.jwk.kid, h.claims()), 401);
  assert.deepEqual(h.paths(), ["/auth/v1/.well-known/jwks.json", "/auth/v1/.well-known/jwks.json"]);
});
