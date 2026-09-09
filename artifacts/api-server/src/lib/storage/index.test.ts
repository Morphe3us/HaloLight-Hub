import test from "node:test";
import assert from "node:assert/strict";
import { getStorageProvider, resetStorageProvider } from "./index";

const originalNodeEnv = process.env.NODE_ENV;
const originalStorageProvider = process.env.STORAGE_PROVIDER;

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
