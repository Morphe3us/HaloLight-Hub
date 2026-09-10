import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file: URL, dependencies: Record<string, unknown>) {
  const module = { exports: {} as Record<string, any> };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  new Function("require", "module", "exports", code)((name: string) => {
    if (name === "react/jsx-runtime") return require(name);
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}

test("consent UI starts unchecked, submits independent false choices, and never fabricates legal links", () => {
  let index = 0;
  const state: any[] = [];
  const submitted: any[] = [];
  const Checkbox = () => null;
  const Button = () => null;
  const form = load(new URL("../components/ConsentGate.tsx", import.meta.url), {
    react: { useEffect() {}, useState(value: unknown) {
      const key = index++; if (!(key in state)) state[key] = value;
      return [state[key], (next: unknown) => { state[key] = typeof next === "function" ? next(state[key]) : next; }];
    } },
    "@clerk/react": {}, "@workspace/api-client-react": {},
    "@tanstack/react-query": { useQueryClient: () => ({}), useMutation: () => ({ mutate: (body: unknown) => submitted.push(body), isPending: false, isError: false }) },
    "react-i18next": { useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }) },
    "@/components/ui/button": { Button }, "@/components/ui/checkbox": { Checkbox },
    "@/lib/userCompliance": { saveConsent() {} },
  });
  const documents = { termsVersion: "fixture-terms", privacyVersion: "fixture-privacy", termsUrl: "https://approved.example.test/terms", privacyUrl: "https://approved.example.test/privacy" };
  const render = (configured = true) => { index = 0; return form.ConsentForm({ userId: "a", status: { configured, required: true, documents: configured ? documents : null, acceptance: null } }); };
  const elements = (node: any): any[] => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(elements) : [node, ...elements(node.props?.children)];
  let tree = render();
  assert.equal(elements(tree).filter((node) => node.type === Checkbox).length, 4);
  assert.ok(elements(tree).filter((node) => node.type === Checkbox).every((node) => node.props.checked === false));
  assert.equal(elements(tree).find((node) => node.type === Button).props.disabled, true);
  tree.props.onSubmit({ preventDefault() {} }); assert.equal(submitted.length, 0);
  elements(tree).find((node) => node.type === Checkbox).props.onCheckedChange(true);
  tree = render(); tree.props.onSubmit({ preventDefault() {} });
  assert.deepEqual(submitted[0], { accepted: true, ...documents, marketing: false, analytics: false, aiImprovement: false });
  assert.deepEqual(elements(tree).filter((node) => node.type === "a").map((node) => node.props.href), [documents.termsUrl, documents.privacyUrl]);
  assert.equal(elements(render(false)).filter((node) => node.type === "a" || node.type === Checkbox).length, 0);
});

test("dashboard transport scopes keys to user, patches one widget, and never reads shared browser storage", async () => {
  const requests: any[] = [];
  const helpers = load(new URL("./userCompliance.ts", import.meta.url), {
    "@workspace/api-client-react": { customFetch: async (...args: unknown[]) => { requests.push(args); return { widgets: { notifications: false } }; } },
  });
  assert.notDeepEqual(helpers.dashboardPreferencesKey("a"), helpers.dashboardPreferencesKey("b"));
  assert.notDeepEqual(helpers.consentKey("a"), helpers.consentKey("b"));
  const controller = new AbortController();
  assert.equal((await helpers.getDashboardPreferences(controller.signal)).notifications, false);
  assert.equal(requests[0][1].signal, controller.signal);
  await helpers.saveDashboardPreference("onboarding", false);
  assert.deepEqual(JSON.parse(requests[1][1].body), { widgets: { onboarding: false } });
  const dashboard = readFileSync(new URL("../pages/Dashboard.tsx", import.meta.url), "utf8");
  assert.ok(!dashboard.includes("localStorage"));
  assert.ok(dashboard.includes("dashboardPreferencesKey(user?.id"));
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  assert.match(app, /<LocalUserGate>\s*<ConsentGate>\s*<AppShell>/);
});
