import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { get } from "node:http";
import { gunzipSync } from "node:zlib";
import { createFrontendHandler } from "./frontend";

test("production frontend serves deep links without exposing private files or swallowing API routes", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "hub-frontend-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, "assets"));
  await writeFile(
    path.join(directory, "index.html"),
    "<!doctype html><title>HaloLight</title>",
  );
  await writeFile(
    path.join(directory, "assets/app-abc123.js"),
    "console.log('hub');",
  );
  const largeScript = "console.log('public frontend asset');\n".repeat(300);
  await writeFile(path.join(directory, "assets/app-abcdefgh.js"), largeScript);
  await writeFile(path.join(directory, ".env"), "SECRET=must-not-be-served");
  await writeFile(path.join(directory, "assets/app.js.map"), "private source");
  const app = express();
  app.use(createFrontendHandler(directory));
  app.get("/api/healthz", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/large", (_req, res) => res.json({ text: largeScript }));
  app.use((_req, res) => res.status(404).json({ error: "Not Found" }));
  const server = app.listen(0, "127.0.0.1");
  t.after(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  );
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const route of ["/", "/sign-in", "/academy/course-id/lesson-id"]) {
    const response = await fetch(base + route, {
      headers: { Accept: "text/html" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(await response.text(), /HaloLight/);
  }
  const asset = await fetch(`${base}/assets/app-abc123.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type") ?? "", /javascript/);
  assert.equal(asset.headers.get("x-content-type-options"), "nosniff");
  assert.equal(asset.headers.get("cache-control"), "public, max-age=3600");
  const compressed = await new Promise<{
    headers: import("node:http").IncomingHttpHeaders;
    body: Buffer;
  }>((resolve, reject) => {
    get(
      `${base}/assets/app-abcdefgh.js`,
      { headers: { "Accept-Encoding": "gzip" } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ headers: res.headers, body: Buffer.concat(chunks) }),
        );
        res.on("error", reject);
      },
    ).on("error", reject);
  });
  assert.equal(compressed.headers["content-encoding"], "gzip");
  assert.match(String(compressed.headers.vary), /Accept-Encoding/);
  assert.equal(
    compressed.headers["cache-control"],
    "public, max-age=31536000, immutable",
  );
  assert.equal(gunzipSync(compressed.body).toString(), largeScript);
  assert.ok(compressed.body.length < Buffer.byteLength(largeScript) / 2);
  const uncompressed = await fetch(`${base}/assets/app-abcdefgh.js`, {
    headers: { "Accept-Encoding": "identity" },
  });
  assert.equal(uncompressed.headers.get("content-encoding"), null);
  assert.equal(await uncompressed.text(), largeScript);
  const api = await fetch(`${base}/api/large`, {
    headers: { "Accept-Encoding": "gzip" },
  });
  assert.equal(api.headers.get("content-encoding"), null);
  assert.deepEqual(await api.json(), { text: largeScript });
  assert.deepEqual(await (await fetch(`${base}/api/healthz`)).json(), {
    status: "ok",
  });
  assert.deepEqual(await (await fetch(`${base}/API/healthz`)).json(), {
    status: "ok",
  });
  for (const route of [
    "/api/missing",
    "/API/missing",
    "/api",
    "/assets/missing.js",
    "/assets/missing",
    "/assets%2fmissing",
    "/.env",
    "/%2eenv",
    "/assets/app.js.map",
    "/assets/app.js%2emap",
  ]) {
    const response = await fetch(base + route);
    assert.equal(response.status, 404, route);
    assert.doesNotMatch(
      await response.text(),
      /HaloLight|must-not-be-served|private source/,
    );
  }
  assert.equal((await fetch(`${base}/%zz`)).status, 400);
  assert.equal(
    (await fetch(`${base}/academy`, { method: "POST" })).status,
    404,
  );
  assert.equal(
    (
      await fetch(`${base}/academy`, {
        headers: { Accept: "application/json" },
      })
    ).status,
    404,
  );
  const head = await fetch(`${base}/academy`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("production refuses to start without a compiled frontend", () => {
  assert.throws(
    () =>
      createFrontendHandler(path.join(tmpdir(), "missing-hub-build", "absent")),
    /Frontend build missing/,
  );
});
