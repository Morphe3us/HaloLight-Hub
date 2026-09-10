import assert from "node:assert/strict";
import { test } from "node:test";
import { chmod, link, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PgDialect } from "drizzle-orm/pg-core";
import { CATEGORIES, SOURCES } from "./canonical";
import { assertSafeText, buildBundle, businessSection, faqContent, fileUrl, ownerMarker, sourceKey, stableId, stageBundle, summarize, type Bundle, type PlannedRow } from "./manifest";
import { applyDiff, compareRow, inventoryLegacyGuide, planDatabase, summarizeDiff, type QueryRunner } from "./database";
import { ensurePrivateChild, externalDirectory, publishPrivate, readRegular, sourceFile, validateApplyStorage } from "./private-files";
import { argumentsFor } from "../src/import-corrected-content";
import { packSource, REVIEW_MANIFEST } from "./pack-source";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

test("canonical inventory is exact, pinned and excludes configuration/template facts", () => {
  assert.equal(CATEGORIES.length, 6);
  assert.deepEqual(CATEGORIES.map(([, name]) => name), ["Bien démarrer", "LumaBooth & Configuration", "Installation & Matériel", "Dépannage & Support", "Développer son activité", "Contrats & Gestion"]);
  assert.ok(SOURCES.filter(source => source.kind === "definition").every(source => source.category === "demarrer"));
  assert.equal(SOURCES.find(source => source.key === "contrat")?.category, "contrats");
  assert.equal(SOURCES.find(source => source.key === "booster-visibilite")?.category, "business");
  assert.ok(SOURCES.every(source => CATEGORIES.some(([key]) => key === source.category)));
  assert.equal(SOURCES.filter(source => source.kind === "pdf").length, 15);
  assert.equal(SOURCES.filter(source => source.kind === "faq").length, 28);
  assert.equal(SOURCES.filter(source => source.kind === "definition").length, 3);
  assert.equal(SOURCES.filter(source => source.kind === "business").length, 1);
  assert.equal(new Set(SOURCES.map(source => source.key)).size, SOURCES.length);
  for (const source of SOURCES) {
    assert.match(source.hash, /^[a-f0-9]{64}$/);
    assert.ok(source.bytes > 0);
    assert.doesNotMatch(source.path, /README|backlog|config|template|Guide360/i);
  }
  assert.equal(SOURCES.find(source => source.key === "faq-fr-025")?.revision, "1.1-corrigee");
});

test("UUIDs and authenticated storage keys are deterministic", () => {
  assert.equal(stableId("a"), stableId("a"));
  assert.notEqual(stableId("a"), stableId("b"));
  assert.match(stableId("a"), /^[a-f0-9-]{14}8[a-f0-9]{3}-[89ab]/);
  assert.equal(fileUrl("a".repeat(64)), `/api/files/corrected-2026-09-10/${"a".repeat(64)}.pdf`);
});

function faq(id = "001", revision = "1.0-corrigee"): string {
  return `---\nid: "FAQ-FR-${id}"\nrevision: "${revision}"\nlanguage: "fr"\nquestion: "Question ?"\ntags: ["modele"]\ncorrection_date: "2026-09-10"\nhardware_validation: "not_performed"\napproval_status: "editorial_correction_only"\nsource_path: "/private/original-not-for-output"\n---\n\n# Question ?\n\nTexte de test.\n`;
}

test("FAQ parser projects safe metadata and preserves the exceptional revision", () => {
  const parsed = faqContent(faq(), "faq-fr-001");
  assert.equal(parsed.title, "Question ?");
  assert.doesNotMatch(JSON.stringify(parsed), /source_path|original-not-for-output/);
  assert.doesNotThrow(() => faqContent(faq("025", "1.1-corrigee"), "faq-fr-025"));
  assert.throws(() => faqContent(faq("025"), "faq-fr-025"), /FAQ_METADATA_MISMATCH/);
  assert.throws(() => faqContent(faq().replace('language: "fr"', 'language: "en"'), "faq-fr-001"), /FAQ_METADATA_MISMATCH/);
  assert.throws(() => faqContent(faq().replace("---\nid:", '---\nlanguage: "fr"\nid:'), "faq-fr-001"), /FAQ_DUPLICATE_METADATA/);
});

