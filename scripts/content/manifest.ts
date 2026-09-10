import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { CATEGORIES, NAMESPACE, REVISION, SOURCES, type Source } from "./canonical";
import { ensurePrivateChild, externalDirectory, publishPrivate, readRegular, requireImport, sha256, sourceFile } from "./private-files";

export const STORAGE_PREFIX = "corrected-2026-09-10";
export type Row = Record<string, unknown> & { id: string };
export type TableName = "kb_categories" | "resources" | "uploads" | "kb_articles" | "ai_knowledge_documents" | "ai_knowledge_chunks";
export interface PlannedRow { table: TableName; sourceKey: string; values: Row }
export interface Pdf { key: string; hash: string; bytes: Buffer }
export interface Bundle { rows: PlannedRow[]; pdfs: Pdf[]; manifest: string }

export function stableId(key: string): string {
  const bytes = createHash("sha256").update(`${NAMESPACE}:${key}`).digest().subarray(0, 16);
  // UUIDv8: application-defined namespaced SHA-256, RFC variant.
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export const sourceKey = (key: string): string => `${NAMESPACE}:${key}`;
export const ownerMarker = (key: string): string => `[sourceKey=${key}]`;
export const fileUrl = (hash: string): string => `/api/files/${STORAGE_PREFIX}/${hash}.pdf`;

export function assertSafeText(text: string): void {
  requireImport(!/(?:\/Users\/|\/home\/|file:\/\/|[A-Z]:\\|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:sk_live_|sk_test_|sk-proj-)[\w-]+|(?:password|client_secret|api_key)\s*[:=]\s*\S+)/i.test(text), "UNSAFE_CONTENT");
  requireImport(!/<\s*(?:script|iframe|object)\b|javascript:/i.test(text), "UNSAFE_MARKUP");
}

// Parse only the JSON-valued metadata projection used by this pinned FAQ format.
// The remaining YAML (notably source_path) is deliberately never propagated.
export function faqContent(text: string, key: string): { title: string; content: string; tags: string[] } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  requireImport(match, "FAQ_FRONTMATTER_REQUIRED");
  const fields: Record<string, unknown> = {};
  const wanted = new Set(["id", "revision", "language", "question", "tags", "hardware_validation", "approval_status", "correction_date"]);
  for (const line of match[1]!.split(/\r?\n/)) {
    const field = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!field || !wanted.has(field[1]!)) continue;
    requireImport(!(field[1]! in fields), "FAQ_DUPLICATE_METADATA");
    fields[field[1]!] = JSON.parse(field[2]!);
  }
  requireImport(fields.id === key.toUpperCase() && fields.language === "fr" && fields.revision === SOURCES.find(source => source.key === key)?.revision && fields.correction_date === REVISION, "FAQ_METADATA_MISMATCH");
  requireImport(fields.hardware_validation === "not_performed" && fields.approval_status === "editorial_correction_only", "FAQ_REVIEW_POLICY_MISMATCH");
  requireImport(typeof fields.question === "string" && Array.isArray(fields.tags) && fields.tags.every(tag => typeof tag === "string"), "FAQ_INVALID_METADATA");
  const content = match[2]!.trim();
  requireImport(content.startsWith(`# ${fields.question}\n`), "FAQ_TITLE_MISMATCH");
  assertSafeText(content);
  return { title: fields.question, content, tags: fields.tags };
}

export function businessSection(text: string): string {
  const heading = "### Trois objectifs distincts\n";
  const pieces = text.split(heading);
  requireImport(pieces.length === 2, "BUSINESS_SECTION_MISMATCH");
  const section = pieces[1]!.split("\n### ")[0]!.trim();
  requireImport(section.length > 50 && section.length < 700, "BUSINESS_SECTION_MISMATCH");
  assertSafeText(section);
  return `# Trois objectifs de visibilité\n\n${section}`;
}

function add(rows: PlannedRow[], table: TableName, key: string, values: Record<string, unknown>): Row {
  const row = { id: stableId(`${table}:${key}`), ...values };
  rows.push({ table, sourceKey: sourceKey(key), values: row });
  return row;
}

function contentFor(source: Source, bytes: Buffer): { title: string; content: string; tags: string[]; eligible: boolean; locator: string } {
  if (source.kind === "faq") return { ...faqContent(bytes.toString("utf8"), source.key), eligible: false, locator: source.key.toUpperCase() };
  if (source.kind === "pdf") return {
    title: source.title!,
    content: `# ${source.title}\n\n[Consulter le document corrigé](${fileUrl(source.hash)})\n\nDocument à vérifier avant utilisation. Les procédures techniques ne sont pas validées pour les réponses de l'assistant.${source.key === "contrat" ? " Trame illustrative non approuvée juridiquement." : ""}`,
    tags: source.model ? [source.model, source.key, "manuel"] : [source.category],
    eligible: false, locator: "overview",
  };
  const content = source.kind === "business" ? businessSection(bytes.toString("utf8")) : bytes.toString("utf8").trim();
  assertSafeText(content);
  const title = /^# (.+)$/m.exec(content)?.[1];
  requireImport(title, "CONTENT_TITLE_REQUIRED");
  return { title, content, tags: [source.category], eligible: true, locator: source.kind === "business" ? "page-3:trois-objectifs-distincts" : "definition" };
}

