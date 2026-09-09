import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  buildClerkUserProfile,
  extractClerkApiProfile,
  fetchClerkUserProfile,
  isPlaceholderEmail,
  isPlaceholderProfileName,
  needsClerkProfileRepair,
} from "./clerkProfile";

test("extractClerkApiProfile uses the primary Clerk email and names", () => {
  const profile = extractClerkApiProfile({
    primary_email_address_id: "email_primary",
    email_addresses: [
      { id: "email_secondary", email_address: "secondary@example.com" },
      {
        id: "email_primary",
        email_address: "Primary@Example.com",
        verification: { status: "verified" },
      },
    ],
    first_name: "Ada",
    last_name: "Lovelace",
  });

  assert.deepEqual(profile, {
    email: "primary@example.com",
    emailVerified: true,
    firstName: "Ada",
    lastName: "Lovelace",
    fullName: "Ada Lovelace",
  });
});

test("buildClerkUserProfile fills missing session claims from Clerk API data", () => {
  const profile = buildClerkUserProfile(
    "user_123",
    {},
    {
      email: "ada@example.com",
      emailVerified: true,
      firstName: "Ada",
      lastName: "Lovelace",
      fullName: "Ada Lovelace",
    },
  );

  assert.deepEqual(profile, {
    email: "ada@example.com",
    emailVerified: true,
    firstName: "Ada",
    lastName: "Lovelace",
    fullName: "Ada Lovelace",
  });
});

test("buildClerkUserProfile falls back to a deterministic placeholder", () => {
  const profile = buildClerkUserProfile("USER_ABC", {}, {});

  assert.equal(profile.email, "user_abc@placeholder.com");
  assert.equal(profile.emailVerified, false);
  assert.equal(isPlaceholderEmail(profile.email), true);
});

test("buildClerkUserProfile never treats placeholder email as verified", () => {
  const profile = buildClerkUserProfile("user_123", {
    email_verified: true,
  });

  assert.equal(profile.email, "user_123@placeholder.com");
  assert.equal(profile.emailVerified, false);
});

test("buildClerkUserProfile reads verified email claims", () => {
  const profile = buildClerkUserProfile("user_123", {
    email: "Ada@Example.com",
    email_verified: true,
  });

  assert.equal(profile.email, "ada@example.com");
  assert.equal(profile.emailVerified, true);
});

test("needsClerkProfileRepair only flags auth identity fields", () => {
  assert.equal(
    needsClerkProfileRepair({
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      fullName: "Ada Lovelace",
    }),
    false,
  );

  assert.equal(
    needsClerkProfileRepair({
      email: "user_123@placeholder.com",
      firstName: "Ada",
      lastName: "Lovelace",
      fullName: "Ada Lovelace",
    }),
    true,
  );

  assert.equal(
    needsClerkProfileRepair({
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      fullName: "Ada Lovelace",
      companyName: null,
      phone: null,
    } as Parameters<typeof needsClerkProfileRepair>[0]),
    false,
  );
});

test("needsClerkProfileRepair treats UI fallback names as repairable placeholders", () => {
  assert.equal(
    isPlaceholderProfileName({
      firstName: "User",
      lastName: "Member",
      fullName: "User Member",
    }),
    true,
  );

  assert.equal(
    needsClerkProfileRepair({
      email: "real@example.com",
      firstName: "User",
      lastName: "Member",
      fullName: "User Member",
    }),
    true,
  );

  assert.equal(
    isPlaceholderProfileName({
      firstName: "Uma",
      lastName: "Mendoza",
      fullName: "Uma Mendoza",
    }),
    false,
  );
});

test("fresh API identity overrides stale verified session claims", () => {
  const profile = buildClerkUserProfile("user_123", {
    email: "old@example.com",
    email_verified: true,
    name: "User Member",
  }, {
    email: "current@example.com",
    emailVerified: false,
    fullName: "Ada Lovelace",
  });
  assert.equal(profile.email, "current@example.com");
  assert.equal(profile.emailVerified, false);
  assert.equal(profile.fullName, "Ada Lovelace");
});

