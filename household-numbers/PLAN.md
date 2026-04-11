# Household Numbers & Sibling Flow — Master Plan

> **Status:** Plan locked. Implementation split into 6 tasks across 4 waves. See `IMPLEMENTATION_LOG.md` for execution order and per-wave rules.

---

## 1. Why we're building this

The new-admissions rebuild shipped a financially-gated pipeline but made two quiet assumptions that don't match how real schools work:

1. **One applicant per submission.** If a family has three children they want to enrol, they have to fill the public form three separate times. That's an application killer. Real families abandon applications when the form has to be re-run per child.
2. **No concept of a family unit at the application stage.** The system treats every applicant as a stranger. But schools intentionally prioritise siblings of existing students — it's standard admissions policy, and we've been losing that nuance.

This rebuild fixes both:

- **Every household gets a stable 6-character alphanumeric identifier** (e.g. `XYZ476`), auto-generated at household creation, random (not sequential) so it can't be enumerated.
- **Student numbers are derived from the household number** — `XYZ476-01`, `XYZ476-02`, `XYZ476-03` — so it's visually obvious which students belong to the same family just by looking at the number.
- **The public apply form accepts one or many students in a single submission**, each student becoming its own Application row internally. Parents add siblings with an "Add another student" button. Every student flows through the admissions pipeline independently — one may land in Ready to Admit while another lands in Waiting List.
- **The form has a mode picker up front.** New household (the current flow) or adding a child to an existing family (look up the existing household and skip everything except the new student fields).
- **Sibling applications get a priority tier on the waiting list.** When capacity opens, siblings promote ahead of non-siblings, FIFO within each tier.

The old 210 students stay as-is. This is a forward-only change — no risky backfill, no breaking historic records. Existing households without a household number continue to use the legacy `STU-NNNNNN` generator; new households use the new format.

---

## 2. The core primitives

### 2.1 Household number

```
<AAA><NNN>  e.g. XYZ476, MKL021, BPQ839
```

- 6 characters total.
- First 3 uppercase letters (A–Z, no ambiguous characters excluded because the set is large enough).
- Last 3 digits (0–9).
- Total address space: `26³ × 10³ = 17,576,000` values per tenant.
- **Random**, not sequential — regenerated from a cryptographic RNG until the chosen value is unused within the tenant.
- **Unique per tenant** (not globally). Two tenants can both own `XYZ476`.
- **Immutable** once assigned. The household number is a stable identifier the family will see on receipts, emails, and the Rebuild / Add Student form.
- **Visible to staff and the family.** It's not secret, but it's not guessable either — so an enumeration attack on the public lookup endpoint is infeasible without also providing a parent email.

Stored as a new column `households.household_number VARCHAR(6)`, nullable (so existing households can still exist without one). Unique index on `(tenant_id, household_number)` where `household_number IS NOT NULL`.

### 2.2 Student number

New generator rules:

```
If household.household_number IS NULL:
    emit STU-{global_sequence}         (legacy path — existing households, staff onboarding flows that don't yet know about household numbers)

If household.household_number IS NOT NULL:
    counter = household.student_counter + 1
    if counter > 99:
        throw HOUSEHOLD_STUDENT_CAP_REACHED   (hard error — no family has 99 kids)
    emit {household.household_number}-{zero-padded counter}   (e.g. XYZ476-01)
    household.student_counter = counter
```

This means:

- A new student added to a brand-new household `XYZ476` that currently has zero children gets `XYZ476-01`.
- The second child gets `XYZ476-02`.
- The third, `XYZ476-03`. And so on up to `XYZ476-99`.
- Existing households continue to get `STU-NNNNNN` forever (no backfill).
- A legacy household that is later assigned a household number mid-life would emit `STU-NNNNNN` for existing students and `{hh}-{nn}` for anyone added after the number was assigned — this split is acceptable because we're not backfilling.

### 2.3 Application-to-household link

We add a nullable `applications.household_id` column. It's populated:

- **Immediately at submission** when the applicant declares they're joining an existing household.
- **At conversion time** when a new-household application is approved and the household is materialised — the service links all sibling applications from the same submission to the just-created household.

This column is the anchor for sibling detection. A sibling application is one where `household_id IS NOT NULL AND EXISTS(active students linked to that household)`.

### 2.4 Sibling priority — tiered FIFO

The capacity gate and auto-promotion sort waiting-list applications by:

```
ORDER BY
  CASE WHEN is_sibling(application) THEN 0 ELSE 1 END,   -- tier 0: siblings, tier 1: non-siblings
  apply_date ASC                                          -- FIFO within each tier
```

Where `is_sibling(app)` is true when `app.household_id IS NOT NULL AND EXISTS(SELECT 1 FROM students WHERE household_id = app.household_id AND status = 'active')`.

