// Run: node src/pages/kb.smoke.mjs. Requires Playwright from installed runtime or PLAYWRIGHT_MODULE.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { startKbPreview } from "./kb.preview.mjs";

const runtime = process.env.PLAYWRIGHT_MODULE || "/Users/rom4n/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
const { chromium } = await import(pathToFileURL(runtime).href);
const output = process.env.KB_SMOKE_OUTPUT || "/tmp/halolight-kb-smoke";
await mkdir(output, { recursive: true });
const preview = await startKbPreview();
const browser = await chromium.launch({ headless: true, executablePath: process.env.KB_CHROMIUM_PATH || "/Users/rom4n/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell" });
const results = [];
let activePage;
try {
  for (const viewport of [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, acceptDownloads: true });
    const page = await context.newPage();
    activePage = page;
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      const url = route.request().url();
      return url.startsWith(preview.url) || url.startsWith("data:") || url.startsWith("blob:") ? route.continue() : route.abort();
    });
    const shot = name => page.screenshot({ path: join(output, `${viewport.name}-${name}.png`), animations: "disabled" });
    const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${viewport.name}: horizontal overflow`);
    await page.goto(preview.url + "/kb?lang=en");
    await page.locator("main select").first().waitFor();
    await page.getByText("No articles found", { exact: true }).waitFor();
    assert.equal(await page.locator("main select").first().inputValue(), "en");
    assert.equal(await page.locator("main select").first().locator("option").count(), 8);
    await shot("empty-en"); await noOverflow();
    if (viewport.name === "mobile") {
      await page.getByTestId("button-mobile-menu").click();
      await page.locator('a[href="/kb"][aria-current="page"]:visible').waitFor();
      await shot("sidebar");
      await page.locator('a[href="/kb"][aria-current="page"]:visible').click();
    } else await page.locator('a[href="/kb"][aria-current="page"]:visible').waitFor();
    await page.getByRole("button", { name: "Français", exact: true }).click();
    await page.locator('main a[href^="/kb/articles/"]').nth(19).waitFor();
    assert.equal(await page.locator("main select").first().inputValue(), "fr");
    await shot("fr-page-1"); await noOverflow();
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await page.getByText("Documentation française 21", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await page.getByText("Documentation française 47", { exact: true }).waitFor();
    assert.equal(await page.locator('main a[href^="/kb/articles/"]').count(), 7);
    assert.equal(await page.getByRole("button", { name: "Next page", exact: true }).isDisabled(), true);
    await shot("fr-page-3"); await noOverflow();

    const search = page.locator("main input");
    const before = preview.requests.filter(req => req.path === "/api/kb/articles" && req.query.search).length;
    await search.fill("temp");
    await page.waitForTimeout(100);
    await search.fill("temperature");
    await page.waitForTimeout(150);
    assert.equal(preview.requests.filter(req => req.path === "/api/kb/articles" && req.query.search).length, before, "search is debounced");
    await page.waitForFunction(() => document.querySelectorAll('main a[href^="/kb/articles/"]').length === 1);
    const searches = preview.requests.filter(req => req.path === "/api/kb/articles" && req.query.search).slice(before);
    assert.equal(searches.length, 1);
    assert.equal(searches[0].query.search, "temperature");
    assert.equal(searches[0].query.offset, "0");
    await page.getByText("Écran et sécurité", { exact: true }).click();
    await page.locator("main article table").waitFor();
    assert.equal(await page.locator("main article strong").textContent(), "Vérifier la température.");
    assert.equal(await page.locator("main article script").count(), 0);
    await page.getByText("fixture-fr-guide", { exact: false }).waitFor();
    await shot("article-markdown"); await noOverflow();
    preview.state.failDownload = true;
    await page.getByRole("button", { name: "Guide PDF", exact: true }).click();
    await page.getByRole("alert").waitFor();
    await shot("download-error"); await noOverflow();
    preview.state.failDownload = false;
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "Guide PDF", exact: true }).click();
    const download = await downloadEvent;
    assert.equal(await download.failure(), null);
    assert.equal(download.suggestedFilename(), "guide.pdf");
    await download.saveAs(join(output, `${viewport.name}-guide.pdf`));
    await page.waitForFunction(() => document.querySelector('[role="alert"]') === null);
    await shot("download-success");
    const fileCalls = preview.requests.filter(req => req.path.startsWith("/api/files/"));
    assert.ok(fileCalls.every(req => req.authorization === "Bearer kb-preview-client"));
    assert.ok(fileCalls.every(req => Object.keys(req.query).length === 0));

    preview.state.failList = true;
    await page.goto(preview.url + "/kb?lang=en");
    await page.getByRole("alert").waitFor();
    await shot("list-error");
    preview.state.failList = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByText("No articles found", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    results.push({ viewport: viewport.name, passed: true, checks: ["real sidebar", "empty EN", "explicit FR", "47 articles / 3 pages", "debounced accent search", "Markdown table", "authenticated PDF failure / retry / success", "list retry", "no horizontal overflow", "no page errors"] });
    await context.close();
  }
  await writeFile(join(output, "results.json"), JSON.stringify({ results, requests: preview.requests }, null, 2));
  console.log(JSON.stringify({ output, results }, null, 2));
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: join(output, "failure.png") });
    await writeFile(join(output, "failure.txt"), await activePage.locator("body").innerText());
  }
  await writeFile(join(output, "failure-requests.json"), JSON.stringify(preview.requests, null, 2));
  throw error;
} finally {
  await browser.close();
  await preview.server.close();
}
