# Implementation 06 — Matrix & Library Backend

**Wave:** 2 (backend fan-out)
**Depends on:** 01 (schema)
**Blocks:** 07 (frontend overview/matrix/library)
**Can run in parallel with:** 02, 03, 05
**Complexity:** medium (query design + reuse of existing gradebook aggregation)

---

## 1. Purpose

Replace the flat report cards overview endpoint with two new endpoints: (a) a **matrix** endpoint that powers the class-first matrix view (mirroring the gradebook), and (b) a **library** endpoint that lists generated PDF documents scoped to the caller. Deprecate but don't yet delete the old flat overview endpoint — impl 12 handles deletion.

**Authoritative design:** `report-card-spec/design-spec.md` Sections 6, 11.

---

## 2. Scope

### In scope

1. New matrix endpoint — reuses existing gradebook aggregation to return a students × subjects matrix shape
2. New library endpoint — returns current report card documents scoped to the caller's access
3. Refactor `report-cards-queries.service.ts` to host the new queries
4. Preserve the existing `GET /v1/report-cards/overview` endpoint (no breaking changes yet)
5. Unit + integration + RLS tests

### Out of scope

- Frontend pages (impl 07)
- Generation (impl 04)
- Removal of old overview (impl 12)

---

## 3. Prerequisites

1. Impl 01 merged
2. Gradebook aggregation queries exist and work (verify by running a gradebook matrix request locally)
3. `turbo test` green on main

---

## 4. Task breakdown

### 4.1 Matrix query service

**File:** `apps/api/src/modules/gradebook/report-cards/report-cards-queries.service.ts` (existing — extend)

**New method:**

```ts
async getClassMatrix(
  tenantId: string,
  { classId, academicPeriodId }: { classId: string; academicPeriodId: string | 'all' },
): Promise<{
  class: { id: string; name: string; year_group: { id: string; name: string } | null };
  period: { id: string; name: string } | { id: 'all'; name: string };
  students: Array<{
    id: string;
    first_name: string;
    last_name: string;
    student_number: string | null;
    preferred_second_language: string | null;
  }>;
  subjects: Array<{ id: string; name: string; code: string | null }>;
  cells: Record<string, Record<string, {
    score: number | null;
    grade: string | null;
    assessment_count: number;
    has_override: boolean;
  }>>;
  overall_by_student: Record<string, {
    weighted_average: number | null;
    overall_grade: string | null;
    rank_position: number | null;  // null unless top 3
  }>;
}>
```

**Implementation approach:**

1. Verify the class belongs to the tenant
2. Load students in the class via enrolments (active only)
3. Load subjects assigned to the class via the class-subject relation
4. For each (student, subject) pair, call the existing gradebook aggregation to get the period-aggregated score and letter grade. Do NOT reimplement this logic — find the existing query (e.g., `gradebook-queries.service.ts` or similar) and call it.
5. If `academicPeriodId === 'all'`, aggregate across all periods (again, reuse existing logic).
6. Compute overall weighted average per student using the same logic gradebook uses.
7. Compute rank: sort students by weighted_average descending, assign rank 1/2/3 to the top distinct values (handle ties — tied students share the same rank). Students not in the top 3 get `rank_position: null`.
8. Assemble the response shape.

**Reuse, do not duplicate.** If the existing gradebook aggregation is poorly structured, extract a helper and use it from both places — but do not recompute grades from scratch in this service. Report card data and gradebook data MUST be identical.

### 4.2 Library query service

**New method:**

```ts
async listReportCardLibrary(
  tenantId: string,
  actor: User,
  {
    page,
    pageSize,
    classId?,
    yearGroupId?,
    academicPeriodId?,
    language?,
  }: ListReportCardLibraryQuery,
): Promise<Paginated<{
  id: string;
  student: { id: string; first_name: string; last_name: string; student_number: string | null };
  class: { id: string; name: string };
  academic_period: { id: string; name: string };
  template: { id: string; content_scope: string; locale: string };
  pdf_storage_key: string;
  pdf_download_url: string;  // signed URL with short TTL
  generated_at: string;
  languages_available: string[];  // all locales for the same student/period/template
}>>
```

**Implementation:**

1. Query `ReportCard` rows where `status != 'superseded'`
2. If the actor has `report_cards.manage`, no scoping — see all
3. If the actor has `report_cards.view` only, no scoping either
4. If the actor has only `report_cards.comment` (teacher), scope to students in their teaching assignments (subject teacher or homeroom)
5. Apply optional filters
6. Join with `ReportCardTemplate` to get content_scope and locale
7. Group by (student, period, template) to compute `languages_available`
8. Generate signed download URLs via the storage provider
9. Return paginated

**Signed URL TTL:** 5 minutes. The frontend must request fresh URLs for each download.

### 4.3 Controller endpoints

**File:** `apps/api/src/modules/gradebook/report-cards/report-cards.controller.ts` (existing — add routes)

**New routes:**

```
GET /v1/report-cards/classes/:classId/matrix?academic_period_id=<id|all>  — matrix view   (report_cards.view or comment)
GET /v1/report-cards/library?<filters>                                      — library     (report_cards.view or comment)
```

Controller scoping:

