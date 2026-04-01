# AGENTS.md — School Operating System

## What This Is

Multi-tenant school management SaaS. Single PostgreSQL database, shared schema, Row-Level Security isolation. NestJS modular monolith backend, Next.js App Router frontend, BullMQ worker service. Bilingual English/Arabic with full RTL. Two confirmed tenants pending onboarding.

## Reference Documents

```
Plans/
├── context.md                    # Architecture, RLS, auth, RBAC — ALWAYS LOAD
├── ui-design-brief.md            # Visual language, components — LOAD FOR ANY FRONTEND WORK
├── deployment-architecture.md    # Deployment setup and environment plan
└── archive/                      # Historical phase plans, results, testing (P0–P9)

architecture/
├── feature-map.md                # COMPLETE feature inventory — what exists and where it lives
├── module-blast-radius.md        # Cross-module dependencies — what breaks if you change X
├── event-job-catalog.md          # BullMQ job flows and side-effect chains
├── state-machines.md             # All lifecycle state machines with valid transitions
├── danger-zones.md               # Non-obvious coupling and risks
└── pre-flight-checklist.md       # Before/after checklist for every code change
```

---

## Current Workflow

Current work is iterative: refining existing functionality, adding enhancements based on tenant feedback, and QA fixes. Work may touch any module in any order. Each session is self-contained — read the relevant source code, make the requested changes, run regression tests.

---

# Autonomous Execution Policy

## Workflow

1. **User describes the deliverable.**
2. **I respond with my understanding** — explicit, nothing assumed. I also ask whether server access is granted for this task.
3. **User approves** the understanding and grants or denies server access.
4. **I execute autonomously from that point:**
   - Implement the changes
   - Run regression tests locally
   - Commit to GitHub (every change must be committed for version control)
   - Monitor GitHub Actions deployment via `gh run watch` / `gh run view`
   - If deployment fails: read logs via `gh run view --log-failed`, fix in code, commit again
   - If the issue is server-side and server access was granted: SSH into production and resolve
   - **Test in production** — local-only results are not sufficient. The work is not done until it is verified on production.

## Do Not Ask for Approval During Execution For

- Applying edits, fixing bugs, retrying after failures
- Refactoring within scope, file restructuring within scope
- Implementation-level decisions
- Committing and pushing to GitHub
- SSHing into the server (if permission was granted for this task)

## Stop and Ask If

- The change requires scope beyond what was requested
- Architecture changes or major unplanned functionality
- A blocker forces a materially different approach

## GitHub — Hard Rules

- **Only interact with `ACANOTES-dev/EduPod`.** Never access, read, push to, or reference any other repo on this account. No exceptions.

## Production Server — Hard Rules

The server is a live production environment. Every action carries real consequences.

- **Assume every command is high-stakes.** Measure all actions against the fact that this is production.
- **No destructive actions** that put the project at risk — no wiping data, dropping tables, deleting databases.
- **Operational deletions are permitted** — removing corrupted files, reverting a bad commit, cleaning up a failed deployment. These are maintenance, not destruction.
- **Never change credentials** (passwords, SSH keys, API keys, secrets) without explicit approval.
- **Never upgrade packages on the server** — versions are controlled from the codebase, not ad-hoc on the server.

---

## Monorepo Structure (Turborepo)

```
root/
├── apps/
│   ├── web/              # Next.js 14+ (App Router) — all role-aware shells
│   ├── api/              # NestJS — modular monolith backend
│   └── worker/           # BullMQ consumer service
├── packages/
│   ├── shared/           # Shared types, constants, Zod schemas
│   │   └── src/scheduler/  # Auto-scheduling CSP solver (pure TypeScript, no DB deps)
│   ├── prisma/           # Prisma schema, client, migrations, seed
│   ├── ui/               # Shared shadcn/Radix component library
│   ├── eslint-config/    # Shared ESLint configuration
│   └── tsconfig/         # Shared TypeScript configurations
├── plans/                # Implementation plans (see structure above)
├── turbo.json
├── package.json
└── .github/workflows/    # CI/CD
```

## Critical Rules — Read Every Time

### RLS — The #1 Rule