test("only one explicit nonprocedural business subsection is extracted", () => {
  const section = "Un objectif commercial peut concerner la visibilité sans promettre une réservation immédiate.";
  const text = `# Guide\n### Trois objectifs distincts\n${section}\n\n### Section technique exclue\nProcédure inconnue.`;
  const content = businessSection(text);
  assert.ok(content.includes(section));
  assert.doesNotMatch(content, /technique|inconnue/);
  assert.throws(() => businessSection(text + "\n### Trois objectifs distincts\n"), /BUSINESS_SECTION_MISMATCH/);
});

test("raw source paths, embedded secrets and active markup fail closed", () => {
  for (const content of ["/Users/test/file", "file:///private/item", "client_secret=example", "<script>test</script>", "javascript:bad()"])
    assert.throws(() => assertSafeText(content));
  assert.doesNotThrow(() => assertSafeText("Un événement à 360 degrés."));
});

const article: PlannedRow = { table: "kb_articles", sourceKey: sourceKey("test"), values: {
  id: stableId("kb_articles:test"), source_key: sourceKey("test"), author_id: "incoming-author", title: "Test", content: "Test", slug: "corrected-fr-test", ai_eligible: false,
} };

test("idempotent diff preserves existing IDs, authors and views", () => {
  const current = { ...article.values, id: stableId("existing"), author_id: "original-author", views: 91, updated_at: "unchanged" };
  const change = compareRow(article, [current]);
  assert.equal(change.kind, "unchanged");
  assert.equal(change.planned.values.id, current.id);
  assert.equal(change.planned.values.author_id, "original-author");
  assert.deepEqual(change.changed, {});
  assert.throws(() => compareRow({ ...article, values: { ...article.values, content: "Revised" } }, [current]), /LOCALLY_MODIFIED_ROW_OR_REVISION_REVIEW_REQUIRED/);
});

test("unrelated IDs, slugs and ambiguous source identities refuse overwrite", () => {
  assert.throws(() => compareRow(article, [{ ...article.values, source_key: null }]), /UNRELATED_ROW_COLLISION/);
  assert.throws(() => compareRow(article, [article.values, { ...article.values, id: stableId("other") }]), /IDENTITY_COLLISION/);
  const upload: PlannedRow = { table: "uploads", sourceKey: sourceKey("test"), values: { id: stableId("upload") } };
  assert.throws(() => compareRow(upload, [{ id: upload.values.id, description: "User content" }]), /UNRELATED_ROW_COLLISION/);
});

const dialect = new PgDialect();
test("database planning remaps preserved foreign IDs and remains read-only", async () => {
  const category: PlannedRow = { table: "kb_categories", sourceKey: sourceKey("category-test"), values: { id: stableId("category"), slug: "test-category", description: ownerMarker(sourceKey("category-test")) } };
  const categoryId = stableId("old-category");
  const plannedArticle = { ...article, values: { ...article.values, category_id: category.values.id } };
  const queries: string[] = [];
  const runner: QueryRunner = { async execute(query) {
    const compiled = dialect.sqlToQuery(query); queries.push(compiled.sql);
    if (compiled.sql.includes('FROM "kb_categories"')) return { rows: [{ ...category.values, id: categoryId }] };
    return { rows: [{ ...plannedArticle.values, category_id: categoryId, views: 70 }] };
  } };
  const bundle: Bundle = { rows: [category, plannedArticle], pdfs: [], manifest: "" };
  const diff = await planDatabase(runner, bundle);
  assert.deepEqual(summarizeDiff(diff), { insert: 0, update: 0, unchanged: 2, staleOwnedChunks: 0 });
  assert.equal(diff.changes[1]!.planned.values.category_id, categoryId);
  assert.ok(queries.every(query => query.startsWith("SELECT")));
});