test("a secondary verified email is never substituted for a missing primary", () => {
  const apiProfile = extractClerkApiProfile({
    primary_email_address_id: "missing",
    email_addresses: [{
      id: "secondary", email_address: "invited@example.com",
      verification: { status: "verified" },
    }],
  });
  assert.equal(apiProfile.email, undefined);
  const profile = buildClerkUserProfile("user_123", {
    email: "invited@example.com", email_verified: true,
  }, apiProfile);
  assert.equal(profile.emailVerified, false);
});

test("email verification cannot transfer from the API to another claim address", () => {
  const profile = buildClerkUserProfile("user_123", {
    email: "unverified@example.com", email_verified: false,
  }, { email: "verified@example.com", emailVerified: true });
  assert.equal(profile.email, "verified@example.com");
  assert.equal(profile.emailVerified, true);
});

test("Google name claims survive a missing Backend API response", () => {
  const profile = buildClerkUserProfile("user_google", {
    email: "ada@example.com", email_verified: true,
    given_name: "Ada", family_name: "Lovelace",
  });
  assert.equal(profile.fullName, "Ada Lovelace");
  assert.equal(profile.emailVerified, true);
});

test("Clerk profile fetch times out without exposing the credential", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
  });
  await assert.rejects(fetchClerkUserProfile("user_test", "test-credential", 1), /aborted/);
});

test("Clerk profile fetch reports only status for an upstream error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("private upstream body", { status: 503 }));
  await assert.rejects(fetchClerkUserProfile("user_test", "test-credential"), {
    message: "Clerk user fetch failed with status 503",
  });
});

const proxySource = ts.transpileModule(readFileSync(new URL("../middlewares/clerkProxyMiddleware.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function proxyHarness(secretKey: string, publishableKey: string) {
  let options: any;
  const module = { exports: {} as typeof import("../middlewares/clerkProxyMiddleware") };
  runInNewContext(proxySource, {
    module, exports: module.exports,
    process: { env: { NODE_ENV: "production", CLERK_SECRET_KEY: secretKey, CLERK_PUBLISHABLE_KEY: publishableKey } },
    require: (id: string) => {
      assert.equal(id, "http-proxy-middleware");
      return { createProxyMiddleware: (config: unknown) => { options = config; return () => {}; } };
    },
  });
  const middleware = module.exports.clerkProxyMiddleware();
  return { middleware, options, getClerkProxyHost: module.exports.getClerkProxyHost };
}

test("production runtime with Clerk test keys never enables the unsupported proxy", () => {
  assert.equal(proxyHarness("sk_test_fixture", "pk_test_fixture").options, undefined);
  assert.equal(proxyHarness("sk_live_fixture", "pk_test_fixture").options, undefined);
  assert.equal(proxyHarness("", "pk_live_fixture").options, undefined);
});

test("live Clerk proxy preserves mounted paths and sends matching proxy headers", () => {
  const { options, getClerkProxyHost } = proxyHarness("sk_live_fixture", "pk_live_fixture");
  assert.equal(options.target, "https://frontend-api.clerk.dev");
  assert.equal(options.pathRewrite("/v1/client?__clerk_api_version=1"), "/v1/client?__clerk_api_version=1");
  assert.equal(options.pathRewrite("/api/__clerk/v1/client"), "/v1/client");
  const headers: Record<string, string> = {};
  const req = {
    headers: {
      host: "internal:8080", "x-forwarded-host": "app.example.com, internal",
      "x-forwarded-proto": "https, http", "x-forwarded-for": "203.0.113.1, 127.0.0.1",
    }, socket: { remoteAddress: "127.0.0.1" },
  };
  options.on.proxyReq({ setHeader: (name: string, value: string) => { headers[name] = value; } }, req);
  assert.equal(getClerkProxyHost(req), "app.example.com");
  assert.equal(headers["Clerk-Proxy-Url"], "https://app.example.com/api/__clerk");
  assert.equal(headers["Clerk-Secret-Key"], "sk_live_fixture");
  assert.equal(headers["Clerk-Publishable-Key"], "pk_live_fixture");
  assert.equal(headers["X-Forwarded-For"], "203.0.113.1");
});
