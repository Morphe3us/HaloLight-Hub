import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../pages/AdminSettings.tsx", import.meta.url), "utf8");

function fixture(path: string, query: Record<string, unknown> = {}) {
  let requests = 0;
  const code = ts.transpileModule(source.replace("import.meta.env.BASE_URL", '"/hub/"'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as { default: () => ReturnType<typeof createElement> } };
  const deps: Record<string, unknown> = {
    "react-i18next": { useTranslation: () => ({ t: (key: string) => key }) },
    wouter: { useLocation: () => [path], Link: "a" },
    "@workspace/api-client-react": {
      getGetOperationalReadinessQueryKey: () => ["/api/admin/operational-readiness"],
      useGetOperationalReadiness: () => { requests++; return { isLoading: false, isFetching: false, refetch() {}, ...query }; },
    },
    "lucide-react": { ArrowRight: () => null, RefreshCw: () => null },
    "@/components/ui/button": { Button: "button" },
    "./Settings": { NotificationPreferences: () => createElement("div", { "data-personal-preferences": true }) },
  };
  new Function("require", "module", "exports", code)((id: string) => deps[id] ?? require(id), module, module.exports);
  return { html: renderToStaticMarkup(createElement(module.exports.default)), requests };
}

test("branding uses bundled assets, immutable identity and owner-settings link without readiness fetch", () => {
  const { html, requests } = fixture("/admin/branding");
  assert.equal(requests, 0);
  assert.match(html, /admin_settings.deployment_branding/);
  assert.match(html, /\/hub\/logo-hub-light-orig.png/);
  assert.match(html, /\/hub\/logo-hub-dark-orig.png/);
  assert.match(html, /href="\/settings#company-logo"/);
  assert.doesNotMatch(html, /<input|<button|role="switch"/);
});

test("notifications mount existing personal preferences, not global configuration", () => {
  const { html, requests } = fixture("/admin/notifications");
  assert.equal(requests, 0);
  assert.match(html, /admin_settings.personal_notifications/);
  assert.match(html, /data-personal-preferences/);
  assert.doesNotMatch(html, /service-configuration/);
});

test("general renders only configuration statuses, never raw backend fields", () => {
  const { html, requests } = fixture("/admin/settings", { data: {
    configurationOnly: true, externalChecksPerformed: false,
    ai: { status: "demo" }, mail: { status: "disabled" }, legal: { status: "configured_unverified" },
    unexpectedSecret: "SHOULD_NOT_RENDER",
  } });
  assert.equal(requests, 1);
  for (const status of ["demo", "disabled", "configured_unverified"]) assert.match(html, new RegExp(`status_${status}`));
  assert.doesNotMatch(html, /SHOULD_NOT_RENDER|<input|role="switch"/);
});

test("loading, errors and malformed responses never claim configuration success", () => {
  assert.match(fixture("/admin/settings", { isLoading: true, isFetching: true }).html, /role="status"/);
  for (const query of [{ isError: true, error: new Error("secret") }, { data: {} }, { data: {
    configurationOnly: true, externalChecksPerformed: false,
    ai: { status: "ready" }, mail: { status: "disabled" }, legal: { status: "disabled" },
  } }]) {
    const { html } = fixture("/admin/settings", query);
    assert.match(html, /role="alert"/);
    assert.match(html, /<button/);
    assert.doesNotMatch(html, /secret|status_ready/);
  }
});
