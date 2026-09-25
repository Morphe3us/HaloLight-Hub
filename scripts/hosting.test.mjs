import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("hosting startup loads private env, preserves host PORT, forces production and works outside root", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "hub-hosting-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "scripts"));
  await mkdir(path.join(root, "artifacts/api-server/dist"), { recursive: true });
  await mkdir(path.join(root, "artifacts/halolight-os/dist/public"), { recursive: true });
  await copyFile(new URL("./hosting-start.mjs", import.meta.url), path.join(root, "scripts/hosting-start.mjs"));
  await writeFile(path.join(root, ".env"), "PORT=9999\nDATABASE_URL=postgres://synthetic\nNODE_ENV=development\nFRONTEND_DIST_PATH=\n", { mode: 0o600 });
  await writeFile(path.join(root, "artifacts/halolight-os/dist/public/index.html"), "test");
  await writeFile(path.join(root, "artifacts/api-server/dist/index.mjs"), 'console.log(JSON.stringify({port:process.env.PORT,configured:!!process.env.DATABASE_URL,mode:process.env.NODE_ENV,cwd:process.cwd()}));');
  const result = spawnSync(process.execPath, [path.join(root, "scripts/hosting-start.mjs")], {
    cwd: tmpdir(), env: { PATH: process.env.PATH, PORT: "3000" }, encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { port: "3000", configured: true, mode: "production", cwd: await import("node:fs/promises").then((fs) => fs.realpath(root)) });
});

const projectRef = "abcdefghijklmnopqrst";
const projectUrl = `https://${projectRef}.supabase.co`;
const otherProjectUrl = "https://zyxwvutsrqponmlkjihg.supabase.co";
const publishableKey = "sb_publishable_synthetic_123-ABC";
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const legacyKey = (payload = {}, header = { alg: "HS256", typ: "JWT" }) =>
  `${encode(header)}.${encode({ role: "anon", ref: projectRef, ...payload })}.c3ludGhldGlj`;

async function buildFixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "hub-hosting-build-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "scripts"));
  await mkdir(path.join(root, "bin"));
  await symlink(process.execPath, path.join(root, "bin/node"));
  await copyFile(new URL("./hosting-build.sh", import.meta.url), path.join(root, "scripts/hosting-build.sh"));
  await writeFile(path.join(root, "bin/pnpm"), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 11.7.0; exit 0; fi\necho reached-install\nexit 42\n', { mode: 0o700 });
  const env = { PATH: `${path.join(root, "bin")}:${process.env.PATH}` };
  return {
    root,
    run: (overrides = {}) => spawnSync("bash", [path.join(root, "scripts/hosting-build.sh")], {
      cwd: tmpdir(), env: { ...env, ...overrides }, encoding: "utf8", timeout: 10000,
    }),
  };
}

function assertRejected(result, message) {
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, message);
  assert.doesNotMatch(result.stdout, /reached-install/);
}

function assertAccepted(result) {
  assert.equal(result.status, 42, result.stderr);
  assert.match(result.stdout, /reached-install/);
}

