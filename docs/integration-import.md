# Corrected Content Import

## Command Contract

Run from the repository root; no package script or new dependency is required.
Supply paths through shell variables; do not commit their values or source files.

```sh
pnpm --filter @workspace/scripts exec tsx src/import-corrected-content.ts prepare --source "$CORRECTED_SOURCE" --staging "$PRIVATE_STAGE"
pnpm --filter @workspace/scripts exec tsx src/import-corrected-content.ts check --source "$CORRECTED_SOURCE" --staging "$PRIVATE_STAGE"
pnpm --filter @workspace/scripts exec tsx src/import-corrected-content.ts --source "$CORRECTED_SOURCE" --staging "$PRIVATE_STAGE"
```

`prepare` writes only private external staging files. `check` verifies the pinned
source inventory and prepared artifacts. The default `dry-run` is offline and
reports planned counts, never source text, source paths, credentials, or SQL.
Database-aware diff requires explicit `--database --author-id <existing-user-id>`.
Only after the main operator authorizes database writes:

```sh
pnpm --filter @workspace/scripts exec tsx src/import-corrected-content.ts dry-run --source "$CORRECTED_SOURCE" --staging "$PRIVATE_STAGE" --database --author-id "$IMPORT_AUTHOR"
pnpm --filter @workspace/scripts exec tsx src/import-corrected-content.ts apply --source "$CORRECTED_SOURCE" --staging "$PRIVATE_STAGE" --author-id "$IMPORT_AUTHOR" --storage-dir "$PRIVATE_STORAGE_DIR" --target local --confirm-apply corrected-content
```

Database modes use an explicitly supplied process `DATABASE_URL`; no dotenv or
secret file is loaded. Implementation/testing must not run either database mode
without main authorization. Apply requires an explicit `--target local|staging|production`.
For an eventual reviewed production import, use `--target production` plus
`--backup-reference <existing-backup-id>` and the same explicit author and
`--confirm-apply corrected-content`. The backup reference is an operator attestation,
not a backup creation or verification operation. Main must verify restorability
before authorizing execution. The importer does not open backup files or log the
reference. Do not mislabel production as local or staging.

## Schema Assumptions For Main

The importer does not create/migrate tables. Main must first add:

- `kb_categories.language`: non-null text, default `en`; retain unique slug.
- `kb_articles.language`: non-null text, default `en`.
- `kb_articles.source_key`: nullable unique text.
- `kb_articles.source_revision` and `source_hash`: nullable text.
- `kb_articles.ai_eligible`: non-null boolean, default false.

Existing article `author_id` is required and references an existing user. Import
requires an explicit existing author; no user or broad seed is created. Existing
resources/uploads and AI document/chunk tables are reused unchanged. Imported
language is `fr`. Manual model tags live on KB articles; upload `related_product`
stays null so existing model download restrictions do not hide these manuals.

Private storage must equal the API server's `PRIVATE_STORAGE_DIR` and stay outside
all Git working trees and the corrected source directory. Files use
`corrected-2026-09-10/<sha256>.pdf` and registered `/api/files/` URLs. Staging and
storage are distinct external directories. No frontend assets are written.
Apply requires `STORAGE_PROVIDER=filesystem` and an absolute `PRIVATE_STORAGE_DIR`
in the process environment, with the same canonical root as `--storage-dir`.
These checks run before database initialization and are repeated before publishing.
Use the API's actual storage/frontend configuration, not importer-only overrides.

## Inventory And Eligibility

`scripts/content/canonical.ts` is the explicit revision-pinned allowlist: 15 PDFs,
28 FAQ Markdown files, exactly 3 approved chatbot definitions, and one business
Markdown source from which only `Trois objectifs distincts` (page 3 of the visibility
guide) is extracted. File SHA-256 and byte length must match before any artifact
is prepared. FAQ IDs, language, revisions, editorial approval and unverified
hardware status are checked. FAQ 025 is `1.1-corrigee`; the others are `1.0-corrigee`.
Hashes cover original bytes; no original/corrected source is modified.

