#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

sql_files=()
while IFS= read -r file; do
  sql_files+=("$file")
done < <(
  find packages/prisma \
    \( -path 'packages/prisma/rls/policies.sql' -o -name 'migration.sql' -o -name 'post_migrate.sql' \) \
    -type f | sort
)

if [ "${#sql_files[@]}" -eq 0 ]; then
  echo "No RLS SQL sources found."
  exit 1
fi

enabled_lines="$(grep -h 'ENABLE ROW LEVEL SECURITY' "${sql_files[@]}" || true)"
forced_lines="$(grep -h 'FORCE ROW LEVEL SECURITY' "${sql_files[@]}" || true)"
policy_lines="$(grep -h 'CREATE POLICY' "${sql_files[@]}" || true)"

enabled_count="$(printf '%s\n' "$enabled_lines" | grep -c 'ENABLE ROW LEVEL SECURITY' || true)"
forced_count="$(printf '%s\n' "$forced_lines" | grep -c 'FORCE ROW LEVEL SECURITY' || true)"
policy_count="$(printf '%s\n' "$policy_lines" | grep -c 'CREATE POLICY' || true)"
table_count="$(printf '%s\n' "$enabled_lines" | sed -E 's/.*TABLE (IF EXISTS )?([^ ]+).*/\2/' | sed '/^$/d' | sort -u | wc -l | tr -d ' ')"

echo "RLS catalogue summary"
echo "  SQL sources scanned: ${#sql_files[@]}"
echo "  Unique ALTER TABLE targets: ${table_count}"
echo "  ENABLE statements:   ${enabled_count}"
echo "  FORCE statements:    ${forced_count}"
echo "  CREATE POLICY lines: ${policy_count}"
