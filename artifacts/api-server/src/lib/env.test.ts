import test from "node:test";
import assert from "node:assert/strict";
import { isExplicitDevelopment, isExplicitTest, parseBooleanEnv } from "./env";

test("parseBooleanEnv accepts explicit true values", () => {
  for (const value of ["1", "true", "TRUE", " yes ", "on"]) {
    assert.equal(parseBooleanEnv(value), true);
  }
});

test("parseBooleanEnv accepts explicit false values", () => {
  for (const value of ["0", "false", "FALSE", " no ", "off"]) {
    assert.equal(parseBooleanEnv(value), false);
  }
});

test("parseBooleanEnv returns null for unset or invalid values", () => {
  assert.equal(parseBooleanEnv(undefined), null);
  assert.equal(parseBooleanEnv(""), null);
  assert.equal(parseBooleanEnv("later"), null);
});

test("runtime helpers require exact development or test envs", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  try {
    delete process.env.NODE_ENV;
    assert.equal(isExplicitDevelopment(), false);
    assert.equal(isExplicitTest(), false);

    process.env.NODE_ENV = "production";
    assert.equal(isExplicitDevelopment(), false);
    assert.equal(isExplicitTest(), false);

    process.env.NODE_ENV = "development";
    assert.equal(isExplicitDevelopment(), true);
    assert.equal(isExplicitTest(), false);

    process.env.NODE_ENV = "test";
    assert.equal(isExplicitDevelopment(), false);
    assert.equal(isExplicitTest(), true);
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }
});
