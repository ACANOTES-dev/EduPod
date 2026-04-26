# Implementation 05 — Conversion-to-Student Service

> **Wave:** 2 (parallelizable with 02, 03, 04)
> **Depends on:** 01
> **Deploys:** API restart only

---

## Goal

Rewrite `apps/api/src/modules/admissions/application-conversion.service.ts` so it runs **automatically**, not from an admin wizard. The input is an application ID; the service takes the application's payload, materialises a Household + Parent(s) + Student record, links them together, sets the student's `year_group_id` to the application's `target_year_group_id`, and returns the new student. No class assignment happens here — the principal/VP handles that later in `/class-assignments`.

Delete the old admin-facing conversion path entirely. The frontend page (`/admissions/[id]/convert`) will be removed in Wave 5 (impl 15).

## Why rewrite instead of adapt

The existing service was designed around an admin manually editing the converted record before submitting (duplicate parent detection, merge into existing household, manual year group selection). In the new flow:

- The payload has already been validated at submission time.
- The target year group is stored structurally on the application row (`target_year_group_id`), not inferred from a string.
- Duplicate parent detection still runs but the resolution is deterministic, not interactive: if an email/phone exactly matches a single existing parent, link to them; otherwise create a new parent.
- There is no "merge into existing household" UI — if the payload's parent matches an existing parent, we link the new student into that parent's household.

This is an unattended conversion that runs inside the payment webhook transaction (impl 06) or the cash-recording transaction (impl 07) or the admin-override transaction (impl 07). It must be idempotent and safe to re-run if the transaction rolls back.

## What to build

### 1. Rewrite `application-conversion.service.ts`

```ts
@Injectable()
export class ApplicationConversionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly searchIndexService: SearchIndexService,
    private readonly sequenceService: SequenceService,
  ) {}

  /**
   * Materialises Household + Parent(s) + Student from a conditional_approval
   * or approved application. Callable INSIDE an existing transaction — the
   * caller passes their transaction client.
   *
   * Idempotent: if the application already has an associated student
   * (looked up by application.id via a new column, see 01), returns the
   * existing student without creating duplicates.
   *
   * Does NOT assign the student to a specific class (2A vs 2B).
   * Does NOT touch fee assignments — that's the finance module's job once
   *   the student exists.
   */
  async convertToStudent(
    db: PrismaService,
    params: {
      tenantId: string;
      applicationId: string;
    },
  ): Promise<{
    student_id: string;
    household_id: string;
    primary_parent_id: string;
    secondary_parent_id: string | null;
    created: boolean; // false if idempotent short-circuit
  }>;
}
```

### 2. Idempotency — track materialisation

Add one more field to `Application` in impl 01's migration (or a follow-up in this impl's own migration — preferred: keep schema changes out of wave 2 and add this in wave 1 retroactively):

```prisma
model Application {
  // ... existing ...
  materialised_student_id String? @db.Uuid
  materialised_student    Student? @relation("application_student", fields: [materialised_student_id], references: [id], onDelete: SetNull)
}
```

**Decision point:** this column wasn't listed in 01's spec. Add it to 01 before starting — coordinate with whoever is building 01. If 01 has already been committed, add a tiny follow-up migration in 05 (acceptable, one-column additive migration is cheap).

### 3. Conversion algorithm

Inside the caller-provided transaction:

1. Load the application with `FOR UPDATE` row lock.
2. If `application.materialised_student_id` is not null, load and return the existing student. Idempotent short-circuit.
3. Parse `payload_json` into a typed structure using the known field keys from `SYSTEM_FORM_FIELDS` (impl 04). Fail loudly with `PAYLOAD_MALFORMED` if required fields are missing.
4. **Resolve parent 1:**
   - Query `parents` where `tenant_id = X` and (`email = payload.parent1_email` OR `phone = payload.parent1_phone`).
   - If exactly one match → link.
   - If zero matches → create new parent row, status `active`.
   - If multiple matches → create a new parent but write an `application_notes` entry flagging the ambiguity for admin review. Do NOT block the conversion — the student still gets created. An admin can merge parent records later via a future admin tool.
