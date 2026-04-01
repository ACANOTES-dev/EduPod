#!/bin/bash

set +e

timestamp="2026-04-01_02-39-13"
log="Audit-GPT/commands-run_${timestamp}.txt"

: > "$log"

run_cmd() {
  local label="$1"
  local cmd="$2"

  printf '\n===== %s =====\n' "$label" | tee -a "$log"
  printf '$ %s\n' "$cmd" | tee -a "$log"

  /bin/bash -lc "$cmd" >>"$log" 2>&1
  local rc=$?

  printf '[exit %s]\n' "$rc" | tee -a "$log"
}

run_cmd "pwd" "pwd"
run_cmd "find maxdepth 2 dirs" "find . -maxdepth 2 -type d | sort | sed 's#^\./##'"

run_cmd "root files" "echo '=== Root files ==='; ls -la"
run_cmd "apps and packages" "echo '=== Apps and packages ==='; find apps packages -maxdepth 2 -type d 2>/dev/null | sort"
run_cmd "TypeScript file count" "echo '=== TypeScript file count ==='; find apps packages \\( -name '*.ts' -o -name '*.tsx' \\) | wc -l"
run_cmd "Largest source files" "echo '=== Largest source files ==='; find apps packages \\( -name '*.ts' -o -name '*.tsx' \\) | xargs wc -l 2>/dev/null | sort -rn | head -60"
run_cmd "Test file count" "echo '=== Test file count ==='; find apps packages \\( -name '*.spec.ts' -o -name '*.spec.tsx' -o -name '*.test.ts' -o -name '*.test.tsx' \\) | wc -l"

run_cmd "root package.json" "echo '=== package.json ==='; cat package.json"
run_cmd "turbo.json" "echo '=== turbo.json ==='; cat turbo.json 2>/dev/null"
run_cmd "Workspace package manifests" "echo '=== Workspace package manifests ==='; find . -maxdepth 3 -name 'package.json' | sort"

run_cmd "API modules" "echo '=== API modules ==='; find apps/api/src/modules -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sed 's#^\./##' | sort"
run_cmd "app.module.ts" "echo '=== app.module.ts ==='; cat apps/api/src/app.module.ts 2>/dev/null"
run_cmd "Per-module file and line counts" "echo '=== Per-module file and line counts ==='; for d in apps/api/src/modules/*/; do [ -d \"\$d\" ] || continue; mod=\$(basename \"\$d\"); files=\$(find \"\$d\" -name '*.ts' ! -name '*.spec.ts' | wc -l | tr -d ' '); lines=\$(find \"\$d\" -name '*.ts' ! -name '*.spec.ts' -exec cat {} + 2>/dev/null | wc -l | tr -d ' '); echo \"\$mod,\$files,\$lines\"; done | sort -t, -k3 -rn | head -60"
run_cmd "Cross-module import hotspots" "echo '=== Cross-module import hotspots ==='; for d in apps/api/src/modules/*/; do [ -d \"\$d\" ] || continue; mod=\$(basename \"\$d\"); imports=\$(grep -rh \"from '../../\" \"\$d\" --include='*.ts' 2>/dev/null | grep -v spec | grep -v dto | sort -u | wc -l | tr -d ' '); echo \"\$mod,\$imports\"; done | sort -t, -k2 -rn | head -40"

run_cmd "Frontend pages" "echo '=== Frontend pages ==='; find apps/web/src/app -name 'page.tsx' 2>/dev/null | wc -l"
run_cmd "Frontend components" "echo '=== Frontend components ==='; find apps/web/src/components -name '*.tsx' 2>/dev/null | wc -l; find apps/web/src/app -path '*/_components/*.tsx' 2>/dev/null | wc -l"
run_cmd "Frontend test files" "echo '=== Frontend test files ==='; find apps/web \\( -name '*.spec.*' -o -name '*.test.*' \\) 2>/dev/null | sort"
run_cmd "Worker processors" "echo '=== Worker processors ==='; find apps/worker/src -name '*.processor.ts' 2>/dev/null | sort"
run_cmd "Worker processor count" "echo '=== Worker processor count ==='; find apps/worker/src -name '*.processor.ts' 2>/dev/null | wc -l"

run_cmd "Backend test count" "echo '=== Backend test count ==='; find apps/api -name '*.spec.ts' | wc -l"
run_cmd "Worker test count" "echo '=== Worker test count ==='; find apps/worker -name '*.spec.ts' | wc -l"
run_cmd "Shared package test count" "echo '=== Shared package test count ==='; find packages \\( -name '*.spec.ts' -o -name '*.test.ts' \\) | wc -l"

run_cmd "Backend tests" "echo '=== Backend tests ==='; cd apps/api && CI=1 pnpm test"
run_cmd "Worker tests" "echo '=== Worker tests ==='; cd apps/worker && CI=1 pnpm test"
run_cmd "Shared package tests" "echo '=== Shared package tests ==='; cd packages/shared && CI=1 pnpm test"

