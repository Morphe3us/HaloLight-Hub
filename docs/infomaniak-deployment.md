# Infomaniak deployment

Target: `https://hub.halolightbooth.com`, one Node.js 24 application serving the
Express API and production React SPA on the same origin. No Vite preview server
or separate frontend process is needed.

Supabase Auth implementation is underway. This runbook specifies configuration
and release gates; it does not claim that any cloud settings, credentials,
account mappings or live deployment have been changed. The parent task/operator
owns deployment. Keep the existing live release serving until the candidate
passes the cutover checks below.

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

Supply `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the private root
`.env` or exported build environment for the intended production Supabase
project. The frontend has no public signup form. Vite and the hosting guard read
the file. The guard rejects missing/invalid public configuration and a URL that
does not match `SUPABASE_URL` when supplied. A passing guard does not verify
remote credentials, providers, redirects or email delivery.

All `VITE_` variables are public, compiled into browser assets. Never put a
secret key, database URL, or Bunny signing key under a `VITE_` name. Rebuild after
changing frontend variables; restarting alone does not update bundled values.
Leave `BASE_PATH` unset (defaults to `/`) for this root-domain deployment.
Leave `VITE_API_PROXY_TARGET` unset: it is a development-only proxy setting.
No Clerk proxy configuration is needed for the Supabase implementation.

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

Configure these in a private root `.env` (file permissions `600`) or through the
host's protected environment configuration, never in committed files or command
strings. The start wrapper loads `.env` without overriding host environment
variables, including `PORT`. The file must remain outside `dist/public`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Reachable production PostgreSQL connection |
| `SUPABASE_URL` | Intended production Supabase project HTTPS URL |
| `SUPABASE_PUBLISHABLE_KEY` | Matching public key for ordinary user-authenticated requests |
| `SUPABASE_SECRET_KEY` | Server-side admin operations only, including invitations; never browser configuration |
| `APP_PUBLIC_URL` | `https://hub.halolightbooth.com` |
| `ALLOW_PUBLIC_SIGNUPS` | `false` for private app access |
| `API_ALLOWED_ORIGINS` | `https://hub.halolightbooth.com` |
| `STORAGE_PROVIDER` | `url` for URL-only resources; otherwise a configured durable provider |
| `PORT` | Supplied by Infomaniak; preserved by the start wrapper |
| `FRONTEND_DIST_PATH` | Optional override; defaults to `artifacts/halolight-os/dist/public` |

The start wrapper sets `NODE_ENV=production` before dynamically importing the
API bundle, and changes the working directory to the repository root. Relative
`FRONTEND_DIST_PATH` overrides resolve from that root; absolute paths also work.
Startup fails clearly if the frontend entry page or API bundle is unreadable.
The production Express server serves the SPA with fallback for client-side
routes; `/api/*` remains handled by the API.

