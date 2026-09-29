#!/usr/bin/env bash
# One command that says whether a change is really done. Tiers, cheapest first; stops at the first failure.
#
#   scripts/verify.sh         fast: type-check + lint + unit tests   (no Docker)
#   scripts/verify.sh full    fast + migration drift check + API e2e against a throwaway Postgres and MinIO
#
# It prints a final table of what ran and what did NOT, so a green result is never read as more than it is.
# It only ever touches the disposable studio_os_test database, never the dev database.
set -uo pipefail
cd "$(dirname "$0")/.."

tier="${1:-fast}"
TEST_DB_URL="${E2E_DATABASE_URL:-postgresql://studio_os:studio_os@localhost:5433/studio_os_test}"
rows=()

summary() {
  echo; echo "---- verify ($tier) ----"; printf '%s\n' "${rows[@]}"
  case "$tier" in
    fast) echo "NOT RUN  migration drift, API e2e (money paths, tenant isolation), browser/UI, mobile lint, native mobile, real Stripe/Mux/Resend/R2" ;;
    full) echo "NOT RUN  browser/UI, mobile lint (crashes upstream), native mobile, real Stripe/Mux/Resend/R2 (all unconfigured)" ;;
  esac
}
run() { # name, command...
  local name="$1"; shift
  echo "==> $name"
  if "$@"; then rows+=("PASS  $name"); else rows+=("FAIL  $name"); summary; exit 1; fi
}

# Bring up the local backing services if a previous reboot left them stopped. `docker start` never removes anything.
ensure_services() {
  docker info >/dev/null 2>&1 || { echo "Docker/colima is not running (try: colima start)"; return 1; }
  for c in studio_os_postgres studio_os_minio; do
    [ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)" = true ] || docker start "$c" >/dev/null || return 1
  done
  for _ in $(seq 1 30); do
    docker exec studio_os_postgres pg_isready -U studio_os >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "Postgres did not become ready"; return 1
}

prepare_test_db() {
  docker exec studio_os_postgres psql -U studio_os -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='studio_os_test'" | grep -q 1 \
    || docker exec studio_os_postgres psql -U studio_os -d postgres -c "CREATE DATABASE studio_os_test" || return 1
  (cd packages/db && DATABASE_URL="$TEST_DB_URL" npx prisma migrate deploy >/dev/null) || return 1
  # Hand-written migrations must produce exactly what schema.prisma describes.
  (cd packages/db && npx prisma migrate diff --from-url "$TEST_DB_URL" --to-schema-datamodel prisma/schema.prisma --exit-code)
}

run "typecheck" npx turbo run check-types --output-logs=errors-only
run "lint"      npx turbo run lint --filter='!mobile' --output-logs=errors-only
run "unit"      npx turbo run test --output-logs=errors-only

case "$tier" in
  fast) ;;
  full)
    run "services up (postgres, minio)"          ensure_services
    run "test db migrated, no schema drift"      prepare_test_db
    run "api e2e"                                bash -c "cd apps/api && E2E_DATABASE_URL='$TEST_DB_URL' npx vitest run --config ./vitest.config.e2e.ts" ;;
  *) echo "unknown tier: $tier"; exit 2 ;;
esac
summary
