import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, it } from "node:test";
import ts from "typescript";
import { createClientNavigation, hasNotificationBadge, isNavItemActive, type NavItem } from "../components/layout/sidebarNavigation";

const items = createClientNavigation((key) => key);
const leaves = (nodes: NavItem[]): NavItem[] => nodes.flatMap((node) => node.children ? leaves(node.children) : [node]);

describe("client navigation", () => {
  it("exposes the six requested groups in order", () => {
    assert.deepEqual(items.map((item) => item.title), ["nav.dashboard", "nav.academy", "nav.events", "nav.clients", "nav.support", "nav.settings"]);
  });

  it("keeps all existing destinations except the hidden community entry", () => {
    assert.deepEqual(leaves(items).map((item) => item.href), ["/dashboard", "/academy", "/events", "/crm/leads", "/quotes", "/contracts", "/invoices", "/support", "/kb", "/ai", "/settings", "/notifications", "/onboarding", "/equipment", "/consumables"]);
    assert.deepEqual(items[4].children?.map((item) => item.href), ["/support", "/kb", "/ai"]);
    assert.deepEqual(items[5].children?.[3].children?.map((item) => item.href), ["/equipment", "/consumables"]);
  });

  it("activates all ancestors for nested routes, without prefix collisions", () => {
    for (const path of ["/equipment/unit-1", "/consumables", "/consumables/?page=2#stock"]) {
      assert.equal(isNavItemActive(items[5], path), true);
      assert.equal(isNavItemActive(items[5].children![3], path), true);
      assert.equal(items.filter((item) => isNavItemActive(item, path)).length, 1);
    }
    for (const path of ["/equipment-other", "/admin/equipment", "/community"]) {
      assert.equal(items.some((item) => isNavItemActive(item, path)), false);
    }
    assert.equal(isNavItemActive(items[1], "/academy/course/lesson"), true);
    assert.equal(isNavItemActive(items[4], "/ai/conversation"), true);
  });

  it("does not activate the admin users link for every admin route", () => {
    const users = { ...items[0], href: "/admin" };
    assert.equal(isNavItemActive(users, "/admin"), true);
    assert.equal(isNavItemActive(users, "/admin/users"), false);
  });

  it("keeps the unread badge discoverable in collapsed Settings", () => {
    assert.equal(hasNotificationBadge(items[5]), true);
    assert.equal(hasNotificationBadge(items[5].children![1]), true);
    assert.equal(hasNotificationBadge(items[5].children![3]), false);
    assert.equal(hasNotificationBadge(items[4]), false);
  });

  it("has translated navigation and requested KB labels in all eight locales", () => {
    const navKeys = new Set(["nav.navigation", ...items.flatMap(function keys(item): string[] { return [item.title, ...(item.children?.flatMap(keys) ?? [])]; })]);
    for (const lang of ["en", "fr", "de", "es", "it", "pl", "pt", "nl"]) {
      const locale = JSON.parse(readFileSync(new URL(`../i18n/locales/${lang}.json`, import.meta.url), "utf8"));
      for (const key of navKeys) assert.ok(locale.nav[key.slice(4)], `${lang}: ${key}`);
      for (const key of ["content_language", "french_fallback", "load_error", "retry", "previous_page", "next_page", "source", "revision", "download_error", "downloading"]) assert.ok(locale.kb[key], `${lang}: kb.${key}`);
      assert.deepEqual(locale.kb.page_status.match(/\{\{\w+\}\}/g), ["{{from}}", "{{to}}", "{{total}}"]);
      for (const key of ["ai_eligible", "ai_review_required"]) assert.ok(locale.kb_admin[key], `${lang}: kb_admin.${key}`);
    }
  });
});

// Exercise the actual component's disclosure handlers without credentials or network calls.
const require = createRequire(import.meta.url);
function navHarness() {
  let state: unknown;
  const source = readFileSync(new URL("../components/layout/Sidebar.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(`${source}\nexport { NavLink };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(output, {
    exports,
    require: (id: string) => {
      if (id === "react") return {
        useId: () => "submenu-test",
        useState: (initial: unknown) => {
          state ??= initial;
          return [state, (value: unknown) => { state = value; }];
        },
      };
      if (id === "./sidebarNavigation") return { createClientNavigation, hasNotificationBadge, isNavItemActive };
      if (id === "@/lib/utils") return { cn: (...args: string[]) => args.filter(Boolean).join(" ") };
      if (id === "wouter") return { Link: "a" };
      if (id.startsWith("@")) return {};
      return require(id);
    },
  });
  return (location: string, item = items[5], onClose = () => {}) => exports.NavLink({ item, location, unreadCount: 2, onClose });
}

describe("sidebar disclosures", () => {
  it("provides native keyboard buttons, controlled panels and recursive children", () => {
    const render = navHarness();
    const [button, panel] = render("/equipment/unit-1").props.children;
    assert.equal(button.type, "button");
    assert.equal(button.props.type, "button");
    assert.equal(button.props["aria-expanded"], true);
    assert.equal(button.props["aria-controls"], panel.props.id);
    assert.equal(panel.props.hidden, false);
    assert.equal(panel.props.children[3].props.item.title, "nav.hardware");
    assert.equal(typeof panel.props.children[3].type, "function");
  });

  it("preserves manual toggles on rerenders and reveals ancestors on history changes", () => {
    const render = navHarness();
    render("/equipment").props.children[0].props.onClick();
    assert.equal(render("/equipment").props.children[1].props.hidden, true);
    assert.equal(render("/dashboard").props.children[1].props.hidden, true);
    assert.equal(render("/equipment").props.children[1].props.hidden, false);
    render("/equipment").props.children[0].props.onClick();
    assert.equal(render("/equipment").props.children[1].props.hidden, true);
    assert.equal(render("/notifications").props.children[1].props.hidden, false);
  });

  it("uses a real link, marks the active page and closes mobile navigation on selection", () => {
    const render = navHarness();
    let closed = false;
    const equipment = items[5].children![3].children![0];
    const link = render("/equipment/unit-1", equipment, () => { closed = true; });
    assert.equal(link.type, "a");
    assert.equal(link.props.href, "/equipment");
    assert.equal(link.props["aria-current"], "page");
    link.props.onClick();
    assert.equal(closed, true);
    assert.equal(render("/consumables", equipment).props["aria-current"], undefined);
  });
});