Use one intended Supabase project for server and frontend configuration.
Keep `ALLOW_PUBLIC_SIGNUPS=false`, Supabase public signups disabled and
`ENABLE_COMMUNITY` disabled for the private launch.
For Bunny playback, configure the server-only keys and security prerequisites
described in the [README](../README.md#database). A build passing does not verify
database access, Supabase authentication, storage durability or Bunny security.

## Supabase Auth configuration

These are operator actions, not settings applied by a build or this documentation
update. In the Supabase dashboard, enable **Email/password** and **Google**, keep
email confirmation enabled, and disable **Allow new users to sign up**, **Allow
anonymous sign-ins** and **Allow manual linking**. App signup flags do not replace
these provider controls. Manual identity linking here is distinct from the
guarded app-user migration script. See [Supabase general configuration](https://supabase.com/docs/guides/auth/general-configuration).

### Site URL and redirects

Set the Supabase **Site URL** to `https://hub.halolightbooth.com`, matching
`APP_PUBLIC_URL`. Add these exact production paths to **Redirect URLs**:

```text
https://hub.halolightbooth.com/auth/callback
https://hub.halolightbooth.com/auth/invite
https://hub.halolightbooth.com/auth/recovery
```

Use exact URLs emitted by the release candidate, including any required query
variants; verify them during smoke tests instead of broadening the production
allowlist to `/**`. Google returns to `/auth/callback` for PKCE code exchange.
Configure Google's authorized redirect URI with the Supabase project's callback
URL from its Google provider dashboard (normally
`https://<project-ref>.supabase.co/auth/v1/callback`), not the app callback URL.
Keep the Google client secret in provider settings, never frontend variables.
See [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
and [Google configuration and PKCE](https://supabase.com/docs/guides/auth/social-login/auth-google).

For a separate local development project, use Site URL
`http://localhost:18205` and the same three exact paths on that origin. A candidate
test deployment likewise needs its own explicit origin and callback entries;
do not repoint the live project's Site URL just to test a candidate.

### SMTP and email templates

Configure **custom SMTP before inviting clients**. Supabase's default sender
only sends to project team addresses and currently allows two messages per hour;
it is not a production delivery service. Verify the sender with the SMTP provider,
review Auth sending limits and disable email link tracking that rewrites auth
links. Test delivery to a non-team mailbox. See [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

In **Email Templates**, use the following action link in **Invite user**:

```html
<a href="{{ .SiteURL }}/auth/invite?token_hash={{ .TokenHash }}&amp;type=invite">Accept invitation</a>
```

Use the analogous link in **Reset password**:

```html
<a href="{{ .SiteURL }}/auth/recovery?token_hash={{ .TokenHash }}&amp;type=recovery">Reset password</a>
```

The rendered URLs contain `&type=invite` or `&type=recovery`; `&amp;` is HTML
escaping. These links send the token hash directly to the app for verification
with the corresponding type and password setup. They are separate from Google's
PKCE code callback. Ensure both app routes handle these links in the release
candidate; neither a default confirmation template nor a successful build proves
the flow works. See [Supabase email template variables](https://supabase.com/docs/guides/auth/auth-email-templates).

An app admin sends invitations through `POST /users/{id}/invite` (actual HTTP
path `/api/users/{id}/invite`). Only active `manual_*` app users with a real email
are eligible. Creating an app user does not itself send an invitation. Existing
Supabase accounts may produce a conflict; do not delete identities or recreate
app users to bypass it. Existing Clerk-bound users follow the migration below.

## Existing-user cutover

The current logical API/ORM field is `authId`, replacing `clerkId`. The physical
`public.users.clerk_id` column remains in place for compatibility and rollback;
this migration does not drop or rename it. Preserve each user's stable local ID,
role, active status and all owned records.

This workflow does not export or import legacy password hashes. Existing
email/password users must establish a Supabase password through the verified
invitation/recovery flow; Google users use the configured Google provider.
Explain this change before inviting clients. Do not promise that their old
password will continue working.

Use `scripts/src/supabase-auth-relink.ts` for a reviewed one-time mapping of one
existing app user to an existing Supabase UUID. The target needs a confirmed
matching email; ambiguous emails and occupied target bindings fail closed.
Supply `DATABASE_URL`, `SUPABASE_URL` and `SUPABASE_SECRET_KEY` securely through
the process environment. The tool does not load `.env` or create Supabase users.

```bash
node --import tsx scripts/src/supabase-auth-relink.ts \
  --local-user-id <exact-local-uuid> \
  --expected-auth-id <exact-existing-auth-id> \
  --new-auth-id <supabase-user-uuid>
```

This defaults to dry-run with no database writes; it still reads the DB and
Supabase Admin API. Apply only in the controlled cutover window after reviewing
the mapping and verifying a backup, adding
`--apply --backup-reference <existing-backup-reference>`. The backup reference is
an operator attestation, not backup creation or verification. Preserve old and
new mappings securely for rollback. Completed mappings fail the old-ID check
on replay; inspect an uncertain commit before any retry. Never run production
seeds or use email-only rebinding to migrate users. Full prerequisites and
failure handling are in the [relink runbook](../scripts/auth-migration/README.md).

Retaining the column makes restoration possible, not automatic. Applying a
Supabase UUID to a shared live row can break that user's old Clerk login.
Validate the candidate against an isolated database copy first; do not mutate
live bindings while claiming the old release is unaffected. The operator must
coordinate the final binding updates, traffic switch and tested restoration
procedure. Code rollback alone cannot restore the previous auth IDs.

## Release and verification

1. Stage the reviewed revision as a candidate without replacing the old live
   release. Use isolated test data for relink validation. Publishing
   that revision is a separate parent/operator action; these scripts never commit,
   push, pull, reset or modify environment files.
2. Back up the production database. Review and apply required schema changes as
   a separate controlled operation before releasing incompatible application
   code. Do not put schema push or seed commands in the hosting lifecycle.
3. Run the candidate build and require a successful exit before starting it. Keep
   the previous complete release for rollback; this script builds in place and
   does not provide atomic release switching.
4. Start the candidate and inspect execution logs. Check the endpoints below on
   its origin, then complete the browser smoke tests. Do not retire the old live
   release or apply live relinks until these checks pass.
5. The operator performs the controlled production cutover, including reviewed
   live relinks, then repeats the checks on the production origin. Preserve the
   previous release and binding backup until production verification is complete.

Required browser smoke tests (builds and health checks do not substitute):

- Email/password sign-in and sign-out; delivery and acceptance of an admin-sent
  invite to a non-team mailbox; password setup and recovery through the custom
  templates, including invalid/expired link handling.
- Google sign-in for an intended existing account via `/auth/callback`, with
  PKCE exchange and a persisted session after refresh. New public and anonymous
  accounts must remain blocked.
- A real client-role session sees only its own records and allowed Academy
  content, cannot reach admin operations, and retains its role and ownership
  after relink. Verify an admin session separately.
- Actual authorized Bunny video playback as a client, plus denial of unauthorized
  access and unsigned embeds; test a direct client-side route refresh as well.

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

Before cutover, any failure means keep the old live release and stop promotion.
After cutover, retain logs without sharing credentials and use the reviewed
rollback procedure to restore both the previous complete release and any changed
identity bindings. Code rollback does not roll back database changes. Never
delete the retained physical column or old provider configuration as a shortcut.
