# Infomaniak deployment

Target: `https://hub.halolightbooth.com`, one Node.js 24 application serving the
Express API and production React SPA on the same origin. No Vite preview server
or separate frontend process is needed.

## Manager settings

Configure the Node.js site with these project-specific values:

| Setting | Value |
| --- | --- |
| Domain | `hub.halolightbooth.com` |
| Node.js | 24 |
| Execution folder | Repository root (contains the root `package.json`) |
| Build command | `bash scripts/hosting-build.sh` |
| Launch command | `npm start` |
| Listening port | Keep the Manager-assigned port; do not hardcode a local port |

`npm run build:hosting` is an equivalent build command. `node --enable-source-maps
scripts/hosting-start.mjs` is an equivalent launch command, written on one line.
Do not use `npm install`: the root preinstall intentionally rejects npm installs.
The build script uses pnpm 11.7.0 when available, otherwise bootstraps that exact
version with `npx --yes pnpm@11.7.0`. Node/npm and registry access are required.

Infomaniak documents the execution folder, custom build/launch commands, dynamic
`PORT`, Node version selection, SSL controls and restart requirement in its
[official Node.js configuration guide](https://www.infomaniak.com/en/support/faq/2535/modify-a-nodejs-configuration).
Save the settings, run the build, then start/restart from the Manager. Configure
DNS for this site using the target provided by Infomaniak, and activate HTTPS
before testing authentication. Do not guess an IP address or change mail DNS.

## Build environment

Supply `VITE_CLERK_PUBLISHABLE_KEY` as an exported build environment variable,
using the live publishable key for the production Clerk instance. The script
fails before installation when this variable is absent or blank; a key only in
a local `.env` does not satisfy this explicit hosting guard. A nonempty value is
not proof that the key is valid or that Clerk's domain configuration is correct.

All `VITE_` variables are public, compiled into browser assets. Never put a
secret key, database URL, or Bunny signing key under a `VITE_` name. Rebuild after
changing frontend variables; restarting alone does not update bundled values.
Leave `BASE_PATH` unset (defaults to `/`) for this root-domain deployment.
Leave `VITE_API_PROXY_TARGET` unset: it is a development-only proxy setting.
Leave `VITE_CLERK_PROXY_URL` unset unless you intentionally configure the Clerk
proxy. Keep `VITE_ALLOW_PUBLIC_SIGNUPS` unset for a private training launch.

The build installs the frozen lockfile with `--prod=false`, even when the host
sets `NODE_ENV=production`, because Vite, TypeScript and frontend packages are
devDependencies. It then switches to production mode, typechecks shared
libraries plus the real frontend/API, and builds only those two applications.
It does not build the mockup sandbox, run seeds or push database schemas.
The lockfile supports macOS and Linux x64 glibc; other hosting architectures need
separate lockfile validation. Keep the installed workspace dependencies and
both complete output directories in the deployed release:

- `artifacts/halolight-os/dist/public/`
- `artifacts/api-server/dist/` (including worker bundles and source maps)

## Runtime environment

Configure these through the host's protected environment configuration, not
committed files or build/start command strings:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Reachable production PostgreSQL connection |
| `CLERK_SECRET_KEY` | Production Clerk secret, server-only |
| `CLERK_PUBLISHABLE_KEY` | Matching production Clerk publishable key |
| `STORAGE_PROVIDER` | `url` for URL-only resources; otherwise a configured durable provider |
| `PORT` | Supplied by Infomaniak; preserved by the start wrapper |
| `FRONTEND_DIST_PATH` | Optional override; defaults to `artifacts/halolight-os/dist/public` |

The start wrapper sets `NODE_ENV=production` before dynamically importing the
API bundle, and changes the working directory to the repository root. Relative
`FRONTEND_DIST_PATH` overrides resolve from that root; absolute paths also work.
Startup fails clearly if the frontend entry page or API bundle is unreadable.
The production Express server serves the SPA with fallback for client-side
routes; `/api/*` remains handled by the API.

Use matching live Clerk keys and configure Clerk for `hub.halolightbooth.com`,
including its required domain verification and permitted authentication URLs.
Keep `ALLOW_PUBLIC_SIGNUPS` and `ENABLE_COMMUNITY` disabled unless intended.
For Bunny playback, configure the server-only keys and security prerequisites
described in the [README](../README.md#database). A build passing does not verify
database access, Clerk authentication, storage durability or Bunny security.

## Release and verification

1. Deploy the reviewed GitHub revision into the execution folder. Publishing
   that revision is a separate operator action; these scripts never commit,
   push, pull, reset or modify environment files.
2. Back up the production database. Review and apply required schema changes as
   a separate controlled operation before releasing incompatible application
   code. Do not put schema push or seed commands in the hosting lifecycle.
3. Run the build command and require a successful exit before restarting. Keep
   the previous complete release for rollback; this script builds in place and
   does not provide atomic release switching.
4. Start/restart the application and inspect execution logs.
5. Check the endpoints below, then test sign-in, a direct client-side route
   refresh, authorized Academy access and actual Bunny playback in a browser.

```bash
curl --fail --show-error https://hub.halolightbooth.com/
curl --fail --show-error https://hub.halolightbooth.com/api/healthz
curl --fail --show-error https://hub.halolightbooth.com/api/readyz
```

`healthz` is process liveness; `readyz` checks database readiness and returns 503
when unavailable. An unknown `/api/*` URL must not return the SPA HTML. Confirm
that browser asset requests succeed and authentication uses production keys.
For the additional read-only Academy launch check, with its required environment
configured, run `npx --yes pnpm@11.7.0 --filter @workspace/scripts run check-academy-launch`.

On failure, retain logs without sharing credentials, restore the previous
complete release and restart. Code rollback does not roll back database changes.