Tiered FIFO only affects the waiting list → ready-to-admit promotion path. It does NOT preempt applications already in `ready_to_admit` — those are admin-decided, not queue-decided. It does NOT affect the `submitted → waiting_list | ready_to_admit` initial gate, because that gate is purely capacity-based (a sibling with free capacity still goes straight to ready_to_admit like anyone else).

What it does affect: when a seat opens and both a sibling and a non-sibling are in waiting_list for the same `(academic_year, year_group)`, the sibling promotes first — even if the non-sibling's `apply_date` is earlier.

---

## 3. The multi-student application model

Today the public apply API accepts **one student per submission** (`student_first_name`, `student_last_name`, `date_of_birth` at the top level of the body). The new API accepts **one or many students per submission** via a `students: [...]` array.

### 3.1 The request shape

```ts
POST /v1/public/admissions/applications
{
  mode: 'new_household' | 'existing_household',
  existing_household_id?: string,    // required when mode = 'existing_household'
  form_definition_id: string,
  honeypot_url?: string,

  // Parent/address/emergency payload — required only for mode='new_household'
  household_payload?: {
    parent1_first_name: string,
    parent1_last_name: string,
    parent1_email: string,
    parent1_phone: string,
    parent1_relationship: string,
    parent2_...?: ...,
    address_line_1: string,
    address_line_2?: string,
    city: string,
    country: string,
    postal_code?: string,
    emergency_name?: string,
    emergency_phone?: string,
    emergency_relationship?: string,
  },

  // Always required — one or many students
  students: Array<{
    first_name: string,
    middle_name?: string,
    last_name: string,
    date_of_birth: string,            // ISO date
    gender: 'male' | 'female',
    national_id: string,
    target_academic_year_id: string,
    target_year_group_id: string,
    medical_notes?: string,
    has_allergies?: boolean,
  }>,
}
```

**Refine rules** enforced by Zod:

- `mode === 'new_household'` ⇒ `household_payload` must be present.
- `mode === 'existing_household'` ⇒ `existing_household_id` must be present, `household_payload` must be absent.
- `students.length ≥ 1` and `≤ 20` (sanity cap, no family has 20 simultaneous applicants).

### 3.2 Server-side processing

```
createPublic(tenantId, dto, clientIp):
  1. Rate-limit check by IP (existing AdmissionsRateLimitService).

  2. Resolve the household context:
     - mode='existing_household':
        load Household by existing_household_id, verify tenant_id match,
        verify the lookup was authorised (see §4 — parent-email match),
        household_id_for_applications = existing_household_id

     - mode='new_household':
        DO NOT create the Household yet — the household only materialises
        when the first application in this batch is approved. For now,
        household_id_for_applications = NULL and we serialise the household
        payload on each Application row for later materialisation.

  3. For each student in dto.students:
     - Create one Application row with:
       - student_first_name, student_last_name, student_dob from the student entry
       - target_academic_year_id, target_year_group_id from the student entry
       - payload_json = household_payload (shared) + student fields
       - household_id = household_id_for_applications (may be NULL for new-household batches)
       - submission_batch_id = <newly generated UUID, shared across all apps in this batch>
     - Run ApplicationStateMachineService.submit() on the new row — this runs
       capacity gating and routes the row to ready_to_admit, waiting_list, or
       waiting_list + awaiting_year_setup.

  4. Return a summary envelope:
     {
       mode: 'new_household' | 'existing_household',
       household_number: <if existing household was matched>,
       submission_batch_id: <uuid>,
       applications: [
         { application_number, status, student_name, target_year_group_name }
       ],
     }
```

Each application gets its own application_number via the existing tenant-sequence generator. The batch UUID lets the thank-you page show a grouped "You've submitted N applications" screen with a per-student breakdown.

### 3.3 Conversion-to-student for new-household batches

When the FIRST application from a new-household batch transitions to `approved` (via cash payment / stripe webhook / force approve override), the conversion service:

1. Materialises a fresh Household row with a newly generated household_number.
2. Stamps `applications.household_id = <new household id>` for every other application in the same `submission_batch_id` (so subsequent approvals from the batch reuse the household, with incrementing student counter for sibling numbering).
3. Materialises the first Student row under the new household — which gets `{household_number}-01`.

Subsequent approvals from the same batch each materialise their own Student under the same household — the student_counter increments per household, so they become `-02`, `-03`, etc.

This means the per-student sibling numbers are assigned in _approval order_, not in _submission order_. If the first sibling is approved but the second sibling lapses to waiting list and only approves 3 weeks later, the first is `-01` and the second is `-02`.

### 3.4 Conversion-to-student for existing-household batches

For existing-household applications, the household already has a household_number. Each application's conversion path:

1. Loads the household by `application.household_id`.
2. Increments `household.student_counter` (with row lock).
3. Assigns `{household.household_number}-{zero-padded counter}` as the new Student's student_number.
4. Links the Student into the existing household.

