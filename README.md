# HaloLight Hub

Local setup for a public clone.

Supabase Auth replaces Clerk in the implementation currently underway. These
instructions describe the target setup, not a completed production rollout.
Keep the existing live release until the cutover smoke tests pass; deployment
is handled separately by the parent task/operator.

## Prerequisites

- Node.js 24+
- `pnpm` 11.7.x
- PostgreSQL database reachable through `DATABASE_URL`
- A Supabase project with Auth configured for email/password and Google

The checked-in lockfile is validated for macOS and Linux x64 glibc. If you use Alpine/musl or ARM Linux, regenerate and verify the lockfile on that platform before relying on CI.

## Setup

```bash
pnpm install
cp .env.example .env
set -a
source .env
set +a
```

`DATABASE_URL` must be present in your shell before any DB command runs. The Drizzle config and DB package fail fast if it is missing.

## Environment variables

Create `.env` from `.env.example` and fill in the required values:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (server-side admin operations only; never browser code)
- `VITE_SUPABASE_URL` (same project as `SUPABASE_URL`)
- `VITE_SUPABASE_PUBLISHABLE_KEY` (public browser key for that project)
- `APP_PUBLIC_URL` (`http://localhost:18205` locally; the HTTPS app origin in production)
- `ALLOW_PUBLIC_SIGNUPS=false`

All `VITE_` values are public build-time configuration. Never expose a secret or
service-role key there. The server publishable key authenticates ordinary user
requests; the secret key is reserved for trusted admin operations such as invites
and the operator-run relink tool.

Optional:

- `VITE_API_PROXY_TARGET`
- `LOG_LEVEL`
- `RUN_DB_PUSH_ON_POST_MERGE`
- `SEED_ADMIN_AUTH_ID`, `SEED_ADMIN_EMAIL` (disposable development databases only)
- `AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`
- `STORAGE_PROVIDER`
- `ENABLE_COMMUNITY`
- `BUNNY_PLAYBACK_SECURITY_CONFIRMED`
- `SEED_DEMO_ACADEMY`
- `SEED_DEMO_DATA`
- `BUNNY_STREAM_API_KEY`, `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_CDN_HOSTNAME`
- `BUNNY_STREAM_TOKEN_AUTH_KEY` (server-side embed signing key)
- `BUNNY_API_KEY` (optional account API key for security diagnostics)

## Database

For a disposable local development database only (verify `DATABASE_URL` first):

```bash
set -a
source .env
set +a
pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run seed
```

For local setup, `SEED_ADMIN_AUTH_ID` identifies the Supabase user UUID; alternatively, `SEED_ADMIN_EMAIL` creates a `manual_*` admin row eligible for verified-email linking. Never run seed commands against production, including to migrate an existing admin.

Keep both signup flags explicitly `false`. Supabase authentication alone does not grant app access: existing active bindings are used, and only an unambiguous active `manual_*` app user can be linked by verified email. Existing Clerk-bound app users require the exact one-time relink below, not automatic email rebinding.

The logical API/ORM user field is now `authId`, replacing `clerkId`. Its physical SQL column remains `public.users.clerk_id` for a reversible provider cutover; it has not been dropped or renamed. Local user IDs, roles and data ownership must remain unchanged.

### Invitations and existing accounts

An authenticated app admin can send an invitation with `POST /users/{id}/invite`
(HTTP path `/api/users/{id}/invite`). The target must be an active, manually
created `manual_*` user with a real email. Creating the app row alone does not
send email, and this endpoint does not migrate an existing Clerk-bound account.

For each existing app user, first have the operator establish the intended
Supabase account with a confirmed matching email. With credentials supplied
securely in the process environment, inspect the exact mapping using:

```bash
node --import tsx scripts/src/supabase-auth-relink.ts \
  --local-user-id <exact-local-uuid> \
  --expected-auth-id <exact-existing-auth-id> \
  --new-auth-id <supabase-user-uuid>
```

Dry-run is the default: it reads the DB and Supabase Admin API without writes.
The script does not load `.env`; it requires `DATABASE_URL`, `SUPABASE_URL` and
`SUPABASE_SECRET_KEY` in its process environment. Use canonical lowercase UUIDs
and the exact old binding, not an email or a guessed ID. Apply only after review
and a verified backup by adding `--apply --backup-reference <existing-backup-reference>`.
The reference attests to a backup; it does not create or verify one. Completed
mappings fail the old-ID precondition on replay; do not blindly retry an uncertain
commit. See the [relink runbook](scripts/auth-migration/README.md) for validation
and rollback prerequisites. Never substitute a production seed.

### Supabase Auth setup

In the Supabase dashboard, enable email/password and Google, keep email
confirmation enabled, and disable **Allow new users to sign up**, **Allow
anonymous sign-ins** and **Allow manual linking**. The last setting concerns
Supabase identity linking, not the operator-controlled app-user relink.