- Matrix endpoint: visible to teachers of the class AND to any user with `report_cards.view`
- Library endpoint: visible to any user with `report_cards.view` or `report_cards.comment` (scoping enforced server-side in the query)

### 4.4 Deprecate old overview

Add a `@deprecated` JSDoc comment to the existing `GET /v1/report-cards/overview` method and log a warning when called. Do NOT delete. Deletion happens in impl 12 after the frontend switches over.

### 4.5 Module registration

`ReportCardsQueriesService` is likely already registered in the module. Confirm and re-export if needed.

---

## 5. Files to modify

- `apps/api/src/modules/gradebook/report-cards/report-cards-queries.service.ts` — new methods
- `apps/api/src/modules/gradebook/report-cards/report-cards-queries.service.spec.ts` — tests for new methods
- `apps/api/src/modules/gradebook/report-cards/report-cards.controller.ts` — new routes
- `apps/api/src/modules/gradebook/report-cards/report-cards.controller.spec.ts` — route tests

## 6. Files to create

- `apps/api/test/report-cards/matrix.e2e-spec.ts`
- `apps/api/test/report-cards/library.e2e-spec.ts`

---

## 7. Testing requirements

### 7.1 Unit tests (queries service)

- `getClassMatrix` with a period returns correct students, subjects, cells
- `getClassMatrix` with `'all'` aggregates across periods
- Rank: top 3 assigned correctly with ties
- Rank: students below top 3 have `rank_position: null`
- `listReportCardLibrary` scopes correctly per role
- `listReportCardLibrary` groups languages under the same student/period/template

### 7.2 Controller tests

- Matrix route auth + permission
- Library route auth + permission
- Validation of query params

### 7.3 Integration tests

**`matrix.e2e-spec.ts`:**

- Request matrix for a class with 3 students and 2 subjects → correct shape
- Switching period filters returns different aggregates
- A teacher of the class can see the matrix
- A teacher NOT of the class cannot see it
- RLS: Tenant A's class matrix is invisible to Tenant B

**`library.e2e-spec.ts`:**

- Admin sees all documents
- Teacher sees only documents for their students
- Filters work (class_id, year_group_id, period_id, language)
- Signed URLs are returned and have TTL
- RLS: Tenant A cannot see Tenant B's documents

### 7.4 Regression

```bash
turbo test && turbo lint && turbo type-check
```

---

## 8. Security / RLS checklist

- [ ] Matrix query verifies class belongs to tenant
- [ ] Library query scopes per role server-side
- [ ] Signed URLs have short TTL (5 minutes)
- [ ] Signed URLs cannot be forged to point at other tenants' storage keys
- [ ] Old overview endpoint still functional (no breaking change)
- [ ] RLS leakage tests for both new endpoints

---

## 9. Acceptance criteria

1. Matrix endpoint returns the documented shape with real gradebook aggregation data
2. Library endpoint returns the documented shape with signed URLs
3. Rank calculation correct (top 3 with ties, rest null)
4. Existing `GET /v1/report-cards/overview` still functional
5. Permission + RLS tests pass
6. `turbo test`, `turbo lint`, `turbo type-check` green
7. Log entry added

---

## 10. Architecture doc update check

| File                     | Decision                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `module-blast-radius.md` | YES if a new cross-module import introduced (e.g., importing gradebook aggregation helper). Update.                                                               |
| `event-job-catalog.md`   | NO                                                                                                                                                                |
| `state-machines.md`      | NO                                                                                                                                                                |
| `danger-zones.md`        | **Consider:** "Report card matrix reuses gradebook aggregation; any change to gradebook aggregation semantics affects report cards silently. Keep these in sync." |

---

## 11. Completion log stub

```markdown
### Implementation 06: Matrix & Library Backend

- **Completed at:** YYYY-MM-DD HH:MM
- **Completed by:** <agent>
- **Branch / commit:** `<branch>` @ `<sha>`
- **Status:** ✅ complete
- **Summary:** Added matrix and library query endpoints reusing gradebook aggregation; old flat overview deprecated.

**What changed:**

- `report-cards-queries.service.ts` — two new methods (getClassMatrix, listReportCardLibrary)
- `report-cards.controller.ts` — two new routes
- 2 new e2e test files

**Test coverage:**

- Unit + controller + 2 e2e specs
- `turbo test`, `turbo lint`, `turbo type-check`: ✅

**Architecture docs updated:**

- `danger-zones.md` — added note on gradebook aggregation coupling

**Blockers or follow-ups:**

- Impl 07 (frontend overview/matrix/library) is unblocked
- Impl 12 will remove the old flat overview endpoint once the frontend switches

**Notes:**

- Rank ties: tied students share the same rank; next distinct average jumps. E.g., two students tied at avg 95 → both rank 1, next student at avg 90 → rank 3.
```

---

## 12. If you get stuck

- **Gradebook aggregation helper unclear:** read `apps/api/src/modules/gradebook/gradebook-queries.service.ts` (or whichever file has the aggregation). Find the method the existing gradebook matrix calls. Use the same.
- **Signed URL provider unclear:** search for existing signed URL generation — the tenant logo or student photo flows probably use it. Follow the pattern.
- **Rank with ties tricky:** use a "dense rank" approach: sort descending by weighted_average, walk the list, assign rank = 1 + (number of distinct values strictly greater). Stop emitting at rank > 3.
