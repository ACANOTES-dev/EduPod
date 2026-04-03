# KIMI.md — Instructions for Kimi-K-2.5

You are an agent executing implementation specs in a large (~300k+ LOC) multi-tenant school management SaaS. Your work will be reviewed by a senior agent (Opus/Codex) before merge. Your priorities, in order:

1. **Do no harm** — never delete, replace, or overwrite existing code you weren't asked to change
2. **Database safety** — every tenant-scoped table needs RLS; every write needs an RLS transaction
3. **Spec completeness** — deliver every item in the deliverables checklist
4. **Code quality** — follow the conventions in CLAUDE.md exactly

---

## Rule #1: Do Not Destroy Existing Code

This is your most critical rule. Violations here are worse than missing a deliverable.

### When modifying an existing file:

- **READ the entire file first.** Do not guess what's in it.
- **ADD lines. Do not replace, remove, or rewrite lines you weren't asked to change.**
- When adding an import to a file with 50 existing imports, your diff must show `+1` line, not `-7 +1`.
- When adding an entry to an array, your diff must show `+1` line added to the array, not the array rewritten.
- If your tool/editor replaces a block of code, **verify the diff** before committing. If the diff shows deletions you didn't intend, stop and fix it.

### Concrete failure that caused this rule:

You were asked to add `SenModule` to `app.module.ts`. You deleted 7 existing module imports (`TenantsModule`, `StudentsModule`, `StaffProfilesModule`, `StaffAvailabilityModule`, `StaffPreferencesModule`, `StaffWellbeingModule`, `WebsiteModule`) and replaced them with your single import. This broke the entire application. The correct change was `+1` line (the SenModule import) and `+1` line (SenModule in the imports array). Nothing else.

### Before committing, verify:

```bash
git diff --stat
```

If any file you were told to MODIFY shows more deletions than you expect, **stop and investigate**. A file where you added 1 import should show `1 insertion(+), 0 deletions(-)`, not `1 insertion(+), 7 deletions(-)`.

---

## Rule #2: Database Safety (RLS & Tenant Isolation)

This is a multi-tenant system. Data leaks between tenants are security breaches.

- Every new table with `tenant_id` needs an RLS policy (ENABLE + FORCE + CREATE POLICY)
- Every write operation (create, update, delete) on a tenant-scoped table must use `createRlsClient(this.prisma, { tenant_id }).$transaction(async (tx) => { ... })`
- The `as unknown as typeof this.prisma` cast inside RLS transactions is the ONE permitted use of `as unknown as X`
- Never use `$executeRawUnsafe` or `$queryRawUnsafe` outside the RLS middleware
- Every BullMQ job payload must include `tenant_id`

---

## Rule #3: Deliver Every Item in the Checklist

You will receive a deliverables checklist alongside each spec. This checklist exists because you have a tendency to complete the "obvious" work (schema, models, core logic) and skip the integration work (permissions, seeds, config, architecture docs, tests).

### Your known blind spots:

| Category             | What you tend to skip                                    | Why it matters                              |
| -------------------- | -------------------------------------------------------- | ------------------------------------------- |
| Permission seeds     | `seed/permissions.ts` — adding new permission entries    | Users can't access the feature              |
| System roles         | `seed/system-roles.ts` — assigning permissions to roles  | RBAC is broken                              |
| Module registration  | `constants/modules.ts` — adding module key               | Module toggle doesn't work                  |
| Sequence types       | `constants/sequence-types.ts` — registering new sequence | Auto-numbering fails                        |
| Tenant settings      | `tenant.schema.ts` — adding settings section             | Feature can't be configured                 |
| Master RLS file      | `rls/policies.sql` — adding policies to master file      | RLS maintenance misses tables               |
| Architecture docs    | `state-machines.md`, `feature-map.md`                    | Documentation rots, developers break things |
| Tests                | `*.spec.ts` files                                        | Regressions go undetected                   |
| Tenant settings type | `types/tenant-config.ts` — adding TypeScript interface   | Type safety missing                         |

**Treat the deliverables checklist as a punch list.** Work through it item by item. Do not report completion until every checkbox is addressed.

---

## Rule #4: Code Quality & Conventions

Read and follow `CLAUDE.md` in the project root. Key conventions:

### Naming

- Files: `kebab-case.suffix.ts` (e.g., `sen-profile.service.ts`)
- Classes: `PascalCase` matching filename
- DB columns / API fields: `snake_case`
- Constants: `UPPER_SNAKE_CASE`
- Zod schemas: `camelCase` + `Schema` suffix

### Imports (strict ordering)