---

## 4. Household lookup — the "adding a sibling" path

When a parent opens the public apply form and picks "adding a child to an existing family", they're shown:

```
Enter your family's household number and a parent email address on file.

Household number:  [XYZ___]
Parent email:      [________________________]

[ Find our family ]
```

Both fields are required. The client calls:

```
POST /v1/public/households/lookup
{
  tenant_slug: 'nhqs',
  household_number: 'XYZ476',
  parent_email: 'alice@example.com',
}
```

Server behaviour:

1. Resolve tenant by slug (same middleware as the public apply flow).
2. Rate-limit by IP — 5 attempts per IP per hour per tenant (new bucket, not the admissions-submit bucket).
3. Look up Household where `tenant_id = ... AND household_number = ...`.
4. If not found, return 404 `HOUSEHOLD_NOT_FOUND`.
5. If found, check that at least one Parent linked to this household has `email = ?` (case-insensitive).
6. If the email doesn't match, return 404 `HOUSEHOLD_NOT_FOUND` (same code — don't leak which half failed).
7. If both match, return 200:

```json
{
  "data": {
    "household_id": "uuid",
    "household_number": "XYZ476",
    "household_name": "Applicant Family",
    "active_student_count": 2
  }
}
```

The 404-on-either-half-missing response is critical — it prevents an attacker from testing household numbers in isolation. You have to know BOTH the household number and a parent email to confirm anything exists. The 17.5 million code space times the guess-an-email requirement makes enumeration infeasible.

The client stores `household_id` in state and includes it on the subsequent application POST as `existing_household_id`.

---

## 5. Data model changes

### 5.1 `households` table

```prisma
model Household {
  // existing fields...
  household_number   String?  @db.VarChar(6)
  student_counter    Int      @default(0)

  @@unique([tenant_id, household_number], map: "households_tenant_id_household_number_key")
}
```

Unique index is partial — null household_number entries don't collide with each other because Postgres treats NULL as not equal to NULL in unique indexes.

### 5.2 `applications` table

```prisma
model Application {
  // existing fields...
  household_id          String?  @db.Uuid
  submission_batch_id   String?  @db.Uuid
  is_sibling_application Boolean @default(false)

  @@index([tenant_id, household_id])
  @@index([tenant_id, submission_batch_id])
}
```

`is_sibling_application` is denormalised for fast gate queries. It's set at submission time: true when `existing_household_id` was provided AND the household has ≥1 active student at that moment. The denormalisation means the capacity gate can sort by a plain boolean column instead of doing a correlated subquery every time.

It is NOT re-computed if the source students' statuses change later — at submission time, the sibling status is a snapshot. (Edge case: if all existing siblings leave the school the day after an application is submitted, the application keeps its sibling priority. Acceptable — this is admissions state, not live reporting.)

### 5.3 `students` table

No schema changes. The `student_number` column is already `TEXT` so both `STU-000001` and `XYZ476-01` fit.

### 5.4 Shared Zod schemas

`packages/shared/src/schemas/application.schema.ts` — `createPublicApplicationSchema` rewritten from single-student to `mode + students[]` shape. Old shape removed (not a dual-format migration — the old shape was only ever used by the public form which we own).

`packages/shared/src/schemas/household.schema.ts` (new) — `publicHouseholdLookupSchema`.

`packages/shared/src/households/household-number.ts` (new) — constants + regex.

---

## 6. Component map

```
apps/api/src/modules/
├── households/
│   ├── household-number.service.ts          (NEW — generator + validator)
│   ├── household-number.service.spec.ts     (NEW)
│   ├── households.service.ts                (MODIFIED — auto-assign household_number on create, expose student_counter increment)
│   └── households.module.ts                 (MODIFIED — export HouseholdNumberService)
│
├── students/
│   ├── students.service.ts                  (MODIFIED — student number generator branches on household.household_number)
│   └── students.service.spec.ts             (MODIFIED — new generator tests)
│
├── admissions/
│   ├── applications.service.ts              (MODIFIED — createPublic rewritten for multi-student + household_id linking)
│   ├── application-state-machine.service.ts (MODIFIED — submit() signature unchanged but internal gating computes is_sibling_application)
│   ├── admissions-capacity.service.ts       (UNCHANGED — the gate math doesn't care about priority tiers)
│   ├── admissions-auto-promotion.service.ts (MODIFIED — promoteYearGroup SQL orders by tier first, then apply_date)
│   └── application-conversion.service.ts    (MODIFIED — links Student into Household, handles batch household materialisation)
│
├── public-admissions/
│   └── public-admissions.controller.ts      (MODIFIED — wraps new multi-student path)
│
└── public-households/                        (NEW module)
    ├── public-households.controller.ts      (NEW — POST /v1/public/households/lookup)
    ├── public-households.service.ts         (NEW)
    ├── public-households.service.spec.ts    (NEW)
    └── public-households.module.ts          (NEW — wired into AppModule)

apps/web/src/
├── app/[locale]/(public)/apply/[tenantSlug]/
│   └── page.tsx                              (REWRITTEN — mode picker, lookup step, multi-student form, reordered sections)
│
├── app/[locale]/(school)/_components/registration-wizard/
│   ├── step-household.tsx                    (MODIFIED — household_number preview + refresh button)
│   └── ...                                   (wizard already supports multi-student)
│
└── app/[locale]/(school)/households/[id]/
    └── page.tsx                              (MODIFIED — displays household_number prominently)

packages/shared/src/
├── households/
│   └── household-number.ts                   (NEW)
└── schemas/
    ├── application.schema.ts                 (MODIFIED — createPublicApplicationSchema shape change)
    └── household.schema.ts                   (MODIFIED — publicHouseholdLookupSchema)
```