Every tenant-scoped table has `tenant_id UUID NOT NULL`. Row-Level Security is enforced at the database layer.

- Tenant context is set via `SET LOCAL app.current_tenant_id` at the start of every Prisma **interactive** transaction
- A Prisma middleware handles this — it reads tenant context from the request pipeline
- **Interactive transactions ONLY**: All tenant-scoped DB access MUST use `prisma.$transaction(async (tx) => { ... })`. The sequential/batch API `prisma.$transaction([...])` is PROHIBITED (PgBouncer transaction mode cannot guarantee connection affinity). Custom ESLint rule `no-sequential-transaction` enforces this.
- **NEVER write raw SQL outside the RLS middleware.** No `$executeRawUnsafe`, no `$queryRawUnsafe` anywhere else. A lint rule enforces this.
- Every BullMQ job payload MUST include `tenant_id`. The `TenantAwareJob` base class sets RLS context before any DB operation. Jobs without `tenant_id` are rejected at enqueue time.
- The `users` table is the ONE exception — it is platform-level, not tenant-scoped, no RLS. Guarded at the application layer.

### Regression Testing — Mandatory

Before considering any work complete, run the full existing test suite to verify nothing was broken by the changes. This is not optional.

- Run `turbo test` (or the relevant test commands for affected packages) after every feature addition, redesign, fix, or refactor
- If any existing test fails that was passing before your changes, you MUST fix the regression before proceeding
- This applies to all work — new features, bug fixes, redesigns, refactors, schema changes
- Do not skip this step. Do not treat it as a nice-to-have. A change that breaks existing functionality is not complete.

### No Drift

- Do not add tables, columns, endpoints, or features beyond what was requested
- Do not unilaterally "improve" the schema or architecture — if you see an opportunity for improvement, flag it to the user for a decision
- If something seems missing, flag it — don't invent it

### Sub-agents

- Sonnet 4.6 or Opus 4.6 models only. Never spawn Haiku sub-agents.

### TypeScript Strict

- `strict: true` in all tsconfig files
- No `any` types. No `@ts-ignore`. No `as unknown as X` casting hacks.
- **ONE exception**: the `as unknown as PrismaService` cast inside RLS transactions (`createRlsClient().$transaction()`) is the sole permitted use. It is confined to the service layer. If you need this cast anywhere else, something is architecturally wrong.
- All API inputs validated with Zod schemas (defined in `packages/shared`)
- All JSONB fields have corresponding Zod schemas

### Error Handling — No Silent Failures

Every `catch` block must do one of two things:

- **User-triggered actions**: show a toast with context — `toast.error(msg)` where `msg` comes from the API error or a descriptive fallback
- **Background fetches**: log to console — `console.error('[functionName]', err)`

**Empty `catch {}` blocks are prohibited.** Swallowing errors silently hides production bugs.

Backend errors always use the structured `{ code, message }` pattern with NestJS built-in exception classes:

```
throw new NotFoundException({ code: 'STUDENT_NOT_FOUND', message: `Student with id "${id}" not found` });
```

Error codes are `UPPER_SNAKE_CASE`. Messages are human-readable with context.

---

## Coding Style Conventions

### Naming

| Entity             | Convention                                                                                          | Example                                         |
| ------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Files              | `kebab-case.suffix.ts`                                                                              | `students.service.ts`, `zod-validation.pipe.ts` |
| File suffixes      | `.service.ts`, `.controller.ts`, `.module.ts`, `.spec.ts`, `.pipe.ts`, `.guard.ts`, `.processor.ts` | —                                               |
| Classes            | `PascalCase` matching filename                                                                      | `StudentsService`, `AuthGuard`                  |
| Interfaces / Types | `PascalCase`, no `I` prefix                                                                         | `StudentRow`, `ListStudentsQuery`               |
| Variables / params | `camelCase` in JS, `snake_case` for DB columns and API fields                                       | `tenantId` (JS), `tenant_id` (DB/API)           |
| Constants          | `UPPER_SNAKE_CASE`                                                                                  | `QUEUE_NAMES`, `SYSTEM_USER_SENTINEL`           |
| Zod schemas        | `camelCase` + `Schema` suffix                                                                       | `createStudentSchema`, `paginationQuerySchema`  |
| DTO types          | `PascalCase` + `Dto` suffix, via `z.infer<>`                                                        | `CreateStudentDto`                              |
| API routes         | `/v1/{resource}` kebab-case, plural                                                                 | `/v1/students`, `/v1/fee-structures`            |