```typescript
// 1. External packages
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

// 2. Internal packages (@school/*)
import { someSchema } from '@school/shared';

// 3. Relative parent imports (../)
import { AuthGuard } from '../../common/guards/auth.guard';

// 4. Relative sibling imports (./)
import { MyService } from './my.service';
```

One blank line between groups. Alphabetical within groups. Use `import type` for type-only imports.

### TypeScript Strict

- No `any` types
- No `@ts-ignore`
- No `as unknown as X` (except the one RLS transaction exception)
- All enum/union values must match exactly — use `as const` if needed
- Match required vs optional fields in test fixtures

### Controllers

- `@Controller('v1')` at class level
- `@ModuleEnabled('module_key')` at class level
- `@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)` at class level
- Static routes before dynamic routes
- `@RequiresPermission('module.action')` per route
- Permissions are resolved via `PermissionCacheService.getPermissions(membershipId)`, NOT from `JwtPayload` (JwtPayload does not have a `permissions` property)
- Route comment above each handler: `// GET /v1/sen/profiles`
- Thin controllers — zero business logic, delegate to service

### Services

- `tenantId: string` as first parameter on every method
- Existence checks before mutations: `findFirst` → null → `NotFoundException`
- Error codes: `UPPER_SNAKE_CASE` — e.g., `SEN_PROFILE_NOT_FOUND`
- Pagination: `{ data, meta: { page, pageSize, total } }`

### Tests

- Co-located: `my.service.spec.ts` next to `my.service.ts`
- Mock RLS: `jest.mock('../../common/middleware/rls.middleware')`
- Prisma errors: use `new Prisma.PrismaClientKnownRequestError('...', { code: 'P2002', clientVersion: '5.0.0' })`, never `new Error()` with a `.code` property
- Guard overrides in controller tests: `.overrideGuard(AuthGuard).useValue({ canActivate: () => true })`
- Metadata keys: `MODULE_ENABLED_KEY` = `'module_enabled'`, `REQUIRES_PERMISSION_KEY` = `'requires_permission'`, guards = `'__guards__'`
- `TenantContext` requires all fields: `tenant_id`, `slug`, `name`, `status`, `default_locale`, `timezone`
- `JwtPayload` requires all fields: `sub`, `email`, `tenant_id`, `membership_id`, `type`, `iat`, `exp`
- `afterEach(() => jest.clearAllMocks())`
- No unused variables — if you declare `let prisma` in the test setup but never use it, remove it

### Enums

- Use the exact values from the Prisma schema / Zod enums
- Common mistake: inventing values like `'cognition'` when the valid values are `'learning'`, `'emotional_behavioural'`, `'physical'`, etc.
- When in doubt, read `packages/shared/src/sen/enums.ts` for the valid values

---

## Rule #5: Git Safety

- **Always create a branch.** Never work directly on `main`.
- **Always commit and push.** Your work is not done until `git log origin/<branch> --oneline -1` shows your commit.
- **Never touch other branches.** If you see `Codex-1`, `main`, or any other branch, do not checkout, merge, rebase, or modify it.
- **Never force-push.**
- **Verify your diff before committing:**
  ```bash
  git diff --stat          # Check file-level changes
  git diff                 # Read the full diff — look for unintended deletions
  git add -A
  git status               # Verify staged files are what you expect
  git commit -m "feat(module): description"
  git push -u origin <branch>
  git log origin/<branch> --oneline -1   # Verify push landed
  ```

---

## Pre-Commit Checklist

Before reporting your work as complete, verify:

- [ ] `git diff --stat` shows no unexpected deletions in modified files
- [ ] All items in the deliverables checklist are addressed
- [ ] No `any` types, no `@ts-ignore`
- [ ] All enum values match the schema exactly
- [ ] All test fixtures use complete types (full `JwtPayload`, full `TenantContext`)
- [ ] RLS policies exist for all new tenant-scoped tables
- [ ] New permissions are added to `seed/permissions.ts` AND `constants/permissions.ts`
- [ ] Work is committed and pushed to remote
- [ ] `git log origin/<branch>` confirms the commit exists

---

## What Happens After You

Your code will be reviewed by Opus or Codex. They will:

1. Run `turbo type-check` and `turbo lint`
2. Run all tests (`turbo test`)
3. Check your diff for unintended deletions
4. Fill any gaps you left
5. Fix type errors, convention violations, and test failures
6. Merge to main and deploy

Your goal is to minimise the review agent's work. Every bug you prevent saves time and money. But if you must choose between:

- **Leaving a gap** (missing a deliverable) — the reviewer catches it instantly by diffing against the checklist
- **Introducing a destructive bug** (deleting imports, wrong types, breaking existing code) — the reviewer might miss it, and it breaks production

**Always choose the gap over the bug.** Incomplete is recoverable. Destructive is not.
