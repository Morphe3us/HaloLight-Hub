# HaloLight OS

An all-in-one SaaS customer portal for HaloLight — a professional photobooth and event equipment company. Clients manage their business, track equipment, access training, handle support, and grow their operations from a single platform.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/halolight-os run dev` — run the frontend (port 18205)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed` — seed demo/onboarding data
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` — auto-provisioned by Replit Clerk

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, TailwindCSS v4, shadcn/ui, Wouter, TanStack Query, Framer Motion
- Auth: Clerk (Replit-managed, auto-provisioned)
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
  - `users.ts` — /users/me, /users (admin), /users/:id
  - `notifications.ts` — /notifications, /notifications/preferences
  - `onboarding.ts` — /onboarding/steps, /onboarding/summary
- `artifacts/api-server/src/middlewares/` — Clerk proxy and requireAuth middleware
- `artifacts/api-server/src/lib/userSync.ts` — JIT user provisioning (creates local user on first Clerk login)
- `artifacts/halolight-os/src/` — React frontend
- `scripts/src/seed.ts` — demo data seeder

## Architecture decisions

- **OpenAPI-first**: All API contracts defined in `lib/api-spec/openapi.yaml`; hooks and Zod schemas generated automatically via Orval
- **JIT user provisioning**: Local users are created automatically in the DB on first Clerk login using `getOrCreateUser()` — no manual registration step
- **Clerk-managed auth**: Replit provisions Clerk keys; proxy middleware at `/api/__clerk` routes Clerk traffic through the Express server
- **Role-based access**: User roles (admin, client, coach, sales_rep) stored in local DB; checked in route handlers; admin routes gated by `user.role === 'admin'`
- **Notification system as backbone**: Notification types are string constants; the delivery layer (email, push) is architected but channels can be wired up in later phases

## Product — Implemented Phases

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

- After schema changes: always run `pnpm --filter @workspace/db run push`
- After OpenAPI spec changes: always run `pnpm --filter @workspace/api-spec run codegen`
- To make a user an admin: update role directly in DB after their first login (JIT provisions them as 'client')
- Clerk dev keys log a warning in console — expected in development, not a bug
- The `scripts` package needs workspace deps explicitly added to its package.json

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `.local/skills/clerk-auth/references/setup-and-customization.md` for Clerk wiring details
