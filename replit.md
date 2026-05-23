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

### Planned Phases (8–10)
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
