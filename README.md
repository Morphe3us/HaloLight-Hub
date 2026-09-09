# HaloLight Hub

Local setup for a public clone.

## Prerequisites

- Node.js 24+
- `pnpm` 11.7.x
- PostgreSQL database reachable through `DATABASE_URL`
- Clerk app keys for local auth

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
- `CLERK_SECRET_KEY`
- `CLERK_PUBLISHABLE_KEY`
- `VITE_CLERK_PUBLISHABLE_KEY`

Optional:

- `VITE_CLERK_PROXY_URL`
- `VITE_API_PROXY_TARGET`
- `LOG_LEVEL`
- `RUN_DB_PUSH_ON_POST_MERGE`
- `SEED_ADMIN_CLERK_ID`, `SEED_ADMIN_EMAIL`
- `AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`
- `STORAGE_PROVIDER`
- `ALLOW_PUBLIC_SIGNUPS`
- `VITE_ALLOW_PUBLIC_SIGNUPS`
- `ENABLE_COMMUNITY`
- `BUNNY_PLAYBACK_SECURITY_CONFIRMED`
- `SEED_DEMO_ACADEMY`
- `SEED_DEMO_DATA`
- `BUNNY_STREAM_API_KEY`, `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_CDN_HOSTNAME`
- `BUNNY_STREAM_TOKEN_AUTH_KEY` (server-side embed signing key)
- `BUNNY_API_KEY` (optional account API key for security diagnostics)

## Database

```bash
set -a
source .env
set +a
pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run seed
```

In non-development environments, the seed requires `SEED_ADMIN_CLERK_ID` or `SEED_ADMIN_EMAIL`. To make the seeded admin match your real Clerk login, set `SEED_ADMIN_CLERK_ID` to your Clerk user ID. If you do not have the Clerk user ID yet, set `SEED_ADMIN_EMAIL` to the real admin email; the seed creates a `manual_*` admin row that can be linked on first login after Clerk confirms the primary email is verified.

In production, new Clerk users are not provisioned automatically unless `ALLOW_PUBLIC_SIGNUPS=true` is set. For client training launches, keep public signups disabled, leave `VITE_ALLOW_PUBLIC_SIGNUPS` empty, and create/link users through manual invites or admin-managed accounts.

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

`check-academy-launch` loads the root `.env` when present, checks database access, published academy content, production Clerk keys, the HTTPS public URL and real Bunny playback restrictions. It prints no credentials, performs no writes, and exits nonzero while a launch prerequisite is missing. A successful build alone is not evidence that Supabase or Bunny works.

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
Export the live `VITE_CLERK_PUBLISHABLE_KEY` in the build environment; the script
rejects a missing or blank key. It typechecks shared libraries and the real
frontend/API, then builds only those applications, excluding the mockup sandbox.
No schema pushes or seeds run automatically.

The start wrapper sets production mode before loading the API and preserves the
platform's `PORT`. Express serves `artifacts/halolight-os/dist/public` with SPA
fallback alongside `/api/*`. Override `FRONTEND_DIST_PATH` only for a different
frontend output location; relative paths resolve from the repository root.
Vite's development proxy is not a production reverse proxy.

See the [Infomaniak deployment guide](docs/infomaniak-deployment.md) for environment
settings, domain/HTTPS setup, release checks and rollback precautions.