Expected plan: 6 French categories, 15 published resources, 15 ready client-visible
uploads, 47 published KB articles, 4 indexed/active AI documents, 4 provenance chunks.
The audited categories, in order, are: Bien démarrer; LumaBooth & Configuration;
Installation & Matériel; Dépannage & Support; Développer son activité; Contrats & Gestion.
Definitions belong to Bien démarrer, marketing/business to Développer son activité,
and the contract overview to Contrats & Gestion.
The 47 articles comprise 15 link-only guide overviews, 28 FAQs, 3 definitions and
1 nontechnical business subsection. All PDFs, overviews and FAQs are RAG-ineligible.
The contract PDF is downloadable as an explicitly unapproved illustrative document;
its clauses are never imported as facts. No README, configurations, backlog,
templates, arbitrary Markdown, complete business guide, or Guide360 is ingested.

Eligibility is code-owned, never taken from user-editable staging metadata or
inferred from a filename. Expanding eligibility requires review plus a deliberate
allowlist/code change. The canonical manifest builder lives in Git; PDFs, source
texts, and generated artifacts do not. The private generated `manifest.json`
contains provenance, hashes, locators and file URLs only, no corpus text or raw
source paths. It also pins category metadata and a plan hash (excluding the eventual
author), so category, citation and policy changes require a fresh prepared stage.
FAQs drop all frontmatter from visible content, retaining only a
strict safe metadata projection. Errors and summaries do not print native errors,
SQL parameters, credentials, source text or paths. A package runner may independently
echo its invocation on failure; use shell variables and private operational logs.

## Safety And Idempotency

Prepare verifies all inputs before writing and atomically publishes immutable
SHA-named PDFs plus a deterministic manifest. Existing unequal files are refused.
Directories must be private (`0700`), outside Git and source trees; files are `0600`.
Root symlinks, application/release directories and their ancestors/descendants,
`FRONTEND_DIST_PATH` (including resolved aliases), public roots, symlink file targets
and storage subdirectories are refused even in releases without Git metadata.
Multi-link files are rejected during staging validation, publication and the final
storage verification before DB writes, matching the runtime's `nlink === 1` rule.
An interrupted hard-link publication can leave a private temporary alias; the
importer fails closed instead of deleting a link it cannot prove is safe. Main
must inspect and remove only a confirmed importer-owned temporary alias before
retrying. A revised manifest
uses a fresh staging directory, not overwrites. Check/default dry-run require a
prepared stage and perform no writes, not even database module initialization.

Database dry-run is a read-only serializable transaction. Apply uses one serializable
transaction and transaction-scoped advisory lock `(726104, 20260910)`. Identity,
slug, file URL and ownership collisions fail closed. Source-key-owned article IDs
and dependent references are preserved, even if their existing UUID differs from
the deterministic UUID. Views, existing authors, creation/publication timestamps,
and unrelated rows are not updated. Existing managed fields are hashed against
the pinned canonical revision's ownership snapshot. Any difference, including
content/title edits, unpublication, visibility, AI approval, a new source revision,
or added/modified chunks, refuses the entire import for review. No automatic
revision upgrade or admin-edit reset is attempted. An unchanged reapply writes no
rows or timestamps. Only missing rows are inserted; no chunks are automatically
pruned. A reviewed update workflow needs a separately verified prior baseline.

UUIDv8 IDs derive from SHA-256 of the stable namespaced table/content key, never
from content hashes. Resources/uploads carry ownership/revision/hash markers in
description; AI documents carry an ownership tag; chunks carry source key/revision/
hash, content hash, language, locator and review scope. Source URLs use the actual
`/kb/articles/<id>` client citation route.

