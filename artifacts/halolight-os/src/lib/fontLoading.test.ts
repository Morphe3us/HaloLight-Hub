import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("fonts are discovered once in HTML without waiting for the application CSS", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
  const stylesheets = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)];
  assert.equal(stylesheets.length, 1);
  assert.match(stylesheets[0][0], /Plus\+Jakarta\+Sans:ital,wght@0,200\.\.800;1,200\.\.800/);
  assert.match(stylesheets[0][0], /family=Inter:wght@300;400;500;600;700/);
  assert.match(stylesheets[0][0], /display=swap/);
  assert.doesNotMatch(css, /@import\s+url/);
});