5. **Resolve parent 2** (if payload has parent 2 fields): same algorithm.
6. **Resolve household:**
   - If parent 1 was linked to an existing parent, use their household.
   - Otherwise, create a new household from `payload.address_line_1/2/city/country/postal_code`. Household name defaults to `${payload.student_last_name} Family`.
7. **Link parents to household** via `StudentParent` / `ParentHousehold` linking tables (check the current schema for exact shape).
8. **Create the student:**
   - `first_name`, `middle_name`, `last_name` from payload.
   - `date_of_birth` from payload.
   - `gender` from payload.
   - `status = 'active'`.
   - `household_id = <resolved>`.
   - `year_group_id = application.target_year_group_id`.
   - `class_homeroom_id = null` (principal will set later).
   - `student_number` generated via the `sequence.service.ts` pattern used elsewhere (format `STU-${YYYY}-${padded_sequence}`).
9. **Link each parent to the student** via `StudentParent` with an appropriate relationship type from the payload.
10. **Consent records** — walk the payload's `__consents` key (the existing consent capture pattern) and write `ConsentRecord` entries for each granted consent. Migrate the subject from `applicant` to `student` now that the student exists.
11. **Update the application:**
    - `materialised_student_id = <new student id>`
    - No status change here — the caller (payment flow or override flow) is responsible for the `approved` transition.
12. Fire search index jobs for the new student, household, and parents (outside the transaction, using the post-commit pattern the project uses elsewhere).
13. Return.

### 4. Error handling

- `PAYLOAD_MALFORMED`: application's payload is missing required fields. Should never happen because submission-time validation prevents it, but defensive check.
- `DUPLICATE_STUDENT`: if somehow an active student already exists with the same first_name + last_name + date_of_birth + tenant_id → return the existing student instead of creating a new one. This handles weird retry scenarios.
- All other errors bubble up and roll back the caller's transaction.

### 5. Delete the old conversion controller endpoints

`application-conversion.service.ts` currently has methods like `getConversionPreview` and `convertApplication` wired to admin endpoints. Delete those endpoints (`GET /v1/applications/:id/conversion-preview`, `POST /v1/applications/:id/convert`). They are no longer used — conversion is automatic.

The frontend page at `/admissions/[id]/convert` will be deleted in impl 15. For now (wave 2), the page will call a 404ing endpoint. That's fine because no production path reaches it.

## Tests

- Happy path: payload → creates household, parent, student, links them, sets year group.
- Idempotency: calling twice with the same application id returns the same student, no duplicates.
- Existing parent match (email): links to existing parent, uses their household.
- Ambiguous parent match: creates new parent, writes internal note.
- Parent 2 optional: payload without parent 2 fields → no secondary parent created.
- Missing required field → `PAYLOAD_MALFORMED`.
- Cross-tenant leakage: parent match query respects tenant isolation.
- Consent records migration: applicant consents → student consents.

## Deployment

1. Commit locally.
2. Patch → production.
3. Build `@school/api`, restart api.
4. Smoke test: no direct smoke since this is called from other services. Verify the API restart is clean and no existing endpoint broke.
5. Update `IMPLEMENTATION_LOG.md`.

## Definition of done

- Service rewritten and passing unit tests.
- Old admin conversion endpoints deleted.
- `materialised_student_id` column exists on applications (either from impl 01 or a follow-up migration in this impl).
- API restarted on production.
- Completion record added to the log.

## Notes for downstream implementations

- **06 (Stripe)** calls `convertToStudent(tx, { tenantId, applicationId })` inside its webhook transaction, then calls `stateMachine.markApproved(...)` in the same transaction.
- **07 (cash / bank / override)** does the same from its recording endpoint.
- **12 (application detail page)** will show a read-only "Student: <name>" link once `materialised_student_id` is populated, deep-linking to `/students/<id>`.
- **Impl 15 cleanup** deletes the `/admissions/[id]/convert` frontend page.
