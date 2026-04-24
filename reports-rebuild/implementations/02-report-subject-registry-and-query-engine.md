# Implementation 02 — Report Subject Registry + Query Engine

> **Wave:** 2 (parallel, API restart)
> **Depends on:** 01
> **Deploys:** API restart only

---

## Goal

Build the two foundations the custom report builder will stand on: (1) the **subject registry**, a curated catalogue of the 11 report subjects and their permission-scoped field trees; and (2) the **query engine**, a safe translator from a saved-report definition (subject + columns + filters + group-by) into RLS-scoped Prisma queries with row caps, timeout, and aggregation support.

Nothing in this phase touches UI. The existing `/v1/reports/builder/execute` endpoint is rewritten to delegate to the engine; the existing `CustomReportBuilderService.executeReport` stub is replaced.

## What to change

### 1. Subject registry (`apps/api/src/modules/reports/subject-registry/`)

#### 1a. `reports-subject-registry.service.ts`

Exports:

```ts
type FieldDescriptor = {
  id: string; // e.g. "student.identity.first_name"
  label_key: string; // i18n key
  domain: string; // e.g. "identity", "finance_summary"
  type: 'string' | 'number' | 'date' | 'boolean' | 'enum' | 'currency';
  aggregations?: Array<'count' | 'sum' | 'avg' | 'min' | 'max' | 'percent'>;
  filterable: boolean;
  groupable: boolean;
  permission?: string; // permission required to see this field
  resolver: ResolverKey; // string id into a resolver map
};

type SubjectDescriptor = {
  key: ReportSubjectKey;
  label_key: string;
  icon_name: string;
  primary_model: string; // Prisma model name
  fields: FieldDescriptor[];
};

class ReportsSubjectRegistryService {
  getAllSubjects(permissions: string[]): SubjectDescriptor[];
  getSubject(key: ReportSubjectKey, permissions: string[]): SubjectDescriptor;
  // returns subject with fields pre-filtered to user's permissions
}
```

The registry is **data, not logic**. Each subject's fields are declared in its own file:

- `fields/student-fields.ts` — 11 domains, ~80 fields (see PLAN.md §4.2).
- `fields/staff-fields.ts` — 9 domains.
- `fields/household-fields.ts` — 5 domains.
- `fields/class-fields.ts` — 7 domains.
- `fields/invoice-fields.ts` — 7 domains.
- `fields/application-fields.ts` — 7 domains.
- `fields/behaviour-incident-fields.ts` — 7 domains.
- `fields/safeguarding-concern-fields.ts` — 7 domains.
- `fields/attendance-record-fields.ts` — 6 domains.
- `fields/grade-fields.ts` — 7 domains.
- `fields/payroll-entry-fields.ts` — 9 domains.

Each file exports a `const { key, label_key, icon_name, primary_model, fields }: SubjectDescriptor`.

The full field catalogues are long but straightforward — document them exhaustively. Each field has: `id`, `label_key`, `domain`, `type`, `aggregations`, `filterable`, `groupable`, `permission` (optional), and `resolver` (a string key that the query engine uses to find the resolver function in its resolver map).

#### 1b. Subject registry endpoint

Expose `GET /v1/reports/subject-registry` returning the caller's permission-scoped registry as JSON. The frontend builder fetches this on load to render the subject picker and field tree.

```ts
@Controller('v1/reports/subject-registry')
@UseGuards(AuthGuard, PermissionGuard)
@RequiresPermission('reports.builder')
export class SubjectRegistryController {
  @Get()
  list(@CurrentTenant() tenant, @CurrentUser() user) { ... }

  @Get(':subjectKey')
  get(@Param('subjectKey') key, @CurrentTenant() tenant, @CurrentUser() user) { ... }
}
```

### 2. Query engine (`apps/api/src/modules/reports/query-engine/`)

#### 2a. `query-engine.types.ts`

```ts
type SavedReportQuery = {
  subject: ReportSubjectKey;
  columns: Array<{ field_id: string; aggregation?: Aggregation }>;
  filters: FilterNode; // recursive AND/OR tree with leaf = { field_id, operator, value }
  group_by?: Array<{ field_id: string }>;
  sort?: Array<{ field_id: string; direction: 'asc' | 'desc' }>;
};

type QueryExecutionResult = {
  rows: Record<string, unknown>[];
  columns: Array<{ id: string; label_key: string; type: string }>;
  meta: { row_count: number; truncated: boolean; execution_ms: number };
};
```

#### 2b. `query-engine.service.ts`

Exports `QueryEngineService.execute(tenantId, userId, permissions, query, { page, pageSize }): Promise<QueryExecutionResult>`.

Algorithm:

