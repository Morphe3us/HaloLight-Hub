# Corrected Documentation Integration

## Scope

- Six client navigation groups, with Support containing tickets, knowledge base and AI; Hardware remains under Settings. Existing admin destinations and business routes are preserved.
- Eight interface locales. Imported content is French, explicitly selectable; no translations are fabricated.
- Six French documentation categories; 47 articles: 15 PDF overview/download articles, 28 FAQ articles, three definitions and one reviewed nonprocedural business section.
- Fifteen private PDFs, served through authenticated `/api/files/` routes. No PDFs or complete source corpus are bundled into the public app or committed to Git.
- Only four reviewed nonprocedural articles are initially eligible for AI. Technical procedures remain excluded pending validation.
- Source-backed citations, language-aware retrieval, recent conversation history and explicit support escalation.

Clerk configuration, Bunny playback configuration, Academy course/video IDs, progress, contracts, stocks and customer roles are not changed by this integration.

## Verification

Executed on a disposable local PostgreSQL database, never the production database:

- Applied the additive SQL migration twice against the previous KB column layout; existing content and views were preserved. Subsequent Drizzle push detected no schema changes.
- First import inserted 91 records across six tables. Second import changed nothing: 91 unchanged, zero inserts or updates.
- Actual PostgreSQL HTTP integration tests passed: category counts, French accent search, language filters, pagination, optimistic concurrent edits, atomic views, provenance changes and PDF publication revocation.
- All 15 imported PDFs returned PDF bytes to authenticated clients and 401 to anonymous requests. Fixture cleanup preserved every imported record and the existing test article.
- Desktop 1440x1000 and mobile 390x844 browser fixtures tested the actual KB components, sidebar, generated hooks and authenticated fetcher: English empty state, explicit French selection, three-page pagination, debounced search, Markdown tables, PDF failure/retry/success and no page overflow.
- Full workspace typecheck passed. Hosting build passed using Node 24 and frozen pnpm 11.7.0 installation.

Browser fixtures use isolated local mock authentication and data; they are not shipped or imported by the application. These checks do not prove a production deployment or a real Clerk login.

## Operational Order

1. Obtain a tested database backup and retain the previous application release. Preserve the private `.env` file without printing it.
2. Transfer the hash-verified allowlisted archive using a private channel. Do not put it under the served site or in public Git.
3. Ensure the hosting account's durable private storage directory survives builds and restarts; directories must be `0700`, files `0600`. Configure `STORAGE_PROVIDER=filesystem` and `PRIVATE_STORAGE_DIR` outside the site, release and frontend roots.
4. Apply `scripts/migrations/2026-09-10-kb-content.sql`. It adds columns and a unique constraint only; never run a broad seed or destructive schema sync against production.
5. Build the reviewed release. Use the existing hosting build/start commands; do not change Clerk or Bunny settings.
6. Follow `docs/integration-import.md`: prepare, check, database dry-run with an existing administrator author, then explicit production apply with a backup reference and matching private storage root.
7. Verify live authenticated article/PDF access, anonymous denial, language selection, Academy playback and a representative client account before announcing availability.

The importer refuses to overwrite locally edited, unpublished or differently approved records. Review such conflicts instead of forcing them. Copied PDF URLs remain subject to the canonical article and resource publication states; linked AI copies remain subject to the current approved article.

## Current Release State

Deployed on Infomaniak on 2026-09-10, application revision `bc253c3` (integration `f0c10fd`). The managed hosting build succeeded and restarted the server on port 3000; public health returned HTTP 200.

- Retained the full previous site archive at baseline `5023e07`, including its private environment and built assets, outside the served site. Verified gzip integrity and mode 0600.
- Captured a consistent, hash-verified backup of the six affected database tables before migration. This is a targeted backup, not a full database backup. A private copy is retained on the Mac and hosting account. The restore helper was tested only on disposable PostgreSQL.
- Transferred the allowlisted source archive privately; remote SHA-256 matched `7db9eab36acdcea487610801111636f8430f6d25d3f4f1eca976563568489aa5`.
- Applied the additive migration and imported 91 new records. Subsequent production dry-run reported 91 unchanged, no inserts, updates or deletions. Compared all pre-existing rows against their backup: unchanged.
- Configured `STORAGE_PROVIDER=filesystem`, with `PRIVATE_STORAGE_DIR=/srv/customer/.local/share/halohub-private-files`. Prior provider was URL-only and there were no existing internal file records to migrate. External links are unchanged.
- Verified all 15 PDF hashes, regular-file ownership structure and private permissions after the managed restart.
- Live anonymous requests to all 15 PDF endpoints and the KB article list returned HTTP 401.

Authenticated production browsing and video playback still require a real Hub session. The integrated browser was left at Clerk sign-in; an Infomaniak session does not authenticate to the Hub. Do not interpret local authenticated fixtures as a completed production login test. The displayed Clerk sign-in remains in Development mode; changing that configuration is outside this documentation deployment.
