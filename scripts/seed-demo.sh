#!/usr/bin/env bash
set -euo pipefail

# ─── Demo Environment Setup ─────────────────────────────────────────────────
#
# Resets the database, runs migrations, applies RLS policies, seeds base data,
# and then seeds rich demo data for presentation and sales demos.
#
# Usage: ./scripts/seed-demo.sh
#
# WARNING: This DROPS and recreates the database. Do not run in production.
# ─────────────────────────────────────────────────────────────────────────────

show_help() {
  cat <<'EOF'
Usage: ./scripts/seed-demo.sh [--reset]

Options:
  --reset  Drop and recreate the database before reseeding everything.
  --help   Show this help message.
EOF
}

reset_database=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --reset)
      reset_database=true
      ;;
    --help)
      show_help
      exit 0
      ;;
    *)
      echo "ERROR: Unknown option: $1"
      echo ""
      show_help
      exit 1
      ;;
  esac
  shift
done

echo "=== School OS — Demo Environment Setup ==="
echo ""

# Check we're not running in production
if [ "${NODE_ENV:-}" = "production" ]; then
  echo "ERROR: Cannot run demo seed in production environment."
  exit 1
fi

step_index=1

if [ "$reset_database" = true ]; then
  echo "Step ${step_index}/5: Resetting database..."
  pnpm --filter @school/prisma exec prisma migrate reset --force --skip-seed
  step_index=$((step_index + 1))
else
  echo "Skipping database reset — use --reset for a full rebuild."
fi

echo ""
step_total=4
if [ "$reset_database" = true ]; then
  step_total=5
fi

echo "Step ${step_index}/${step_total}: Running migrations..."
pnpm --filter @school/prisma exec prisma migrate deploy
step_index=$((step_index + 1))

echo ""
echo "Step ${step_index}/${step_total}: Applying RLS policies..."
pnpm db:post-migrate
step_index=$((step_index + 1))

echo ""
echo "Step ${step_index}/${step_total}: Seeding base data..."
pnpm db:seed
step_index=$((step_index + 1))

echo ""
echo "Step ${step_index}/${step_total}: Seeding demo data..."
npx tsx packages/prisma/seed/demo-data.ts

echo ""
echo "=== Demo environment ready ==="
echo ""
echo "Login credentials:"
echo "  Platform Admin:  admin@edupod.app / Password123!"
echo ""
echo "  Al Noor Academy (al-noor.edupod.app):"
echo "    School Owner:  owner@alnoor.test / Password123!"
echo "    School Admin:  admin@alnoor.test / Password123!"
echo "    Teacher:       teacher@alnoor.test / Password123!"
echo "    Parent:        parent@alnoor.test / Password123!"
echo ""
echo "  Cedar International (cedar.edupod.app):"
echo "    School Owner:  owner@cedar.test / Password123!"
echo "    School Admin:  admin@cedar.test / Password123!"
echo "    Teacher:       teacher@cedar.test / Password123!"
echo "    Parent:        parent@cedar.test / Password123!"
