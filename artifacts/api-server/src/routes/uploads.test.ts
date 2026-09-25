import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import * as streams from "node:stream/promises";
import test from "node:test";
import express, { type Request } from "express";
import { transformSync } from "esbuild";
import * as storage from "../lib/storage";
import * as localStorage from "../lib/storage/local-provider";
import * as fileAccess from "../lib/fileAccess";
import * as uploadSecurity from "../lib/uploadSecurity";

function isolatedModule(source: URL, dependencies: Record<string, unknown>) {
  const code = transformSync(readFileSync(source, "utf8"), {
    loader: "ts",
    format: "cjs",
  }).code;
  const module = { exports: {} as Record<string, unknown> };
  // Strict dependency isolation prevents tests from opening a DB or Supabase connection.
  new Function("require", "module", "exports", code)(
    (name: string) => {
      assert.ok(
        Object.hasOwn(dependencies, name),
        `Unexpected dependency: ${name}`,
      );
      return dependencies[name];
    },
    module,
    module.exports,
  );
  return module.exports;
}

test("upload/file routes enforce auth, metadata, containment and private caching without external services", async (t) => {
  const names = [
    "NODE_ENV",
    "STORAGE_PROVIDER",
    "PRIVATE_STORAGE_DIR",
    "LOCAL_STORAGE_DIR",
    "LOCAL_STORAGE_PUBLIC_PATH",
  ];
  const original = names.map((name) => process.env[name]);
  const temp = await mkdtemp(path.join(os.tmpdir(), "hub-route-private-"));
  const root = path.join(temp, "private");
  process.env.NODE_ENV = "production";
  process.env.STORAGE_PROVIDER = "filesystem";
  process.env.PRIVATE_STORAGE_DIR = root;
  process.env.LOCAL_STORAGE_DIR = path.join(temp, "wrong-root");
  process.env.LOCAL_STORAGE_PUBLIC_PATH = "https://public.invalid";
  storage.resetStorageProvider();
  t.after(async () => {
    storage.resetStorageProvider();
    names.forEach((name, index) => {
      if (original[index] === undefined) delete process.env[name];
      else process.env[name] = original[index];
    });
    await rm(temp, { recursive: true, force: true });
  });

  type RecordRow = Record<string, unknown>;
  let upload: RecordRow | null = null;
  let resource: RecordRow | null = null;
  let article: RecordRow | null = null;
  let articleReads = 0;
  let reads = 0;
  let users = 0;
  const uploadTable = { fileUrl: "uploads.fileUrl" };
  const resourceTable = { fileUrl: "resources.fileUrl" };
  const articleTable = {
    sourceKey: "kbArticles.sourceKey",
    status: "kbArticles.status",
  };
  const requireAuth = isolatedModule(
    new URL("../middlewares/requireAuth.ts", import.meta.url),
    {
      "../middlewares/supabaseAuth": {
        getAuth: (req: Request) => ({
          userId: req.headers["x-test-auth"] ? "test-user" : null,
        }),
      },
    },
  );
  const dependencies = {
    express: { Router: express.Router },
    "node:stream/promises": streams,
    "drizzle-orm": { eq: (_column: unknown, value: unknown) => value },
    "@workspace/db": {
      uploads: uploadTable,
      resources: resourceTable,
      kbArticles: articleTable,
      db: {
        select: () => ({
          from: (table: unknown) => ({
            where: async (url: string) => {
              reads++;
              if (table === articleTable) {
                articleReads++;
                return article?.sourceKey === url ? [article] : [];
              }
              const row = table === uploadTable ? upload : resource;
              return row?.fileUrl === url || row?.id === url ? [row] : [];
            },
          }),
        }),
        update: (table: unknown) => ({ set: (updates: RecordRow) => ({ where: () => ({ returning: async () => {
          const row = table === uploadTable ? upload : resource;
          if (!row) return [];
          Object.assign(row, updates);
          return [row];
        } }) }) }),
      },
    },
    "../middlewares/requireAuth": requireAuth,
    "../lib/userSync": {
      getOrCreateUser: async (req: Request) => {
        users++;
        const role = req.headers["x-test-role"];
        return role && role !== "missing" ? { id: "test-user", role } : null;
      },
    },
    "../lib/storage": storage,
    "../lib/storage/local-provider": localStorage,
    "../lib/fileAccess": fileAccess,
    "../lib/uploadSecurity": uploadSecurity,
  };
  const routes = isolatedModule(new URL("./uploads.ts", import.meta.url), dependencies);
  const resourceRoutes = isolatedModule(new URL("./resources.ts", import.meta.url), {
    express: dependencies.express,
    "drizzle-orm": { ...dependencies["drizzle-orm"], ilike: () => {}, and: () => {} },
    "@workspace/db": dependencies["@workspace/db"],
    "../middlewares/requireAuth": requireAuth,
    "../lib/userSync": dependencies["../lib/userSync"],
    "./uploads": routes,
  });
  const app = express();
  app.use(express.json({ limit: "25mb" }));
  app.use("/api", routes.default as express.Router);
  app.use("/api", resourceRoutes.default as express.Router);
  const server = app.listen(0, "127.0.0.1");
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = (role = "client") => ({
    "x-test-auth": "authenticated",
    "x-test-role": role,
  });
  const request = async (url: string, init?: RequestInit) => {
    const response = await fetch(`${base}${url}`, init);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    return response;
  };
  const pdf = Buffer.from("%PDF-1.7\nprivate content");
  const uploadBody = {
    fileName: "Guide.pdf",
    mimeType: "application/pdf",
    dataBase64: pdf.toString("base64"),
    folder: "library",
  };
  const post = (role?: string) =>
    request("/api/admin/uploads/file", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(role ? headers(role) : {}),
      },
      body: JSON.stringify(uploadBody),
    });

  assert.equal((await post()).status, 401);
  assert.equal((await post("client")).status, 403);
  const created = await post("admin");
  assert.equal(created.status, 201);
  const result = (await created.json()) as {
    url: string;
    key: string;
    provider: string;
  };
  assert.equal(result.provider, "filesystem");
  assert.match(result.url, /^\/api\/files\/library\//);

  const before = [reads, users];
  assert.equal((await request(result.url)).status, 401);
  assert.deepEqual(
    [reads, users],
    before,
    "anonymous requests stop before user sync or metadata",
  );
  assert.equal(
    (await request(result.url, { headers: headers("missing") })).status,
    401,
  );
  assert.equal(reads, before[0]);
  assert.equal(
    (await request(result.url, { headers: headers() })).status,
    404,
    "bytes alone do not authorize download",
  );
  upload = {
    fileUrl: result.url,
    visibility: "client_visible",
    status: "ready",
    fileName: "Guide.pdf",
    mimeType: "application/pdf",
  };
  const allowed = await request(result.url, { headers: headers() });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("x-content-type-options"), "nosniff");
  assert.match(allowed.headers.get("content-disposition")!, /^inline;/);
  assert.deepEqual(Buffer.from(await allowed.arrayBuffer()), pdf);
  for (const field of [
    "relatedCourseId",
    "relatedLessonId",
    "relatedProduct",
  ]) {
    upload[field] = "scope";
    assert.equal(
      (await request(result.url, { headers: headers() })).status,
      403,
    );
    const admin = await request(result.url, { headers: headers("admin") });
    assert.equal(admin.status, 200);
    await admin.arrayBuffer();
    delete upload[field];
  }
  for (const visibility of ["admin_only", "ai_only"]) {
    upload.visibility = visibility;
    assert.equal(
      (await request(result.url, { headers: headers() })).status,
      403,
    );
  }
  upload.visibility = "public_resource";
  assert.equal(
    (await request(result.url)).status,
    401,
    "public-resource still requires auth",
  );
  upload.status = "processing";
  assert.equal(
    (await request(result.url, { headers: headers("admin") })).status,
    403,
  );
  upload = null;
  resource = { fileUrl: result.url, title: "Guide", status: "draft" };
  assert.equal((await request(result.url, { headers: headers() })).status, 403);
  resource.status = "published";
  const published = await request(result.url, { headers: headers() });
  assert.equal(published.status, 200);
  await published.arrayBuffer();
  resource = null;

  assert.equal(
    articleReads,
    0,
    "regular uploads/resources do not query KB publication",
  );
  await t.test(
    "imported PDF copied URLs track canonical article and resource publication",
    async () => {
      const prefix = "corrected-2026-09-10";
      const key = `${prefix}/${"a".repeat(64)}.pdf`;
      const url = `/api/files/${key}`;
      await mkdir(path.join(root, prefix), { mode: 0o700 });
      await writeFile(path.join(root, key), pdf, { mode: 0o600 });
      const sourceKey = "halolight:corrected-content:fr:guide-ultime";
      const description = `[sourceKey=${sourceKey}] revision=2026-09-10 sha256=${"a".repeat(64)}`;
      upload = {
        fileUrl: url,
        visibility: "client_visible",
        status: "ready",
        description,
        mimeType: "application/pdf",
      };
      resource = { fileUrl: url, status: "published", description };
      article = { sourceKey, status: "published" };
      const get = (role = "client") => request(url, { headers: headers(role) });
      const consume = async (response: globalThis.Response, status: number) => {
        assert.equal(response.status, status);
        if (status === 200)
          assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
        else await response.arrayBuffer();
      };
      await consume(await get(), 200);
      for (const status of ["draft", "archived"]) {
        article.status = status;
        await consume(await get(), 403);
        await consume(await get("coach"), 403);
        await consume(await get("admin"), 200);
      }
      article = null;
      await consume(await get(), 403);
      await consume(await get("admin"), 200);
      article = {
        sourceKey: "halolight:corrected-content:fr:other-guide",
        status: "published",
      };
      await consume(await get(), 403);
      article = { sourceKey, status: "published" };
      await consume(await get(), 200);
      resource.status = "draft";
      await consume(await get(), 403);
      await consume(await get("admin"), 200);
      resource = null;
      await consume(await get(), 403);
      await consume(await get("admin"), 200);
      resource = {
        fileUrl: url,
        status: "published",
        description: "[sourceKey=halolight:corrected-content:fr:other-guide]",
      };
      await consume(await get(), 403);
      resource.description = description;
      for (const marker of [
        null,
        "",
        "[sourceKey=other:guide]",
        `${description} [sourceKey=${sourceKey}]`,
      ]) {
        upload.description = marker;
        await consume(await get(), 403);
        await consume(await get("admin"), 200);
      }
      upload = null;
      await consume(await get(), 404);
      await consume(await get("admin"), 200);
      // A trusted import marker continues to gate a legacy/moved internal URL.
      upload = {
        fileUrl: result.url,
        visibility: "client_visible",
        status: "ready",
        description,
      };
      article = null;
      await consume(await request(result.url, { headers: headers() }), 403);
      upload = null;
      resource = null;
      article = null;
    },
  );

  await t.test("original PDF exact hash owner, anonymous denial and admin inspection", async () => {
    const hash = "b".repeat(64);
    const key = `original-2026-09-10/${hash}.pdf`;
    const url = `/api/files/${key}`;
    const sourceKey = "halolight:corrected-content:fr:guide-ultime";
    const description = `[sourceKey=${sourceKey}] revision=2026-09-10 sha256=${hash}`;
    await mkdir(path.join(root, "original-2026-09-10"), { mode: 0o700 });
    await writeFile(path.join(root, key), pdf, { mode: 0o600 });
    upload = { id: "original-upload", fileUrl: url, description, visibility: "client_visible", status: "ready", mimeType: "application/pdf", fileSize: pdf.length };
    resource = { id: "original-resource", fileUrl: url, description, status: "published" };
    article = { sourceKey, sourceHash: hash, status: "published" };
    const download = async (role?: string) => {
      const response = await request(url, role ? { headers: headers(role) } : undefined);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (response.status === 200) assert.deepEqual(bytes, pdf);
      return response.status;
    };
    assert.equal(await download(), 401);
    assert.equal(await download("client"), 200);
    article.sourceHash = "c".repeat(64);
    assert.equal(await download("client"), 403);
    assert.equal(await download("admin"), 200);
    article.sourceHash = hash;
    upload.relatedProduct = "scoped-owner";
    assert.equal(await download("client"), 403);
    assert.equal(await download("admin"), 200);
    delete upload.relatedProduct;
    article.status = "archived";
    assert.equal(await download("client"), 403);
    assert.equal(await download("admin"), 200);
    article.status = "published";

    for (const [kind, row] of [["uploads", upload], ["resources", resource]] as const) {
      const put = (body: RecordRow, role?: string) => fetch(`${base}/api/admin/${kind}/${row.id}`, {
        method: "PUT", headers: { "content-type": "application/json", ...(role ? headers(role) : {}) }, body: JSON.stringify(body),
      });
      assert.equal((await put({ description: "" })).status, 401);
      assert.equal((await put({ description: "" }, "client")).status, 403);
      for (const descriptionValue of [null, "", "Editable description"]) {
        const response = await put({ description: descriptionValue }, "admin");
        assert.equal(response.status, 200);
        assert.ok(String(row.description).startsWith(description));
        assert.equal(await download("client"), 200);
      }
      for (const body of [
        { fileUrl: "/api/files/original-2026-09-10/other.pdf" },
        { fileUrl: "https://public.invalid/original.pdf" },
        { description: "[sourceKey=halolight:corrected-content:fr:other]" },
      ]) {
        const before = { ...row };
        assert.equal((await put(body, "admin")).status, 400);
        assert.deepEqual(row, before);
      }
      assert.equal((await put({ fileUrl: url }, "admin")).status, 200);
    }
    upload = null;
    assert.equal(await download("client"), 404);
    assert.equal(await download("admin"), 200);
    resource = null;
    article = null;
  });

  await mkdir(path.join(temp, "outside"));
  await writeFile(path.join(temp, "outside", "secret.pdf"), "do not expose");
  await symlink(path.join(temp, "outside"), path.join(root, "escape"));
  await symlink(
    path.join(temp, "outside", "secret.pdf"),
    path.join(root, "linked.pdf"),
  );
  for (const key of [
    "escape/secret.pdf",
    "linked.pdf",
    "missing.pdf",
    "%2e%2e%2foutside%2fsecret.pdf",
    "%252e%252e%252foutside%252fsecret.pdf",
  ]) {
    const url = `/api/files/${key}`;
    upload = { fileUrl: url, visibility: "client_visible", status: "ready" };
    const denied = await request(url, { headers: headers() });
    assert.equal(denied.status, 404);
    assert.deepEqual(await denied.json(), { error: "File not found" });
  }
  process.env.PRIVATE_STORAGE_DIR = "invalid-relative-path";
  storage.resetStorageProvider();
  const unavailable = await post("admin");
  assert.equal(unavailable.status, 400);
  assert.deepEqual(await unavailable.json(), {
    error: "Direct file upload is not available",
  });
});