Apply copies immutable PDFs into private storage before publishing DB references.
Filesystem and PostgreSQL cannot share a transaction: failure rolls back all DB
changes, but may leave private, unregistered hash files. They are not automatically
deleted and cannot be downloaded through the metadata-authorized API. Rerun after
reviewing a failure; no broad reset, seed, archive, or destructive cleanup occurs.
The importer never creates backups, embeds secrets, reads dotenv, downloads files,
calls embedding providers, or executes schema migrations.

## Legacy Guide360

No exact legacy record identity exists in the inspected source code. Main must
resolve it from an authorized read-only DB inventory, not guess from `360` words.
Once identified, append `--legacy-guide-id <exact-uuid>` to a database dry-run.
This reports exact-ID presence counts in resources, uploads, KB and AI documents;
it never archives or deletes anything. Repeat for separately identified records.
Quarantine of a known unvalidated legacy record is a separate, explicitly reviewed
operation owned by main. Valid mentions of 360-degree subjects are not blanket-banned.

## Private Source Transfer

Fixes are ready; 91 initial row inserts are the expected database diff. Package
only the canonical 47 input files and one generated review manifest locally:

```sh
pnpm --filter @workspace/scripts exec tsx content/pack-source.ts --source "$CORRECTED_SOURCE" --output-dir "$PRIVATE_TRANSFER_DIR"
```

The output directory must be private and external, not inside the source, Git,
application, or public roots. The command verifies every source hash, snapshots
only those exact relative files, and writes a `0600` SHA-named `.tar.gz`. It prints
only the archive filename, SHA-256, size, and counts. The archive has 48 regular
file entries: 47 canonical inputs plus `import-review-manifest.json`. No recursive
source-directory tar, assets, other configs/manifests, README, backlog, or Guide360
is included. The FAQ source metadata and business Markdown remain private archive
content as required for source hash verification; they are not Git/public assets.
The review manifest records relative paths and hashes without absolute source paths.

Main owns archive transfer via private Infomaniak web FTP. Do not upload into a
web-served directory. Verify the printed SHA-256 again on the server before
extracting, then extract as the application owner into a new empty private root:

```sh
set -eu
umask 077
SOURCE_DIR=/srv/customer/.local/share/halohub-content-source-2026-09-10
printf '%s  %s\n' "$EXPECTED_SHA256" "$PRIVATE_ARCHIVE" | sha256sum --check --status
mkdir -m 700 "$SOURCE_DIR"
tar --extract --gzip --file "$PRIVATE_ARCHIVE" --directory "$SOURCE_DIR" --no-same-owner --no-same-permissions
```

Set `EXPECTED_SHA256` to the locally printed archive hash before running this block. A
pre-existing source root makes `mkdir` fail: stop rather than overlaying files.
The archive is locally generated and checksum-verified, not an arbitrary upload.
Keep staging and filesystem storage as separate private siblings, for example
`halohub-content-staging-2026-09-10` and `halohub-private-storage`, under the same
`.local/share` parent. Run `prepare --source "$SOURCE_DIR" --staging "$PRIVATE_STAGE"`
on the server, followed by `check` and the authorized database dry-run. The CLI
reads the preserved `documents/...`, `kb-fr/faq/...`, and `chatbot/facts/...` paths;
it ignores the review manifest as content and independently verifies its own pins.
No upload or server apply is performed by the packing command.

## Tests

```sh
pnpm --filter @workspace/scripts exec tsc -p tsconfig.json --noEmit
pnpm --filter @workspace/scripts exec tsx --test content/import.test.ts
CORRECTED_CONTENT_SOURCE="$CORRECTED_SOURCE" pnpm --filter @workspace/scripts exec tsx --test content/import.test.ts
```

The optional source-backed test uses private temporary staging, verifies the actual
corpus and repeated preparation, rejects manifest/PDF tampering, and removes only
its own temporary files. All tests are offline and database-free. Main should still
verify against the disposable database: initial diff/apply, second no-op diff/apply,
view/ID preservation, deliberate collision rollback, and authenticated PDF access.
