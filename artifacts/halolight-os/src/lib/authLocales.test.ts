import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("all auth, access approval and invitation keys have nonempty translations in eight locales", () => {
  const sources = ["../pages/Auth.tsx", "../components/InviteUserButton.tsx", "../components/AccountAccessGate.tsx", "../pages/Admin.tsx"]
    .map(path => readFileSync(new URL(path, import.meta.url), "utf8"))
    .join("\n");
  const keys = new Set([
    ...Array.from(sources.matchAll(/\btr\(\s*"([a-z_]+)"/g), match => match[1]),
    ...Array.from(sources.matchAll(/\bt\(\s*"auth\.([a-z_]+)"/g), match => match[1]),
  ]);
  assert.ok(keys.size >= 25, "auth screen and invitation keys are discovered");
  for (const key of ["pending_title", "review_time_max", "approve_access", "reject_access", "filter_all_access"])
    assert.ok(keys.has(key), `access flow key ${key} is discovered`);
  const namespaces: string[][] = [];
  for (const language of ["en", "fr", "es", "de", "it", "pl", "pt", "nl"]) {
    const locale = JSON.parse(readFileSync(new URL(`../i18n/locales/${language}.json`, import.meta.url), "utf8"));
    assert.ok(locale.auth, `${language}: auth namespace exists`);
    for (const key of keys) {
      assert.equal(typeof locale.auth[key], "string", `${language}: auth.${key}`);
      assert.ok(locale.auth[key].trim(), `${language}: auth.${key} is not empty`);
    }
    assert.equal(typeof locale.settings.email_managed, "string");
    assert.ok(locale.settings.email_managed.trim());
    namespaces.push(Object.keys(locale.auth).sort());
  }
  for (const namespace of namespaces) assert.deepEqual(namespace, namespaces[0]);
});