export async function buildBundle(sourceDirectory: string, authorId = "<existing-author-required>"): Promise<Bundle> {
  const root = await realpath(sourceDirectory);
  const rows: PlannedRow[] = [];
  const pdfs: Pdf[] = [];
  const inventory: Record<string, unknown>[] = [];
  for (const [index, [key, name]] of CATEGORIES.entries()) add(rows, "kb_categories", `category-${key}`, {
    name, language: "fr", slug: `corrected-fr-${key}`, description: ownerMarker(sourceKey(`category-${key}`)), icon: "BookOpen", order: index,
  });
  for (const source of SOURCES) {
    const bytes = await sourceFile(root, source.path);
    requireImport(bytes.length === source.bytes && sha256(bytes) === source.hash, "SOURCE_HASH_OR_SIZE_MISMATCH");
    if (source.kind === "pdf") {
      requireImport(bytes.subarray(0, 5).toString() === "%PDF-", "INVALID_PDF");
      pdfs.push({ key: `${STORAGE_PREFIX}/${source.hash}.pdf`, hash: source.hash, bytes });
      const description = `${ownerMarker(sourceKey(source.key))} revision=${REVISION} sha256=${source.hash}`;
      add(rows, "resources", source.key, { title: source.title, category: source.key === "contrat" ? "contract" : "guide", language: "fr", file_url: fileUrl(source.hash), description, status: "published" });
      add(rows, "uploads", source.key, {
        title: source.title, category: source.model ? "product_manuals" : "resources", language: "fr", file_url: fileUrl(source.hash),
        file_name: `${source.key}.pdf`, mime_type: "application/pdf", file_size: source.bytes,
        visibility: "client_visible", status: "ready", related_product: null, related_course_id: null, related_lesson_id: null, description,
      });
    }
    const item = contentFor(source, bytes);
    assertSafeText(item.title);
    const article = add(rows, "kb_articles", source.key, {
      category_id: stableId(`kb_categories:category-${source.category}`), author_id: authorId,
      title: item.title, language: "fr", slug: `corrected-fr-${source.key}`, content: item.content,
      excerpt: source.kind === "pdf" ? "Document corrigé à consulter." : item.title,
      status: "published", tags: item.tags, source_key: sourceKey(source.key), source_revision: source.revision ?? REVISION,
      source_hash: source.hash, ai_eligible: item.eligible,
    });
    if (item.eligible) {
      const document = add(rows, "ai_knowledge_documents", source.key, {
        title: item.title, language: "fr", category: source.kind === "business" ? "business_guide" : "support_article",
        source_url: `/kb/articles/${article.id}`, content: item.content, tags: [...item.tags, ownerMarker(sourceKey(source.key))],
        ai_active: true, status: "indexed", product_model: null,
      });
      // Each allowed section is short enough to be one complete, traceable chunk.
      add(rows, "ai_knowledge_chunks", source.key, {
        document_id: document.id, content: item.content, chunk_index: 0,
        metadata: { sourceKey: sourceKey(source.key), sourceRevision: REVISION, sourceHash: source.hash,
          contentHash: sha256(item.content), language: "fr", locator: item.locator,
          reviewScope: "editorial-nontechnical", aiEligible: "true" },
      });
    }
    inventory.push({ sourceKey: sourceKey(source.key), sourceRevision: source.revision ?? REVISION, sourceHash: source.hash, bytes: source.bytes,
      kind: source.kind, category: source.category, language: "fr", aiEligible: item.eligible, locator: item.locator,
      contentHash: sha256(item.content), ...(source.kind === "pdf" ? { fileUrl: fileUrl(source.hash) } : {}) });
  }
  // Bind prepared artifacts to category/policy/citation changes without persisting
  // corpus text or requiring the eventual database author during offline prepare.
  const planHash = sha256(JSON.stringify(rows.map(row => {
    const { author_id: _author, ...values } = row.values;
    return { ...row, values };
  })));
  return { rows, pdfs, manifest: `${JSON.stringify({ version: 1, namespace: NAMESPACE, revision: REVISION, planHash, categories: CATEGORIES, inventory }, null, 2)}\n` };
}

export async function stageBundle(bundle: Bundle, input: string, source: string, prepare: boolean): Promise<string> {
  const staging = await externalDirectory(input, await realpath(source), prepare);
  await ensurePrivateChild(staging, STORAGE_PREFIX, prepare);
  for (const pdf of bundle.pdfs) {
    const file = path.join(staging, pdf.key);
    if (prepare) await publishPrivate(file, pdf.bytes);
    requireImport(sha256(await readRegular(file)) === pdf.hash, "STAGED_HASH_MISMATCH");
    requireImport(((await lstat(file)).mode & 0o077) === 0, "PRIVATE_FILE_PERMISSIONS");
  }
  const manifest = path.join(staging, "manifest.json");
  if (prepare) await publishPrivate(manifest, Buffer.from(bundle.manifest));
  requireImport((await readRegular(manifest)).toString() === bundle.manifest, "MANIFEST_MISMATCH");
  requireImport(((await lstat(manifest)).mode & 0o077) === 0, "PRIVATE_FILE_PERMISSIONS");
  return staging;
}

export function summarize(bundle: Bundle): Record<string, number> {
  return Object.fromEntries([
    ...(["kb_categories", "resources", "uploads", "kb_articles", "ai_knowledge_documents", "ai_knowledge_chunks"] as const).map(table => [table, bundle.rows.filter(row => row.table === table).length]),
    ["pdfs", bundle.pdfs.length], ["faqs", SOURCES.filter(source => source.kind === "faq").length],
    ["aiEligibleArticles", bundle.rows.filter(row => row.table === "kb_articles" && row.values.ai_eligible).length],
  ]);
}
