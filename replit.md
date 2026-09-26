# HaloLight OS

An all-in-one SaaS customer portal for HaloLight — a professional photobooth and event equipment company. Clients manage their business, track equipment, access training, handle support, and grow their operations from a single platform.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/halolight-os run dev` — run the frontend (port 18205)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed` — seed a disposable development DB only; never production
- Required env: `DATABASE_URL` — Postgres connection string
- Required server env: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (admin operations only; never expose to the browser)
- Required frontend build env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (same Supabase project)
- App origin: `APP_PUBLIC_URL`; invitation-only: `ALLOW_PUBLIC_SIGNUPS=false`. Public registration with manual approval uses `true` plus Supabase signups enabled only after the approval gate is deployed.

Supabase Auth migration is underway; this is current implementation guidance,
not a production rollout claim. Deployment remains with the parent task/operator.
Retain the old live release until email, Google, client-role access and actual
video playback pass the [cutover checks](docs/infomaniak-deployment.md#release-and-verification).

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, TailwindCSS v4, shadcn/ui, Wouter, TanStack Query, Framer Motion
- Auth: Supabase Auth (email/password, Google PKCE; admin-approved Hub access)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all API contracts)
- `lib/db/src/schema/` — Drizzle ORM table definitions
  - `users.ts` — users table with roles and language preferences
  - `notifications.ts` — notifications and notification_preferences tables
  - `onboarding.ts` — onboarding_steps and user_onboarding_progress tables
- `artifacts/api-server/src/routes/` — Express route handlers
  - `users.ts` — /users/me, /users (admin), /users/:id, POST /users/:id/invite (admin)
  - `notifications.ts` — /notifications, /notifications/preferences
  - `onboarding.ts` — /onboarding/steps, /onboarding/summary
- `artifacts/api-server/src/middlewares/` — Supabase bearer authentication and requireAuth middleware
- `artifacts/api-server/src/lib/userSync.ts` — existing binding lookup and guarded verified-email linking for active manual app users
- `artifacts/halolight-os/src/auth/` — Supabase session handling and auth callbacks
- `scripts/src/supabase-auth-relink.ts` — operator-only exact one-account migration, dry-run by default
- `artifacts/halolight-os/src/` — React frontend
- `scripts/src/seed.ts` — demo data seeder

## Architecture decisions

