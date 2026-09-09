import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalStorageProvider } from "./local-provider";

test("LocalStorageProvider writes files and returns a public API URL", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "halolight-storage-"));
  try {
    const provider = new LocalStorageProvider(root);
    const result = await provider.upload(Buffer.from("hello"), {
      filename: "Welcome File.pdf",
      contentType: "application/pdf",
      folder: "resources",
    });

    assert.equal(result.provider, "local");
    assert.equal(result.size, 5);
    assert.equal(result.contentType, "application/pdf");
    assert.match(result.key, /^resources\/\d{4}-\d{2}-\d{2}\/welcome-file-/);
    assert.match(result.url, /^\/api\/files\/resources\//);

    const stored = await readFile(path.join(root, result.key), "utf8");
    assert.equal(stored, "hello");

    const deleted = await provider.delete(result.key);
    assert.deepEqual(deleted, { success: true, key: result.key });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("LocalStorageProvider rejects storage keys outside the root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "halolight-storage-"));
  try {
    const provider = new LocalStorageProvider(root);
    await assert.rejects(
      () => provider.delete("../outside.txt"),
      /Invalid storage key/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
