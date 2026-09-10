import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KBMarkdown } from "../pages/KBMarkdown";

test("KB Markdown renders French emphasis, lists, tables and protected file buttons without raw HTML", t => {
  const previousWindow = globalThis.window;
  const previousReact = (globalThis as Record<string, unknown>).React;
  Object.assign(globalThis, { window: { location: { origin: "https://hub.example" } }, React });
  t.after(() => { Object.assign(globalThis, { window: previousWindow, React: previousReact }); });
  const content = "# Écran\n\n**Sécurité**\n\n- Vérifier\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n[PDF](/api/files/kb/guide.pdf)\n\n<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)";
  const html = renderToStaticMarkup(React.createElement(KBMarkdown, { content }));
  assert.match(html, /<h1>Écran<\/h1>/);
  assert.match(html, /<strong>Sécurité<\/strong>/);
  assert.match(html, /<li>Vérifier<\/li>/);
  assert.match(html, /<table>/);
  assert.match(html, /<button[^>]*>/);
  assert.doesNotMatch(html, /<script|javascript:|href="\/api\/files/);
});