### Import Ordering

Three-block pattern in every file:

1. External packages (NestJS, Prisma, React, Zod)
2. Internal shared packages (`@school/shared`, `@school/ui`)
3. Relative imports (path aliases `@/` for web, relative `../../` for API)

Use `import type` for type-only imports. Destructured, alphabetically ordered.

### Section Separators

Use visual dividers for logical code sections:

```
// ─── Status transition map ────────────────────────────────────────────────────
```

### JSDoc

Reserve for non-obvious behavior — describe what the method does and key side-effects. Not required on every method.

---

## Frontend Conventions (Next.js App Router)

### Routing & Structure

- `[locale]` dynamic segment at root for i18n
- Route groups: `(auth)`, `(platform)`, `(public)`, `(school)` for layout boundaries
- Page-local components go in `_components/` folder (underscore = excluded from routing)
- Dynamic routes use `[id]/` folder

### i18n (English / Arabic / RTL)

- `next-intl` library for translations
- Locale from `[locale]` param. Direction: `locale === 'ar' ? 'rtl' : 'ltr'`
- **Use logical CSS properties**: `start`/`end`, `ps-`/`pe-`/`ms-`/`me-` — never `left`/`right`

### Component Patterns

- Client components: `'use client'` directive at top
- React hooks via namespace: `React.useState`, `React.useCallback`, `React.useEffect`
- Data fetching: imperative `apiClient<T>()` from `@/lib/api-client` with `useEffect`. Do NOT introduce server-component data fetching — the auth flow is not designed for it.
- Component library: `@school/ui` (shadcn/Radix). Icons from `lucide-react`.
- Pagination: client-managed, API returns `{ data, meta: { page, pageSize, total } }`

### Forms — Hard Rule

New forms **must** use `react-hook-form` with `zodResolver` and the corresponding Zod schema from `@school/shared`:

```
const form = useForm<CreateStudentDto>({
  resolver: zodResolver(createStudentSchema),
  defaultValues: { ... },
});
```

Individual `useState` per form field is not acceptable for new forms. Existing hand-rolled forms may be migrated as they are touched.

### Styling

- Tailwind CSS with semantic design tokens: `bg-background`, `text-text-primary`, `text-text-secondary`
- Google Fonts via `@/lib/fonts`

---

## NestJS Backend Conventions

### Module Structure

Each feature module lives in `apps/api/src/modules/{module-name}/`:

```
modules/students/
├── dto/                          # Thin re-exports from @school/shared
├── students.controller.ts
├── students.controller.spec.ts
├── students.service.ts
├── students.service.spec.ts
└── students.module.ts
```

- **Flat structure** — no nested `services/` or `controllers/` directories
- Larger modules (finance, payroll) split into sub-services by concern, differentiated by filename prefix

### DTO Pattern

DTOs are thin re-exports from `@school/shared`. Zod schema is the single source of truth:

```
// dto/create-student.dto.ts
import { createStudentSchema } from '@school/shared';
import type { CreateStudentDto } from '@school/shared';
export { createStudentSchema };
export type { CreateStudentDto };
```

- Schema naming: `{action}{Entity}Schema`
- Update schemas: `.optional()` on all fields, `.nullable().optional()` for clearable fields
- Cross-field validation: `.refine()` with `path` pointing to dependent field

### Controller Pattern

- Versioned routes: `@Controller('v1/{resource}')`
- Guard stack: `@UseGuards(AuthGuard, PermissionGuard)` at class level
- Permission: `@RequiresPermission('module.action')` — dot-separated
- Tenant: `@CurrentTenant()` decorator → `tenantContext.tenant_id`
- Validation: `@Body(new ZodValidationPipe(schema))` inline per-parameter
- UUID params: `@Param('id', ParseUUIDPipe)`
- Static routes before dynamic (e.g., `allergy-report` before `:id`)
- Comment per route: `// GET /v1/students/:id`
- **Thin controllers** — zero business logic, delegate to service with `tenantId` as first arg

