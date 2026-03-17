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

echo "=== School OS — Demo Environment Setup ==="
echo ""

# Check we're not running in production
if [ "${NODE_ENV:-}" = "production" ]; then
  echo "ERROR: Cannot run demo seed in production environment."
  exit 1
fi

echo "Step 1/5: Resetting database..."
pnpm --filter @school/prisma exec prisma migrate reset --force --skip-seed

echo ""
echo "Step 2/5: Running migrations..."
pnpm --filter @school/prisma exec prisma migrate deploy

echo ""
echo "Step 3/5: Applying RLS policies..."
pnpm db:post-migrate

echo ""
echo "Step 4/5: Seeding base data..."
pnpm db:seed

echo ""
echo "Step 5/5: Seeding demo data..."
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
