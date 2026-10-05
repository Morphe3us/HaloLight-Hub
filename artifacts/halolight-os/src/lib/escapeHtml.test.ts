import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml, safeImageUrl } from "./escapeHtml";
import { paymentMethodPrint } from "./paymentMethodPrint";

test("escapeHtml neutralises markup and quotes, keeps plain text intact", () => {
  assert.equal(escapeHtml(`<img src=x onerror="alert('x')">&`), "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;");
  assert.equal(escapeHtml("Jean Dupont — Mariage 2026"), "Jean Dupont — Mariage 2026");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(42), "42");
});

test("safeImageUrl only allows https, same-origin paths and raster data URIs", () => {
  for (const url of ["https://cdn.example/logo.png", "/api/files/logo.png", "/uploads/logo.png", "data:image/png;base64,AAAA", "data:image/webp;base64,AAAA"])
    assert.equal(safeImageUrl(url), url, url);
  assert.equal(safeImageUrl(`https://cdn.example/a.png" onerror="alert(1)`), "https://cdn.example/a.png&quot; onerror=&quot;alert(1)");
  for (const url of ["javascript:alert(1)", "http://evil.example/a.png", "//evil.example/a.png", "data:image/svg+xml;base64,AAAA",
    "data:text/html,<script>", "", null, undefined, 12])
    assert.equal(safeImageUrl(url), "", String(url));
});

test("paymentMethodPrint escapes label and value", () => {
  assert.equal(paymentMethodPrint("Pay", null), "");
  const html = paymentMethodPrint("<b>", "IBAN <script>");
  assert.ok(!html.includes("<script>") && !html.includes("<b>"));
  assert.ok(html.includes("IBAN &lt;script&gt;"));
});