### Service Pattern

- Constructor DI: `private readonly` for all injected deps
- Every method signature starts with `tenantId: string`
- Existence checks before mutations: `findFirst` → null → `NotFoundException`
- RLS writes: `createRlsClient(this.prisma, { tenant_id }).$transaction(async (tx) => { ... })`
- Reads without RLS transaction: direct `this.prisma.model.findMany()` with `tenant_id` in `where`
- State machines: `VALID_TRANSITIONS` Record map, validated before update
- Pagination shape: `{ data, meta: { page, pageSize, total } }`

---

## Migration / Schema Change Rules

### Migration Naming

Format: `YYYYMMDDHHMMSS_{description_snake_case}/`

Prefixes: `add_`, `fix_`, `upgrade_`. Suffixes: `_tables`, `_indexes`, `_fields`, `_constraint`, `_enum`.

### RLS Policy for New Tables

Every new tenant-scoped table needs this boilerplate (from `packages/prisma/rls/policies.sql`):

```sql
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS {table_name}_tenant_isolation ON {table_name};
CREATE POLICY {table_name}_tenant_isolation ON {table_name}
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

- Policy naming: `{table_name}_tenant_isolation` — always
- Nullable `tenant_id` tables: add `tenant_id IS NULL OR` to both clauses
- Policies go in `post_migrate.sql` alongside their migration
- **Never forget `FORCE ROW LEVEL SECURITY`** — applies policies even to table owners

---

## BullMQ Job Conventions

### Queues

Defined in `apps/worker/src/base/queue.constants.ts`. One queue per domain module. Queue names are `kebab-case` strings, constants are `UPPER_SNAKE_CASE`.

### Job Names

Format: `module:action-description` — colon separator, kebab-case action. Exported as `UPPER_SNAKE_CASE` with `_JOB` suffix from the processor file.

### Processor Pattern

- File: `{feature}-{action}.processor.ts`, class: `{Feature}{Action}Processor extends WorkerHost`
- Prisma: `@Inject('PRISMA_CLIENT')` — worker uses raw `PrismaClient`, NOT `PrismaService`
- Job routing: guard clause `if (job.name !== MY_JOB) return;` — multiple processors share a queue
- Delegation: processor creates a `TenantAwareJob` subclass instance, calls `.execute(data)`
- Logger: `private readonly logger = new Logger(ClassName.name)` per class

### Cron Registration

All in `CronSchedulerService` via `OnModuleInit`:

- jobId format: `cron:${JOB_CONSTANT}` for BullMQ deduplication
- Retention: `removeOnComplete: 10`, `removeOnFail: 50`
- Cross-tenant crons: empty `{}` payload, processor iterates all tenants
- Per-tenant jobs: include `tenant_id` in payload

---

## Test Conventions

- **Co-located**: test files live next to source — `students.service.spec.ts` beside `students.service.ts`
- **Jest** as framework
- **describe blocks** per method: `'ClassName — methodName'`
- **NestJS testing module** for DI: `Test.createTestingModule({ providers: [...] }).compile()`
- **Mock factories**: `buildMockPrisma()`, `buildMockRedis()` — reusable helpers at module scope
- **RLS mocking**: `jest.mock('../../common/middleware/rls.middleware')` → mock `createRlsClient`
- **Fixtures**: `TENANT_ID`, `STUDENT_ID` etc. as module-scope constants
- **Cleanup**: `afterEach(() => jest.clearAllMocks())` — always

---

## Sequence Number Generation

Receipt numbers, invoice numbers, application numbers, payslip numbers all use the `tenant_sequences` table with row-level `SELECT ... FOR UPDATE` locking to prevent duplicates under concurrency. Format: `{prefix}-{YYYYMM}-{padded_sequence}`.

## Git Conventions

- Commit messages: conventional commits — `feat(payroll): add payroll run finalisation`

## Permanent Constraints

- No multi-currency — single currency per tenant, always
