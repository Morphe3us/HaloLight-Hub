#!/bin/bash
set -e
pnpm install --frozen-lockfile

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [ "${RUN_DB_PUSH_ON_POST_MERGE:-}" != "1" ]; then
  echo "Skipping db push. Set RUN_DB_PUSH_ON_POST_MERGE=1 to run it after merge."
elif [ -z "${DATABASE_URL:-}" ]; then
  echo "RUN_DB_PUSH_ON_POST_MERGE=1 but DATABASE_URL is unset." >&2
  exit 1
else
  pnpm --filter @workspace/db run push
fi