run_cmd "Lint" "echo '=== Lint ==='; CI=1 pnpm turbo run lint"
run_cmd "Type-check" "echo '=== Type-check ==='; CI=1 pnpm turbo run type-check"
run_cmd "Build" "echo '=== Build ==='; CI=1 pnpm turbo run build"

run_cmd "any and as any" "echo '=== any / as any ==='; grep -rn ': any\\|as any' apps/api/src apps/web/src apps/worker/src --include='*.ts' --include='*.tsx' | grep -v spec | grep -v node_modules | grep -v '.d.ts'"
run_cmd "ts-ignore and ts-expect-error" "echo '=== ts-ignore / ts-expect-error ==='; grep -rn '@ts-ignore\\|@ts-expect-error' apps/api/src apps/web/src apps/worker/src --include='*.ts' --include='*.tsx'"
run_cmd "Technical debt markers" "echo '=== Technical debt markers ==='; grep -rcn 'TODO\\|FIXME\\|HACK\\|XXX\\|TEMP\\|WORKAROUND' apps/api/src apps/web/src apps/worker/src --include='*.ts' --include='*.tsx' | grep -v ':0\$' | sort -t: -k2 -rn"
run_cmd "Largest backend files" "echo '=== Largest backend files ==='; find apps/api/src -name '*.ts' ! -name '*.spec.ts' | xargs wc -l 2>/dev/null | sort -rn | head -40"
run_cmd "Largest frontend files" "echo '=== Largest frontend files ==='; find apps/web/src -name '*.tsx' | xargs wc -l 2>/dev/null | sort -rn | head -25"
run_cmd "Largest worker files" "echo '=== Largest worker files ==='; find apps/worker/src -name '*.ts' ! -name '*.spec.ts' | xargs wc -l 2>/dev/null | sort -rn | head -25"

run_cmd "Prisma model count" "echo '=== Prisma model count ==='; grep -c '^model ' packages/prisma/schema.prisma 2>/dev/null"
run_cmd "tenant_id occurrences" "echo '=== tenant_id occurrences ==='; grep -c 'tenant_id' packages/prisma/schema.prisma 2>/dev/null"
run_cmd "policies.sql RLS enable count" "echo '=== policies.sql RLS enable count ==='; grep -c 'ENABLE ROW LEVEL SECURITY' packages/prisma/rls/policies.sql 2>/dev/null"
run_cmd "RLS tables from policies" "echo '=== RLS tables from policies ==='; grep 'ENABLE ROW LEVEL SECURITY' packages/prisma/rls/policies.sql 2>/dev/null | sed 's/.*TABLE //' | sed 's/ .*//' | sort > /tmp/rls_tables_audit_gpt.txt; wc -l /tmp/rls_tables_audit_gpt.txt"
run_cmd "RLS tables from post_migrate files" "echo '=== RLS tables from post_migrate files ==='; find packages/prisma/migrations -name 'post_migrate.sql' -exec grep 'ENABLE ROW LEVEL SECURITY' {} \\; 2>/dev/null | sed 's/.*TABLE //' | sed 's/ .*//' | sort -u >> /tmp/rls_tables_audit_gpt.txt; sort -u /tmp/rls_tables_audit_gpt.txt | wc -l"
run_cmd "Models with tenant_id" "echo '=== Models with tenant_id ==='; grep -B1 'tenant_id' packages/prisma/schema.prisma 2>/dev/null | grep '^model ' | awk '{print \$2}' | sort > /tmp/tenant_models_audit_gpt.txt; wc -l /tmp/tenant_models_audit_gpt.txt"
run_cmd "Models with tenant_id but no RLS" "echo '=== Models with tenant_id but no RLS ==='; comm -23 /tmp/tenant_models_audit_gpt.txt <(sort -u /tmp/rls_tables_audit_gpt.txt) 2>/dev/null"

run_cmd "CI workflow" "echo '=== CI workflow ==='; cat .github/workflows/ci.yml 2>/dev/null"
run_cmd "Deploy workflow" "echo '=== Deploy workflow ==='; cat .github/workflows/deploy.yml 2>/dev/null"
run_cmd "Docker compose" "echo '=== Docker compose ==='; cat docker-compose.yml 2>/dev/null"
run_cmd "Env example" "echo '=== Env example ==='; cat .env.example 2>/dev/null"
run_cmd "Husky hooks" "echo '=== Husky hooks ==='; ls .husky/ 2>/dev/null; cat .husky/pre-commit 2>/dev/null"
run_cmd "Process manager configs" "echo '=== Process manager configs ==='; find . -name 'ecosystem.config.*' -o -name 'pm2.*' 2>/dev/null"
run_cmd "Sentry references" "echo '=== Sentry references ==='; grep -rn 'Sentry\\|sentry\\|SENTRY' apps/api/src/main.ts apps/api/src/instrument.ts 2>/dev/null"

printf '\nDiscovery pass complete. Log written to %s\n' "$log"