test("apply emits parameterized changes, never updates views, and no-op emits nothing", async () => {
  const queries: { sql: string; params: unknown[] }[] = [];
  const runner: QueryRunner = { async execute(query) { queries.push(dialect.sqlToQuery(query)); return { rows: [] }; } };
  const changed = { planned: article, kind: "update" as const, changed: { content: "quote ' safe" } };
  await applyDiff(runner, { changes: [changed], staleChunks: [] });
  assert.equal(queries.length, 1);
  assert.doesNotMatch(queries[0]!.sql, /quote|views|author_id/);
  assert.ok(queries[0]!.params.includes("quote ' safe"));
  queries.length = 0;
  await applyDiff(runner, { changes: [compareRow(article, [article.values])], staleChunks: [] });
  assert.equal(queries.length, 0);
});

test("AI citation remaps to the preserved article ID using the real client route", async () => {
  const preservedId = stableId("preserved-article");
  const document: PlannedRow = { table: "ai_knowledge_documents", sourceKey: sourceKey("test"), values: {
    id: stableId("ai-test"), tags: [ownerMarker(sourceKey("test"))], source_url: `/kb/articles/${article.values.id}`,
  } };
  const runner: QueryRunner = { async execute(query) {
    const compiled = dialect.sqlToQuery(query);
    return { rows: compiled.sql.includes('FROM "kb_articles"') ? [{ ...article.values, id: preservedId }] : [] };
  } };
  const diff = await planDatabase(runner, { rows: [article, document], pdfs: [], manifest: "" });
  assert.equal(diff.changes[1]!.planned.values.source_url, `/kb/articles/${preservedId}`);
});

test("legacy inventory accepts exact UUID only, never broad titles or writes", async () => {
  const queries: string[] = [];
  const runner: QueryRunner = { async execute(query) { queries.push(dialect.sqlToQuery(query).sql); return { rows: [] }; } };
  await assert.rejects(inventoryLegacyGuide(runner, "360"), /LEGACY_EXACT_UUID_REQUIRED/);
  await inventoryLegacyGuide(runner, stableId("legacy"));
  assert.equal(queries.length, 4);
  assert.ok(queries.every(query => query.startsWith("SELECT id") && !query.includes("LIKE")));
});

test("CLI defaults offline; apply requires explicit target, author, storage and production backup", () => {
  const base = ["--source", "/external/source", "--staging", "/external/staging"];
  assert.equal(argumentsFor(base).mode, "dry-run");
  assert.equal(argumentsFor(base).database, false);
  assert.throws(() => argumentsFor(["apply", ...base]), /APPLY_CONFIRMATION/);
  assert.throws(() => argumentsFor(["check", ...base, "--database"]), /DATABASE_FLAG/);
  const apply = ["apply", ...base, "--storage-dir", "/external/storage", "--author-id", "author", "--confirm-apply", "corrected-content", "--target", "production"];
  assert.throws(() => argumentsFor(apply), /PRODUCTION_BACKUP_REFERENCE_REQUIRED/);
  assert.equal(argumentsFor([...apply, "--backup-reference", "backup-20260910"]).target, "production");
});

test("added or foreign chunks require review rather than destructive reconciliation", async () => {
  const doc: PlannedRow = { table: "ai_knowledge_documents", sourceKey: sourceKey("test"), values: { id: stableId("doc"), tags: [ownerMarker(sourceKey("test"))] } };
  const staleId = stableId("stale");
  let foreign = false;
  const runner: QueryRunner = { async execute(query) {
    const compiled = dialect.sqlToQuery(query);
    return { rows: compiled.sql.includes('FROM "ai_knowledge_documents"') ? [doc.values] : [{ id: staleId, metadata: { sourceKey: foreign ? "other" : sourceKey("test") } }] };
  } };
  const bundle: Bundle = { rows: [doc], pdfs: [], manifest: "" };
  await assert.rejects(planDatabase(runner, bundle), /LOCALLY_MODIFIED_CHUNKS_REVIEW_REQUIRED/);
  foreign = true;
  await assert.rejects(planDatabase(runner, bundle), /UNRELATED_CHUNK_COLLISION/);
});

