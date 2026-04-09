# 00 — Common Knowledge

**READ THIS FIRST before picking up any implementation from this folder.**

This file captures the shared policies, conventions, and guardrails that every implementation in the Report Cards redesign MUST follow. If any implementation file appears to contradict this document, the contradiction is a bug — flag it and ask before proceeding.

---

## 1. What you are building

You are implementing one slice of a multi-part redesign of the Report Cards module for a multi-tenant school management SaaS. The authoritative design lives in `report-card-spec/design-spec.md` — read it end to end before touching code. The overall goal is to:

1. Replace the flat report card overview with a gradebook-style class-first matrix view.
2. Gate generation to admin users (`report_cards.manage` permission).
3. Introduce admin-controlled comment windows that govern when teachers can write comments and call AI.
4. Introduce a teacher request workflow for window reopens and regenerations.
5. Support English + Arabic PDF output with the "one language per PDF" rule.
6. Preserve existing infrastructure (`ReportCard`, `ReportCardTemplate`, `ReportCardBatchJob`, approval, delivery, custom fields) by refactoring rather than replacing.

If any of this is unclear, stop and re-read `design-spec.md`.

---

## 2. Repo context you need in your head

- **Monorepo:** Turborepo with `apps/web` (Next.js 14+ App Router), `apps/api` (NestJS modular monolith), `apps/worker` (BullMQ), `packages/shared` (Zod schemas & types), `packages/prisma` (schema, migrations, client), `packages/ui` (shadcn-based component library).
- **Database:** single PostgreSQL instance, shared schema, **Row-Level Security** enforced at the database layer. Tenant context is set via `SET LOCAL app.current_tenant_id` inside Prisma interactive transactions by middleware.
- **Auth:** JWT in memory, refresh via httpOnly cookie. No `localStorage`. No `sessionStorage`.
- **Bilingual:** English (LTR) + Arabic (RTL). All frontend work MUST use logical CSS properties (`start`/`end`/`ps-`/`pe-`/`ms-`/`me-`), never `left`/`right`/`pl-`/`pr-`/`ml-`/`mr-`. Lint rule enforces this.
- **Morphing shell:** the school-facing app uses the morphing-shell pattern from `docs/plans/ux-redesign-final-spec.md`. Do NOT introduce a sidebar.

---

## 3. Hard rules you MUST NOT violate

These come from `CLAUDE.md` and `.claude/rules/*.md`. Violating them breaks CI or worse.

### 3.1 Row-Level Security

- Every new tenant-scoped table MUST have `tenant_id UUID NOT NULL` with a foreign key to `tenants`.
- Every new tenant-scoped table MUST have an RLS policy in `post_migrate.sql` using the exact naming convention `{table_name}_tenant_isolation`.
- Every new table MUST enable AND force RLS:
  ```sql
  ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
  ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
  ```
- All tenant-scoped DB mutations MUST go through `prisma.$transaction(async (tx) => { ... })` interactive transactions. The sequential `$transaction([...])` batch API is PROHIBITED (enforced by the `no-sequential-transaction` ESLint rule).
- NEVER write raw SQL outside the RLS middleware. No `$executeRawUnsafe`, no `$queryRawUnsafe` anywhere in services or controllers.
- Every BullMQ job payload MUST include `tenant_id`. Processors MUST extend `TenantAwareJob` which sets RLS context before any DB operation.
- For every new tenant-scoped table, you MUST add at least one **RLS leakage test**: create data as Tenant A, authenticate as Tenant B, attempt to read, assert Tenant A's data is NOT returned.

### 3.2 TypeScript strict

- `strict: true` everywhere. No `any`. No `@ts-ignore`. No `as unknown as X` casting hacks.
- **One** exception exists repo-wide: the `as unknown as PrismaService` cast inside `createRlsClient().$transaction()` calls. You should never introduce a second exception.
- All API inputs validated with Zod schemas defined in `packages/shared`.
- All JSONB fields MUST have corresponding Zod schemas that validate structure at write time.

### 3.3 Error handling

- No empty `catch {}` blocks. Ever.
- User-triggered actions: show a toast with context — `toast.error(msg)`.
- Background fetches: log to console — `console.error('[functionName]', err)`.
- Backend errors: use NestJS exception classes with structured `{ code, message }` payloads, e.g.:
  ```ts
  throw new NotFoundException({
    code: 'STUDENT_NOT_FOUND',
    message: `Student with id "${id}" not found`,
  });
  ```
