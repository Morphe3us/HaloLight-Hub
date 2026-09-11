import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../pages/AdminRoles.tsx", import.meta.url), "utf8");
function load() {
  const deps: Record<string, unknown> = {
    "react/jsx-runtime": require("react/jsx-runtime"),
    "react-i18next": { useTranslation: () => ({ t: (key: string) => key }) },
    wouter: { Link: ({ children, href }: any) => createElement("a", { href }, children) },
    "lucide-react": { Users: () => null },
    "@/components/ui/button": { Button: ({ children }: any) => children },
  };
  const module = { exports: {} as any };
  const compiled = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  new Function("require", "module", "exports", compiled)((name: string) => {
    assert.ok(Object.hasOwn(deps, name), `Unexpected dependency: ${name}`);
    return deps[name];
  }, module, module.exports);
  return module.exports;
}

test("fixed matrix preserves ownership even for admin and does not invent coach delegation", () => {
  const { permissionRows } = load();
  assert.deepEqual(permissionRows, [
    { key: "own_records", admin: "own", standard: "own" },
    { key: "sales_search", admin: "all", standard: "own" },
    { key: "support", admin: "all", standard: "own" },
    { key: "administration", admin: "allowed", standard: "denied" },
    { key: "academy", admin: "published", standard: "published" },
    { key: "knowledge", admin: "drafts", standard: "published" },
    { key: "downloads", admin: "ready", standard: "visible" },
    { key: "community", admin: "moderation", standard: "public_channels" },
  ]);
});

test("rendered table has four roles, row and column headers, caption and keyboard-scrollable region", () => {
  const page = load();
  const html = renderToStaticMarkup(createElement(page.default));
  assert.equal((html.match(/scope="col"/g) ?? []).length, 6);
  assert.equal((html.match(/scope="row"/g) ?? []).length, 8);
  for (const role of ["admin", "client", "coach", "sales_rep"]) assert.ok(html.includes(`admin.role_${role}`));
  assert.match(html, /role="region" aria-labelledby="permissions-caption" tabindex="0"/);
  assert.match(html, /<caption id="permissions-caption"/);
  assert.match(html, /overflow-x-auto/);
  assert.match(html, /min-w-\[860px\]/);
  assert.match(html, /break-words/);
  assert.ok(html.includes("admin_roles.conditions"));
  assert.ok(html.includes("admin_roles.no_delegation"));
});

test("page is informational with only the existing Users assignment link and no writes", () => {
  const html = renderToStaticMarkup(createElement(load().default));
  assert.match(html, /<a href="\/admin">nav.users<\/a>/);
  assert.equal((html.match(/<a /g) ?? []).length, 1);
  assert.doesNotMatch(html, /<input|<select|role="switch"|role="checkbox"|<form/);
  assert.doesNotMatch(source, /useMutation|mutate\(|fetch\(|onCheckedChange|onSubmit/);
});