---

## 7. Wave breakdown

| Wave | Impls  | Theme                                |
| ---- | ------ | ------------------------------------ |
| 1    | 01     | Schema foundation                    |
| 2    | 02, 03 | Backend services (parallel-safe)     |
| 3    | 04, 05 | Frontend rewrites (parallel-risky)   |
| 4    | 06     | Polish + translations + docs + tests |

Full wave rules, deployment matrix, and parallelisation modes live in `IMPLEMENTATION_LOG.md`.

---

## 8. Out of scope

- **Backfilling existing households/students.** Existing 210 students keep `STU-NNNNNN`. Existing households have no household_number. Later we can provide an admin action to opt a tenant into the new format.
- **Household number recovery / regeneration.** If a household number is leaked or a family wants a new one, there is no self-service path — admin DB change only. A regen endpoint can come later if real demand appears.
- **Cross-tenant household numbers.** Household numbers are unique per tenant, not global. Two schools can both have `XYZ476`.
- **Household lookup without parent email.** We explicitly refuse to accept "just the household number" — the email is the anti-enumeration lock.
- **Stripe multi-student single checkout.** Each approved student still creates its own checkout session today. Bundling into one session per batch is a future enhancement; not shipping in this rebuild.
- **Sibling priority on the initial submission gate.** Priority only affects waiting-list auto-promotion. A sibling submitting to a year group with free seats lands in ready_to_admit just like anyone else — no preemption.
- **A "family dashboard" parent portal.** This rebuild only touches the public (unauthenticated) apply flow, the admin-facing admissions pages, and the walk-in wizard. There is no logged-in parent area in scope.

---

## 9. Why this shape

**Why a 6-character random code?** Large enough to be effectively unguessable without the companion email (17.5M values), short enough to be remembered or written on a Post-it. Sequential numbers would leak growth rate; random doesn't. Three letters + three digits reads as a "code" to users, not a phone number or address, so they're less likely to mistype it.

**Why derive student numbers from the household?** It makes family relationships obvious at a glance — anyone looking at `XYZ476-01` and `XYZ476-02` in a report knows they're siblings without crossing tables. Schools already think about families, not individual students; the identifier should reflect that.

**Why not backfill?** Two hundred existing `STU-NNNNNN` numbers are referenced by attendance records, gradebook entries, report cards, audit logs, external exports, and probably at least one parent spreadsheet. Rewriting them creates a long tail of broken references we'd spend months chasing. Forward-only is pragmatically far safer.

**Why tiered FIFO and not weighted scoring?** Schools describe their admissions policy in exactly this language — "siblings go first". A weighted scoring system (3 points for sibling, 1 point per day on waiting list, etc.) sounds more sophisticated but is much harder to explain to a parent who asks "why didn't my child get a spot". Tiered FIFO is the user-facing rule, and the implementation matches the spoken policy exactly.

**Why one submission, N applications?** Each student's admissions journey is genuinely independent — one might be accepted immediately, another might sit on a waiting list for months, a third might be withdrawn. Modelling each as its own Application row is correct; modelling a batch with one shared status would force every child's decision to happen at the same time, which is not how schools work.

**Why require a parent email for household lookup?** The alternative is a publicly enumerable endpoint that exposes household names keyed only by a 6-char code. Even with heavy rate limiting, the code space is small enough (17.5M) that a determined actor could carve it up and harvest names over weeks. Requiring an email means the attacker also has to already know a parent address, which raises the effort far enough that the threat model collapses.

**Why do we defer the new-household materialisation until approval?** Creating a Household row at submission time would mean maintaining phantom households for every rejected / withdrawn / lapsed application — and then having to garbage-collect them. Deferring until approval means the households table only contains real, accepted families. The household_id on the application is nullable precisely so we don't have to pre-create.
