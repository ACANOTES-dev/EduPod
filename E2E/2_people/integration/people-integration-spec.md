# People — Integration Test Specification

> **Generated:** 2026-04-12  
> **Module slug:** `people`  
> **Scope:** RLS leakage, API contract edges, DB invariants, concurrency, transaction boundaries, encrypted-field access control, PDF/export byte-level correctness.  
> **Companion spec:** `../admin_view/people-e2e-spec.md` (UI), `../worker/people-worker-spec.md` (queues), `../perf/people-perf-spec.md`, `../security/people-security-spec.md`.

Every row in this spec is a machine-executable HTTP + SQL assertion. The target harness is Jest + supertest (or an equivalent node fetch wrapper) with a dedicated test Redis instance and a two-tenant Postgres fixture. Raw-HTTP execution is required — do NOT exercise these rows through Playwright; the UI is covered by the E2E spec.

---

## Table of Contents

1. [Prerequisites & fixture seeding](#1-prerequisites--fixture-seeding)
2. [RLS leakage matrix (per tenant-scoped table)](#2-rls-leakage-matrix-per-tenant-scoped-table)
3. [API contract matrix — Students](#3-api-contract-matrix--students)
4. [API contract matrix — Staff profiles](#4-api-contract-matrix--staff-profiles)
5. [API contract matrix — Households](#5-api-contract-matrix--households)
6. [API contract matrix — Parents](#6-api-contract-matrix--parents)
7. [Consent-gate integration — allergy report](#7-consent-gate-integration--allergy-report)
8. [State-machine matrices](#8-state-machine-matrices)
9. [Concurrency / race tests](#9-concurrency--race-tests)
10. [Transaction boundary tests](#10-transaction-boundary-tests)
11. [Encrypted-field access control](#11-encrypted-field-access-control)
12. [Audit-log correctness + sensitive-data classification](#12-audit-log-correctness--sensitive-data-classification)
13. [Webhook tests](#13-webhook-tests)
14. [PDF / binary content invariants](#14-pdf--binary-content-invariants)
15. [Cross-module invariants](#15-cross-module-invariants)
16. [Sign-off](#16-sign-off)

---

## 1. Prerequisites & fixture seeding

### 1.1 Fixture tenants

| #     | What to run                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Expected                                                                                                               | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.1.1 | Provision **Tenant A** (slug: `nhqs`, currency: EUR) via seeder with: 209 students, 50 households, 30 parents, 20 staff profiles (5 with encrypted bank details), 8 users (owner/principal/admin/teacher/accounting/front_office/parent/student), ≥ 2 withdrawn students, ≥ 1 graduated, ≥ 1 archived household, ≥ 5 households with `needs_completion=true`, ≥ 10 students with granted `gdpr_consent_records` (type=health_data) and ≥ 5 students with health_data consent withdrawn/absent. | `SELECT COUNT(*) FROM students WHERE tenant_id=<A>` = 209. `SELECT COUNT(*) FROM households WHERE tenant_id=<A>` = 50. |           |
| 1.1.2 | Provision **Tenant B** (slug: `acme-test`, currency: USD) with: 50 students, 20 households, 10 parents, 10 staff. Separate user set (`*@acme-test.test`). Households named differently from Tenant A's so payloads are visually distinguishable.                                                                                                                                                                                                                                               | Counts match.                                                                                                          |           |
| 1.1.3 | Seeder location: `packages/prisma/seed/qa-nhqs/*.ts` (or equivalent seed script). Must re-seed deterministically: dropping `students`, `households`, etc. with `CASCADE` then re-running returns the exact same counts.                                                                                                                                                                                                                                                                        | Deterministic.                                                                                                         |           |
| 1.1.4 | The test harness obtains JWTs for each role × tenant combination via `POST /v1/auth/login`, caches them in an in-memory map keyed `(tenant, role)`.                                                                                                                                                                                                                                                                                                                                            | 16 tokens cached.                                                                                                      |           |

### 1.2 Helper functions

| #     | What to run                                                                                                                                                           | Expected      | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------- |
| 1.2.1 | `async function request(token, method, path, body?): Response` — wraps `fetch` against `http://localhost:3001`, sets `Authorization: Bearer ${token}`, JSON headers.  | Helper works. |           |
| 1.2.2 | `async function sql(query, params): Row[]` — runs raw SQL via `prisma.$queryRawUnsafe` with ZERO tenant context (admin connection) so cross-tenant reads are visible. | Helper works. |           |
| 1.2.3 | `async function countQueries(fn): number` — instruments Prisma via `$on('query', …)` and counts queries fired while `fn` runs. Used in §9 and the perf spec.          | Helper works. |           |

---

## 2. RLS leakage matrix (per tenant-scoped table)

Tenant-scoped tables in this module: `students`, `households`, `household_emergency_contacts`, `household_parents`, `parents`, `staff_profiles`, `student_parents`. The `users` table is platform-level (no RLS). Total: **7 tables × 6 scenarios = 42 rows**.

For every row: `tokenA` = Tenant A owner JWT; `tokenB` = Tenant B owner JWT. `idA`, `idB` = known UUIDs from each tenant.

### 2.1 students

| #     | What to run                                                                                                                                                                                                                             | Expected                                                                                                                                                                                                                                                   | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1.1 | `request(tokenA, 'GET', '/v1/students?pageSize=50')`                                                                                                                                                                                    | 200. `meta.total` = 209. Every `row.tenant_id` = Tenant A's id. Zero rows from Tenant B.                                                                                                                                                                   |           |
| 2.1.2 | `request(tokenB, 'GET', '/v1/students?pageSize=50')`                                                                                                                                                                                    | 200. `meta.total` = 50. Every row in Tenant B.                                                                                                                                                                                                             |           |
| 2.1.3 | `request(tokenA, 'GET', '/v1/students/{tenantB_student_id}')`                                                                                                                                                                           | **404** `STUDENT_NOT_FOUND`. Response body must NOT leak Tenant B data.                                                                                                                                                                                    |           |
| 2.1.4 | `request(tokenA, 'PATCH', '/v1/students/{tenantB_student_id}', { first_name: 'Hacked' })`                                                                                                                                               | 404. `sql("SELECT first_name FROM students WHERE id=?", [tenantB_student_id])` returns the original value (NOT "Hacked").                                                                                                                                  |           |
| 2.1.5 | `request(tokenA, 'POST', '/v1/students', { ...valid, tenant_id: tenantB_id })`                                                                                                                                                          | 201 (or 400 if Zod strict mode). The `tenant_id` body key is NOT in `createStudentSchema`, so Zod strips or rejects it. Confirm: `sql("SELECT tenant_id FROM students WHERE id=<newId>")` = **Tenant A** (the session tenant), regardless of body payload. |           |
| 2.1.6 | No shared sequence — create a student in Tenant A and in Tenant B with the same year. `student_number` values are independent per tenant (via household-derived generation). Tenant A `STU-001-1` and Tenant B `STU-001-1` can coexist. | Both rows present with same-looking numbers.                                                                                                                                                                                                               |           |

### 2.2 households

| #     | What to run                                                                                                                       | Expected                                                                                                                | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.2.1 | `request(tokenA, 'GET', '/v1/households?pageSize=50')`                                                                            | 200. Total 50. All Tenant A.                                                                                            |           |
| 2.2.2 | `request(tokenB, 'GET', '/v1/households?pageSize=50')`                                                                            | 200. Total 20. All Tenant B.                                                                                            |           |
| 2.2.3 | `request(tokenA, 'GET', '/v1/households/{tenantB_household_id}')`                                                                 | 404 `HOUSEHOLD_NOT_FOUND`.                                                                                              |           |
| 2.2.4 | `request(tokenA, 'PATCH', '/v1/households/{tenantB_household_id}', { household_name: 'Pwned' })`                                  | 404. Tenant B name unchanged.                                                                                           |           |
| 2.2.5 | `request(tokenA, 'POST', '/v1/households', { ...valid, tenant_id: tenantB_id })`                                                  | 201 with `tenant_id`=A (body field ignored).                                                                            |           |
| 2.2.6 | `household_number` is per-tenant unique: `@@unique([tenant_id, household_number])`. Tenant A and Tenant B can both have `ABC123`. | `sql("SELECT tenant_id FROM households WHERE household_number='ABC123'")` returns ≤ 2 rows if the two tenants collided. |           |

### 2.3 household_emergency_contacts

| #     | What to run                                                                                                                                                                | Expected                                                                                                 | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------- |
| 2.3.1 | `request(tokenA, 'POST', '/v1/households/{tenantB_household_id}/emergency-contacts', { ...valid })`                                                                        | 404 `HOUSEHOLD_NOT_FOUND`. Tenant B contact count unchanged.                                             |           |
| 2.3.2 | `request(tokenA, 'PATCH', '/v1/households/{tenantB_household_id}/emergency-contacts/{tenantB_contact_id}', { ... })`                                                       | 404.                                                                                                     |           |
| 2.3.3 | `request(tokenA, 'DELETE', '/v1/households/{tenantB_household_id}/emergency-contacts/{tenantB_contact_id}')`                                                               | 404.                                                                                                     |           |
| 2.3.4 | Create a contact via POST on a Tenant A household. SQL: `SELECT tenant_id FROM household_emergency_contacts WHERE id=<new>` = A.                                           | Correct tenant.                                                                                          |           |
| 2.3.5 | No bleed: `sql("SELECT DISTINCT tenant_id FROM household_emergency_contacts WHERE household_id IN (SELECT id FROM households WHERE tenant_id=<A>)")` returns only `[<A>]`. | No foreign contacts.                                                                                     |           |
| 2.3.6 | RLS policy `household_emergency_contacts_tenant_isolation` exists and has `FORCE ROW LEVEL SECURITY`.                                                                      | `sql("SELECT relforcerowsecurity FROM pg_class WHERE relname='household_emergency_contacts'")` = `true`. |           |

### 2.4 household_parents

| #     | What to run                                                                                                              | Expected                                   | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | --------- |
| 2.4.1 | `request(tokenA, 'POST', '/v1/households/{tenantB_household_id}/parents', { parent_id: <tenantA_parent> })`              | 404 on household (not found in A's scope). |           |
| 2.4.2 | `request(tokenA, 'POST', '/v1/households/{tenantA_household_id}/parents', { parent_id: <tenantB_parent> })`              | 404 on parent.                             |           |
| 2.4.3 | `request(tokenA, 'DELETE', '/v1/households/{tenantB_household_id}/parents/{tenantB_parent_id}')`                         | 404.                                       |           |
| 2.4.4 | Unique index: create the same link twice. Second call returns the existing record (or idempotent 201 with no duplicate). | No duplicate row.                          |           |
| 2.4.5 | `sql("SELECT COUNT(*) FROM household_parents WHERE household_id=? AND parent_id=?")` = 1 after repeated POST.            | Exactly 1.                                 |           |
| 2.4.6 | Composite PK `@@id([household_id, parent_id])` enforced. `FORCE ROW LEVEL SECURITY`.                                     | Correct.                                   |           |

### 2.5 parents

| #     | What to run                                                                                                                                                                                                          | Expected                                                                                                                                                   | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.5.1 | `request(tokenA, 'GET', '/v1/parents?pageSize=50')`                                                                                                                                                                  | All Tenant A only.                                                                                                                                         |           |
| 2.5.2 | `request(tokenA, 'GET', '/v1/parents/{tenantB_parent_id}')`                                                                                                                                                          | 404 `PARENT_NOT_FOUND`.                                                                                                                                    |           |
| 2.5.3 | `request(tokenA, 'PATCH', '/v1/parents/{tenantB_parent_id}', { first_name: 'X' })`                                                                                                                                   | 404.                                                                                                                                                       |           |
| 2.5.4 | `request(tokenA, 'POST', '/v1/parents', { ...valid })` — same email as an existing Tenant B parent.                                                                                                                  | 201 in A (parents' `@@index([tenant_id, email])` is per-tenant, not global — same email can exist in both tenants). Verify row created with `tenant_id`=A. |           |
| 2.5.5 | `POST /v1/parents/{tenantB_parent_id}/students { student_id }`                                                                                                                                                       | 404 `PARENT_NOT_FOUND`.                                                                                                                                    |           |
| 2.5.6 | Parent has optional `user_id` → if the email matches a platform `users` row, the link is set on CREATE. Verify: create a parent with email matching `teacher@nhqs.test` → `parents.user_id` = the teacher's user id. | Correct linkage.                                                                                                                                           |           |

### 2.6 staff_profiles

| #     | What to run                                                                                                                                                                                                                                                                                | Expected                                                   | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------- |
| 2.6.1 | `request(tokenA, 'GET', '/v1/staff-profiles?pageSize=50')`                                                                                                                                                                                                                                 | Tenant A only.                                             |           |
| 2.6.2 | `request(tokenA, 'GET', '/v1/staff-profiles/{tenantB_staff_id}')`                                                                                                                                                                                                                          | 404 `STAFF_PROFILE_NOT_FOUND`.                             |           |
| 2.6.3 | `request(tokenA, 'PATCH', '/v1/staff-profiles/{tenantB_staff_id}', { job_title: 'X' })`                                                                                                                                                                                                    | 404. Tenant B row unchanged.                               |           |
| 2.6.4 | `request(tokenA, 'GET', '/v1/staff-profiles/{tenantB_staff_id}/bank-details')`                                                                                                                                                                                                             | 404.                                                       |           |
| 2.6.5 | Create a staff with email of a user who has a staff_profile in Tenant B. `email = 'teacher@acme-test.test'` → Tenant A receives 201 with a NEW staff_profile in Tenant A linked to the same platform `users.id`. `tenant_memberships` gets a new row for `(tenant=A, user_id=<existing>)`. | Cross-tenant user can have staff profiles in both tenants. |           |
| 2.6.6 | Attempt to create staff with the same `email` that already has a staff profile in THIS tenant.                                                                                                                                                                                             | 409 `STAFF_PROFILE_EXISTS`.                                |           |

### 2.7 student_parents

| #     | What to run                                                                                                  | Expected                                                                                 | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------- |
| 2.7.1 | Create student with `parent_links: [{ parent_id: <tenantB_parent_id> }]`.                                    | 404 `PARENT_NOT_FOUND` on the validation step — existence check in Tenant A scope fails. |           |
| 2.7.2 | `request(tokenA, 'POST', '/v1/parents/{tenantA_parent}/students', { student_id: <tenantB_student> })`        | 404 `STUDENT_NOT_FOUND`.                                                                 |           |
| 2.7.3 | Duplicate link: same `(student_id, parent_id)` twice → second returns 409 `STUDENT_ALREADY_LINKED`.          | Correct.                                                                                 |           |
| 2.7.4 | `request(tokenA, 'DELETE', '/v1/parents/{tenantA_parent}/students/{tenantA_student}')` — link doesn't exist. | 404 `STUDENT_PARENT_LINK_NOT_FOUND`.                                                     |           |
| 2.7.5 | Composite PK `@@id([student_id, parent_id])`. FORCE ROW LEVEL SECURITY.                                      | Correct.                                                                                 |           |

---

## 3. API contract matrix — Students

For each endpoint, the matrix covers: happy, invalid (Zod boundary), permission denials, existence (404), uniqueness, and state-machine invariants where applicable.

### 3.1 POST /v1/students

| #      | What to run                                                                                | Expected                                                                                                   | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------- |
| 3.1.1  | Happy: valid payload with all required fields.                                             | 201 + full student body.                                                                                   |           |
| 3.1.2  | Missing `first_name`.                                                                      | 400 Zod: `first_name: Required`.                                                                           |           |
| 3.1.3  | `first_name` length 101.                                                                   | 400 Zod: "String must contain at most 100 character(s)".                                                   |           |
| 3.1.4  | `national_id` empty string.                                                                | 400 Zod: "National ID is required".                                                                        |           |
| 3.1.5  | `nationality` empty.                                                                       | 400 Zod: "Nationality is required".                                                                        |           |
| 3.1.6  | `status` = `"foo"` (invalid enum).                                                         | 400 Zod invalid_enum_value.                                                                                |           |
| 3.1.7  | `gender` = `"M"` (invalid enum; only `male, female, other, prefer_not_to_say`).            | 400.                                                                                                       |           |
| 3.1.8  | `household_id` is not a UUID.                                                              | 400 Zod.                                                                                                   |           |
| 3.1.9  | `has_allergy: true`, `allergy_details` empty/missing.                                      | 400 `.refine` error: "allergy_details is required when has_allergy is true" (`path: ['allergy_details']`). |           |
| 3.1.10 | `date_of_birth` is an empty string.                                                        | 400 `.min(1)`.                                                                                             |           |
| 3.1.11 | `parent_links[0].parent_id` references a non-existent parent.                              | 404 `PARENT_NOT_FOUND`.                                                                                    |           |
| 3.1.12 | `year_group_id` references a non-existent year group.                                      | 404 `YEAR_GROUP_NOT_FOUND`.                                                                                |           |
| 3.1.13 | `class_homeroom_id` references a non-existent class.                                       | 404 `CLASS_NOT_FOUND`.                                                                                     |           |
| 3.1.14 | Permission: send without `students.manage` role.                                           | 403.                                                                                                       |           |
| 3.1.15 | Auth: missing Bearer token.                                                                | 401.                                                                                                       |           |
| 3.1.16 | Post-condition: `sql("SELECT tenant_id FROM students WHERE id=<newId>")` = session tenant. | Correct.                                                                                                   |           |

### 3.2 GET /v1/students (list)

| #     | What to run                                | Expected                                                                                                                       | Pass/Fail |
| ----- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 3.2.1 | `?page=1&pageSize=20`                      | 200 with `{ data: [...20 rows], meta: { page: 1, pageSize: 20, total: 209 } }`.                                                |           |
| 3.2.2 | `?pageSize=200` (above max 100).           | 400 Zod.                                                                                                                       |           |
| 3.2.3 | `?page=0`.                                 | 400 Zod (min 1).                                                                                                               |           |
| 3.2.4 | `?status=foo`                              | 400 Zod enum.                                                                                                                  |           |
| 3.2.5 | `?has_allergy=yes`                         | The transform coerces to undefined (only "true"/"false" are honored). Returns 200 with filter NOT applied. Confirm via counts. |           |
| 3.2.6 | `?year_group_id=not-uuid`                  | 400 Zod.                                                                                                                       |           |
| 3.2.7 | `?sort=last_name&order=desc`               | 200. Response ordered by last_name DESC.                                                                                       |           |
| 3.2.8 | `?sort=invalid_field`                      | 200 (Prisma will throw or ignore). Confirm actual behaviour. If Prisma throws, server returns 500 — flag as **INT-1**.         |           |
| 3.2.9 | Permission: token without `students.view`. | 403.                                                                                                                           |           |

### 3.3 GET /v1/students/:id

| #     | What to run                                                                                                                             | Expected                                                                                                                                   | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 3.3.1 | Valid UUID, existing student.                                                                                                           | 200. Response includes `student_parents[]` (with masked parent fields), `class_enrolments[]`, `year_group`, `homeroom_class`, `household`. |           |
| 3.3.2 | `id` not a UUID (`ParseUUIDPipe`).                                                                                                      | 400.                                                                                                                                       |           |
| 3.3.3 | UUID not in tenant.                                                                                                                     | 404 `STUDENT_NOT_FOUND`.                                                                                                                   |           |
| 3.3.4 | Permission denied.                                                                                                                      | 403.                                                                                                                                       |           |
| 3.3.5 | Audit-log: one new row with `entity_type='student'`, `entity_id=<id>`, `metadata.classification='special_category'`, `actor_id=<user>`. | Row present.                                                                                                                               |           |

### 3.4 PATCH /v1/students/:id

| #     | What to run                                                    | Expected                                            | Pass/Fail |
| ----- | -------------------------------------------------------------- | --------------------------------------------------- | --------- |
| 3.4.1 | Update `first_name`.                                           | 200. `first_name` changed. `updated_at` increments. |           |
| 3.4.2 | Partial: only `year_group_id`.                                 | 200. Other fields unchanged.                        |           |
| 3.4.3 | Set `household_id` to non-existent.                            | 404.                                                |           |
| 3.4.4 | Set `year_group_id` to non-existent.                           | 404.                                                |           |
| 3.4.5 | Set `class_homeroom_id` to non-existent.                       | 404.                                                |           |
| 3.4.6 | `has_allergy=true` + `allergy_details=''`.                     | 400 `.refine`.                                      |           |
| 3.4.7 | Redis cache for `preview:student:{id}` is cleared post-update. | `redis-cli EXISTS preview:student:{id}` = 0.        |           |
| 3.4.8 | Permission denied.                                             | 403.                                                |           |

### 3.5 PATCH /v1/students/:id/status

| #      | What to run                                                 | Expected                                                                                                          | Pass/Fail |
| ------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 3.5.1  | Applicant → Active.                                         | 200. `status='active'`. `entry_date` unchanged (entry_date is set on create; status-to-active does NOT reset it). |           |
| 3.5.2  | Active → Withdrawn with no `reason`.                        | 400 `WITHDRAWAL_REASON_REQUIRED`.                                                                                 |           |
| 3.5.3  | Active → Withdrawn with `reason=''` (whitespace).           | 400 (whitespace-trimmed length = 0).                                                                              |           |
| 3.5.4  | Active → Withdrawn with reason.                             | 200. `exit_date=today`. Active `class_enrolments` dropped (`status='dropped', end_date=today`).                   |           |
| 3.5.5  | Active → Graduated.                                         | 200. `exit_date=today`. Active enrolments NOT dropped.                                                            |           |
| 3.5.6  | Active → Archived.                                          | 200. `exit_date` unchanged.                                                                                       |           |
| 3.5.7  | Withdrawn → Active.                                         | 200. `status='active'`. `exit_date` is NOT cleared (observation D from admin spec).                               |           |
| 3.5.8  | Applicant → Withdrawn.                                      | 400 `INVALID_STATUS_TRANSITION`.                                                                                  |           |
| 3.5.9  | Archived → Anything.                                        | 400 `INVALID_STATUS_TRANSITION`.                                                                                  |           |
| 3.5.10 | Status to invalid enum value.                               | 400 Zod.                                                                                                          |           |
| 3.5.11 | Redis cache `preview:student:{id}` cleared post-transition. | Yes.                                                                                                              |           |

### 3.6 GET /v1/students/allergy-report

| #     | What to run                                                         | Expected                                                                     | Pass/Fail |
| ----- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------- |
| 3.6.1 | No filters.                                                         | 200 with rows limited to `has_allergy=true` AND health_data consent granted. |           |
| 3.6.2 | `?year_group_id=<uuid>`                                             | 200, filtered.                                                               |           |
| 3.6.3 | `?class_id=<uuid>`                                                  | 200. Rows restricted to students with an active enrolment in that class.     |           |
| 3.6.4 | Both filters.                                                       | 200, both applied.                                                           |           |
| 3.6.5 | `?format=json`                                                      | 200 (only accepted format).                                                  |           |
| 3.6.6 | `?format=csv`                                                       | 400 Zod enum.                                                                |           |
| 3.6.7 | Audit row: `classification='special_category'` tagged on each call. | Row present.                                                                 |           |

### 3.7 GET /v1/students/export-data

| #     | What to run                                                                              | Expected                                                      | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------- |
| 3.7.1 | No filters.                                                                              | 200 with `{ data: [all students in tenant] }`. No pagination. |           |
| 3.7.2 | `?search=Ryan&status=active`                                                             | 200 with `OR`-matched + status-filtered set.                  |           |
| 3.7.3 | Response size for a 10k-row tenant should be under 5 MB (see perf spec for real budget). | Size check.                                                   |           |

### 3.8 GET /v1/students/:id/preview

| #     | What to run                                                                | Expected                                                                                                                                                                                                                                                                | Pass/Fail |
| ----- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.8.1 | First call: 200 + Redis cache set (`EX 30`).                               | `redis-cli EXISTS preview:student:{id}` = 1.                                                                                                                                                                                                                            |           |
| 3.8.2 | Second call within 30s: returns cached payload.                            | Identical bytes.                                                                                                                                                                                                                                                        |           |
| 3.8.3 | After update (PATCH), preview call returns fresh data (cache invalidated). | Correct.                                                                                                                                                                                                                                                                |           |
| 3.8.4 | Cross-tenant UUID.                                                         | 404 — BUT Redis cache key `preview:student:{id}` is NOT tenant-scoped (naming convention). Flag as **INT-2**: two tenants could theoretically share a cache key if UUIDs collided (UUID collision is astronomically unlikely, but the cache key lacks a tenant prefix). |           |

### 3.9 GET /v1/students/:id/export-pack

| #     | What to run                                  | Expected                                                                                                          | Pass/Fail |
| ----- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 3.9.1 | Valid id.                                    | 200 with `{ profile, attendance_summary: [], grades: [], report_cards: [] }` (placeholders per service comments). |           |
| 3.9.2 | Permission: token missing `students.manage`. | 403.                                                                                                              |           |
| 3.9.3 | Audit classification `full_export`.          | Row present.                                                                                                      |           |

---

## 4. API contract matrix — Staff profiles

### 4.1 POST /v1/staff-profiles

| #      | What to run                                                                                                                                                                                   | Expected                                                            | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------- |
| 4.1.1  | Valid.                                                                                                                                                                                        | 201 with masked bank fields (`bank_account_last4: null` or `****`). |           |
| 4.1.2  | Missing first_name / last_name / email / phone / role_id.                                                                                                                                     | 400 per-field.                                                      |           |
| 4.1.3  | Invalid email.                                                                                                                                                                                | 400 Zod.                                                            |           |
| 4.1.4  | `employment_type` = `"freelance"` (invalid enum).                                                                                                                                             | 400.                                                                |           |
| 4.1.5  | `employment_status` = `"suspended"`.                                                                                                                                                          | 400.                                                                |           |
| 4.1.6  | Existing user (email matches a platform user with no staff profile in this tenant) → 201. Verify membership + role created.                                                                   | Correct.                                                            |           |
| 4.1.7  | Existing user with a staff profile in this tenant.                                                                                                                                            | 409 `STAFF_PROFILE_EXISTS`.                                         |           |
| 4.1.8  | `role_id` references a role outside this tenant.                                                                                                                                              | 400 or 404 on role validation (confirm which).                      |           |
| 4.1.9  | Permission: no `users.manage`.                                                                                                                                                                | 403.                                                                |           |
| 4.1.10 | Bank fields encrypted: SELECT the raw row — `bank_account_number_encrypted` is NOT the plaintext.                                                                                             | Ciphertext.                                                         |           |
| 4.1.11 | `staff_number` unique within tenant — after a rare collision, the retry loop should succeed within 5 attempts. Simulate by pre-inserting `AAA1234-5` then create with forced same generation. | Retry loop avoids the collision.                                    |           |

### 4.2 GET /v1/staff-profiles

| #     | What to run                  | Expected                                   | Pass/Fail |
| ----- | ---------------------------- | ------------------------------------------ | --------- |
| 4.2.1 | Happy.                       | 200. Bank fields NOT in list response.     |           |
| 4.2.2 | `?employment_status=active`  | Filtered.                                  |           |
| 4.2.3 | `?department=Mathematics`    | Filtered.                                  |           |
| 4.2.4 | `?search=Fatima`             | Filters on `user.first_name/last_name` OR. |           |
| 4.2.5 | `?pageSize=200`              | 400 (max 100).                             |           |
| 4.2.6 | Permission: no `users.view`. | 403.                                       |           |

### 4.3 GET /v1/staff-profiles/:id

| #     | What to run                                                          | Expected                                      | Pass/Fail |
| ----- | -------------------------------------------------------------------- | --------------------------------------------- | --------- |
| 4.3.1 | Happy.                                                               | 200 with masked bank + `class_assignments[]`. |           |
| 4.3.2 | Cross-tenant id.                                                     | 404.                                          |           |
| 4.3.3 | Non-UUID.                                                            | 400.                                          |           |
| 4.3.4 | Bank fields in response: only the `_last4` values. Plaintext absent. | Correct.                                      |           |

### 4.4 PATCH /v1/staff-profiles/:id

| #     | What to run                               | Expected                                                                         | Pass/Fail |
| ----- | ----------------------------------------- | -------------------------------------------------------------------------------- | --------- |
| 4.4.1 | Update `job_title`.                       | 200.                                                                             |           |
| 4.4.2 | Update `bank_account_number`.             | 200. New ciphertext in DB. Response has masked `bank_account_last4`.             |           |
| 4.4.3 | Clear `bank_iban` (set to null).          | `bank_iban_encrypted` = null in DB.                                              |           |
| 4.4.4 | Set `employment_status=inactive`.         | 200. DB reflects. Membership NOT auto-deactivated (observation H in admin spec). |           |
| 4.4.5 | `staff_number` update.                    | 200 (field is in `updateStaffProfileSchema`).                                    |           |
| 4.4.6 | Permission: no `users.manage`.            | 403.                                                                             |           |
| 4.4.7 | Redis cache `preview:staff:{id}` cleared. | Correct.                                                                         |           |

### 4.5 GET /v1/staff-profiles/:id/bank-details

| #     | What to run                                                                                                                   | Expected                                                                                                            | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.5.1 | As owner (holds `payroll.view_bank_details`).                                                                                 | 200 with `{ bank_name, bank_account_number_masked, bank_iban_masked }`. Masked = last 4 chars prefixed with `****`. |           |
| 4.5.2 | As admin (no `payroll.view_bank_details`).                                                                                    | 403.                                                                                                                |           |
| 4.5.3 | As accounting (per seed, no `payroll.view_bank_details`).                                                                     | 403.                                                                                                                |           |
| 4.5.4 | Cross-tenant id.                                                                                                              | 404.                                                                                                                |           |
| 4.5.5 | No bank encrypted values → `bank_account_number_masked: null`, `bank_iban_masked: null`.                                      | Correct.                                                                                                            |           |
| 4.5.6 | Audit row with `classification='financial'` written per call.                                                                 | Row present.                                                                                                        |           |
| 4.5.7 | Plaintext bank number NEVER appears in the response body. Verify by grepping the response bytes for the original number.      | Not present.                                                                                                        |           |
| 4.5.8 | Plaintext bank number does NOT appear in server logs. Grep the application log tail for the original number — must not match. | Not in logs.                                                                                                        |           |

### 4.6 GET /v1/staff-profiles/:id/preview

| #     | What to run                                               | Expected | Pass/Fail |
| ----- | --------------------------------------------------------- | -------- | --------- |
| 4.6.1 | First call: 200. Redis `preview:staff:{id}` set, `EX 30`. | Correct. |           |
| 4.6.2 | Cross-tenant.                                             | 404.     |           |

---

## 5. API contract matrix — Households

### 5.1 POST /v1/households

| #     | What to run                          | Expected                                                                                                                        | Pass/Fail |
| ----- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1.1 | Valid.                               | 201. `household_number` matches `^[A-Z]{3}\d{3}$`, `status='active'`, `needs_completion=true` (contacts but no billing parent). |           |
| 5.1.2 | Missing `household_name`.            | 400.                                                                                                                            |           |
| 5.1.3 | Zero emergency contacts.             | 400 "At least one emergency contact is required".                                                                               |           |
| 5.1.4 | 4 contacts.                          | 400 "max 3".                                                                                                                    |           |
| 5.1.5 | Contact with missing `contact_name`. | 400.                                                                                                                            |           |
| 5.1.6 | Contact `display_order=4`.           | 400 Zod max 3.                                                                                                                  |           |
| 5.1.7 | `address_line1` length 256.          | 400 max 255.                                                                                                                    |           |
| 5.1.8 | Cross-tenant tenant_id in body.      | Ignored; `tenant_id` in DB = session.                                                                                           |           |
| 5.1.9 | Permission denied.                   | 403.                                                                                                                            |           |

### 5.2 GET /v1/households

| #     | What to run           | Expected                                                                          | Pass/Fail |
| ----- | --------------------- | --------------------------------------------------------------------------------- | --------- |
| 5.2.1 | Happy.                | 200 with `data[].completion_issues` computed from `buildCompletionIssues` helper. |           |
| 5.2.2 | `?status=archived`    | Filter by status.                                                                 |           |
| 5.2.3 | `?search=Al-Mansouri` | Filter by `household_name.contains` (insensitive).                                |           |

### 5.3 GET /v1/households/next-number

| #     | What to run                                                                                                                                          | Expected                                                             | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------- |
| 5.3.1 | Happy.                                                                                                                                               | 200 `{ household_number: "XYZ123" }`. Does NOT consume the sequence. |           |
| 5.3.2 | Called repeatedly, same call returns the same number (non-consuming preview) OR incrementing (consuming). **Confirm behaviour** and flag if unclear. | Deterministic.                                                       |           |
| 5.3.3 | Permission: no `students.manage`.                                                                                                                    | 403.                                                                 |           |

### 5.4 GET /v1/households/merge

| #     | What to run                                                                                                                                          | Expected | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 5.4.1 | GET returns 405 placeholder with `{ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST /merge' } }`. This is a deliberate route-conflict guard. | 405.     |           |

### 5.5 POST /v1/households/merge

| #     | What to run                                           | Expected                                                                               | Pass/Fail |
| ----- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- | --------- |
| 5.5.1 | Valid merge (two active in same tenant).              | 200. Source archived, students moved, parents moved (dedup), contacts moved up to cap. |           |
| 5.5.2 | `source == target`.                                   | 400 `SAME_HOUSEHOLD`.                                                                  |           |
| 5.5.3 | Source archived.                                      | 400 `HOUSEHOLD_ARCHIVED`.                                                              |           |
| 5.5.4 | Target archived.                                      | 400 `HOUSEHOLD_ARCHIVED`.                                                              |           |
| 5.5.5 | Cross-tenant target.                                  | 404.                                                                                   |           |
| 5.5.6 | Cross-tenant source.                                  | 404.                                                                                   |           |
| 5.5.7 | Missing `target_household_id`.                        | 400 Zod.                                                                               |           |
| 5.5.8 | `needs_completion` recalculated on target post-merge. | Correct.                                                                               |           |

### 5.6 POST /v1/households/split

| #     | What to run                                          | Expected                                                                                                                                       | Pass/Fail |
| ----- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.6.1 | Valid split (1 student, 1 parent, 1 contact).        | 200. New household created.                                                                                                                    |           |
| 5.6.2 | `student_ids` contains an id from another household. | Silently ignored (updateMany filters by source_household_id). Confirm: non-matching student is NOT moved.                                      |           |
| 5.6.3 | `parent_ids` references non-existent parent.         | Fails at `householdParent.create` with a FK error → 500 unless service handles it. Flag **INT-3**: validate parent ids before the create loop. |           |
| 5.6.4 | `new_household_name` empty.                          | 400 Zod.                                                                                                                                       |           |
| 5.6.5 | 0 contacts.                                          | 400 Zod.                                                                                                                                       |           |
| 5.6.6 | Archived source.                                     | 400 `HOUSEHOLD_ARCHIVED`.                                                                                                                      |           |
| 5.6.7 | Cross-tenant source.                                 | 404.                                                                                                                                           |           |

### 5.7 GET /v1/households/:id

| #     | What to run      | Expected                                                                                                                                                    | Pass/Fail |
| ----- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.7.1 | Happy.           | 200. `emergency_contacts` ordered by display_order ASC. `household_parents[].parent` nested. `students[]` with minimal fields. `completion_issues` present. |           |
| 5.7.2 | Cross-tenant id. | 404.                                                                                                                                                        |           |
| 5.7.3 | Invalid UUID.    | 400.                                                                                                                                                        |           |

### 5.8 PATCH /v1/households/:id

| #     | What to run                                 | Expected                | Pass/Fail |
| ----- | ------------------------------------------- | ----------------------- | --------- |
| 5.8.1 | Update `household_name`.                    | 200. Cache invalidated. |           |
| 5.8.2 | Clear `address_line2` (null).               | 200. Field nulled.      |           |
| 5.8.3 | `household_name` empty.                     | 400 Zod min 1.          |           |
| 5.8.4 | `household_number` in body (not in schema). | Ignored / rejected.     |           |

### 5.9 PATCH /v1/households/:id/status

| #     | What to run        | Expected                                                                        | Pass/Fail |
| ----- | ------------------ | ------------------------------------------------------------------------------- | --------- |
| 5.9.1 | Active → Inactive. | 200.                                                                            |           |
| 5.9.2 | Inactive → Active. | 200.                                                                            |           |
| 5.9.3 | Active → Archived. | 200.                                                                            |           |
| 5.9.4 | Archived → Active. | 200 (no state-machine validation — flag **INT-4** for whether this is desired). |           |
| 5.9.5 | Invalid enum.      | 400 Zod.                                                                        |           |

### 5.10 PUT /v1/households/:id/billing-parent

| #      | What to run                    | Expected                                                             | Pass/Fail |
| ------ | ------------------------------ | -------------------------------------------------------------------- | --------- |
| 5.10.1 | Parent is linked to household. | 200. `primary_billing_parent_id` updated. `needs_completion` recalc. |           |
| 5.10.2 | Parent NOT linked.             | 400 `PARENT_NOT_IN_HOUSEHOLD`.                                       |           |
| 5.10.3 | Parent doesn't exist.          | 400 (same error path) or 404 depending on implementation.            |           |
| 5.10.4 | Cross-tenant parent.           | 400 (link won't be found in A scope).                                |           |

### 5.11 POST /v1/households/:id/emergency-contacts

| #      | What to run                     | Expected                      | Pass/Fail |
| ------ | ------------------------------- | ----------------------------- | --------- |
| 5.11.1 | Add contact, household has < 3. | 201.                          |           |
| 5.11.2 | Add when already 3.             | 400 `CONTACTS_LIMIT_REACHED`. |           |
| 5.11.3 | Cross-tenant household.         | 404.                          |           |
| 5.11.4 | Missing fields.                 | 400 Zod.                      |           |

### 5.12 PATCH /v1/households/:h/emergency-contacts/:c

| #      | What to run                                                                | Expected | Pass/Fail |
| ------ | -------------------------------------------------------------------------- | -------- | --------- |
| 5.12.1 | Happy.                                                                     | 200.     |           |
| 5.12.2 | Cross-tenant household.                                                    | 404.     |           |
| 5.12.3 | `relationship_label` omitted from body → uses existing (service fallback). | Confirm. |           |

### 5.13 DELETE /v1/households/:h/emergency-contacts/:c

| #      | What to run                                  | Expected                     | Pass/Fail |
| ------ | -------------------------------------------- | ---------------------------- | --------- |
| 5.13.1 | Delete when count ≥ 2.                       | 204.                         |           |
| 5.13.2 | Delete when count = 1.                       | 400 `MIN_CONTACTS_REQUIRED`. |           |
| 5.13.3 | Cross-tenant.                                | 404.                         |           |
| 5.13.4 | `needs_completion` recalculated post-delete. | Correct.                     |           |

### 5.14 POST /v1/households/:id/parents

| #      | What to run                | Expected                                                      | Pass/Fail |
| ------ | -------------------------- | ------------------------------------------------------------- | --------- |
| 5.14.1 | Link new parent.           | 201.                                                          |           |
| 5.14.2 | Link existing (duplicate). | 201 returns the existing record (service intercepts `P2002`). |           |
| 5.14.3 | Parent cross-tenant.       | 404 `PARENT_NOT_FOUND`.                                       |           |
| 5.14.4 | Household cross-tenant.    | 404 `HOUSEHOLD_NOT_FOUND`.                                    |           |

### 5.15 DELETE /v1/households/:h/parents/:p

| #      | What to run            | Expected                       | Pass/Fail |
| ------ | ---------------------- | ------------------------------ | --------- |
| 5.15.1 | Unlink non-billing.    | 204.                           |           |
| 5.15.2 | Unlink billing parent. | 400 `IS_BILLING_PARENT`.       |           |
| 5.15.3 | Link doesn't exist.    | 404 `PARENT_NOT_IN_HOUSEHOLD`. |           |
| 5.15.4 | Cross-tenant.          | 404.                           |           |

### 5.16 POST /v1/households/:id/students

| #      | What to run                                                                                              | Expected | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 5.16.1 | Delegated to `RegistrationService.addStudentToHousehold`. 201 with the new student under this household. | Correct. |           |
| 5.16.2 | Cross-tenant household.                                                                                  | 404.     |           |
| 5.16.3 | Invalid payload (missing national_id).                                                                   | 400 Zod. |           |

### 5.17 GET /v1/households/:id/preview

| #      | What to run                            | Expected | Pass/Fail |
| ------ | -------------------------------------- | -------- | --------- |
| 5.17.1 | First call: 200, Redis cache set.      | Correct. |           |
| 5.17.2 | Post-merge/split/PATCH: cache cleared. | Correct. |           |
| 5.17.3 | Permission: `students.view`.           | 200.     |           |

---

## 6. API contract matrix — Parents

### 6.1 POST /v1/parents

| #     | What to run                                                        | Expected                                                                                                           | Pass/Fail |
| ----- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------- |
| 6.1.1 | Valid with `preferred_contact_channels=['email']` and `email` set. | 201.                                                                                                               |           |
| 6.1.2 | `preferred_contact_channels=['whatsapp']` but no `whatsapp_phone`. | 400 `.refine` — "whatsapp_phone is required when whatsapp is a preferred contact channel".                         |           |
| 6.1.3 | Both channels.                                                     | 201.                                                                                                               |           |
| 6.1.4 | 0 channels.                                                        | 400 Zod min 1.                                                                                                     |           |
| 6.1.5 | 3 channels (invalid).                                              | 400 max 2.                                                                                                         |           |
| 6.1.6 | Duplicate email in same tenant.                                    | 409 `PARENT_EMAIL_EXISTS`.                                                                                         |           |
| 6.1.7 | Same email in other tenant.                                        | 201.                                                                                                               |           |
| 6.1.8 | With `household_id` set → link also created.                       | 201. `household_parents` row present.                                                                              |           |
| 6.1.9 | `household_id` in another tenant.                                  | 404 `HOUSEHOLD_NOT_FOUND` on the validation (confirm — or the link creation silently fails; either way, no bleed). |           |

### 6.2 GET /v1/parents

| #     | What to run                                                  | Expected  | Pass/Fail |
| ----- | ------------------------------------------------------------ | --------- | --------- |
| 6.2.1 | Happy.                                                       | 200.      |           |
| 6.2.2 | `?search=` matches `first_name/last_name/email` (not phone). | Correct.  |           |
| 6.2.3 | `?status=active` / `inactive`.                               | Filtered. |           |

### 6.3 GET /v1/parents/:id

| #     | What to run   | Expected                                                                  | Pass/Fail |
| ----- | ------------- | ------------------------------------------------------------------------- | --------- |
| 6.3.1 | Happy.        | 200 with `household_parents[].household` and `student_parents[].student`. |           |
| 6.3.2 | Cross-tenant. | 404.                                                                      |           |

### 6.4 PATCH /v1/parents/:id

| #     | What to run                                                           | Expected                   | Pass/Fail |
| ----- | --------------------------------------------------------------------- | -------------------------- | --------- |
| 6.4.1 | Update `email`.                                                       | 200.                       |           |
| 6.4.2 | Set `email` to duplicate in same tenant.                              | 409 `PARENT_EMAIL_EXISTS`. |           |
| 6.4.3 | Clear `phone` (null).                                                 | 200.                       |           |
| 6.4.4 | Set `preferred_contact_channels=['whatsapp']` without whatsapp_phone. | 400 refine.                |           |
| 6.4.5 | Cross-tenant.                                                         | 404.                       |           |

### 6.5 POST /v1/parents/:id/students

| #     | What to run           | Expected                      | Pass/Fail |
| ----- | --------------------- | ----------------------------- | --------- |
| 6.5.1 | Link new student.     | 201.                          |           |
| 6.5.2 | Duplicate.            | 409 `STUDENT_ALREADY_LINKED`. |           |
| 6.5.3 | Cross-tenant parent.  | 404 `PARENT_NOT_FOUND`.       |           |
| 6.5.4 | Cross-tenant student. | 404 `STUDENT_NOT_FOUND`.      |           |

### 6.6 DELETE /v1/parents/:p/students/:s

| #     | What to run         | Expected                             | Pass/Fail |
| ----- | ------------------- | ------------------------------------ | --------- |
| 6.6.1 | Unlink existing.    | 204.                                 |           |
| 6.6.2 | Link doesn't exist. | 404 `STUDENT_PARENT_LINK_NOT_FOUND`. |           |

---

## 7. Consent-gate integration — allergy report

| #   | What to run                                                                                                                                          | Expected    | Pass/Fail |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------- |
| 7.1 | Create 10 students with `has_allergy=true`. Grant 5 of them `gdpr_consent_records` (subject_type=student, consent_type=health_data, status=granted). | Seed ready. |           |
| 7.2 | `GET /v1/students/allergy-report` → response contains exactly the 5 consented students.                                                              | Count = 5.  |           |
| 7.3 | Withdraw consent on 1 (`UPDATE gdpr_consent_records SET status='withdrawn' WHERE ...`). Report now returns 4.                                        | Count = 4.  |           |
| 7.4 | Create a new allergy student with NO consent record at all. Report still 4 (new one is absent).                                                      | Count = 4.  |           |
| 7.5 | Filter by class_id that covers 2 of the 4 consented students. Report returns 2.                                                                      | Count = 2.  |           |
| 7.6 | The list endpoint (`/v1/students?has_allergy=true`) does NOT apply the consent gate — it returns all 10. (Observation O in admin spec.)              | Count = 10. |           |

---

## 8. State-machine matrices

### 8.1 Student status

States: applicant, active, withdrawn, graduated, archived. Map (from code):

| From \ To | applicant | active | withdrawn       | graduated | archived |
| --------- | --------- | ------ | --------------- | --------- | -------- |
| applicant | —         | ✅     | ❌              | ❌        | ❌       |
| active    | ❌        | —      | ✅ (reason req) | ✅        | ✅       |
| withdrawn | ❌        | ✅     | —               | ❌        | ❌       |
| graduated | ❌        | ❌     | ❌              | —         | ✅       |
| archived  | ❌        | ❌     | ❌              | ❌        | —        |

| #      | From → To                      | Expected                                             | Pass/Fail |
| ------ | ------------------------------ | ---------------------------------------------------- | --------- |
| 8.1.1  | applicant → active             | 200                                                  |           |
| 8.1.2  | applicant → withdrawn          | 400 INVALID_STATUS_TRANSITION                        |           |
| 8.1.3  | applicant → graduated          | 400                                                  |           |
| 8.1.4  | applicant → archived           | 400                                                  |           |
| 8.1.5  | active → withdrawn (no reason) | 400 WITHDRAWAL_REASON_REQUIRED                       |           |
| 8.1.6  | active → withdrawn (reason)    | 200. exit_date=today. active enrolments dropped.     |           |
| 8.1.7  | active → graduated             | 200. exit_date=today. enrolments unchanged.          |           |
| 8.1.8  | active → archived              | 200. exit_date unchanged.                            |           |
| 8.1.9  | active → applicant             | 400                                                  |           |
| 8.1.10 | withdrawn → active             | 200. exit_date NOT cleared, enrolments NOT restored. |           |
| 8.1.11 | withdrawn → archived           | 400                                                  |           |
| 8.1.12 | graduated → archived           | 200                                                  |           |
| 8.1.13 | graduated → active             | 400                                                  |           |
| 8.1.14 | archived → anything            | 400                                                  |           |

### 8.2 Household status (no enforced map — all transitions permitted)

| #     | From → To           | Expected | Pass/Fail |
| ----- | ------------------- | -------- | --------- |
| 8.2.1 | active → inactive   | 200      |           |
| 8.2.2 | active → archived   | 200      |           |
| 8.2.3 | inactive → active   | 200      |           |
| 8.2.4 | archived → active   | 200      |           |
| 8.2.5 | archived → inactive | 200      |           |
| 8.2.6 | Invalid enum value  | 400 Zod  |           |

Flag **INT-5**: unlike students, household status has no `VALID_TRANSITIONS` gate. An archived-from-merge source can be revived by PATCHing back to active; that revives students who were moved to the merge target (their `household_id` was reassigned but the archived source can become active again as an orphan). Confirm this is the intended behaviour.

### 8.3 Parent status

Only `active` / `inactive` enum. No state-machine enforcement beyond enum; PATCH flips freely.

---

## 9. Concurrency / race tests

Use `Promise.all([...])` against separate HTTP clients (distinct connections) to force true concurrency.

### 9.1 Parallel merges on the same source

| #     | What to run                                                                                                                  | Expected                                                                                                                                                                                                              | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1.1 | Fire N=10 `POST /v1/households/merge` in parallel, all with the same `(sourceId, targetId)`.                                 | Exactly one 200 succeeds. The other 9 return 400 `HOUSEHOLD_ARCHIVED` (the source is archived after the first winner) OR they block on the `SELECT FOR UPDATE` until the first finishes, then see the archived state. |           |
| 9.1.2 | Post-condition: source.status='archived', source's students all have household_id=target (count unchanged, no double-moves). | `SELECT COUNT(*) FROM students WHERE household_id=<source>` = 0.                                                                                                                                                      |           |
| 9.1.3 | No duplicate emergency contacts on target (each source contact moved at most once, up to the cap).                           | `SELECT COUNT(*) FROM household_emergency_contacts WHERE household_id=<target>` ≤ 3.                                                                                                                                  |           |

### 9.2 Merges on overlapping pairs (deadlock test)

| #     | What to run                                                                                                                                                                                                                                                                | Expected                       | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------- |
| 9.2.1 | Fire 2 merges in parallel: `merge(A, B)` and `merge(B, A)`. The service uses `[sourceId, targetId].sort()` to lock in canonical order, so both transactions acquire locks in the same sequence. Exactly one succeeds, the other sees archived state and 400s. No deadlock. | No deadlock. One 200, one 400. |           |

### 9.3 Parallel status updates on the same student

| #     | What to run                                                                                              | Expected                                                                                                                        | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.3.1 | Fire 5 PATCH `/v1/students/{id}/status` with `{ status: "graduated" }` in parallel on an active student. | One succeeds (200), the other 4 return 400 `INVALID_STATUS_TRANSITION` (once graduated, graduated-to-graduated is not allowed). |           |
| 9.3.2 | Student's `updated_at` has a single final value. Audit log has exactly 1 `status_change` event.          | Correct.                                                                                                                        |           |

### 9.4 Parallel emergency-contact creates (cap guard)

| #     | What to run                                                                    | Expected                                                                         | Pass/Fail |
| ----- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | --------- |
| 9.4.1 | On a household with 2 contacts, fire 5 POST `/emergency-contacts` in parallel. | Exactly 1 succeeds (cap becomes 3). Other 4 return 400 `CONTACTS_LIMIT_REACHED`. |           |
| 9.4.2 | Post-condition: household's contact count = 3.                                 | Correct.                                                                         |           |

### 9.5 Parallel parent-link creates (dedup)

| #     | What to run                                                                                         | Expected                                                        | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------- |
| 9.5.1 | On a household + parent not yet linked, fire 5 POST `/parents` in parallel with the same parent_id. | One creates, 4 return the existing row (service catches P2002). |           |
| 9.5.2 | `SELECT COUNT(*) FROM household_parents WHERE household_id=? AND parent_id=?` = 1.                  | Exactly 1.                                                      |           |

### 9.6 Parallel staff creates (staff_number collision)

| #     | What to run                                                         | Expected                                                                                                                                     | Pass/Fail |
| ----- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.6.1 | Fire 10 POST `/v1/staff-profiles` in parallel with distinct emails. | All 10 succeed. Each has a unique `staff_number` (retry-loop handles any random collision; the collision probability per attempt is 1/260k). |           |
| 9.6.2 | No duplicate `staff_number` in DB for the tenant.                   | `SELECT staff_number, COUNT(*) FROM staff_profiles WHERE tenant_id=? GROUP BY staff_number HAVING COUNT(*) > 1` returns zero rows.           |           |

### 9.7 Parallel split + merge on same household (race)

| #     | What to run                                                                                    | Expected                                                                                                                                                                                                                   | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.7.1 | Simultaneously `split(sourceId, …)` and `merge(sourceId, targetId)`.                           | Order determined by `SELECT FOR UPDATE`. The second one runs against post-first state. If merge wins first, split sees archived source → 400. If split wins first, merge sees active source with fewer students, proceeds. |           |
| 9.7.2 | Final DB state is consistent (no dangling rows, no orphans). Verify via the invariants in §15. | Consistent.                                                                                                                                                                                                                |           |

---

## 10. Transaction boundary tests

### 10.1 Create student — parent link failure rollback

| #      | What to run                                                                                                                                          | Expected                                                                                                                  | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1.1 | Force a failure on the `student_parents.create` step inside the create transaction (e.g. mock `studentParent.create` to throw on the 2nd iteration). | Whole transaction rolls back. `SELECT COUNT(*) FROM students WHERE id=<attempted>` = 0. No orphan `student_parents` rows. |           |

### 10.2 Staff create — user already exists, role create fails

| #      | What to run                            | Expected                                                                                                                                             | Pass/Fail |
| ------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.2.1 | Mock `membershipRole.create` to throw. | Transaction rolls back: no new `staff_profiles`, no new `tenant_memberships`. (The platform `users` row predates this transaction and is preserved.) |           |

### 10.3 Merge — contact move fails

| #      | What to run                                                                                | Expected                                                                                                      | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | --------- |
| 10.3.1 | Mock `householdEmergencyContact.create` in the merge loop to throw after moving 1 contact. | Full merge rolls back: source NOT archived, students NOT moved, parents NOT moved, target contacts unchanged. |           |

### 10.4 Split — FK error on parent link

| #      | What to run                                                                                              | Expected                                                                                    | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------- |
| 10.4.1 | Pass a non-existent `parent_id` in `parent_ids`. The `householdParent.create` will FK-fail on parent_id. | Transaction rolls back — new household NOT created, students NOT moved. (Relates to INT-3.) |           |

### 10.5 RLS context set before DB read

| #      | What to run                                                                                                                                                                                                                                                                                                  | Expected                        | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | --------- |
| 10.5.1 | Instrument the rls middleware: log the SQL before the first user query. Verify `SET LOCAL app.current_tenant_id = '<id>'` fires before any tenant-scoped query within every interactive transaction.                                                                                                         | Every tx starts with SET LOCAL. |           |
| 10.5.2 | A transaction that reads without the SET (e.g. a direct `prisma.student.findMany` OUTSIDE `$transaction`) is still safe only if the `where: { tenant_id }` filter is present in the query. Verify the list / findFirst calls in `students.service.ts` (lines 296, 320, 378) all include `tenant_id` filters. | Filters present.                |           |

---

## 11. Encrypted-field access control

Encrypted columns: `staff_profiles.bank_account_number_encrypted`, `staff_profiles.bank_iban_encrypted`. Key reference: `staff_profiles.bank_encryption_key_ref`.

| #     | What to run                                                                                                                                                                     | Expected                                                                                                                                 | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1  | Create staff with `bank_account_number='IE12345678'`.                                                                                                                           | 201. DB: `bank_account_number_encrypted` contains NON-plaintext bytes. Grep for the literal `12345678` → no match.                       |           |
| 11.2  | Read via `GET /v1/staff-profiles/{id}` — bank fields masked.                                                                                                                    | Plaintext absent.                                                                                                                        |           |
| 11.3  | Read via `GET /v1/staff-profiles/{id}/bank-details` with `payroll.view_bank_details`.                                                                                           | 200. Masked (`****5678`). Full plaintext NEVER in the body.                                                                              |           |
| 11.4  | Read via `sql("SELECT bank_account_number_encrypted FROM staff_profiles WHERE id=?")` directly.                                                                                 | Returns ciphertext string. Does NOT decrypt.                                                                                             |           |
| 11.5  | EncryptionService.decrypt only works when called with the correct `keyRef`. Forge a keyRef — decrypt throws / returns error.                                                    | Error.                                                                                                                                   |           |
| 11.6  | Application logs during a bank-details request: grep for the plaintext → must NOT match.                                                                                        | Clean.                                                                                                                                   |           |
| 11.7  | Audit log: each `/bank-details` read has a row with `classification='financial'`, `actor_id`, `entity_id`, timestamp.                                                           | Row present per read.                                                                                                                    |           |
| 11.8  | Masked output format: `****` + last 4 chars. Confirm `last4` is derived from the PLAINTEXT decrypted value, not from the ciphertext.                                            | Correct: decrypt → take last 4 → prefix `****`.                                                                                          |           |
| 11.9  | Update bank — old ciphertext replaced by new.                                                                                                                                   | `bank_account_number_encrypted` differs between before and after. `bank_encryption_key_ref` may be different if keys rotated; else same. |           |
| 11.10 | Clear bank (set to null) — `bank_account_number_encrypted` nulled.                                                                                                              | Correct.                                                                                                                                 |           |
| 11.11 | Key rotation: rotate the encryption key via the service's rotate method (if exposed). All existing staff's bank values are re-encryptable and readable via their stored keyRef. | (If this operation is not yet implemented, mark N/A and flag in §15 observations.)                                                       |           |

---

## 12. Audit-log correctness + sensitive-data classification

The `AuditLogInterceptor` (from CLAUDE.md: "do NOT manually write audit logs — the AuditLogInterceptor handles this on mutations") should produce audit rows for every mutation and every sensitive-data read.

| #     | What to run                                                                                                                                                                                                                                                           | Expected             | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------- |
| 12.1  | After POST /v1/students: audit row exists with `entity_type='student'`, `entity_id=<newId>`, `action='create'`, `actor_id=<owner.user_id>`, `tenant_id=<session>`, `before=null`, `after={...}` (redacted per classification rules).                                  | Row present.         |           |
| 12.2  | After PATCH /v1/students/{id}: row with `action='update'`, `before={...pre}`, `after={...post}`. Only changed fields in the diff.                                                                                                                                     | Row present.         |           |
| 12.3  | After PATCH /v1/students/{id}/status: row with `action='status_change'`.                                                                                                                                                                                              | Row present.         |           |
| 12.4  | After GET /v1/students/{id}: row with `action='read'`, `metadata.classification='special_category'`.                                                                                                                                                                  | Row present.         |           |
| 12.5  | After GET /v1/students/{id}/export-pack: `classification='full_export'`.                                                                                                                                                                                              | Row present.         |           |
| 12.6  | After GET /v1/staff-profiles/{id}/bank-details: `classification='financial'`.                                                                                                                                                                                         | Row present.         |           |
| 12.7  | After POST /v1/households/merge: rows for the merge, the source.status change, and each moved student's household change. The number of rows should roughly equal 1 + 1 + movedStudents + movedParents + movedContacts. Confirm what the actual interceptor produces. | Row count plausible. |           |
| 12.8  | No PII in audit `before/after` for encrypted fields: `bank_account_number_encrypted` appears as the ciphertext, NOT as plaintext.                                                                                                                                     | Correct.             |           |
| 12.9  | Audit row is immutable. Attempt `PATCH /v1/audit-logs/:id` → 404 or 403.                                                                                                                                                                                              | Immutable.           |           |
| 12.10 | Audit row is not deletable. Attempt `DELETE` → 404 or 403.                                                                                                                                                                                                            | Cannot delete.       |           |
| 12.11 | Audit row has `request_id` linking to the original API request (for tracing).                                                                                                                                                                                         | Present.             |           |

---

## 13. Webhook tests

| #    | What to run                                                                                                                                            | Expected                   | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | --------- |
| 13.1 | The People module exposes NO webhook endpoints of its own. Stripe and admissions webhooks live in other modules. This leg is therefore N/A for People. | Pass by virtue of absence. |           |

If a future feature adds a people-module webhook (e.g. a SIS integration webhook pushing roster updates), this section expands to the 6 standard rows: missing signature, wrong signature, valid + known event, valid + duplicate event (idempotency), tenant-id missing, tenant-id mismatch.

---

## 14. PDF / binary content invariants

The People module does not expose any server-rendered PDF endpoint directly (exports are client-generated via jsPDF/XLSX). The following rows confirm the Content-Type + filename conventions for the list-export data endpoint, which is JSON.

| #    | What to run                                                                                                               | Expected | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 14.1 | `GET /v1/students/export-data` — `Content-Type: application/json; charset=utf-8`.                                         | Correct. |           |
| 14.2 | `Content-Disposition` header is NOT set — the client decides the filename.                                                | Correct. |           |
| 14.3 | Response body is valid JSON parseable by `JSON.parse`.                                                                    | Valid.   |           |
| 14.4 | No PDF endpoints in this module — skip jsPDF/`pdf-parse` assertions. See `finance` module spec for a full PDF test suite. | N/A.     |           |

---

## 15. Cross-module invariants

These rows cover invariants between the People module and its consumers (finance, academics, behaviour, etc.). Each is testable in isolation.

| #    | Invariant                                                                                                                                                                                                                           | Query / Check                                                                                           | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------- |
| 15.1 | Every `invoices.household_id` references an existing household.                                                                                                                                                                     | `SELECT COUNT(*) FROM invoices i LEFT JOIN households h ON h.id=i.household_id WHERE h.id IS NULL` = 0. |           |
| 15.2 | Every `class_enrolments.student_id` references an existing student (FK cascade on delete).                                                                                                                                          | Zero orphans.                                                                                           |           |
| 15.3 | Merging a household with outstanding invoices does NOT break the invoice.household_id FK — invoices stay pointed at the archived source. Flag **INT-6** if the product expects invoices to follow students to the target household. | FK intact; invoices remain on source.                                                                   |           |
| 15.4 | Withdrawing a student drops `class_enrolments.status` to 'dropped' but does NOT cancel future invoices (those are finance-module concerns). Finance's `overdue_detection` cron handles that separately.                             | Confirm invoices still `issued` post-withdrawal.                                                        |           |
| 15.5 | Deleting a `parent` CASCADES `student_parents`, `household_parents` links (Prisma schema `onDelete: Cascade`). A billing parent reference is set NULL (`onDelete: SetNull` via `"billing_parent"` relation).                        | Verify: `DELETE FROM parents WHERE id=?` leaves household.primary_billing_parent_id=null if matched.    |           |
| 15.6 | Search sync: every successful POST/PATCH on students, parents, staff, households enqueues a `search:index-entity` job. Verify by inspecting the BullMQ queue immediately post-call.                                                 | Job enqueued.                                                                                           |           |

---

## 16. Sign-off

| Section                     | Reviewer | Date | Rows passed / total | Notes         |
| --------------------------- | -------- | ---- | ------------------- | ------------- |
| 1. Prerequisites            |          |      |                     |               |
| 2. RLS matrix (42 rows)     |          |      |                     |               |
| 3. Students contract        |          |      |                     |               |
| 4. Staff contract           |          |      |                     |               |
| 5. Households contract      |          |      |                     |               |
| 6. Parents contract         |          |      |                     |               |
| 7. Allergy consent gate     |          |      |                     |               |
| 8. State machines           |          |      |                     |               |
| 9. Concurrency              |          |      |                     |               |
| 10. Transaction boundaries  |          |      |                     |               |
| 11. Encrypted fields        |          |      |                     |               |
| 12. Audit log               |          |      |                     |               |
| 13. Webhooks (N/A)          | n/a      | n/a  | n/a                 | N/A by design |
| 14. PDF / binary (N/A)      | n/a      | n/a  | n/a                 | N/A by design |
| 15. Cross-module invariants |          |      |                     |               |

**Release-ready when:**

- Every non-N/A row passes, AND
- Zero RLS cell produces a 200-with-cross-tenant-data, AND
- Every state-machine row matches the documented map, AND
- Encrypted-field round-trip shows ciphertext at rest and masked in responses, AND
- Audit log is immutable AND records all classifications per §12.

**Findings flagged during integration walkthrough:**

- INT-1: Invalid `sort` value on `/v1/students?sort=...` behaviour under-specified — Prisma may throw 500. Fix: validate `sort` against a whitelist.
- INT-2: Redis cache key `preview:student:{id}` lacks tenant prefix. Unlikely collision but a security nitpick.
- INT-3: `POST /households/split` does not pre-validate each `parent_id` before the `householdParent.create` loop — a non-existent id causes the whole tx to rollback with a FK error. Pre-validate for a cleaner 404.
- INT-4: `PATCH /households/:id/status` has no state-machine enforcement; archived → active is permitted, which can silently revive a post-merge source.
- INT-5: Related to INT-4 — document intent or add a state map.
- INT-6: Merge does not re-home outstanding invoices to the target household. Verify product intent.

---

**End of Integration Spec.**