- Error codes are `UPPER_SNAKE_CASE`. Messages are human-readable with context.

### 3.4 Zod + DTO pattern

DTOs are thin re-exports from `packages/shared`. The Zod schema is the single source of truth.

```ts
// apps/api/src/modules/<module>/dto/<action>-<entity>.dto.ts
import { createSubjectCommentSchema } from '@school/shared';
import type { CreateSubjectCommentDto } from '@school/shared';

export { createSubjectCommentSchema };
export type { CreateSubjectCommentDto };
```

- Schema naming: `{action}{Entity}Schema` (camelCase + Schema suffix)
- Update schemas: `.optional()` on all fields, `.nullable().optional()` for clearable fields
- Cross-field validation: `.refine()` with `path` pointing to the dependent field

### 3.5 Controller pattern

- Versioned routes: `@Controller('v1/{resource}')`
- Guards: `@UseGuards(AuthGuard, PermissionGuard)` at class level
- Permission decorator: `@RequiresPermission('module.action')` — dot-separated
- Tenant: `@CurrentTenant()` decorator → `tenantContext.tenant_id`
- Validation: `@Body(new ZodValidationPipe(schema))` inline per-parameter
- UUID params: `@Param('id', ParseUUIDPipe)`
- Thin controllers — NO business logic. Delegate to service with `tenantId` as the first arg.

### 3.6 Service pattern

- Constructor DI with `private readonly`
- Every method signature starts with `tenantId: string`
- Existence checks before mutations: `findFirst` → null → `NotFoundException`
- RLS writes: `createRlsClient(this.prisma, { tenant_id }).$transaction(async (tx) => { ... })`
- Reads without RLS transaction: direct `this.prisma.model.findMany()` with `tenant_id` in `where`
- State machines: `VALID_TRANSITIONS` Record map, validated before update
- Pagination shape: `{ data, meta: { page, pageSize, total } }`
- If a service grows beyond ~400-500 lines or mixes concerns, split it by filename prefix (e.g., `report-card-generation-scope.service.ts`, `report-card-generation-render.service.ts`).

### 3.7 Module DI verification

When you add a dependency to a service constructor or create a new service that other modules consume, run the DI verification script from `CLAUDE.md` locally before pushing:

```bash
cd apps/api && DATABASE_URL=postgresql://x:x@localhost:5432/x \
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=fakefakefakefakefakefakefakefake \
JWT_REFRESH_SECRET=fakefakefakefakefakefakefakefake \
ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
MFA_ISSUER=test PLATFORM_DOMAIN=test.local APP_URL=http://localhost:3000 \
npx ts-node -e "
import { Test } from '@nestjs/testing';
import { AppModule } from './src/app.module';
Test.createTestingModule({ imports: [AppModule] }).compile()
  .then(() => { console.log('DI OK'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
"
```

Catches DI failures in seconds instead of waiting for CI.

### 3.8 Imports and code quality

- Three-block import pattern: (1) external packages, (2) internal shared packages (`@school/shared`, `@school/ui`), (3) relative imports
- Alphabetical within each block
- One blank line between groups
- `import type` for type-only imports
- Never leave unused imports

---

## 4. Frontend-specific rules

### 4.1 RTL-safe styling (zero tolerance)

Never use any of these:

- `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`
- `text-left`, `text-right`
- `rounded-l-`, `rounded-r-`
- `border-l-`, `border-r-`

Always use:

- `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`
- `text-start`, `text-end`
- `rounded-s-`, `rounded-e-`
- `border-s-`, `border-e-`

Lint rule enforces this. It is a build error. Do not bypass.

### 4.2 Mobile responsiveness

Every page and component MUST be usable at 375px width (iPhone SE). Build mobile-first.

- Main content containers under the morph shell: `flex-1 min-w-0 overflow-x-hidden`. The `min-w-0` is critical.
- Never use fixed pixel widths on content containers.
- Use `w-full` not `100vw`.
- Minimum touch target: 44×44px on all interactive elements.
- Inputs: `w-full` on mobile, font-size at least `text-base` (16px) to prevent iOS zoom.
- Tables: wrap in `<div className="overflow-x-auto">`. Prefer stacked cards or sticky first column on mobile.
- Long unbreakable strings: `break-all` or `overflow-wrap: break-word`.