1. **Validate** — every field id in `query.columns`, `query.filters`, `query.group_by`, `query.sort` must exist in the subject's permission-scoped registry. Reject otherwise (400 with field id).
2. **Compile** — translate to Prisma query components:
   - `where` clause from the filter tree.
   - `select` / `include` from the columns (using the join graph declared in each field's `resolver`).
   - `orderBy` from sort.
   - `groupBy` + `_count/_sum/_avg` if group-by is present.
3. **Row-count probe** — run a Prisma `count` first. If > 50 000 rows AND not a group-by query, throw a `REPORT_ROW_CAP_EXCEEDED` error (the UI will show a friendly message).
4. **Execute** — run inside an `createRlsClient` transaction with a 30-second timeout (`statement_timeout` set via `$queryRaw` inside the tx OR a Promise race). On timeout, abort and throw `REPORT_QUERY_TIMEOUT`.
5. **Shape** — map Prisma result rows into the flat `rows` shape using field resolvers.
6. **Return** — `{ rows, columns, meta }`.

Key files:

- `query-engine.service.ts` — the public executor.
- `query-compilers/student-query-compiler.ts` — compiles a Student-subject query into Prisma. One compiler per subject.
- `query-compilers/staff-query-compiler.ts`
- ... (one per subject, 11 total)
- `query-resolvers/student-resolvers.ts` — resolver functions that map Prisma rows → field values (for computed fields like `age`, `household_size`, `attendance_rate_this_term`).
- `query-resolvers/staff-resolvers.ts`
- ...

Each compiler exports a `compile(query, permissionScopedFields): { prismaMethod, args }` function. Each resolver file exports a map of `{ [resolverKey: string]: (row) => unknown }`.

**Filter operators** supported (leaf-level):

```
equals, not_equals, contains, starts_with, ends_with,
greater_than, less_than, greater_or_equal, less_or_equal,
before, after, on, between,
in_list, not_in_list,
is_null, is_not_null
```

Each operator has a type constraint (e.g., `contains` only on `string`, `greater_than` only on `number | date | currency`). Validation rejects type mismatches.

**Group-by rules:**

- Group-by is allowed only on `groupable: true` fields.
- When group-by is present, non-group-by columns must have an `aggregation`.
- Exactly one aggregation per column when grouped.

### 3. Rewrite `CustomReportBuilderService.executeReport`

In `apps/api/src/modules/reports/custom-report-builder.service.ts`:

Delete the existing switch-statement on `report.data_source` (lines 261–342). Replace with:

```ts
async executeReport(tenantId, userId, reportId, page, pageSize) {
  const report = await this.getSavedReport(tenantId, reportId);
  const query = this.deserialiseQuery(report);  // merge data_source/dimensions/measures/filters into SavedReportQuery
  const permissions = await this.permissionsService.getPermissionsForUser(userId, tenantId);
  return this.queryEngine.execute(tenantId, userId, permissions, query, { page, pageSize });
}
```

Inject `QueryEngineService` into the builder service's constructor. Register in `ReportsModule.providers`.

### 4. Ad-hoc execute (builder preview)

New endpoint `POST /v1/reports/builder/preview`:

```ts
@Post('preview')
@RequiresPermission('reports.builder')
preview(@CurrentTenant() tenant, @CurrentUser() user, @Body(new ZodValidationPipe(previewQuerySchema)) body) {
  return this.queryEngine.execute(tenant.id, user.id, user.permissions, body.query, { page: 1, pageSize: 50 });
}
```

This is what the UI calls on every debounced change during builder editing. 50-row preview.

### 5. Draft persistence endpoints

```
GET  /v1/reports/builder/draft          → returns current user's draft or 204
PUT  /v1/reports/builder/draft          → upsert
DELETE /v1/reports/builder/draft        → clear
```

Wire to a new `SavedReportDraftService` that CRUDs the `saved_report_drafts` row via RLS.

## Testing requirements

- **Unit tests** for the registry: every subject returns the expected field tree; permission filtering works (Teacher sees Student but not Student → Finance Summary fields).
- **Unit tests** for the query engine compiler per subject: given a sample SavedReportQuery, verify the generated Prisma call shape.
- **Unit tests** for filter operators — every operator × every type.
- **Integration test** — POST `/v1/reports/builder/preview` with a realistic Student query, seeded data, verify rows match expectations.
- **RLS test** — create data as Tenant A, authenticate as Tenant B, execute same query, assert empty.
- **Row cap test** — seed > 50 000 students for a tenant, execute an ungrouped Student query, assert `REPORT_ROW_CAP_EXCEEDED`.
- **Timeout test** — deliberately stall a query (mock `this.prisma`), assert `REPORT_QUERY_TIMEOUT` after 30s.

Target coverage on the query engine: 90%+. This is load-bearing for privacy and performance.

## Post-deploy verification

1. Hit `GET /v1/reports/subject-registry` as owner@nhqs.test — confirm JSON structure with 11 subjects.
2. Hit `GET /v1/reports/subject-registry/student` — confirm field tree with Finance Summary visible (Owner has finance perm).
3. Same as teacher@nhqs.test — confirm Finance Summary group absent.
4. Create a test saved-report via the existing CRUD endpoint; `POST /v1/reports/builder/:id/execute` — confirm real rows (not stub).
5. `POST /v1/reports/builder/preview` with a simple `{ subject: 'student', columns: [{ field_id: 'student.identity.first_name' }], filters: {} }` — confirm 50 rows.

## Follow-ups for subsequent waves

- **Impl 11 (AI Ask-AI)** consumes the subject registry — the AI translates natural language into a `SavedReportQuery` using the registry as its grammar.
- **Impl 16 (Builder UI)** consumes `/v1/reports/subject-registry` on page load, `/v1/reports/builder/preview` on every change, and draft CRUD.
- **Impl 08 (Scheduled worker)** executes saved reports via this engine.
- **Impl 04 (Export service)** takes the engine's `{ rows, columns }` output.

## Rollback

`git revert <sha>` — only the service rewrite and new files are affected. The old stub `executeReport` was already unusable, so reverting returns to a known-broken state, not a working one. Follow-up recovery would be to re-deploy the next working phase.
