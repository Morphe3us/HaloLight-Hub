import test from "node:test";
import assert from "node:assert/strict";
import {
  detectModuleLang,
  filterModulesForLang,
  normalizeAcademyLang,
  resolveLocale,
  sortAcademyLessons,
} from "./academyLanguage";

test("normalizeAcademyLang accepts app languages and falls back to English", () => {
  assert.equal(normalizeAcademyLang("fr-CA"), "fr");
  assert.equal(normalizeAcademyLang("pt"), "pt");
  assert.equal(normalizeAcademyLang("jp"), "en");
  assert.equal(normalizeAcademyLang(undefined), "en");
  assert.equal(normalizeAcademyLang(" FR-ca "), "fr");
  assert.equal(normalizeAcademyLang(["fr", "es"]), "en");
});

test("detectModuleLang reads native and English language-track titles", () => {
  assert.equal(detectModuleLang({ en: "French Language" }), "fr");
  assert.equal(detectModuleLang({ fr: "Français" }), "fr");
  assert.equal(detectModuleLang({ es: "Español" }), "es");
  assert.equal(detectModuleLang({ en: "Foundations" }), null);
});

test("filterModulesForLang uses requested language with English fallback", () => {
  const mods = [
    { id: "en", title: { en: "English Language" } },
    { id: "fr", title: { fr: "Français" } },
  ];

  assert.deepEqual(
    filterModulesForLang(mods, "fr").map((m) => m.id),
    ["fr"],
  );
  assert.deepEqual(
    filterModulesForLang(mods, "de").map((m) => m.id),
    ["en"],
  );
});

test("resolveLocale tolerates missing and malformed locale maps", () => {
  assert.equal(resolveLocale("fr", { en: "Hello", fr: "Bonjour" }), "Bonjour");
  assert.equal(resolveLocale("de", { en: "Hello", fr: "Bonjour" }), "Hello");
  assert.equal(resolveLocale("de", { fr: "Bonjour" }), "Bonjour");
  assert.equal(resolveLocale("de", null), "");
});

test("language filtering never falls back to unrelated language tracks", () => {
  const modules = [
    { id: "fr", title: { en: "French Language" } },
    { id: "es", title: { en: "Spanish Language" } },
  ];
  assert.deepEqual(filterModulesForLang(modules, "de"), []);
  assert.deepEqual(filterModulesForLang(modules, "en"), []);
  assert.deepEqual(filterModulesForLang(modules, "invalid"), []);
});

test("all supported languages select their native track without mutating the catalog", () => {
  const modules = [
    { id: "en", title: { en: "English" } },
    { id: "fr", title: { fr: "Français" } },
    { id: "es", title: { es: "Español" } },
    { id: "de", title: { de: "Deutsch" } },
    { id: "it", title: { it: "Italiano" } },
    { id: "pt", title: { pt: "Português" } },
    { id: "pl", title: { pl: "Polski" } },
    { id: "nl", title: { nl: "Nederlands" } },
  ];
  const original = structuredClone(modules);
  for (const { id } of modules) {
    assert.deepEqual(
      filterModulesForLang(modules, id).map((module) => module.id),
      [id],
    );
  }
  assert.deepEqual(modules, original);
});

test("ordinary modules remain visible in courses without language tracks", () => {
  const modules = [
    { title: { en: "Foundations" } },
    { title: { en: "Lighting" } },
  ];
  assert.deepEqual(filterModulesForLang(modules, "fr"), modules);
  assert.deepEqual(filterModulesForLang([], "fr"), []);
});

test("module language detection ignores malformed values and inherited dictionary keys", () => {
  for (const value of [
    null,
    [],
    "English",
    { en: 1 },
    { en: "constructor" },
    { en: "__proto__" },
  ]) {
    assert.equal(detectModuleLang(value), null);
  }
  assert.equal(detectModuleLang({ en: null, fr: " French Language " }), "fr");
});

test("locale fallback skips empty or whitespace-only translations", () => {
  assert.equal(resolveLocale("fr", { fr: "", en: "Hello" }), "Hello");
  assert.equal(resolveLocale("fr", { fr: "  ", en: "Hello" }), "Hello");
  assert.equal(resolveLocale("de", { en: "", fr: "Bonjour" }), "Bonjour");
  assert.equal(resolveLocale("fr", { fr: "", en: "  " }), "");
  assert.equal(resolveLocale("fr", { fr: 4, en: false, de: "Hallo" }), "Hallo");
  assert.equal(resolveLocale("fr", ["Hello"]), "");
});

test("lesson ordering keeps intro first, numeric chapters in order, and conclusion last", () => {
  const rows = [
    { title: { en: "Conclusion" }, order: 0 },
    { title: { en: "Video 2.1" }, order: 1 },
    { title: { en: "Video 1.10" }, order: 2 },
    { title: { en: "Introduction" }, order: 3 },
    { title: { en: "Video 1.2" }, order: 4 },
  ];
  const original = structuredClone(rows);
  assert.deepEqual(
    sortAcademyLessons(rows).map((row) => row.title.en),
    ["Introduction", "Video 1.2", "Video 1.10", "Video 2.1", "Conclusion"],
  );
  assert.deepEqual(rows, original);
  assert.deepEqual(
    sortAcademyLessons([
      { title: null, order: 3 },
      { title: { en: "Lighting" }, order: 1 },
    ]).map((row) => row.order),
    [1, 3],
  );
});
