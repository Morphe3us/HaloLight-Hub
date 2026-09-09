#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

node --input-type=module -e '
  if (Number(process.versions.node.split(".")[0]) < 24) {
    console.error("Hosting build requires Node.js 24 or newer.");
    process.exit(1);
  }
  if (!process.env.VITE_CLERK_PUBLISHABLE_KEY?.trim()) {
    console.error("Hosting build aborted: VITE_CLERK_PUBLISHABLE_KEY is missing or blank. Export the production Clerk publishable key in the build environment, then rebuild. Never use CLERK_SECRET_KEY or any secret under a VITE_ name.");
    process.exit(1);
  }
  if (!/^pk_(test|live)_/.test(process.env.VITE_CLERK_PUBLISHABLE_KEY)) {
    console.error("VITE_CLERK_PUBLISHABLE_KEY must be a Clerk publishable key (pk_test_ or pk_live_), never a secret key.");
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
