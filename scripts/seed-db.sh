#!/usr/bin/env bash
# ==============================================================================
# LedgerLab Database Seeder CLI
# Run migrations and seed baseline demo data to Dev or Prod PostgreSQL.
#
# Usage:
#   ./seed-db.sh [dev|prod] [--migrate] [--force]
#
# Examples:
#   ./seed-db.sh                  # Seed local dev database (default)
#   ./seed-db.sh dev --force      # Reset & re-seed local dev database
#   ./seed-db.sh prod             # Seed prod/sandbox DB (LXC 103:5433)
#   ./seed-db.sh prod --migrate   # Run Drizzle migrations then seed prod DB
#   ./seed-db.sh prod --force     # Reset & re-seed prod DB
# ==============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

# Setup PATH for Node/pnpm/Docker
for p in "$HOME/.nvm/versions/node/$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)/bin" /opt/homebrew/bin /usr/local/bin "$HOME/.local/share/pnpm" "$HOME/.pnpm-global/bin"; do
  if [ -d "$p" ]; then
    export PATH="$p:$PATH"
  fi
done

TARGET="dev"
RUN_MIGRATE=false
FORCE_FLAG=""

for arg in "$@"; do
  case "$arg" in
    dev|development|local)
      TARGET="dev"
      ;;
    prod|production|sandbox|k8s)
      TARGET="prod"
      ;;
    --migrate|-m)
      RUN_MIGRATE=true
      ;;
    --force|-f)
      FORCE_FLAG="--force"
      ;;
    --help|-h)
      echo "Usage: ./seed-db.sh [dev|prod] [--migrate] [--force]"
      echo ""
      echo "Targets:"
      echo "  dev   Local PostgreSQL on localhost:5432 (default)"
      echo "  prod  Homelab Sandbox PostgreSQL on 10.18.1.103:5433 (from .env.prod)"
      echo ""
      echo "Options:"
      echo "  --migrate, -m  Run Drizzle SQL migrations prior to seeding"
      echo "  --force, -f    Reset existing journal entries and re-seed baseline"
      exit 0
      ;;
  esac
done

if [ "$TARGET" = "prod" ]; then
  if [ -f ".env.prod" ]; then
    TARGET_DB_URL=$(grep ^DATABASE_URL= .env.prod 2>/dev/null | cut -d = -f2- || true)
  fi
  TARGET_DB_URL="${TARGET_DB_URL:-postgres://ledgerlab:ledgerlab@10.18.1.103:5433/ledgerlab}"
  ENV_LABEL="PRODUCTION / SANDBOX (10.18.1.103:5433)"
else
  if [ -f ".env.dev" ]; then
    TARGET_DB_URL=$(grep ^DATABASE_URL= .env.dev 2>/dev/null | cut -d = -f2- || true)
  fi
  TARGET_DB_URL="${TARGET_DB_URL:-postgres://ledgerlab:ledgerlab@localhost:5432/ledgerlab}"
  ENV_LABEL="DEVELOPMENT (localhost:5432)"
fi

echo "=================================================================="
echo "🌱 LedgerLab Database Seeder"
echo "Target: $ENV_LABEL"
echo "DB URL: $(echo "$TARGET_DB_URL" | sed s/:[^:@]*@/:***@/)"
echo "=================================================================="

run_cmd() {
  local filter="$1"
  local script="$2"
  shift 2

  if docker ps --format {{.Names}} 2>/dev/null | grep -q ledgerlab-dev-ledger-api-1; then
    local docker_db_url="$TARGET_DB_URL"
    if [ "$TARGET" = "dev" ]; then
      docker_db_url="postgres://ledgerlab:ledgerlab@postgres:5432/ledgerlab"
    fi
    docker exec -e DATABASE_URL="$docker_db_url" ledgerlab-dev-ledger-api-1 pnpm --filter "$filter" "$script" "$@"
  elif command -v pnpm >/dev/null 2>&1; then
    DATABASE_URL="$TARGET_DB_URL" pnpm --filter "$filter" "$script" "$@"
  else
    echo "❌ Error: Neither running docker container nor local pnpm found."
    exit 1
  fi
}

if [ "$RUN_MIGRATE" = true ]; then
  echo "📦 Step 1: Running Drizzle migrations..."
  run_cmd "@ledgerlab/db" "migrate:sql"
  echo "✅ Migrations complete."
fi

echo "🌱 Step 2: Executing seeder..."
if [ -n "$FORCE_FLAG" ]; then
  run_cmd "@ledgerlab/db" "seed" "--" "$FORCE_FLAG"
else
  run_cmd "@ledgerlab/db" "seed"
fi

echo ""
echo "🎉 Database seeding finished successfully for $ENV_LABEL!"
