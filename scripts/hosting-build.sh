#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

node --env-file-if-exists=.env --input-type=module -e '
  if (Number(process.versions.node.split(".")[0]) < 24) {
    console.error("Hosting build requires Node.js 24 or newer.");
    process.exit(1);
  }
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!key) {
    console.error("Hosting build aborted: VITE_SUPABASE_PUBLISHABLE_KEY is missing. Set a public Supabase key in the private root .env or build environment.");
    process.exit(1);
  }
  let url;
  try {
    const projectUrl = (value) => {
      if (typeof value !== "string" || !/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(value)) throw new Error();
      return new URL(value);
    };
    url = projectUrl(process.env.VITE_SUPABASE_URL);
    if (process.env.SUPABASE_URL !== undefined && projectUrl(process.env.SUPABASE_URL).origin !== url.origin) throw new Error();
  } catch {
    console.error("VITE_SUPABASE_URL must be the hosted Supabase project HTTPS URL and match SUPABASE_URL. Use https://<20-character-project-ref>.supabase.co without credentials, ports, paths, queries or fragments.");
    process.exit(1);
  }
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  try {
    const parts = key.split(".");
    if (parts.length === 3 && parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) {
      const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      // This checks legacy key metadata, not its signature; modern keys are opaque.
      publicKey = header.alg === "HS256" && payload.role === "anon" &&
        payload.ref === url.hostname.split(".")[0];
    }
  } catch { /* Reject malformed legacy keys. */ }
  if (!publicKey) {
    console.error("VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable or legacy anon key for the configured Supabase project, never a secret key or service_role key.");
    process.exit(1);
  }
'

if command -v pnpm >/dev/null 2>&1 && [[ "$(pnpm --version)" == "11.7.0" ]]; then
  pnpm_command=(pnpm)
else
  pnpm_command=(npx --yes pnpm@11.7.0)
fi

# Vite, TypeScript and frontend dependencies are devDependencies, even on hosting.
NODE_ENV=development "${pnpm_command[@]}" install --frozen-lockfile --prod=false

export NODE_ENV=production
"${pnpm_command[@]}" run typecheck:libs
"${pnpm_command[@]}" --filter @workspace/halolight-os --filter @workspace/api-server run typecheck
"${pnpm_command[@]}" --filter @workspace/halolight-os run build
"${pnpm_command[@]}" --filter @workspace/api-server run build

test -f artifacts/halolight-os/dist/public/index.html
test -f artifacts/api-server/dist/index.mjs
printf '%s\n' 'Hosting build complete. Start with: npm start'
