import assert from "node:assert/strict";
import test from "node:test";
import { kbLinkTarget } from "./kbLinks";
import { initialKbLanguage } from "./kbLanguage";

const origin = "https://hub.example";
test("KB protected links remain authenticated same-origin paths without token queries", () => {
  const expected = { href: "/api/files/kb/guide.pdf", authenticated: true };
  assert.deepEqual(kbLinkTarget(expected.href, origin), expected);
  assert.deepEqual(kbLinkTarget(`${origin}${expected.href}`, origin), expected);
  for (const href of ["javascript:alert(1)", "data:text/html,test", "//evil.example/api/files/a.pdf",
    "/api/files/a.pdf?token=secret", "/api/files/a.pdf#token", "https://evil.example/api/files/a.pdf",
    "/api/users", "/api/files/../../users", "https://user:pass@hub.example/api/files/a.pdf", "\\evil.example"])
    assert.equal(kbLinkTarget(href, origin), null, href);
});

test("KB ordinary external links never enter authenticated downloader", () => {
  assert.deepEqual(kbLinkTarget("https://example.org/manual", origin), { href: "https://example.org/manual", authenticated: false });
});

test("KB defaults to interface locale, preserves supported languages and uses explicit French fallback", () => {
  for (const locale of ["fr", "en", "de", "es", "it", "nl", "pl", "pt"]) assert.equal(initialKbLanguage(locale), locale);
  assert.equal(initialKbLanguage("pt-BR"), "pt");
  assert.equal(initialKbLanguage("en_US"), "en");
  assert.equal(initialKbLanguage("ja"), "fr");
  assert.equal(initialKbLanguage(), "fr");
});