test("hosting build recognizes private .env and preserves host overrides", async (t) => {
  const { root, run } = await buildFixture(t);
  let result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /VITE_SUPABASE_PUBLISHABLE_KEY is missing/);
  await writeFile(path.join(root, ".env"), `VITE_SUPABASE_PUBLISHABLE_KEY=${publishableKey}\nVITE_SUPABASE_URL=${projectUrl}\nSUPABASE_URL=${projectUrl}/\n`, { mode: 0o600 });
  assertAccepted(run());
  assertRejected(run({ VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_synthetic" }), /never a secret key/);
  assertRejected(run({ VITE_SUPABASE_PUBLISHABLE_KEY: " " }), /is missing/);
  assertRejected(run({ SUPABASE_URL: otherProjectUrl }), /match SUPABASE_URL/);
  assertRejected(run({ VITE_SUPABASE_URL: otherProjectUrl }), /match SUPABASE_URL/);
});

test("hosting build accepts modern publishable and project-matched legacy anon keys", async (t) => {
  const { run } = await buildFixture(t);
  for (const [name, key] of [["modern", publishableKey], ["legacy", legacyKey()]]) {
    for (const trailingSlash of ["", "/"]) {
      await t.test(`${name}, trailing slash ${Boolean(trailingSlash)}`, () => {
        assertAccepted(run({
          VITE_SUPABASE_PUBLISHABLE_KEY: key,
          VITE_SUPABASE_URL: `${projectUrl}${trailingSlash}`,
          SUPABASE_URL: projectUrl,
        }));
      });
    }
  }
  await t.test("server URL is optional", () => {
    assertAccepted(run({ VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey, VITE_SUPABASE_URL: projectUrl }));
  });
});

test("hosting build rejects unsafe or malformed keys before installing", async (t) => {
  const { run } = await buildFixture(t);
  const cases = [
    ["secret", "sb_secret_synthetic"],
    ["service role", legacyKey({ role: "service_role" })],
    ["authenticated role", legacyKey({ role: "authenticated" })],
    ["wrong project", legacyKey({ ref: "zyxwvutsrqponmlkjihg" })],
    ["missing project", legacyKey({ ref: undefined })],
    ["wrong-case project", legacyKey({ ref: projectRef.toUpperCase() })],
    ["non-string project", legacyKey({ ref: 123 })],
    ["missing role", legacyKey({ role: undefined })],
    ["unsigned algorithm", legacyKey({}, { alg: "none" })],
    ["missing algorithm", legacyKey({}, {})],
    ["null header", legacyKey({}, null)],
    ["invalid header JSON", `bm90LWpzb24.${encode({ role: "anon", ref: projectRef })}.c2ln`],
    ["invalid payload JSON", `${encode({ alg: "HS256" })}.bm90LWpzb24.c2ln`],
    ["null payload", `${encode({ alg: "HS256" })}.${encode(null)}.c2ln`],
    ["missing signature", legacyKey().replace(/\.[^.]+$/, ".")],
    ["extra segment", `${legacyKey()}.extra`],
    ["invalid base64url characters", legacyKey().replace(".c3ludGhldGlj", ".!signature!")],
    ["empty publishable suffix", "sb_publishable_"],
    ["invalid publishable suffix", "sb_publishable_bad.key"],
    ["unrecognized key", "not-a-public-key"],
  ];
  for (const [name, key] of cases) {
    await t.test(name, () => {
      const result = run({ VITE_SUPABASE_PUBLISHABLE_KEY: key, VITE_SUPABASE_URL: projectUrl });
      assertRejected(result, /publishable or legacy anon key.*never a secret key/);
      assert.ok(!`${result.stdout}${result.stderr}`.includes(key), "key must not be logged");
    });
  }
});

test("hosting build rejects invalid frontend and configured server URLs", async (t) => {
  const { run } = await buildFixture(t);
  const cases = [
    ["empty", ""],
    ["blank", " "],
    ["malformed", "not-a-url"],
    ["HTTP", projectUrl.replace("https:", "http:")],
    ["short reference", "https://synthetic.supabase.co"],
    ["long reference", `https://${projectRef}x.supabase.co`],
    ["apex", "https://supabase.co"],
    ["extra subdomain", `https://nested.${projectRef}.supabase.co`],
    ["lookalike domain", `${projectUrl}.example.com`],
    ["custom domain", "https://auth.example.com"],
    ["username", projectUrl.replace("https://", "https://user@")],
    ["password", projectUrl.replace("https://", "https://user:password@")],
    ["nonstandard port", `${projectUrl}:8443`],
    ["explicit default port", `${projectUrl}:443`],
    ["path", `${projectUrl}/auth/v1`],
    ["normalized dot path", `${projectUrl}/auth/..`],
    ["query", `${projectUrl}?next=example`],
    ["empty query", `${projectUrl}?`],
    ["fragment", `${projectUrl}#example`],
    ["empty fragment", `${projectUrl}#`],
    ["trailing newline", `${projectUrl}\n`],
    ["normalized backslash", `${projectUrl}\\`],
  ];
  for (const variable of ["VITE_SUPABASE_URL", "SUPABASE_URL"]) {
    for (const [name, url] of cases) {
      await t.test(`${variable}: ${name}`, () => {
        assertRejected(run({
          VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
          VITE_SUPABASE_URL: projectUrl,
          SUPABASE_URL: projectUrl,
          [variable]: url,
        }), /hosted Supabase project HTTPS URL and match SUPABASE_URL/);
      });
    }
  }
  await t.test("missing frontend URL", () => {
    assertRejected(run({ VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey }), /match SUPABASE_URL/);
  });
});
