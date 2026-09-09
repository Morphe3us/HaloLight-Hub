import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
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

test("hosting build recognizes private .env and still rejects a missing public key", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "hub-hosting-build-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "scripts"));
  await mkdir(path.join(root, "bin"));
  await copyFile(new URL("./hosting-build.sh", import.meta.url), path.join(root, "scripts/hosting-build.sh"));
  await writeFile(path.join(root, "bin/pnpm"), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 11.7.0; exit 0; fi\necho reached-install\nexit 42\n', { mode: 0o700 });
  const env = { PATH: `${path.join(root, "bin")}:${process.env.PATH}` };
  let result = spawnSync("bash", [path.join(root, "scripts/hosting-build.sh")], { env, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /VITE_CLERK_PUBLISHABLE_KEY is missing/);
  await writeFile(path.join(root, ".env"), "VITE_CLERK_PUBLISHABLE_KEY=pk_test_synthetic\n", { mode: 0o600 });
  result = spawnSync("bash", [path.join(root, "scripts/hosting-build.sh")], { env, encoding: "utf8" });
  assert.equal(result.status, 42, result.stderr);
  assert.match(result.stdout, /reached-install/);
  result = spawnSync("bash", [path.join(root, "scripts/hosting-build.sh")], { env: { ...env, VITE_CLERK_PUBLISHABLE_KEY: "sk_test_synthetic" }, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /never a secret key/);
});
