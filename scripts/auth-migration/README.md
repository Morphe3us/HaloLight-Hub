# Supabase Auth Relink

An operator-only, one-account migration from an exact legacy `authId` to an
existing Supabase user UUID. The logical field is `authId`; the physical SQL
column remains `public.users.clerk_id` for compatibility.

## Operation

From the repository root, with credentials supplied securely in the process
environment (no dotenv loading):

```sh
node --import tsx scripts/src/supabase-auth-relink.ts \
  --local-user-id <exact-local-uuid> \
  --expected-auth-id <exact-existing-auth-id> \
  --new-auth-id <supabase-user-uuid>
```

Required environment: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.
The URL must be the explicitly trusted hosted project, exactly
`https://<20-lowercase-alphanumeric-project-ref>.supabase.co`, with an optional
trailing slash. Do not choose the URL from user-controlled input. Custom domains,
local endpoints, ports, userinfo, paths, query strings and fragments are rejected.
The URL is an operator trust decision; a secret key does not independently prove
that the operator chose the intended project or database.

`SUPABASE_SECRET_KEY` accepts `sb_secret_...` or a legacy HS256 `service_role`
JWT for the same project. A secret key is sent only in `apikey`; a legacy JWT is
sent in both `apikey` and `Authorization: Bearer`. JWT decoding only rejects
incorrect roles, project references, issuers, formats and expired keys; the
hosted admin endpoint performs authentication/signature verification. Anonymous,
publishable and user session keys are rejected. No SDK or new dependency is used.

Both UUID arguments must use canonical lowercase spelling. The expected legacy
ID is compared exactly, without trimming or case folding; letters, digits,
underscores and hyphens are accepted (1-255 characters, starting alphanumeric).
This includes old `user_*`, `manual_*` and seed/demo identifiers.

Dry-run is the default and still performs the database reads and the authenticated
`GET /auth/v1/admin/users/{uuid}` lookup. The response must identify that exact
UUID, explicitly report `is_anonymous: false`, and contain a confirmed top-level
email matching the local email after trim/lowercase normalization. Missing or
malformed confirmation timestamps, future confirmations, active or malformed
bans, deleted identities, placeholder emails and ambiguous local emails fail
closed. An omitted/null ban or an expired ban is accepted, matching Supabase's
ban semantics. Phone confirmation, pending email changes and user metadata never
substitute for `email_confirmed_at`. Redirects are forbidden; lookups time out.

Apply requires both `--apply` and `--backup-reference <existing-backup-reference>`.
The reference is an operator attestation, not backup creation or verification;
take and verify a backup before applying. Do not put credentials in arguments or
backup references. Output contains only result counts or fixed redacted errors.

Transactions remain serializable, read-only for dry-run and row-locking for
apply, with bounded lock/statement/idle timeouts. The exact local ID, old binding,
email uniqueness and unoccupied target are prerequisites. Only the binding is
updated, guarded again by SQL predicates. Returned and persisted rows must
otherwise match the original row, preserving roles, active status, local ID,
timestamps and data ownership. No Supabase user is created or modified.

No automatic retry occurs. A completed mapping fails the old-ID precondition on
replay. After a connection/commit failure, inspect the account before retrying:
the commit may have succeeded even if its acknowledgment was lost.

## Offline Verification

From `scripts/`:

```sh
node --import tsx --test auth-migration/*.test.ts
RELINK_TEST_TOOLS=/Users/rom4n/.HaloHub/test-tools node --import tsx --test auth-migration/relink.postgres.test.ts
../node_modules/.bin/tsc -p auth-migration/tsconfig.json --noEmit
```

All HTTP responses are mocked. PostgreSQL tests are skipped unless explicitly
enabled with external tooling; they create and remove a disposable cluster under
`/tmp`, use Unix sockets only, and never read `DATABASE_URL` or connect to an
existing database. Unit tests cover headers, malformed configuration/identities,
collisions, replay, redaction, unchanged fields and transaction failures. The
disposable database tests additionally exercise real triggers, concurrent target
claims, read-only transactions, foreign-key ownership and commit uncertainty.

## References

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Admin getUserById](https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid)
- [Auth REST API specification](https://github.com/supabase/auth/blob/master/openapi.yaml)
- [Auth user model and ban semantics](https://github.com/supabase/auth/blob/master/internal/models/user.go)