### 4.3 Forms

New forms MUST use `react-hook-form` with `zodResolver` and the shared Zod schema:

```ts
const form = useForm<CreateSubjectCommentDto>({
  resolver: zodResolver(createSubjectCommentSchema),
  defaultValues: { ... },
});
```

Individual `useState` per field is NOT acceptable for new forms.

### 4.4 Data fetching

- Client components only. `'use client'` at the top.
- Use `apiClient<T>()` from `@/lib/api-client` inside `useEffect`.
- Do NOT introduce server-component data fetching for the authenticated school app — the auth flow does not support it.
- Pagination: client-managed, API returns `{ data, meta: { page, pageSize, total } }`.

### 4.5 Component library and tokens

- Use `@school/ui` components (shadcn/Radix under the hood). Do not install another component library.
- Icons from `lucide-react`.
- Tailwind only. No CSS modules. No inline styles.
- Semantic tokens: `bg-background`, `text-text-primary`, `text-text-secondary`, etc.
- NEVER hardcode colour hex values inside components.
- Charts: Recharts.

### 4.6 i18n

- Use `useTranslations()` from `next-intl`
- Translation files: `apps/web/messages/{locale}.json`
- Every new string MUST have a translation key and both `en.json` and `ar.json` entries
- LTR enforcement on: email addresses, URLs, phone numbers, numeric inputs, enrolment IDs
- Western numerals (0-9) in both locales. Gregorian calendar in both locales.

---

## 5. Testing policies

Every implementation MUST include tests. Not optional.

### 5.1 Required test types per implementation

Depending on what your implementation touches, include the relevant types:

| What you built                              | Tests required                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| Prisma schema change (new table)            | RLS leakage test for the new table                                        |
| Zod schema                                  | Unit tests for every `.refine()` rule and edge case                       |
| Service                                     | Co-located `.spec.ts` with happy path + error path + existence check      |
| Controller                                  | Co-located `.spec.ts` with auth, permission, and validation coverage      |
| New API endpoint                            | At least one happy-path test AND one permission-denied test               |
| State machine                               | All valid transitions AND confirm invalid transitions throw               |
| BullMQ job                                  | Co-located processor spec + an RLS context test                           |
| Frontend page                               | Component test (if applicable) + E2E in `apps/web/e2e` for critical flows |
| Calculation (grade, rank, weighted average) | Unit tests with exact expected outputs                                    |

### 5.2 Test naming

- `describe` blocks: name the service/controller (e.g., `'CommentWindowsService — open'`)
- Test names: plain English describing behaviour (e.g., `'should return 403 when user lacks report_cards.manage'`)
- Edge case tests: prefix `'edge:'` (e.g., `'edge: should reject window with closes_at before opens_at'`)

### 5.3 RLS leakage test pattern

Every new tenant-scoped table needs a test following this structure:

1. Create data as Tenant A (seed or fixture)
2. Authenticate as Tenant B
3. Attempt to read/query the data
4. Assert: data is NOT returned (empty result or 404 — never Tenant A's data)

Do this for EVERY new tenant-scoped table in your implementation.

### 5.4 Regression testing — mandatory

Before considering your implementation complete, you MUST run the full existing test suite:

```bash
turbo test
```

If any existing test fails that was passing before your changes, you MUST fix the regression. A change that breaks existing functionality is not complete. Log the result of `turbo test` in your implementation log entry.

### 5.5 Coverage ratchet

Coverage thresholds in `jest.config.js` are a floor, not a target. When coverage improves, ratchet the threshold UP. NEVER lower a threshold to make CI pass — find and fix the missing tests instead.

---

## 6. Security requirements

### 6.1 Permission checks

- Every endpoint that touches tenant data MUST resolve and inject tenant context before any DB operation.
- Every endpoint MUST have an explicit `@RequiresPermission('<perm>')` decorator — default-deny is not sufficient.
- The new permissions introduced by this redesign:
  - `report_cards.view` — view report cards and library (read-only)
  - `report_cards.comment` — edit own subject comments + submit requests (all teachers)
  - `report_cards.manage` — admin: wizard, settings, window, approvals
- Register these permissions in the permission seed / registry (see `docs/plans/context.md` for where permissions are registered).

### 6.2 Encrypted fields

- Student `national_id` is encrypted at rest. Only decrypt in memory during rendering. NEVER log. NEVER return in API responses unmasked. On the report card PDF, render it only when the admin explicitly selects it as a personal-info field, and only for tenants whose users have the permission to see it.
- Principal signature is stored as an image file under tenant-scoped storage, not in the DB directly.

### 6.3 AI cost control

- The AI draft endpoint MUST reject calls outside an open comment window. This is the core cost-control mechanism — it is not advisory, it is enforced server-side.
- Error code: `COMMENT_WINDOW_CLOSED`
- Log every AI call (who, when, for which student, which period) for post-hoc cost analysis.

---

## 7. Commit and PR conventions

- Conventional commits: `feat(report-cards): ...`, `fix(report-cards): ...`, `refactor(report-cards): ...`, `docs(report-cards): ...`
- One logical unit per commit. No "misc fixes".
- Never skip hooks (`--no-verify` is forbidden unless the user explicitly asks).
- Never amend a commit that has been pushed. Create a new commit instead.
- Commit the implementation log update in the same commit or PR as the implementation itself.

---

## 8. Architecture doc updates (mandatory check)

After every implementation, check whether any of these files need updating. If yes, update them in the same PR. If no, note "not required" in your log entry.

| File                                       | Update if your implementation…                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `docs/architecture/module-blast-radius.md` | …adds/removes a cross-module dependency (one module importing another module's service)          |
| `docs/architecture/event-job-catalog.md`   | …adds/removes/modifies a BullMQ job or cron                                                      |
| `docs/architecture/state-machines.md`      | …adds a new status enum, a new transition, or a new lifecycle                                    |
| `docs/architecture/danger-zones.md`        | …discovers a non-obvious coupling or risk (add the entry)                                        |
| `docs/architecture/feature-map.md`         | DO NOT update unilaterally — ask the user first (see `.claude/rules/feature-map-maintenance.md`) |

You are policing architecture drift as you go. Do not treat it as optional.

---

## 9. When to stop and ask the user

Per `CLAUDE.md` — Autonomous Execution Policy:

**Stop and ask if:**

- The change requires scope beyond what the implementation file describes
- You discover the design spec is wrong or internally contradictory
- Architecture changes or major unplanned functionality are needed to proceed
- A blocker forces a materially different approach

**Do NOT ask for approval to:**

- Apply edits, fix bugs, retry after failures
- Refactor within scope
- Commit and push
- Run tests

---

## 10. How to complete an implementation

1. Read the implementation file end to end.
2. Read `design-spec.md` for the sections relevant to your implementation.
3. Re-read this file to confirm the rules.
4. Execute the task list in the implementation file.
5. Run `turbo lint`, `turbo type-check`, `turbo test` locally.
6. Fix anything that fails.
7. Commit with a conventional commit message referencing the implementation number (e.g., `feat(report-cards): land database foundation (impl 01)`).
8. Update `implementation-log.md` with a completion entry following its template.
9. Check `docs/architecture/*.md` per Section 8 above and update if needed.
10. If the implementation is partial or blocked, mark it as such in the log and surface blockers clearly.

---

## 11. Known constraints from design-spec.md

Quick reference — full detail in `design-spec.md`:

- **v1 languages:** English + Arabic only
- **v1 templates:** "grades-only" content scope only; homework/attendance/behaviour variants are placeholders with "coming soon" tooltips in the UI
- **Runs overwrite:** new generation deletes the old PDF, no version history at the document level
- **Comment finalisation:** strict — unfinalised comments block generation unless admin explicitly overrides
- **Class rank:** top 3 only, never display ranks below top 3
- **Comment window:** exactly one open window per tenant at any time, enforced by unique partial index
- **Language rule:** one language per physical PDF, never mixed; English is always produced; second language is additional when the student has the flag
- **PDF visual design:** held for user — do NOT design it yourself

---

## 12. Contact / escalation

If you are stuck:

1. Re-read `design-spec.md` for the relevant section
2. Re-read this file
3. If still stuck, document the blocker in your implementation log entry and hand off to the user

Good luck. Ship carefully.