test("admin content edits, unpublication and approval changes are never reset", () => {
  const baseline: PlannedRow = { ...article, values: { ...article.values, status: "published", source_hash: "original-hash", source_revision: "original-revision" } };
  for (const edit of [{ content: "Admin-approved content" }, { status: "draft" }, { status: "archived" }, { ai_eligible: true }, { source_hash: "new-hash" }, { source_revision: "new-revision" }]) {
    assert.throws(() => compareRow(baseline, [{ ...baseline.values, ...edit }]), /LOCALLY_MODIFIED_ROW_OR_REVISION_REVIEW_REQUIRED/);
  }
  const document: PlannedRow = { table: "ai_knowledge_documents", sourceKey: sourceKey("test"), values: { id: stableId("doc"), tags: [ownerMarker(sourceKey("test"))], ai_active: true, status: "indexed", content: "Original" } };
  for (const edit of [{ ai_active: false }, { status: "needs_review" }, { content: "Reviewed" }])
    assert.throws(() => compareRow(document, [{ ...document.values, ...edit }]), /LOCALLY_MODIFIED_ROW_OR_REVISION_REVIEW_REQUIRED/);
  const resource: PlannedRow = { table: "resources", sourceKey: sourceKey("test"), values: { id: stableId("resource"), description: `${ownerMarker(sourceKey("test"))} revision=2026-09-10`, status: "published" } };
  assert.throws(() => compareRow(resource, [{ ...resource.values, status: "draft" }]), /LOCALLY_MODIFIED_ROW_OR_REVISION_REVIEW_REQUIRED/);
});

