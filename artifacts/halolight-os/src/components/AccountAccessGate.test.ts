import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("./AccountAccessGate.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source.replaceAll("import.meta.env", "__env"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function nodes(node: any): any[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return node && typeof node === "object" ? [node, ...nodes(node.props?.children)] : [];
}
function text(node: any): string {
  if (Array.isArray(node)) return node.map(text).join(" ");
  return node && typeof node === "object" ? text(node.props?.children) : typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function harness(visual = false) {
  let index = 0;
  const states: any[] = [];
  let options: any;
  let refreshes = 0;
  let signouts = 0;
  const query: any = { data: { status: "pending", email: "purchase@example.invalid" }, isPending: false, isError: false, isFetching: false,
    refetch: async () => { refreshes++; } };
  const deps: Record<string, any> = {
    "react/jsx-runtime": require("react/jsx-runtime"),
    react: { useState: (initial: any) => { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], (v: any) => { states[i] = v; }]; } },
    "@workspace/api-client-react": { useGetMyAccess: (o: any) => { options = o; return query; } },
    "react-i18next": { useTranslation: () => ({ t: (key: string, o: any) => o?.defaultValue ?? key }) },
    "lucide-react": Object.fromEntries(["Clock", "ShieldCheck", "RefreshCw", "LogOut", "Loader2"].map(key => [key, key])),
    "@/auth/AuthProvider": { useAuth: () => ({ signOut: async () => { signouts++; } }) },
    "@/components/ui/button": { Button: "button" },
  };
  if (visual) {
    const locale = JSON.parse(readFileSync(new URL("../i18n/locales/fr.json", import.meta.url), "utf8"));
    deps["react-i18next"] = { useTranslation: () => ({ t: (key: string, o: any) => key.split(".").reduce((v: any, k) => v?.[k], locale) ?? o?.defaultValue ?? key }) };
    deps["lucide-react"] = require("lucide-react");
    const buttonSource = readFileSync(new URL("./ui/button.tsx", import.meta.url), "utf8");
    const buttonCode = ts.transpileModule(buttonSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const buttonModule = { exports: {} as any };
    new Function("require", "module", "exports", buttonCode)((id: string) => id === "@/lib/utils" ? { cn: (...values: unknown[]) => require("tailwind-merge").twMerge(require("clsx").clsx(values)) } : require(id), buttonModule, buttonModule.exports);
    deps["@/components/ui/button"] = buttonModule.exports;
  }
  const module = { exports: {} as any };
  new Function("require", "module", "exports", "__env", compiled)((id: string) => { assert.ok(id in deps, id); return deps[id]; }, module, module.exports, { BASE_URL: "/" });
  return { query, get options() { return options; }, get refreshes() { return refreshes; }, get signouts() { return signouts; },
    render: () => { index = 0; return module.exports.AccountAccessGate({ children: "PROTECTED_CONTENT" }); } };
}

test("pending screen shows exact account and maximum review window, never protected children", () => {
  const h = harness(); const view = h.render();
  assert.match(text(view), /Awaiting validation/);
  assert.match(text(view), /purchase@example.invalid/);
  assert.match(text(view), /12 hours maximum/);
  assert.match(text(view), /HaloLight purchase/);
  assert.doesNotMatch(text(view), /PROTECTED_CONTENT/);
  assert.equal(h.options.query.refetchInterval, 30_000);
  assert.equal(h.options.query.refetchOnWindowFocus, "always");
  assert.equal(h.options.query.retry, false);
});

test("pending, rejected, disabled, missing and failed statuses cannot mount approved children", () => {
  const h = harness();
  for (const status of ["pending", "rejected", "disabled", undefined, "unexpected"]) {
    h.query.data.status = status; assert.doesNotMatch(text(h.render()), /PROTECTED_CONTENT/);
  }
  h.query.data.status = "approved"; assert.equal(h.render(), "PROTECTED_CONTENT");
  h.query.isError = true; const view = text(h.render());
  assert.match(view, /Unable to check your access/); assert.doesNotMatch(view, /PROTECTED_CONTENT|12 hours|awaiting approval/i);
  h.query.isError = false; h.query.isPending = true; assert.doesNotMatch(text(h.render()), /PROTECTED_CONTENT/);
});

test("rejected and disabled are distinct from pending; refresh and logout use actual actions", async () => {
  const h = harness();
  h.query.data.status = "rejected"; assert.match(text(h.render()), /not approved/);
  h.query.data.status = "disabled"; assert.match(text(h.render()), /account is disabled/);
  h.query.data.status = "pending";
  let buttons = nodes(h.render()).filter(node => node.type === "button");
  await buttons[0].props.onClick(); assert.equal(h.refreshes, 1);
  h.query.isFetching = true; assert.equal(nodes(h.render()).find(node => node.type === "button").props.disabled, true);
  h.query.isFetching = false;
  buttons = nodes(h.render()).filter(node => node.type === "button");
  await buttons[1].props.onClick(); assert.equal(h.signouts, 1);
  h.query.data.status = "approved"; assert.notEqual(h.render(), "PROTECTED_CONTENT");
});