Custom SMTP is essential before client invitations or recovery: the default
sender only delivers to project team addresses and currently allows two messages
per hour. Configure the Site URL, exact redirect allowlist and custom invite and
recovery templates in the [deployment guide](docs/infomaniak-deployment.md#supabase-auth-configuration).
Use a separate development project with Site URL `http://localhost:18205` and
the corresponding `/auth/callback`, `/auth/invite` and `/auth/recovery` URLs.

Seed skips demo Academy courses by default so placeholder YouTube/example.com content is not published. Set `SEED_DEMO_ACADEMY=true` only for a demo database. CRM/revenue/support demo records are skipped outside explicit development unless `SEED_DEMO_DATA=true`.

Storage must be explicit outside `NODE_ENV=development` or `NODE_ENV=test`. Use `STORAGE_PROVIDER=url` for URL-only resource workflows, or implement/configure a durable private provider before enabling direct uploads.

Community is disabled for non-admins unless `ENABLE_COMMUNITY=true` is set or the API runs with `NODE_ENV=development`. Keep it disabled for a private training launch unless cross-client discussion is intended.

Bunny playback outside `NODE_ENV=development` requires `BUNNY_STREAM_TOKEN_AUTH_KEY`, `BUNNY_STREAM_LIBRARY_ID` and `BUNNY_PLAYBACK_SECURITY_CONFIRMED=true`. The confirmation flag alone cannot unlock production playback. In Bunny Stream > library > Security, enable Embed view token authentication, configure the allowed app domain and disable direct play. The embed token key is different from the Stream API key. Keep both keys server-side, never under a `VITE_` name. The API signs authorized lesson URLs for one hour; signatures are not stored in the catalog or database. Course outlines expose thumbnails only, and lesson responses use `Cache-Control: private, no-store`.

The Stream API returns library statistics, not security settings. The admin diagnostic only reports verified remote security settings when the optional account `BUNNY_API_KEY` is available; unknown values remain unknown. `BUNNY_STREAM_CDN_HOSTNAME` supplies the thumbnail hostname. CDN token protection is separate from embed protection: if enabled, thumbnails and previews also need CDN-compatible protection; do not disable it to work around a 403. See [Bunny embed authentication](https://bunny.net/docs/stream/token-authentication) and [Bunny security layers](https://bunny.net/docs/stream/security).

Before delivering a Bunny lesson or importing a video in production, the API also probes the player: the unsigned embed must return 403 and a correctly signed embed must return 200. Successful checks are shared for 60 seconds to avoid repeated requests during navigation; checks expire and failures never unlock playback. Changing a local confirmation flag cannot bypass this remote check. An unavailable account-management API is reported separately and does not hide the remaining diagnostic results.

The post-merge helper never pushes DB changes automatically unless you opt in:

```bash
RUN_DB_PUSH_ON_POST_MERGE=1 scripts/post-merge.sh
```

## Run locally

Start the API in one terminal:

```bash
set -a
source .env
set +a
PORT=8080 pnpm --filter @workspace/api-server run dev
```

Start the frontend in another terminal:

```bash
set -a
source .env
set +a
PORT=18205 VITE_API_PROXY_TARGET=http://localhost:8080 pnpm --filter @workspace/halolight-os run dev
```

Local URLs:

- Frontend: `http://localhost:18205`
- API: `http://localhost:8080`

Both apps read `PORT`, so set ports per command instead of storing one shared `PORT` value in `.env`.

## Validation commands

```bash
pnpm run typecheck
pnpm run test
pnpm run build
pnpm --filter @workspace/scripts run check-academy-launch
```

`check-academy-launch` loads the root `.env` when present, checks database access, published academy content, the presence of Supabase Auth configuration, the HTTPS public URL and real Bunny playback restrictions. It prints no credentials, performs no writes, and exits nonzero while a launch prerequisite is missing. It does not prove email delivery, Google login or account migration; a successful build alone is not evidence that Supabase or Bunny works.

`GET /api/healthz` is process liveness. Use `GET /api/readyz` for database readiness: it returns JSON 503 with `code: DATABASE_UNAVAILABLE` within two seconds when the DB cannot be reached. A Supabase `tenant/user not found` response requires checking the project status and the current connection string in Supabase; setting a local flag cannot repair it.

## Production hosting

For Infomaniak Node.js 24 at `hub.halolightbooth.com`, set the execution folder to
the repository root and use:

```bash
# Build command (installs full dependencies using pnpm 11.7.0)
bash scripts/hosting-build.sh
# Launch command
npm start
```

`npm run build:hosting` also runs the hosting build. Do not use `npm install`.
Export `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the intended
production project in the build environment. The frontend has no public signup form.
The script validates the public key and hosted project URL. It typechecks shared libraries and the real
frontend/API, then builds only those applications, excluding the mockup sandbox.
No schema pushes or seeds run automatically.

The start wrapper sets production mode before loading the API and preserves the
platform's `PORT`. Express serves `artifacts/halolight-os/dist/public` with SPA
fallback alongside `/api/*`. Override `FRONTEND_DIST_PATH` only for a different
frontend output location; relative paths resolve from the repository root.
Vite's development proxy is not a production reverse proxy.

See the [Infomaniak deployment guide](docs/infomaniak-deployment.md) for environment
settings, domain/HTTPS setup, release checks and rollback precautions.