test("filesystem configuration must match the canonical explicit storage root", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "corrected-config-test-")));
  try {
    const source = path.join(temp, "source");
    const staging = path.join(temp, "stage");
    const storage = path.join(temp, "storage");
    const env = { STORAGE_PROVIDER: "filesystem", PRIVATE_STORAGE_DIR: storage };
    assert.equal(await validateApplyStorage(storage, source, staging, env), storage);
    await assert.rejects(validateApplyStorage(storage, source, staging, { ...env, STORAGE_PROVIDER: "local" }), /FILESYSTEM_STORAGE_PROVIDER_REQUIRED/);
    await assert.rejects(validateApplyStorage(storage, source, staging, { STORAGE_PROVIDER: "filesystem" }), /PRIVATE_STORAGE_DIR_REQUIRED/);
    await assert.rejects(validateApplyStorage(path.join(temp, "different"), source, staging, env), /PRIVATE_STORAGE_DIR_MISMATCH/);
    await mkdir(storage, { mode: 0o700 });
    const alias = path.join(temp, "alias"); await symlink(storage, alias);
    await assert.rejects(validateApplyStorage(alias, source, staging, env), /PRIVATE_ROOT_SYMLINK/);
    await assert.rejects(validateApplyStorage(storage, source, staging, { ...env, PRIVATE_STORAGE_DIR: alias }), /PRIVATE_ROOT_SYMLINK/);
    const parentAlias = path.join(temp, "parent-alias"); await symlink(temp, parentAlias);
    assert.equal(await validateApplyStorage(path.join(parentAlias, "storage"), source, staging, env), storage);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("non-Git releases, application/public ancestors and frontend aliases are excluded", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "corrected-release-test-")));
  try {
    const source = path.join(temp, "source");
    const applicationCwd = path.join(temp, "release");
    const frontendDistPath = path.join(temp, "served");
    await mkdir(applicationCwd, { mode: 0o700 });
    await mkdir(frontendDistPath, { mode: 0o700 });
    const context = { applicationCwd, frontendDistPath };
    for (const root of [applicationCwd, path.join(applicationCwd, "private"), path.join(applicationCwd, "public"), frontendDistPath, path.join(frontendDistPath, "files"), temp])
      await assert.rejects(externalDirectory(root, source, true, context), /PRIVATE_DIRECTORY_IN_APPLICATION_OR_PUBLIC_ROOT/);
    const alias = path.join(temp, "frontend-alias"); await symlink(frontendDistPath, alias);
    await assert.rejects(externalDirectory(path.join(alias, "private"), source, true, context), /PRIVATE_DIRECTORY_IN_APPLICATION_OR_PUBLIC_ROOT/);
    const safe = path.join(temp, "safe"); await mkdir(safe, { mode: 0o700 });
    const rootAlias = path.join(temp, "root-alias"); await symlink(safe, rootAlias);
    await assert.rejects(externalDirectory(rootAlias, source, false, context), /PRIVATE_ROOT_SYMLINK/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("relative frontend paths resolve from release root, not importer scripts cwd", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "corrected-relative-frontend-test-")));
  try {
    const releaseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const served = path.join(temp, "served");
    await mkdir(served, { mode: 0o700 });
    const relativeFrontend = path.relative(releaseRoot, served);
    const context = { applicationCwd: path.join(releaseRoot, "scripts"), frontendDistPath: relativeFrontend };
    assert.notEqual(path.resolve(context.applicationCwd, relativeFrontend), served);
    await assert.rejects(externalDirectory(served, path.join(temp, "source"), false, context), /PRIVATE_DIRECTORY_IN_APPLICATION_OR_PUBLIC_ROOT/);
    await assert.rejects(externalDirectory(path.join(served, "private"), path.join(temp, "source"), true, context), /PRIVATE_DIRECTORY_IN_APPLICATION_OR_PUBLIC_ROOT/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("interrupted hard-link publication fails closed before file registration", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "corrected-links-test-")));
  try {
    const file = path.join(temp, "content.pdf");
    await publishPrivate(file, Buffer.from("verified"));
    assert.equal((await lstat(file)).nlink, 1);
    const interrupted = `${file}.interrupted.tmp`;
    await link(file, interrupted);
    assert.equal((await lstat(file)).nlink, 2);
    await assert.rejects(readRegular(file), /PRIVATE_FILE_MULTIPLE_LINKS/);
    await assert.rejects(publishPrivate(file, Buffer.from("verified")), /PRIVATE_FILE_MULTIPLE_LINKS/);
    assert.equal((await lstat(interrupted)).nlink, 2);
    // Only the test/operator knows this alias is safe to remove.
    await unlink(interrupted);
    await publishPrivate(file, Buffer.from("verified"));
    assert.equal((await lstat(file)).nlink, 1);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("real corrected corpus verifies eligibility, provenance and staging tamper rejection", { skip: !process.env.CORRECTED_CONTENT_SOURCE }, async () => {
  const source = process.env.CORRECTED_CONTENT_SOURCE!;
  const bundle = await buildBundle(source, "test-author");
  assert.deepEqual(summarize(bundle), { kb_categories: 6, resources: 15, uploads: 15, kb_articles: 47, ai_knowledge_documents: 4, ai_knowledge_chunks: 4, pdfs: 15, faqs: 28, aiEligibleArticles: 4 });
  assert.equal((await buildBundle(source, "test-author")).manifest, bundle.manifest);
  assert.equal((await buildBundle(source, "different-author")).manifest, bundle.manifest);
  const faqRows = bundle.rows.filter(row => row.table === "kb_articles" && row.sourceKey.includes(":faq-fr-"));
  assert.equal(faqRows.length, 28);
  assert.ok(faqRows.every(row => row.values.ai_eligible === false && row.values.status === "published"));
  for (const row of bundle.rows.filter(row => row.table === "uploads")) {
    assert.equal(row.values.related_product, null);
    assert.equal(row.values.visibility, "client_visible");
    assert.equal(row.values.status, "ready");
  }
  for (const row of bundle.rows.filter(row => row.table === "ai_knowledge_documents")) {
    assert.equal(row.values.ai_active, true);
    assert.equal(row.values.status, "indexed");
    assert.match(String(row.values.source_url), /^\/kb\/articles\/[a-f0-9-]+$/);
  }
  assertSafeText(JSON.stringify(bundle.rows));
  assertSafeText(bundle.manifest);
  assert.doesNotMatch(bundle.manifest, /source_path|"content"|\/Users\//);
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "corrected-corpus-test-")));
  try {
    await stageBundle(bundle, temp, source, true);
    await stageBundle(bundle, temp, source, true);
    await stageBundle(bundle, temp, source, false);
    await writeFile(path.join(temp, "manifest.json"), "{}");
    await assert.rejects(stageBundle(bundle, temp, source, false), /MANIFEST_MISMATCH/);
    await writeFile(path.join(temp, "manifest.json"), bundle.manifest);
    await writeFile(path.join(temp, bundle.pdfs[0]!.key), "tampered");
    await assert.rejects(stageBundle(bundle, temp, source, false), /STAGED_HASH_MISMATCH/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("private transfer contains exactly 47 pinned files plus review manifest and reproduces source", { skip: !process.env.CORRECTED_CONTENT_SOURCE }, async () => {
  const source = process.env.CORRECTED_CONTENT_SOURCE!;
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "corrected-pack-test-")));
  const execute = promisify(execFile);
  try {
    const result = await packSource(source, temp);
    assert.equal(result.sourceFiles, 47);
    const archive = path.join(temp, result.filename);
    assert.equal((await lstat(archive)).mode & 0o077, 0);
    assert.equal((await lstat(archive)).nlink, 1);
    const listed = await execute("tar", ["-tzf", archive]);
    assert.deepEqual(listed.stdout.trim().split("\n").sort(), [...SOURCES.map(item => item.path), REVIEW_MANIFEST].sort());
    const restored = path.join(temp, "restored"); await mkdir(restored, { mode: 0o700 });
    await execute("tar", ["-xzf", archive, "-C", restored]);
    assert.equal((await buildBundle(restored)).manifest, (await buildBundle(source)).manifest);
    const review = JSON.parse((await readFile(path.join(restored, REVIEW_MANIFEST))).toString());
    assert.equal(review.files.length, 47);
    assert.ok(review.files.every((file: { relativePath: string }) => !path.isAbsolute(file.relativePath)));
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("private publication is atomic, immutable, private and rejects symlinks/escapes", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "corrected-import-test-")));
  try {
    const source = path.join(temp, "source"); await mkdir(source, { mode: 0o700 });
    const stage = await externalDirectory(path.join(temp, "stage"), source, true);
    const folder = await ensurePrivateChild(stage, "corrected-test", true);
    const file = path.join(folder, "test.pdf");
    await publishPrivate(file, Buffer.from("example"));
    await publishPrivate(file, Buffer.from("example"));
    assert.equal((await lstat(file)).mode & 0o077, 0);
    await assert.rejects(publishPrivate(file, Buffer.from("changed")), /STAGED_FILE_CONFLICT/);
    assert.equal((await readFile(file)).toString(), "example");
    await symlink(file, path.join(source, "escape.pdf"));
    await assert.rejects(sourceFile(source, "escape.pdf"), /SOURCE_ESCAPE/);
    await assert.rejects(externalDirectory(path.join(source, "stage"), source, true), /PRIVATE_SOURCE_OVERLAP/);
    const git = path.join(temp, "repo"); await mkdir(path.join(git, ".git"), { recursive: true });
    await assert.rejects(externalDirectory(path.join(git, "stage"), source, true), /PRIVATE_DIRECTORY_IN_GIT/);
    await chmod(stage, 0o755);
    await assert.rejects(externalDirectory(stage, source), /PRIVATE_DIRECTORY_PERMISSIONS/);
    await chmod(stage, 0o700);
    await symlink(folder, path.join(stage, "unsafe-child"));
    await assert.rejects(ensurePrivateChild(stage, "unsafe-child", false), /UNSAFE_STORAGE_DIRECTORY/);
    await writeFile(path.join(source, "regular.md"), "test");
    assert.equal((await sourceFile(source, "regular.md")).toString(), "test");
  } finally { await rm(temp, { recursive: true, force: true }); }
});