test("approval refresh admits children without another login and app gates local queries and preloads", () => {
  const h = harness(); assert.notEqual(h.render(), "PROTECTED_CONTENT");
  h.query.data.status = "approved"; assert.equal(h.render(), "PROTECTED_CONTENT");
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  assert.match(app, /<AccountAccessGate>\s*<LocalUserGate>\s*<RequestedRoutePreloader/);
  assert.equal((app.match(/<RequestedRoutePreloader/g) ?? []).length, 1);
});

test("Admin filters pending server-side, paginates total, and requires confirmation before review", () => {
  const adminSource = readFileSync(new URL("../pages/Admin.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(adminSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const requests: any[] = [], invalidations: any[] = [];
  const states: any[] = []; let index = 0; let params: any; let reviewOptions: any;
  const pending = { id: "pending-user", email: "purchase@example.invalid", role: "client", accessStatus: "pending", isActive: false, createdAt: "2026-09-26T00:00:00Z" };
  const genericMutation = { isPending: false, mutateAsync: async () => {} };
  const deps: Record<string, any> = {
    "react/jsx-runtime": require("react/jsx-runtime"),
    react: { useState: (initial: any) => { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], (v: any) => { states[i] = v; }]; }, useEffect: () => {} },
    "react-i18next": { useTranslation: () => ({ t: (key: string, options: any) => options?.defaultValue ?? key }) },
    "@tanstack/react-query": { useQueryClient: () => ({ invalidateQueries: (v: any) => { invalidations.push(v); } }) },
    "@workspace/api-client-react": {
      useGetCurrentUser: () => ({ data: { id: "admin-user", role: "admin" } }),
      useListUsers: (value: any) => { params = value; return { data: { items: [pending], total: 101 }, isLoading: false }; },
      useCreateUser: () => genericMutation, useUpdateUser: () => genericMutation,
      useReviewUserAccess: (options: any) => { reviewOptions = options; return { isPending: false, mutate: (v: any) => requests.push(v) }; },
    },
    "@/hooks/use-toast": { useToast: () => ({ toast: () => {} }) },
  };
  const module = { exports: {} as any };
  new Function("require", "module", "exports", code)((id: string) => deps[id] ?? new Proxy({}, { get: (_, name) => String(name) }), module, module.exports);
  const render = () => { index = 0; return module.exports.default(); };
  let view = render();
  const filter = nodes(view).find(node => node.type === "Select" && text(node).includes("All approval statuses"));
  assert.ok(filter); filter.props.onValueChange("pending"); view = render();
  assert.equal(params.accessStatus, "pending"); assert.equal(params.limit, 50); assert.equal(params.offset, 0);
  const next = nodes(view).find(node => node.props?.["aria-label"] === "Next page");
  next.props.onClick(); view = render(); assert.equal(params.offset, 50);
  assert.ok(text(view).includes("101"));
  assert.equal(nodes(view).filter(node => node.type === "InviteUserButton").length, 0);
  for (const decision of ["approved", "rejected"]) {
    const label = decision === "approved" ? "Approve access" : "Reject access";
    const row = nodes(view).find(node => node.props?.["data-testid"] === "row-user-pending-user");
    nodes(row).find(node => node.type === "Button" && text(node).trim() === label).props.onClick();
    assert.equal(requests.length, decision === "approved" ? 0 : 1);
    view = render();
    const dialog = nodes(view).find(node => node.type === "Dialog" && node.props.open);
    assert.match(text(dialog), /purchase@example.invalid/);
    nodes(dialog).find(node => node.type === "Button" && text(node).trim() === label).props.onClick();
    assert.deepEqual(requests.at(-1), { id: "pending-user", data: { decision } });
    reviewOptions.mutation.onSuccess(); view = render();
  }
  assert.ok(invalidations.some(value => value.queryKey[0] === "/api/users"));
  assert.ok(invalidations.some(value => value.queryKey[0] === "/api/users/me/access"));
});

test("optional private French pending fixture uses real component, icons, buttons and built CSS", { skip: !process.env.ACCOUNT_ACCESS_VISUAL_DIR }, () => {
  const directory = process.env.ACCOUNT_ACCESS_VISUAL_DIR!;
  assert.equal(directory, "/Users/rom4n/.HaloHub/account-approval/visual");
  const assets = new URL("../../dist/public/assets/", import.meta.url);
  const css = readdirSync(assets).find(name => /^index-.*\.css$/.test(name));
  assert.ok(css, "build the frontend first");
  let markup = require("react-dom/server").renderToStaticMarkup(harness(true).render());
  const logo = readFileSync(new URL("../../public/logo-hub-light-orig.png", import.meta.url)).toString("base64");
  markup = markup.replaceAll("/logo-hub-light-orig.png", `data:image/png;base64,${logo}`);
  const styles = readFileSync(new URL(css, assets), "utf8");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(`${directory}/pending-fr.html`, `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pending approval preview</title><style>${styles}</style></head><body>${markup}</body></html>`, { mode: 0o600 });
});
