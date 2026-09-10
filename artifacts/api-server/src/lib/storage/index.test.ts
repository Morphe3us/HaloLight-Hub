import test from "node:test";
import assert from "node:assert/strict";
import { getStorageProvider, resetStorageProvider } from "./index";
import path from "node:path";
import os from "node:os";

const originalNodeEnv = process.env.NODE_ENV;
const originalStorageProvider = process.env.STORAGE_PROVIDER;
const originalPrivateStorageDir = process.env.PRIVATE_STORAGE_DIR;

test.afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }

  if (originalStorageProvider === undefined) {
    delete process.env.STORAGE_PROVIDER;
  } else {
    process.env.STORAGE_PROVIDER = originalStorageProvider;
  }

  resetStorageProvider();
  if (originalPrivateStorageDir === undefined)
    delete process.env.PRIVATE_STORAGE_DIR;
  else process.env.PRIVATE_STORAGE_DIR = originalPrivateStorageDir;
});

test("getStorageProvider rejects local storage unless development or test is explicit", () => {
  delete process.env.NODE_ENV;
  delete process.env.STORAGE_PROVIDER;
  resetStorageProvider();

  assert.throws(
    () => getStorageProvider(),
    /Local file storage is only allowed/,
  );

  process.env.NODE_ENV = "production";
  resetStorageProvider();
  assert.throws(
    () => getStorageProvider(),
    /Local file storage is only allowed/,
  );
});

test("getStorageProvider allows URL-only storage in production", () => {
  process.env.NODE_ENV = "production";
  process.env.STORAGE_PROVIDER = "url";
  resetStorageProvider();

  const provider = getStorageProvider();
  assert.equal(provider.name, "url-only");
});

test("filesystem is explicit in production and requires a private absolute root", () => {
  process.env.NODE_ENV = "production";
  process.env.STORAGE_PROVIDER = "filesystem";
  delete process.env.PRIVATE_STORAGE_DIR;
  assert.throws(
    () => getStorageProvider(),
    /Private file storage is unavailable/,
  );
  process.env.PRIVATE_STORAGE_DIR = "relative";
  assert.throws(() => getStorageProvider());
  process.env.PRIVATE_STORAGE_DIR = path.join(
    os.tmpdir(),
    "hub-configured-private",
  );
  assert.equal(getStorageProvider().name, "filesystem");
});

test("a private root does not implicitly enable production filesystem or local storage", () => {
  process.env.NODE_ENV = "production";
  process.env.PRIVATE_STORAGE_DIR = path.join(
    os.tmpdir(),
    "hub-configured-private",
  );
  for (const selector of [undefined, "local"]) {
    resetStorageProvider();
    if (selector === undefined) delete process.env.STORAGE_PROVIDER;
    else process.env.STORAGE_PROVIDER = selector;
    assert.throws(
      () => getStorageProvider(),
      /Local file storage is only allowed/,
    );
  }
});
