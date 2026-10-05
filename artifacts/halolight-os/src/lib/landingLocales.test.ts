import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const LANGUAGES = ["en", "fr", "es", "de", "it", "pl", "pt", "nl"];

function flatten(node: unknown, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object") for (const [k, v] of flatten(value, path)) out.set(k, v);
      else out.set(path, value);
    }
  }
  return out;
}

test("landing v2 keys have the same nonempty translations in eight locales", () => {
  const sets: string[][] = [];
  for (const language of LANGUAGES) {
    const locale = JSON.parse(readFileSync(new URL(`../i18n/locales/${language}.json`, import.meta.url), "utf8"));
    const keys = flatten(locale.landing?.v2);
    assert.ok(keys.size > 100, `${language}: landing.v2 namespace exists`);
    for (const [key, value] of keys) {
      assert.equal(typeof value, "string", `${language}: landing.v2.${key}`);
      assert.ok((value as string).trim(), `${language}: landing.v2.${key} is not empty`);
    }
    sets.push([...keys.keys()].sort());
  }
  for (const set of sets) assert.deepEqual(set, sets[0]);
});

test("every literal landing key used by the landing components exists in English", () => {
  const files = ["../pages/Landing.tsx", "../components/landing/HubHero.tsx", "../components/landing/ProductTour.tsx", "../components/landing/FeatureBento.tsx", "../components/landing/AiAssistantSection.tsx"];
  const en = flatten(JSON.parse(readFileSync(new URL("../i18n/locales/en.json", import.meta.url), "utf8")));
  const missing: string[] = [];
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const [, key] of source.matchAll(/\bt\(\s*"(landing\.[a-z0-9_.]+)"/g)) if (!en.has(key)) missing.push(`${file}: ${key}`);
    for (const [, key] of source.matchAll(/\bm\(\s*"([a-z0-9_]+)"/g)) if (!en.has(`landing.v2.mock.${key}`)) missing.push(`${file}: mock.${key}`);
    for (const [, key] of source.matchAll(/\bb\(\s*"([a-z0-9_]+)"/g)) if (!en.has(`landing.v2.bento.${key}`)) missing.push(`${file}: bento.${key}`);
  }
  assert.deepEqual(missing, []);
});
