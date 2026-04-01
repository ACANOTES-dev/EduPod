#!/usr/bin/env bash
# Generates a snapshot of the current Prisma schema for diffing.
# Run this script whenever the schema changes intentionally, then commit the
# updated snapshot file alongside the migration.
#
# Usage:
#   pnpm run snapshot:schema
#
# The committed snapshot (packages/prisma/schema-snapshot.prisma) is compared
# against the live schema.prisma by the test suite. If they diverge, CI fails
# until the snapshot is updated.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRISMA_DIR="${SCRIPT_DIR}/../packages/prisma"
SNAPSHOT_FILE="${PRISMA_DIR}/schema-snapshot.prisma"

cp "${PRISMA_DIR}/schema.prisma" "${SNAPSHOT_FILE}"
echo "Schema snapshot saved to packages/prisma/schema-snapshot.prisma"
echo "Commit this file alongside any schema change."
