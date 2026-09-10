import assert from "node:assert/strict";
import {
  link,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { FilesystemStorageProvider } from "./filesystem-provider";

test("filesystem requires an explicit absolute root outside application and web roots", async (t) => {
  const original = process.env.PRIVATE_STORAGE_DIR;
  const frontend = process.env.FRONTEND_DIST_PATH;
  t.after(() => {
    if (original === undefined) delete process.env.PRIVATE_STORAGE_DIR;
    else process.env.PRIVATE_STORAGE_DIR = original;
    if (frontend === undefined) delete process.env.FRONTEND_DIST_PATH;
    else process.env.FRONTEND_DIST_PATH = frontend;
  });
  delete process.env.PRIVATE_STORAGE_DIR;
  for (const root of [
    undefined,
    "",
    "relative/files",
    process.cwd(),
    path.join(process.cwd(), "private"),
    path.dirname(process.cwd()),
  ]) {
    assert.throws(
      () => new FilesystemStorageProvider(root),
      /Private file storage is unavailable/,
    );
  }
  const temp = await mkdtemp(path.join(os.tmpdir(), "hub-private-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  process.env.FRONTEND_DIST_PATH = path.join(temp, "public");
  assert.throws(
    () => new FilesystemStorageProvider(path.join(temp, "public", "files")),
  );
  await symlink(process.cwd(), path.join(temp, "alias"));
  const provider = new FilesystemStorageProvider(
    path.join(temp, "alias", "not-created-private"),
  );
  await assert.rejects(
    provider.upload(Buffer.from("test"), {}),
    /^Error: Private file storage is unavailable$/,
  );
});

test("filesystem persists private bytes with restrictive modes and fixed authenticated URLs", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "hub-private-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const override = process.env.LOCAL_STORAGE_PUBLIC_PATH;
  process.env.LOCAL_STORAGE_PUBLIC_PATH = "https://public.invalid/files";
  t.after(() => {
    if (override === undefined) delete process.env.LOCAL_STORAGE_PUBLIC_PATH;
    else process.env.LOCAL_STORAGE_PUBLIC_PATH = override;
  });
  const root = path.join(temp, "private");
  const provider = new FilesystemStorageProvider(root);
  const bytes = Buffer.from("%PDF-1.7\nprivate document");
  const result = await provider.upload(bytes, {
    filename: "Private Guide.pdf",
    contentType: "application/pdf",
    folder: "library/en",
    isPublic: true,
  });
  assert.equal(result.provider, "filesystem");
  assert.equal(result.size, bytes.length);
  assert.equal(result.contentType, "application/pdf");
  assert.match(result.url, /^\/api\/files\/library\/en\//);
  assert.deepEqual(await readFile(path.join(root, result.key)), bytes);
  for (const directory of [
    root,
    path.join(root, "library"),
    path.join(root, "library/en"),
    path.dirname(path.join(root, result.key)),
  ]) {
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
  }
  assert.equal((await stat(path.join(root, result.key))).mode & 0o777, 0o600);
  const restarted = new FilesystemStorageProvider(root);
  const stream = await restarted.openReadStream(result.key);
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  assert.deepEqual(Buffer.concat(chunks), bytes);
  await assert.rejects(provider.getPresignedUrl({ key: result.key }));
  assert.deepEqual(await restarted.delete(result.key), {
    success: true,
    key: result.key,
  });
  await assert.rejects(restarted.openReadStream(result.key));
});

test("filesystem denies traversal, symlink roots/directories/files, and exposes no server paths", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "hub-private-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, "private");
  const outside = path.join(temp, "outside");
  await mkdir(root);
  await mkdir(outside);
  await writeFile(path.join(outside, "secret.pdf"), "untouched");
  const provider = new FilesystemStorageProvider(root);
  for (const key of [
    "../outside/secret.pdf",
    "/etc/passwd",
    "a/../../secret.pdf",
    "a//b",
    "a/./b",
    "a\\b",
    "a\0b",
    "%2e%2e/secret.pdf",
    "",
  ]) {
    await assert.rejects(
      provider.openReadStream(key),
      /^Error: Private file storage is unavailable$/,
    );
    await assert.rejects(
      provider.delete(key),
      /^Error: Private file storage is unavailable$/,
    );
    assert.throws(() => provider.getPublicUrl(key));
  }
  await symlink(outside, path.join(root, "escape"));
  await symlink(
    path.join(outside, "secret.pdf"),
    path.join(root, "linked.pdf"),
  );
  await link(
    path.join(outside, "secret.pdf"),
    path.join(root, "hardlinked.pdf"),
  );
  await assert.rejects(provider.openReadStream("hardlinked.pdf"));
  await mkdir(path.join(root, "real-directory"));
  await writeFile(path.join(root, "real-directory", "inside.pdf"), "inside");
  await symlink(
    path.join(root, "real-directory"),
    path.join(root, "internal-alias"),
  );
  await assert.rejects(provider.openReadStream("internal-alias/inside.pdf"));
  for (const key of ["escape/secret.pdf", "linked.pdf"]) {
    await assert.rejects(
      provider.openReadStream(key),
      /^Error: Private file storage is unavailable$/,
    );
    await assert.rejects(
      provider.delete(key),
      /^Error: Private file storage is unavailable$/,
    );
  }
  await assert.rejects(
    provider.upload(Buffer.from("overwrite"), { folder: "escape" }),
  );
  await assert.rejects(
    provider.upload(Buffer.from("overwrite"), { folder: "../outside" }),
  );
  await symlink(root, path.join(temp, "linked-root"));
  await assert.rejects(
    new FilesystemStorageProvider(path.join(temp, "linked-root")).upload(
      Buffer.from("test"),
      {},
    ),
  );
  assert.equal(
    await readFile(path.join(outside, "secret.pdf"), "utf8"),
    "untouched",
  );
});
