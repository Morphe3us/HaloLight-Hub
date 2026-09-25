import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { build } from "vite";

// Run from any directory: node artifacts/halolight-os/scripts/check-bundle.mjs
// --report-only measures the old configuration without enforcing the guard.
const root = fileURLToPath(new URL("../", import.meta.url));
const outDir = await mkdtemp(path.join(tmpdir(), "halolight-bundle-"));
const reportOnly = process.argv.includes("--report-only");
const routeOnly = /\/node_modules\/(?:recharts|recharts-scale|d3-[^/]+|react-hook-form|@hookform\/[^/]+|zod)\//;

try {
  const result = await build({
    configFile: path.join(root, "vite.config.ts"),
    logLevel: "error",
    build: { outDir, emptyOutDir: true },
  });
  assert(!Array.isArray(result) && "output" in result, "Expected one client build");
  const chunks = new Map(result.output.filter((item) => item.type === "chunk")
    .map((chunk) => [chunk.fileName, chunk]));
  const entry = [...chunks.values()].find((chunk) => chunk.isEntry);
  assert(entry, "Missing client entry");
  const landing = [...chunks.values()].find((chunk) =>
    chunk.facadeModuleId?.endsWith("/pages/Landing.tsx"));
  assert(landing?.isDynamicEntry, "Landing must remain a dynamic entry");

  function closure(files, seen = new Set()) {
    for (const file of files) {
      if (seen.has(file)) continue;
      const chunk = chunks.get(file);
      assert(chunk, `Missing imported chunk: ${file}`);
      seen.add(file);
      closure(chunk.imports, seen);
    }
    return seen;
  }

  const html = await readFile(path.join(outDir, "index.html"), "utf8");
  const preloads = [...html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"[^>]*>/g)]
    .map((match) => [...chunks.keys()].find((file) => match[1].endsWith(`/${file}`)));
  assert(preloads.every(Boolean), "Unrecognized HTML modulepreload");
  const initial = closure([entry.fileName, ...preloads]);
  const landingFiles = closure([...initial, landing.fileName]);
  const sizeCache = new Map();
  function sizes(files) {
    return [...files].reduce((total, file) => {
      if (!sizeCache.has(file)) {
        const code = Buffer.from(chunks.get(file).code);
        sizeCache.set(file, {
          raw: code.length,
          gzip: gzipSync(code).length,
          brotli: brotliCompressSync(code).length,
        });
      }
      const size = sizeCache.get(file);
      total.raw += size.raw;
      total.gzip += size.gzip;
      total.brotli += size.brotli;
      return total;
    }, { raw: 0, gzip: 0, brotli: 0 });
  }
  console.log(JSON.stringify({
    note: "JS bytes; gzip/Brotli are per-file compressed payload estimates, excluding HTTP headers",
    modulepreloads: preloads.map((file) => ({ file, ...sizes([file]) })),
    initial: { files: initial.size, ...sizes(initial) },
    landing: { files: landingFiles.size, ...sizes(landingFiles) },
  }, null, 2));

  const violations = [];
  for (const file of landingFiles) {
    const modules = Object.keys(chunks.get(file).modules).filter((id) => routeOnly.test(id));
    if (modules.length) violations.push(`${file} eagerly includes ${modules.length} chart/form modules`);
  }
  // Inspect emitted static imports, not dynamic imports: route back-references are safe.
  const visited = new Set();
  function checkCycles(file, stack = []) {
    if (stack.includes(file)) {
      violations.push(`Static chunk cycle: ${[...stack.slice(stack.indexOf(file)), file].join(" -> ")}`);
      return;
    }
    if (visited.has(file)) return;
    visited.add(file);
    for (const dependency of chunks.get(file).imports) checkCycles(dependency, [...stack, file]);
  }
  for (const file of chunks.keys()) checkCycles(file);
  const lazyModules = [...chunks.values()].flatMap((chunk) => Object.keys(chunk.modules))
    .filter((id) => routeOnly.test(id));
  assert(lazyModules.some((id) => id.includes("/recharts/")), "Charts missing from build");
  assert(lazyModules.some((id) => id.includes("/react-hook-form/")), "Forms missing from build");
  if (reportOnly) console.log("Guard findings:", violations);
  else assert.deepEqual(violations, [], "Bundle isolation regression");
} finally {
  await rm(outDir, { recursive: true, force: true });
}