- **OpenAPI-first**: All API contracts defined in `lib/api-spec/openapi.yaml`; hooks and Zod schemas generated automatically via Orval
- **Account provisioning**: With both signup flags disabled, access is invitation-only. Public signup may be enabled after deploying the approval gate; verified newcomers become pending clients. Verified-email auto-linking is restricted to a unique active, approved `manual_*` app user. Existing provider-bound users require an explicit relink.
- **Supabase-managed auth**: Browser sessions use public project configuration; API middleware validates bearer tokens. `SUPABASE_SECRET_KEY` is restricted to server-side admin operations. Google uses PKCE at `/auth/callback`; invite and recovery email templates target `/auth/invite` and `/auth/recovery` with `token_hash` and the corresponding type. These flows must be smoke-tested before release.
- **Identity compatibility**: The logical API/ORM field `authId` replaces `clerkId`, but the physical `users.clerk_id` column is intentionally retained for reversible cutover. Relinking preserves the local user ID, role and ownership; code rollback alone does not restore changed auth bindings.
- **Admin invitations**: `POST /users/{id}/invite` (under `/api`) sends to active manual app users only; row creation does not itself send an email. It is not the existing-account migration mechanism.
- **Auth operations**: In Supabase, enable Google and email/password with email confirmation; keep anonymous sign-ins and manual identity linking disabled. Enable public signups only with the deployed approval gate and matching API flag. Custom SMTP is required for real clients. Configure exact redirects and templates using the [deployment guide](docs/infomaniak-deployment.md#supabase-auth-configuration).
- **Role-based access**: User roles (admin, client, coach, sales_rep) stored in local DB; checked in route handlers; admin routes gated by `user.role === 'admin'`
- **Account approval**: `users.accessStatus` is independent of role and activation. Public JIT writes `pending` and `client`; existing accounts and explicit admin invitations remain approved. All authenticated API requests except own access status pass the approval gate before consent/business routing. Never auto-approve after the displayed 12-hour manual review window.
- **Notification system as backbone**: Notification types are string constants; the delivery layer (email, push) is architected but channels can be wired up in later phases

## Product — Implemented Phases

Historical implementation records follow. Clerk references in completed phases
describe what shipped at that time, not the current Supabase setup above.

### Phase 1 — Foundation (complete)
- Clerk authentication (sign in, sign up, sign out) with branded pages
- JIT user provisioning with role system (admin, client, coach, sales_rep)
- Multilingual support framework (8 languages: EN, FR, ES, DE, IT, PL, PT, NL)
- Main application shell: sidebar + topbar, responsive layout
- Client dashboard with KPIs and onboarding progress
- Notification inbox with unread badge, mark-read, mark-all-read
- Notification preferences (per-channel toggles)
- Onboarding wizard (8 steps, completion tracking)
- User profile settings (name, company, phone, language)
- Admin user list view
- Public landing page

### Phase 6 — Hardware Management (complete)
- Equipment registry (5 tables: equipment, service_history, consumable_catalog, consumable_stock, consumable_orders)
- 12 API endpoints across equipment.ts and consumables.ts
- Equipment page with warranty/maintenance alert flags
- Equipment Detail with service history timeline
- Consumables page with stock bars, days remaining, reorder workflow
- Admin Equipment dashboard with alert filters and search
- Seeded 7 units, 24 service records, 18 stock rows, 8 orders

### Phase 7 — AI Assistant (complete)
- Provider abstraction layer: `artifacts/api-server/src/lib/ai/`
  - `provider.ts` — AIProvider interface, RAGSource, SuggestedAction types
  - `mock.ts` — Local mock provider (no API key needed), domain-aware rich responses
  - `openai.ts` — OpenAI streaming provider (gpt-4o-mini default)
  - `claude.ts` — Anthropic streaming provider (claude-3-5-haiku default)
  - `factory.ts` — Auto-selects provider: OPENAI_API_KEY → ANTHROPIC_API_KEY → Mock
  - `rag.ts` — RAG retrieval: keyword search on KB articles + Academy courses (vector-search-ready)
- New SSE streaming endpoint: `POST /ai/conversations/:id/stream`
- Escalation endpoint: `POST /ai/conversations/:id/escalate` (creates support ticket)
- Provider info endpoint: `GET /ai/provider`
- DB schema additions: `sources` (jsonb) and `suggestedActions` (jsonb) on ai_messages; `providerName` on ai_conversations
- Full AIAssistant.tsx rewrite: SSE streaming chat, source citations, suggested action buttons, provider badge, escalation dialog, conversation history sidebar
- Seeded 8 starter AI suggested questions

### Phase 8 — Automation Engine (complete)
- DB schema: 3 tables (`automation_rules`, `automation_executions`, `automation_logs`)
- 10 trigger evaluators: `onboarding_stalled`, `inactive_user`, `low_academy_progress`, `no_events_created`, `no_quotes_created`, `low_consumable_stock`, `warranty_expiring`, `high_performer_detected`, `upsell_opportunity_detected`, `coaching_recommendation_generated`
- 6 action handlers: `in_app_notification`, `email_template_generation`, `coaching_task_creation`, `support_follow_up`, `upsell_recommendation`, `consumable_reorder_recommendation`
- Engine (`engine.ts`): per-rule evaluator → matcher → cooldown check (24h default) → action dispatch → log writes
- Scheduler (`scheduler.ts`): 5-min warm-up delay, then 1-hour interval; wired to SIGTERM/SIGINT
- 11 REST endpoints: CRUD on rules, manual trigger, execution history, logs, stats, run-all
- Admin dashboard at `/admin/automation`: 7-stat header, rules list with enable toggle + manual run, execution timeline, filterable log table
- Seeded 10 default rules (one per trigger type) via `pnpm --filter @workspace/scripts run seed-automation`

### Phase 9 — Brand & Design System Overhaul (complete)
- **Design system**: Full CSS variable replacement in `index.css` — Plus Jakarta Sans font, warm palette (#FAF8F5 bg, #DDB398 accent, #111111 primary, semantic success/warning/danger/info tokens)
- **Dark mode**: Complete warm-dark palette (#1A1714 bg, #242018 surface, #F5F0E8 text) via `ThemeProvider` + localStorage persistence; toggle in Topbar
- **Typography**: Plus Jakarta Sans (Google Fonts) with Inter fallback; applied across all pages
- **Shadows**: Warm accent-tinted shadow system (rgba(221,179,152,...)) replacing cold blue shadows
- **Border radius**: Increased to 0.75rem (cards 12–16px feel)
- **Landing page**: Rewritten with brand tokens, HaloLight logo, terracotta accent hero, 6-feature grid, dark CTA section
- **Sidebar**: Updated with HaloLight logo (dark/light variants), semantic `text-muted-foreground` nav items, warm accent active states, cleaner layout
- **Topbar**: Added dark mode toggle (Sun/Moon), brand token colors throughout
- **All 36+ pages**: Systematic hardcoded color replacement — `gray-*` → `foreground/muted-foreground/border`, `blue-*` → `info`, `red-*` → `destructive`, `green-*` → `success`, `yellow-*` → `warning`
- **Clerk auth pages**: Rebranded with new colors (primary dark, accent terracotta, Plus Jakarta Sans font, warm card styling, logo-dark.png)
- **Zero hardcoded colors remaining**: All pages and components use CSS design tokens

### Phase 11 — Export System (complete)
- **DB schema**: `export_logs` table — logs every export (userId, userEmail, exportType, format, scope, fileCount, recordCounts, createdAt)
- **API routes** (`artifacts/api-server/src/routes/exports.ts`):
  - `GET /exports/workspace-zip` — admin only; ZIP of 9 CSVs + `metadata.json`
  - `GET /exports/csv/:entity` — admin only; single entity CSV (leads, quotes, contracts, invoices, events, support-tickets, equipment, consumables, clients)
  - `GET /exports/personal` — any user; GDPR JSON dump of all personal data
  - `GET /exports/history` — admin only; export audit log (up to 500 entries)
- **CSV encoding**: UTF-8 BOM prefix (`\uFEFF`), RFC 4180 escaping (commas/quotes/newlines), `?sep=semicolon` option for EU Excel compatibility
- **File naming**: `halolight-{entity}-{YYYY-MM-DD}.csv`, `halolight-workspace-export-{YYYY-MM-DD}.zip`, `halolight-personal-data-{YYYY-MM-DD}.json`
- **ZIP generation**: archiver v8 (`ZipArchive` class), streamed directly to response
- **Permissions**: admin → full workspace; client → own data only (`userId` filter on all queries); no API keys or secrets ever exposed
- **OpenAPI spec**: 4 endpoints + `ExportLog` schema added; codegen updated
- **Frontend**:
  - `/admin/exports` — `AdminExports.tsx` with workspace ZIP button, 9 individual CSV download cards, CSV separator selector (comma/semicolon), and live export audit log table
  - Settings page — `PersonalExportCard` with GDPR download button
  - Sidebar: "Exports" nav item added to admin section
- **i18n**: `nav.exports` + 4 `settings.export_data.*` keys added to all 8 locale files

### Contract Generation Pipeline — 9 fixes + 6 follow-up fixes (complete)
- **Contract number in body**: `fillAllVariables` leaves `{{contract_number}}` intact (negative lookahead in catch-all regex); server replaces it with the real number after generating it — now always correct in saved content. Live preview shows `[Auto-generated on save]`.
- **Pricing format**: `fillAllVariables` now uses `Intl.NumberFormat` for locale-aware amounts (e.g. "700,00 €" in FR); `{{currency}}` outputs `""` eliminating double-currency display; trailing spaces trimmed from every line
- **HIDE_LINE mechanism**: Variables set to `"\x00HIDE_LINE\x00"` cause the entire containing line to be filtered out in post-processing, then excess blank lines collapsed
- **Zero discount/fees hiding**: `discount_amount`, `options_price`, `delivery_fees`, `tax_amount` hidden when zero
- **Service option checkboxes**: 5 boolean flags (`digitalGallery`, `customTemplate`, `deliveryIncluded`, `setupIncluded`, `operatorIncluded`) as `<Checkbox>` in the form; unchecked = line hidden in contract; checked = locale-aware "Included" text
- **Setup/pickup times**: Optional time fields in event section; hidden via HIDE_LINE when left empty
- **Equipment linking**: `equipmentIds: json[]` column on contracts table; `useGetEquipment` checkbox list auto-fills `equipmentDescription` and stores IDs
- **Provider signature**: `providerSignature` + `providerSignerTitle` columns on users table; Settings page "Provider Signature" card; templates use `{{provider_signature}}` / `{{provider_signer_title}}`
- **Template cleanup**: Node script fixed colon spacing (`:{{` → `: {{`) across all 8 language templates; added `{{provider_signature}}` + `{{provider_signer_title}}` variables to all provider signature sections
- **Equipment selector fix**: Selector now uses correct field names (`productModel`, `serialNumber`) — was using nonexistent `name`/`model` fields, producing empty circles; empty state message added
- **Equipment "undefined" fix**: Auto-fill and `equipment_list` variable now guard against `undefined`/empty — uses `productModel — SN: serialNumber` format
- **Company logo**: `logoUrl: text` column on users table; Settings "Company Logo" card with file upload (PNG/JPG/WebP/SVG, max 2 MB → base64 data URI) and URL paste input + preview + remove; logo appears on all 3 print templates
- **Professional document design**: Contracts, Quotes, Invoices print/PDF fully redesigned — clean header (logo left, document type/number/date right), two-column parties section, subtle `<hr>` dividers replacing `════` separators, dark value badge, proper `@page` print margins
- **No HaloLight branding on documents**: All 3 print templates removed "HaloLight Hub" — show company logo + name instead; if no logo set, no logo shown

### Sales CRM — Autocomplete + Duplicate Prevention (complete)
- **API endpoint**: `GET /sales/search?q=` — unified customer search across leads, quotes, contracts, invoices
  - Debounce-friendly: returns `{ items: [] }` for queries shorter than 2 characters
  - Merges results by email/name key: one suggestion card per unique customer, with all linked IDs
  - Scoped by userId for regular users; admins search entire workspace
  - Returns: id, type, name, company, email, phone, address, eventType, eventDate, eventLocation, currency, leadId, quoteId, contractId, invoiceId, pipelineStage, lastActivityAt
- **Reusable component** `components/CustomerSearchCombobox.tsx`:
  - Debounced fetch (300ms), keyboard navigation (↑↓ Enter Escape), loading spinner
  - Empty state: "No existing customer found"
  - Duplicate warning: inline `AlertCircle` if typed email matches an existing record
  - Clear (×) button resets selection; source type badge (Lead / Quote / Contract / Invoice)
- **Form integration** — Lead, Quote, Contract, Invoice creation dialogs:
  - "Search existing customer" field at top of each form
  - On selection: prefills name, company, email, phone, address, eventType, eventDate, eventLocation, currency
  - Passes pipeline link IDs: leadId (Quote/Contract/Invoice), quoteId (Contract/Invoice), contractId (Invoice)
  - Users can still edit prefilled values freely or ignore the search and type new values
  - Forms reset cleanly on close or success
- **Pipeline linking**: When an existing lead/quote/contract is selected, the new record inherits the link — no silently orphaned records
- **OpenAPI spec + codegen**: `/sales/search` endpoint + `CustomerSuggestion` schema added; `useSearchSalesCustomers` hook generated
- **i18n**: `sales_search.*` keys added to all 8 locale files

### Planned Phases (10+)
See architecture document for full 30-module scope.

## User preferences

- Do not implement external APIs until explicitly approved
- Stop after each phase and provide summary before continuing
- Clean, scalable, production-ready code
- Use mock/demo data where real integrations are pending

## Gotchas

- After schema changes: use `pnpm --filter @workspace/db run push` only on development databases; production changes require a separate reviewed operation and backup
- After OpenAPI spec changes: always run `pnpm --filter @workspace/api-spec run codegen`
- Existing admins migrate with `scripts/src/supabase-auth-relink.ts`: exact local ID, expected old auth ID and new Supabase UUID; dry-run first, then explicit apply with a verified backup reference. Never seed production to recreate an admin.
- Keep `authId` separate from the stable local user ID, and retain the physical legacy `clerk_id` column during cutover
- The `scripts` package needs workspace deps explicitly added to its package.json

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See [README setup](README.md), the [Supabase relink runbook](scripts/auth-migration/README.md) and [deployment guide](docs/infomaniak-deployment.md) for current auth wiring and cutover requirements

## Maintenance log (notes for the next AI)

### 2026-07-07 — Bug-hunt session (Claude Code, local)

Fixed three classes of bugs found by audit. All changes typecheck and pass tests (`pnpm run typecheck`, `pnpm run test` — 35 api-server + 4 frontend tests green). Nothing committed; changes are in the working tree alongside earlier uncommitted work.

1. **Document numbers were random, now sequential per user.**
   Contract/quote/invoice numbers were `PREFIX-YEAR-{random 1000–9999}` with no unique constraint — birthday-paradox duplicate risk after ~100 documents (~50% collision at 112), unacceptable for invoices (legal requirement in FR: sequential unique numbering).
   - New: `artifacts/api-server/src/lib/documentNumbers.ts` (pure `buildNextDocumentNumber`, unit-tested) and `documentNumberQueries.ts` (`nextContractNumber` / `nextQuoteNumber` / `nextInvoiceNumber`, DB-backed: max existing suffix for the user+year, +1, padded to 4 digits).
   - Wired into `routes/contracts.ts`, `routes/quotes.ts`, `routes/invoices.ts` (the old `generate*Number()` functions are gone). Prefixes unchanged: `CON-`, `Q-`, `INV-`. Legacy random numbers are treated as part of the sequence (next = max+1), so existing data needs no migration.
   - Known limitation: two concurrent creates by the same user could still collide (no unique constraint / no serialized allocation). If this matters later: add a unique index on `(user_id, contract_number)` etc. and retry on conflict.

2. **User-supplied `language`/dates could crash contract generation (HTTP 500).**
   - `fillContractVariables` in `routes/contracts.ts` passed `data.language` straight to `toLocaleDateString`/`toLocaleString`; any tag outside the 8 supported languages threw a `RangeError`. Now whitelisted against the `INCLUDED` map keys, fallback `en`. `fmtDate` also guards against Invalid Date.
   - Unparseable date strings (`eventDate`, `startDate`, `endDate`, `validUntil`, `dueDate`) previously became `Invalid Date` — either a DB serialization crash or the literal text "Invalid Date" inside a legal document. New helper `artifacts/api-server/src/lib/dateInput.ts` (`parseOptionalDateInput`, unit-tested) returns 400 with a field-specific message. Wired into POST+PUT of contracts, quotes, invoices.

3. **Frontend/server pricing mismatch.** `computePricing` in `artifacts/halolight-os/src/lib/contractValidation.ts` allowed a negative subtotal in the live preview while the server clamps to 0 (`Math.max(0, …)` in both `fillContractVariables` and `quotePricing.ts`). Preview now clamps too.

Audit notes (checked, no action needed): the 8 i18n locale files are fully in sync (1865 keys each); ownership checks (`validateOwnedLinks`) are consistently applied on create/update/status routes; division-by-zero spots in `revenue.ts`/`analytics.ts` are guarded; upload security, CORS policy, and academy access have test coverage.

Dev environment gotcha (macOS local): `pnpm` is only available through corepack and the root scripts re-invoke bare `pnpm`. Run `corepack enable --install-directory /tmp/clbin pnpm && export PATH=/tmp/clbin:$PATH` first, then `pnpm run …` works.
