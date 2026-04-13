# Admissions Module — Integration Test Specification

**Scope:** API contracts, RLS leakage, Stripe webhooks, DB invariants, concurrency, transaction boundaries, PDF assertions
**Spec version:** 1.0 (2026-04-12)
**Audience:** a Jest / Vitest / supertest harness. Every row is a standalone test case with a direct HTTP call OR a DB assertion and a concrete expected result.
**Pack companion:** part of `/e2e-full admissions` — sibling specs under `admin_view/`, `parent_view/`, `worker/`, `perf/`, `security/`.

---

## Table of Contents

1. [Prerequisites & Fixture Seeding](#1-prerequisites)
2. [RLS Leakage Matrix (tables × tenants)](#2-rls-matrix)
3. [API Contract Matrix](#3-api-contract)
4. [Public Application Submission Contract](#4-public-submit-contract)
5. [Parent Applications Contract](#5-parent-contract)
6. [Stripe Webhook Suite](#6-webhook)
7. [Data-Invariant Queries (per flow)](#7-invariants)
8. [Concurrency / Race Conditions](#8-concurrency)
9. [Transaction Boundary Tests](#9-transactions)
10. [Encrypted-field access control](#10-encrypted-fields)
11. [PDF / binary content assertions](#11-pdf)
12. [Rate-limit precision tests](#12-rate-limit)
13. [Observations](#13-observations)
14. [Sign-off](#14-signoff)

---

## 1. Prerequisites & Fixture Seeding <a id="1-prerequisites"></a>

### 1.1 Fixture seeder

All test cases assume two tenants are seeded per `infra/test/fixtures/admissions.seed.ts` (or hand-rolled SQL). Required state:

| Tenant | Slug       | Currency | Upfront % | Pay window (d) | allow_cash | allow_bank | override_role      | Stripe keys (test mode) |
| ------ | ---------- | -------- | --------- | -------------- | ---------- | ---------- | ------------------ | ----------------------- |
| A      | `tenant-a` | EUR      | 100       | 7              | true       | true       | `school_owner`     | configured              |
| B      | `tenant-b` | USD      | 50        | 14             | false      | true       | `school_principal` | configured              |

For each tenant:

- 1 published `AdmissionFormDefinition` (`status='published'`, `version_number=1`).
- 1 `Household` + 2 Parents + 1 enrolled Student for the existing-household test flow.
- Applications in every lifecycle state (see admin spec §1.4 counts).
- `AcademicYear` 2026/27 + 2 `YearGroup` rows (with and without fee structures).
- `FeeStructure` on year_group `Year 1` for Tenant A (enables `NO_FEE_STRUCTURE_CONFIGURED` test on another year_group).

### 1.2 Test users

Per tenant: `admin@…`, `principal@…`, `front_office@…`, `parent@…`, `teacher@…`. All with known JWTs obtainable via a test-only login helper.

### 1.3 Harness infrastructure

- PostgreSQL 15 (matches prod)
- Redis for worker state (but worker NOT running in integration suite — use direct DB assertions; worker behaviour is in `worker/admissions-worker-spec.md`)
- Stripe SDK mocked at boundary for webhook assertions (raw-body HMAC supported)
- `prisma.$on('query', …)` instrumented to count queries per endpoint (for N+1 detection — perf spec uses the same hook)

### 1.4 Seeded UUIDs (record for cross-tenant matrix)

Tester records: `APP_A_RTA` (Tenant A ready_to_admit), `APP_A_CA`, `APP_A_APPROVED`, `APP_A_REJ`, `APP_A_WITH`, `APP_B_RTA`, `APP_B_CA`, `APP_B_APPROVED`. Plus one `form_definition_id` per tenant.

---

## 2. RLS Leakage Matrix <a id="2-rls-matrix"></a>

One matrix row per (table × scenario). Tables: `applications`, `admission_form_definitions`, `admission_form_fields`, `application_notes`, `admission_overrides`, `admissions_payment_events`. All tenant-scoped. `FORCE ROW LEVEL SECURITY` must be enabled.

**Setup:** every test runs in a fresh Prisma interactive transaction with `SET LOCAL app.current_tenant_id = <tenant uuid>` set via the RLS middleware. Raw clients (bypassing middleware) are used only in the assertion phase to prove the constraint.

### 2.1 Table: `applications`

| #     | Scenario                                                                       | Expected Result                                                                                                                                 | Pass/Fail |
| ----- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1.1 | List as Tenant A admin                                                         | Only Tenant A rows. `SELECT DISTINCT tenant_id FROM applications` inside session = `{tenant_a_id}`.                                             |           |
| 2.1.2 | List as Tenant B admin                                                         | Only Tenant B rows.                                                                                                                             |           |
| 2.1.3 | Tenant A authenticated; detail query for `APP_B_RTA`                           | 404 `APPLICATION_NOT_FOUND` (RLS filters the row out; service returns not-found; controller maps to 404).                                       |           |
| 2.1.4 | Tenant A: `POST /v1/applications/:id/review` with `APP_B_APPROVED`             | 404. Row unchanged: `SELECT status FROM applications WHERE id=APP_B_APPROVED;` still = 'approved'.                                              |           |
| 2.1.5 | Tenant A: `POST /v1/applications/:id/withdraw` with `APP_B_RTA`                | 404. Row unchanged.                                                                                                                             |           |
| 2.1.6 | Tenant A: submit public application with forged `tenant_id=<tenant_b>` in body | 201 — but inserted row has `tenant_id=<tenant_a>` (middleware overrides). `SELECT tenant_id FROM applications WHERE id=<new_id>` = tenant_a_id. |           |
| 2.1.7 | Sequence: `application_number` is per-tenant                                   | Create 2 apps in Tenant A, 2 in Tenant B. Numbers 1 and 2 coexist; no conflict. Indexes `(tenant_id, application_number)` unique.               |           |

### 2.2 Table: `admission_form_definitions`

| #     | Scenario                                | Expected Result                                                                                                                                           | Pass/Fail |
| ----- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.2.1 | Tenant A: GET form                      | Returns Tenant A definition only.                                                                                                                         |           |
| 2.2.2 | Tenant A: rebuild form                  | Bumps `version_number`. Tenant B's definition row untouched (verify `SELECT version_number FROM admission_form_definitions WHERE tenant_id=tenant_b_id`). |           |
| 2.2.3 | Public form fetch with tenant-a context | Returns the single published Tenant A definition. Tenant B's def is never returned.                                                                       |           |

### 2.3 Table: `admission_form_fields`

| #     | Scenario                                | Expected Result                                                                                                   | Pass/Fail |
| ----- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 2.3.1 | List as Tenant A                        | Only Tenant A's fields. Never Tenant B's.                                                                         |           |
| 2.3.2 | Rebuild form (Tenant A) replaces fields | `DELETE FROM admission_form_fields WHERE form_definition_id=...` happens within RLS; Tenant B's fields untouched. |           |

### 2.4 Table: `application_notes`

| #     | Scenario                                                                                | Expected Result                                                                                                  | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------- |
| 2.4.1 | Tenant A: list notes for `APP_A_CA`                                                     | Only Tenant A notes.                                                                                             |           |
| 2.4.2 | Tenant A: list notes for `APP_B_CA`                                                     | 404 (application not found for this tenant).                                                                     |           |
| 2.4.3 | Tenant A: `POST` note body for Tenant B application                                     | 404. No note inserted.                                                                                           |           |
| 2.4.4 | Parent: `GET /v1/parent/applications/:id` — response.notes only has `is_internal=false` | Verify response JSON — no `is_internal=true` entries present. Not just filtered on render: filtered in DB query. |           |
| 2.4.5 | Append-only check                                                                       | Schema `\d application_notes` has no `updated_at`, no PATCH endpoint, no soft-delete column.                     |           |

### 2.5 Table: `admission_overrides`

| #     | Scenario                                | Expected Result                                                                                                          | Pass/Fail |
| ----- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| 2.5.1 | Tenant A: `GET /v1/admission-overrides` | Only Tenant A overrides.                                                                                                 |           |
| 2.5.2 | Immutability                            | No endpoint to PATCH or DELETE overrides. `application-state-machine.service.ts` never updates an existing override row. |           |
| 2.5.3 | Approver referential integrity          | `SELECT o.* FROM admission_overrides o LEFT JOIN users u ON u.id=o.approved_by_user_id WHERE u.id IS NULL` → 0 rows.     |           |

### 2.6 Table: `admissions_payment_events`

| #     | Scenario                                      | Expected Result                                                                                           | Pass/Fail |
| ----- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| 2.6.1 | Tenant A list                                 | Only Tenant A events.                                                                                     |           |
| 2.6.2 | `stripe_event_id` unique globally             | Schema: `stripe_event_id` has a unique index (prevents cross-tenant id-reuse collision).                  |           |
| 2.6.3 | Tenant-A-scoped query for Tenant B's event id | Event not visible under Tenant A RLS. Attempting to apply it returns 404 at the application-resolve step. |           |

### 2.7 Aggregate cross-tenant check

| #     | Scenario                                                         | Expected Result                                                                                                         | Pass/Fail |
| ----- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.7.1 | Raw unscoped query `SELECT DISTINCT tenant_id FROM applications` | Returns both tenant ids (no RLS context — this is the DB root; prod never runs queries this way).                       |           |
| 2.7.2 | Running any `$queryRaw` outside the RLS middleware               | Code review / grep: no `$queryRawUnsafe` or `$executeRawUnsafe` outside the RLS policies file. Lint rule enforces this. |           |

**RLS total rows: 22.**

---

## 3. API Contract Matrix <a id="3-api-contract"></a>

One row per (endpoint × input class). Status codes exact. Error bodies follow `{ error: { code, message, details? } }`.

### 3.1 `GET /v1/admissions/dashboard-summary`

| #     | Input                     | Expected                                                                                                                                                                                                                                                   | Pass/Fail |
| ----- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1.1 | Tenant A admin token      | 200. Shape: `{ ready_to_admit, waiting_list, conditional_approval, approved, rejected, overrides, capacity_pressure: [{academic_year_id, year_group_id, total_capacity, enrolled, conditional, available}] }`. Counts match `COUNT(*)` from DB per status. |           |
| 3.1.2 | No token                  | 401 `UNAUTHORIZED`.                                                                                                                                                                                                                                        |           |
| 3.1.3 | Token with role `teacher` | 403 `PERMISSION_DENIED` with required permission string.                                                                                                                                                                                                   |           |
| 3.1.4 | Token with role `parent`  | 403.                                                                                                                                                                                                                                                       |           |

### 3.2 `GET /v1/applications/queues/{queue}`

Covered once generically — each of the 5 queue endpoints gets a matrix row.

| #     | Input                                          | Expected                                                                                                                       | Pass/Fail |
| ----- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 3.2.1 | Valid queue token                              | 200. Shape: `{ data: [...], meta: { total, page, pageSize, ...queue-specific } }`. `data[*].tenant_id` = authenticated tenant. |           |
| 3.2.2 | Unknown queue name                             | 404 (route doesn't match) OR 400 `UNKNOWN_QUEUE`.                                                                              |           |
| 3.2.3 | pageSize > 100                                 | 400 `BAD_REQUEST` via pagination schema.                                                                                       |           |
| 3.2.4 | `?search=<10,000 chars>`                       | 400 — Zod max 200.                                                                                                             |           |
| 3.2.5 | `?status=<invalid enum>` on `/v1/applications` | 400 `BAD_REQUEST` — enum check.                                                                                                |           |

### 3.3 `POST /v1/applications/:id/review`

| #      | Input                                                                                       | Expected                                                         | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------- |
| 3.3.1  | Valid approval to conditional_approval + expected_updated_at correct                        | 200. Response updated application. DB side-effects listed below. |           |
| 3.3.2  | `expected_updated_at` missing                                                               | 400 Zod.                                                         |           |
| 3.3.3  | `expected_updated_at` stale                                                                 | 409 `CONCURRENT_MODIFICATION`.                                   |           |
| 3.3.4  | `rejection_reason` > 5000 chars                                                             | 400 Zod.                                                         |           |
| 3.3.5  | `status='approved'` from ready_to_admit (skipping payment)                                  | 400 `INVALID_STATUS_TRANSITION`.                                 |           |
| 3.3.6  | `status='conditional_approval'` on app with no fee structure                                | 400 `NO_FEE_STRUCTURE_CONFIGURED`.                               |           |
| 3.3.7  | `status='conditional_approval'` on app where year_group has 0 available seats               | 400 `NO_AVAILABLE_SEATS`.                                        |           |
| 3.3.8  | Token without `admissions.manage`                                                           | 403.                                                             |           |
| 3.3.9  | No token                                                                                    | 401.                                                             |           |
| 3.3.10 | Cross-tenant id                                                                             | 404.                                                             |           |
| 3.3.11 | Invalid UUID                                                                                | 400 `BAD_UUID` (ParseUUIDPipe).                                  |           |
| 3.3.12 | State transition matrix (19 rows in admin spec §28) — each INVALID row gets a contract test | 400 `INVALID_STATUS_TRANSITION` with machine-readable code.      |           |

### 3.4 `POST /v1/applications/:id/withdraw`

| #     | Input                             | Expected                                | Pass/Fail |
| ----- | --------------------------------- | --------------------------------------- | --------- |
| 3.4.1 | Staff admin on ready_to_admit     | 200. Status → withdrawn. Seat released. |           |
| 3.4.2 | Staff admin on approved           | 400 `INVALID_STATUS_TRANSITION`.        |           |
| 3.4.3 | Token without `admissions.manage` | 403.                                    |           |
| 3.4.4 | Cross-tenant                      | 404.                                    |           |

### 3.5 `POST /v1/applications/:id/manual-promote`

| #     | Input                                                              | Expected                                                           | Pass/Fail |
| ----- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | --------- |
| 3.5.1 | Valid justification 50 chars, seats available                      | 200.                                                               |           |
| 3.5.2 | Justification 9 chars                                              | 400 Zod.                                                           |           |
| 3.5.3 | Justification 2001 chars                                           | 400 Zod.                                                           |           |
| 3.5.4 | On application with `waiting_list_substatus='awaiting_year_setup'` | 400 `YEAR_GROUP_NOT_SET_UP`.                                       |           |
| 3.5.5 | Year group has 0 seats                                             | 400 `NO_AVAILABLE_SEATS`.                                          |           |
| 3.5.6 | From `ready_to_admit` state                                        | 400 `INVALID_STATUS_TRANSITION` (only waiting_list is promotable). |           |

### 3.6 `POST /v1/applications/:id/payment/cash`

| #     | Input                                                | Expected                                                                                                 | Pass/Fail |
| ----- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------- |
| 3.6.1 | Valid amount (= expected), receipt_number `CASH-001` | 200. Status → approved. Student materialised. Invoice+Payment+Allocation created. ApplicationNote added. |           |
| 3.6.2 | amount = 0                                           | 400 Zod "positive".                                                                                      |           |
| 3.6.3 | amount ≠ expected                                    | 400 `AMOUNT_MISMATCH`.                                                                                   |           |
| 3.6.4 | `allow_cash=false` tenant setting                    | 400 `CASH_PAYMENT_DISABLED`.                                                                             |           |
| 3.6.5 | Non-conditional_approval state                       | 400 `INVALID_STATUS`.                                                                                    |           |
| 3.6.6 | Token without `admissions.manage`                    | 403.                                                                                                     |           |

### 3.7 `POST /v1/applications/:id/payment/bank-transfer`

| #     | Input                                                     | Expected                      | Pass/Fail |
| ----- | --------------------------------------------------------- | ----------------------------- | --------- |
| 3.7.1 | Valid amount + reference `BANK-001` + transfer_date today | 200.                          |           |
| 3.7.2 | Empty `transfer_reference`                                | 400 Zod.                      |           |
| 3.7.3 | `transfer_date` in future                                 | 400 Zod/refinement.           |           |
| 3.7.4 | `allow_bank_transfer=false`                               | 400 `BANK_TRANSFER_DISABLED`. |           |
| 3.7.5 | Non-conditional_approval                                  | 400.                          |           |

### 3.8 `POST /v1/applications/:id/payment/override`

| #     | Input                                                                                       | Expected                                                                                         | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| 3.8.1 | Authorised role + `full_waiver` + actual_amount=0 + justification 25 chars                  | 200. AdmissionOverride row. Status → approved. Finance records with `payment_source='override'`. |           |
| 3.8.2 | Justification 19 chars                                                                      | 400 Zod.                                                                                         |           |
| 3.8.3 | Justification 2001 chars                                                                    | 400 Zod.                                                                                         |           |
| 3.8.4 | `override_type='partial_waiver'` + actual > expected                                        | 400 `OVERRIDE_AMOUNT_EXCEEDS_EXPECTED`.                                                          |           |
| 3.8.5 | Token with `admissions.manage` but wrong role (e.g. admin in Tenant A where owner required) | 403 `OVERRIDE_ROLE_REQUIRED`.                                                                    |           |
| 3.8.6 | Actual amount negative                                                                      | 400 Zod.                                                                                         |           |
| 3.8.7 | Concurrent double-submit                                                                    | Second request → 409 `CONCURRENT_MODIFICATION` or 400 `INVALID_STATUS` (row already approved).   |           |

### 3.9 `POST /v1/applications/:id/payment-link/regenerate`

| #     | Input                                              | Expected                                                                                                         | Pass/Fail |
| ----- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------- |
| 3.9.1 | Valid conditional_approval, Stripe keys configured | 200. `stripe_checkout_session_id` updated. New Stripe session created with correct amount + currency + metadata. |           |
| 3.9.2 | Non-conditional_approval                           | 400 `INVALID_STATUS`.                                                                                            |           |
| 3.9.3 | Stripe keys missing                                | 412 `STRIPE_NOT_CONFIGURED` (or 400 with same code).                                                             |           |
| 3.9.4 | Cross-tenant                                       | 404.                                                                                                             |           |

### 3.10 `POST /v1/applications/:applicationId/notes`

| #      | Input                             | Expected                            | Pass/Fail |
| ------ | --------------------------------- | ----------------------------------- | --------- |
| 3.10.1 | Valid `note` + `is_internal=true` | 201. Row created. Author = user_id. |           |
| 3.10.2 | Empty note                        | 400 Zod.                            |           |
| 3.10.3 | 10,001 char note                  | 400 Zod.                            |           |
| 3.10.4 | Unauth                            | 401.                                |           |
| 3.10.5 | Parent token                      | 403.                                |           |

### 3.11 `GET /v1/applications/:applicationId/notes`

| #      | Input                                              | Expected                                                | Pass/Fail |
| ------ | -------------------------------------------------- | ------------------------------------------------------- | --------- |
| 3.11.1 | Admin of application's tenant                      | 200 with all notes.                                     |           |
| 3.11.2 | Cross-tenant admin                                 | 404.                                                    |           |
| 3.11.3 | Parent (owner) — via `/v1/parent/applications/:id` | Response has notes array with only `is_internal=false`. |           |

### 3.12 `GET /v1/admission-forms/system` / `POST /v1/admission-forms/system/rebuild`

| #      | Input                       | Expected                                                                                           | Pass/Fail |
| ------ | --------------------------- | -------------------------------------------------------------------------------------------------- | --------- |
| 3.12.1 | Admin GET                   | 200 with `{ definition, fields }`.                                                                 |           |
| 3.12.2 | Admin rebuild               | 200. `version_number` incremented. Old fields deleted, new fields inserted within RLS transaction. |           |
| 3.12.3 | Admin rebuild twice rapidly | Both 200, versions N and N+1 exist. No in-flight race-condition conflict (transaction serialises). |           |
| 3.12.4 | Non-admin rebuild           | 403.                                                                                               |           |

### 3.13 `GET /v1/admission-overrides`

| #      | Input     | Expected            | Pass/Fail |
| ------ | --------- | ------------------- | --------- |
| 3.13.1 | Admin     | 200 paginated list. |           |
| 3.13.2 | Non-admin | 403.                |           |

**Contract matrix total rows: ~75.**

---

## 4. Public Application Submission Contract <a id="4-public-submit-contract"></a>

`POST /v1/public/admissions/applications`. No auth. IP rate-limited.

| #    | Input                                                                        | Expected                                                                                                                                   | Pass/Fail |
| ---- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 4.1  | Valid new-household, 1 student                                               | 201. Response `{ applications: [{ id, application_number, status }] }`. DB: 1 Application row, 1 submission_batch_id, status per capacity. |           |
| 4.2  | Valid new-household, 20 students                                             | 201. 20 rows created, all share same `submission_batch_id`.                                                                                |           |
| 4.3  | 21 students                                                                  | 400 Zod `TOO_MANY_STUDENTS`.                                                                                                               |           |
| 4.4  | 0 students                                                                   | 400 Zod.                                                                                                                                   |           |
| 4.5  | Honeypot `website_url='http://spam.com'`                                     | 200/201 response but NO rows created. Verify with `SELECT COUNT(*) FROM applications WHERE student_first_name=<submitted_first_name>` = 0. |           |
| 4.6  | Same IP submitting 6 times within rate-limit window (5/hour)                 | 6th request → 429. Verify `Retry-After` header present.                                                                                    |           |
| 4.7  | Existing-household mode with valid `existing_household_id` + email match     | 201. New rows have `household_id = existing_household_id`. No duplicate household created.                                                 |           |
| 4.8  | Existing-household mode with mismatched email                                | 404 `HOUSEHOLD_NOT_FOUND` (anti-enumeration — same code whether id wrong or email wrong).                                                  |           |
| 4.9  | `existing_household_id` from another tenant                                  | 404 (cross-tenant).                                                                                                                        |           |
| 4.10 | Duplicate `national_id` within the same tenant                               | 409 `DUPLICATE_NATIONAL_ID`.                                                                                                               |           |
| 4.11 | `target_academic_year_id` from another tenant                                | 400 `INVALID_TARGET_YEAR` or 404.                                                                                                          |           |
| 4.12 | `target_year_group_id` not on that academic year                             | 400 `INVALID_TARGET_YEAR_GROUP`.                                                                                                           |           |
| 4.13 | `date_of_birth` in future                                                    | 400 Zod refine.                                                                                                                            |           |
| 4.14 | `gender` outside enum                                                        | 400 Zod.                                                                                                                                   |           |
| 4.15 | Missing required consent `health_data`                                       | 400 Zod.                                                                                                                                   |           |
| 4.16 | Invalid email format                                                         | 400 Zod.                                                                                                                                   |           |
| 4.17 | Invalid phone format                                                         | 400 Zod.                                                                                                                                   |           |
| 4.18 | Missing `form_definition_id`                                                 | 400 Zod.                                                                                                                                   |           |
| 4.19 | `form_definition_id` from another tenant                                     | 400 `INVALID_FORM_DEFINITION` or 404.                                                                                                      |           |
| 4.20 | Multi-student batch where some go to ready_to_admit and some to waiting_list | 201. Rows have correct status each. All share `submission_batch_id`.                                                                       |           |
| 4.21 | Request with `Content-Type` other than `application/json`                    | 415 `UNSUPPORTED_MEDIA_TYPE`.                                                                                                              |           |

---

## 5. Parent Applications Contract <a id="5-parent-contract"></a>

`GET /v1/parent/applications`, `GET /v1/parent/applications/:id`, `POST /v1/parent/applications/:id/withdraw`.

| #   | Input                                                | Expected                                                                                                                           | Pass/Fail |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1 | Valid parent token; list                             | 200. Only rows where `submitted_by_parent_id = parent.id`. Response excludes other parents' rows even if same tenant.              |           |
| 5.2 | Parent token; detail of own application              | 200. Notes filtered to `is_internal=false`.                                                                                        |           |
| 5.3 | Parent token; detail of another parent's application | 404 `APPLICATION_NOT_FOUND`.                                                                                                       |           |
| 5.4 | Parent token; detail of a cross-tenant application   | 404.                                                                                                                               |           |
| 5.5 | Parent token; withdraw own active application        | 200. Status → withdrawn.                                                                                                           |           |
| 5.6 | Parent token; withdraw on terminal state             | 400 `INVALID_STATUS_TRANSITION`.                                                                                                   |           |
| 5.7 | Parent token; withdraw another parent's application  | 404.                                                                                                                               |           |
| 5.8 | Admin token hitting `/v1/parent/applications`        | Either 200 with that admin's linked-parent-account rows, or 200 with empty if no parent linkage. Must NOT return all applications. |           |
| 5.9 | Unauth GET                                           | 401.                                                                                                                               |           |

---

## 6. Stripe Webhook Suite <a id="6-webhook"></a>

Endpoint: `/v1/finance/stripe/webhook` (handled by Finance module, dispatched to admissions for admission events). Raw-body HMAC; `@SkipThrottle()` applied.

| #    | Scenario                                                                                                                                     | Expected                                                                                                                                                                                                                 | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 6.1  | POST without `Stripe-Signature`                                                                                                              | 400 `INVALID_SIGNATURE`. No DB writes.                                                                                                                                                                                   |           |
| 6.2  | POST with wrong signature (wrong secret)                                                                                                     | 400 `INVALID_SIGNATURE`.                                                                                                                                                                                                 |           |
| 6.3  | Valid signature + event `checkout.session.completed` with `metadata.purpose='admissions'` + expected `amount_total` + known `application_id` | 200 `received`. DB: application → approved, AdmissionsPaymentEvent row with `status='succeeded'`, Student materialised, Invoice+Payment+Allocation created.                                                              |           |
| 6.4  | Same event replayed (same `event.id`)                                                                                                        | 200 but NO duplicate side effects. Verify: `SELECT COUNT(*) FROM admissions_payment_events WHERE stripe_event_id=<id>` = 1. Application still in approved state (no state change to idempotent re-apply).                |           |
| 6.5  | Valid signature, `metadata.application_id` missing                                                                                           | 400 `MISSING_APPLICATION_ID` or passes through to Finance handler. No admission side effect.                                                                                                                             |           |
| 6.6  | Valid signature, `metadata.tenant_id` belongs to Tenant A but `application_id` belongs to Tenant B                                           | 400 `TENANT_MISMATCH` and/or 404. No side effects.                                                                                                                                                                       |           |
| 6.7  | Valid signature, `amount_total` does NOT match `application.payment_amount_cents`                                                            | 400 `AMOUNT_MISMATCH` and log an `AdmissionsPaymentEvent` with `status='failed'` for forensic record. Application NOT transitioned to approved.                                                                          |           |
| 6.8  | Valid signature, application is NOT in `conditional_approval` (e.g. already approved via override)                                           | Event record logged with `status='received_out_of_band'`. No status change. 200 response.                                                                                                                                |           |
| 6.9  | `checkout.session.expired` event                                                                                                             | Acknowledged (200). No state change; the `payment-expiry` cron handles expiration authoritatively. A note could be added to the application (implementation-dependent).                                                  |           |
| 6.10 | `payment_intent.payment_failed` event                                                                                                        | Acknowledged. No state change.                                                                                                                                                                                           |           |
| 6.11 | Unknown event type                                                                                                                           | 200 `ignored`.                                                                                                                                                                                                           |           |
| 6.12 | Rate-limit exempt                                                                                                                            | 1000 valid webhook events in 1 minute → all processed (no 429 from IP throttle). Verify `@SkipThrottle()` decorator on the route.                                                                                        |           |
| 6.13 | Raw body handling                                                                                                                            | Posting JSON-re-serialised body with same signature → `INVALID_SIGNATURE` (Stripe signatures are byte-exact). Must use `express.raw()` or equivalent on this route.                                                      |           |
| 6.14 | Event `event.id` already in DB but different tenant                                                                                          | `stripe_event_id` has global unique index — second tenant insert would fail. Should be impossible since Stripe events are unique across their whole account. Test by inserting duplicate manually → unique violation.    |           |
| 6.15 | Under load: 50 concurrent webhook posts with different event ids for the same application_id                                                 | Exactly one produces the approved transition (SELECT FOR UPDATE in markApproved serialises). Others get `received_out_of_band` or 400 depending on race. DB: exactly one transition, exactly one set of finance records. |           |

**Webhook tests total: 15.**

---

## 7. Data-Invariant Queries (per flow) <a id="7-invariants"></a>

Run after each flow. Each row is one SQL assertion.

| #    | After flow                                   | Query                                                                                                                                                    | Expected                                         | Pass/Fail |
| ---- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------- |
| 7.1  | Public submit (Flow A)                       | `SELECT status FROM applications WHERE id=?`                                                                                                             | `ready_to_admit` OR `waiting_list`               |           |
| 7.2  | Public submit                                | `SELECT submission_batch_id FROM applications WHERE id IN (...)` for all students in batch                                                               | All same UUID                                    |           |
| 7.3  | Public submit                                | `SELECT tenant_id FROM applications WHERE id=?`                                                                                                          | = requester's tenant_id                          |           |
| 7.4  | Approve to conditional_approval              | `SELECT payment_amount_cents, payment_deadline FROM applications WHERE id=?`                                                                             | Both non-null; amount > 0                        |           |
| 7.5  | Approve                                      | `SELECT COUNT(*) FROM applications WHERE tenant_id=? AND target_year_group_id=? AND status IN ('ready_to_admit','conditional_approval')` before vs after | After = Before + 0 (moved internally)            |           |
| 7.6  | Approve                                      | `SELECT ready_to_admit_count FROM dashboard_summary(?)` (derived)                                                                                        | Decreased by 1                                   |           |
| 7.7  | Stripe webhook success                       | `SELECT COUNT(*) FROM admissions_payment_events WHERE application_id=? AND status='succeeded'`                                                           | ≥ 1                                              |           |
| 7.8  | Stripe webhook replay                        | Same query                                                                                                                                               | Still = 1 (idempotent)                           |           |
| 7.9  | Stripe webhook success                       | `SELECT materialised_student_id FROM applications WHERE id=?`                                                                                            | NOT NULL                                         |           |
| 7.10 | Stripe webhook success                       | `SELECT COUNT(*) FROM students WHERE id=? AND tenant_id=?`                                                                                               | = 1                                              |           |
| 7.11 | Any payment path (stripe/cash/bank/override) | `SELECT COUNT(*) FROM invoices WHERE household_id=? AND academic_year_id=?`                                                                              | ≥ 1                                              |           |
| 7.12 | Any payment path                             | `SELECT SUM(allocated_amount) FROM payment_allocations WHERE invoice_id=?`                                                                               | = amount paid                                    |           |
| 7.13 | Any payment path                             | Invoice balance formula: `total - SUM(alloc) - writeoff`                                                                                                 | = `balance_amount` ±0.01                         |           |
| 7.14 | Cash payment                                 | `SELECT payment_source FROM payments WHERE id=?`                                                                                                         | = 'cash'                                         |           |
| 7.15 | Bank transfer                                | Same                                                                                                                                                     | = 'bank_transfer'                                |           |
| 7.16 | Override                                     | Same                                                                                                                                                     | = 'override'                                     |           |
| 7.17 | Override                                     | `SELECT COUNT(*) FROM admission_overrides WHERE application_id=?`                                                                                        | = 1                                              |           |
| 7.18 | Override                                     | `SELECT actual_amount_cents, expected_amount_cents FROM admission_overrides WHERE application_id=?`                                                      | actual ≤ expected                                |           |
| 7.19 | Reject                                       | `SELECT status, rejection_reason FROM applications WHERE id=?`                                                                                           | status='rejected'; reason not null               |           |
| 7.20 | Reject from holding state                    | Seats available count                                                                                                                                    | Increased by 1                                   |           |
| 7.21 | Withdraw                                     | `SELECT status FROM applications WHERE id=?`                                                                                                             | = 'withdrawn'                                    |           |
| 7.22 | Withdraw from holding state                  | Seats available                                                                                                                                          | Increased by 1                                   |           |
| 7.23 | Auto-promotion (after seat free)             | Next waiting_list row (FIFO) `SELECT status FROM applications WHERE ...`                                                                                 | = 'ready_to_admit'                               |           |
| 7.24 | Payment expiry cron                          | `SELECT status, payment_amount_cents, payment_deadline FROM applications WHERE id=?`                                                                     | status='waiting_list'; amount/deadline NULL      |           |
| 7.25 | Payment expiry cron                          | `SELECT COUNT(*) FROM application_notes WHERE application_id=? AND note LIKE '%payment_expired%'`                                                        | ≥ 1                                              |           |
| 7.26 | Rebuild form                                 | `SELECT version_number FROM admission_form_definitions WHERE tenant_id=? AND status='published'`                                                         | incremented by 1                                 |           |
| 7.27 | Rebuild form                                 | `SELECT COUNT(*) FROM admission_form_fields WHERE form_definition_id=<new>`                                                                              | = expected count from shared config              |           |
| 7.28 | Any mutating flow — audit log                | `SELECT * FROM audit_logs WHERE entity_type='application' AND entity_id=?` (if audit-log table exists module-wide)                                       | Row present with actor_id, before/after payloads |           |
| 7.29 | Any flow — tenant_id column                  | `SELECT DISTINCT tenant_id FROM applications` (inside RLS session)                                                                                       | single value                                     |           |
| 7.30 | Application_number monotonic                 | `SELECT application_number FROM applications WHERE tenant_id=? ORDER BY created_at` — extract numeric suffix                                             | strictly monotonic                               |           |

---

## 8. Concurrency / Race Conditions <a id="8-concurrency"></a>

All tests use `Promise.all` of N concurrent requests or parallel harness workers.

| #    | Scenario                                                                                                    | Expected                                                                                                                                                                                                   | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1  | 10 concurrent `POST /v1/applications/:id/review { status: 'conditional_approval' }` on the SAME application | Exactly 1 succeeds (200). 9 fail with 409 `CONCURRENT_MODIFICATION` or 400 `INVALID_STATUS_TRANSITION`. Exactly one AdmissionsPaymentLink job enqueued.                                                    |           |
| 8.2  | 5 concurrent approvals on DIFFERENT applications in the same year_group with capacity 1 remaining           | At most 1 succeeds. Others fail with 400 `NO_AVAILABLE_SEATS`. Verify `SELECT COUNT(*) FROM applications WHERE status IN ('ready_to_admit','conditional_approval') AND target_year_group_id=?` ≤ capacity. |           |
| 8.3  | 2 concurrent Stripe webhook deliveries for the same `event.id`                                              | One succeeds, one no-ops (idempotency via unique constraint). Exactly one transition.                                                                                                                      |           |
| 8.4  | Stripe webhook success racing with admin cash-payment on the same application                               | Whichever transitions the row first wins. Second call gets 400 `INVALID_STATUS`. No double approval; no double finance records.                                                                            |           |
| 8.5  | Payment-expiry cron racing with Stripe webhook (payment completed 14m before deadline)                      | Exactly one path takes effect. The loser's side effect is rolled back. No partial state (e.g. finance records created but status reverted).                                                                |           |
| 8.6  | Auto-promotion: seat freed, 5 concurrent cron ticks                                                         | Exactly one promotes the next FIFO applicant. `SELECT ... FOR UPDATE SKIP LOCKED` ensures no double promotion.                                                                                             |           |
| 8.7  | Manual promote racing: 2 admins promote 2 different waiting_list apps into a year_group with 1 seat         | Both SUCCEED (promote sets status but doesn't consume seat). Later, only first to reach conditional_approval gets the seat. See admin spec OB-11 for product decision.                                     |           |
| 8.8  | Override approval double-submit                                                                             | Second request 409 or 400. Only 1 AdmissionOverride row created.                                                                                                                                           |           |
| 8.9  | Concurrent public applications with same `national_id` (race against unique index)                          | Exactly 1 succeeds; others 409 `DUPLICATE_NATIONAL_ID`.                                                                                                                                                    |           |
| 8.10 | Concurrent form rebuilds                                                                                    | Both produce new version numbers (N, N+1). No version-number collision.                                                                                                                                    |           |

---

## 9. Transaction Boundary Tests <a id="9-transactions"></a>

| #   | Scenario                                                                                                                 | Expected                                                                                                                                           | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1 | Force a failure AFTER Student creation but BEFORE Invoice creation in `markApproved` path (mock finance bridge to throw) | Entire transaction rolls back. Application still in `conditional_approval`. No Student, no Invoice. Verify via post-failure SELECT.                |           |
| 9.2 | Force a failure AFTER AdmissionsPaymentEvent insert but BEFORE markApproved                                              | Transaction rolls back. No event row visible (the failure was inside the same tx).                                                                 |           |
| 9.3 | Verify RLS context is set BEFORE any read                                                                                | `SHOW app.current_tenant_id` right after first DB operation inside the service tx returns the expected tenant_id.                                  |           |
| 9.4 | Sequential transactions in a service method (prohibited by CLAUDE.md)                                                    | Lint rule `no-sequential-transaction`: `turbo lint` rejects any `prisma.$transaction([...])` batch usage in admissions module.                     |           |
| 9.5 | External-to-transaction reads observe only committed state                                                               | During a long conditional_approval transition, another session reading the application sees the PRE-transition state until commit. No dirty reads. |           |
| 9.6 | Transaction timeout / connection loss mid-flow                                                                           | Request gets 500. No partial writes (rollback at Postgres level).                                                                                  |           |

---

## 10. Encrypted-field access control <a id="10-encrypted-fields"></a>

Admissions module has NO directly-encrypted columns (unlike finance/Stripe keys in the Tenant settings). Stripe keys are encrypted in `tenants.stripe_secret_key_encrypted` and consumed by `StripeService.decryptKey()`.

| #    | Scenario                                 | Expected                                                                                                                                              | Pass/Fail |
| ---- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1 | Reading tenant Stripe key via raw SELECT | Returns ciphertext (base64 or bytes), never plaintext.                                                                                                |           |
| 10.2 | Reading via decryption service           | Returns plaintext `sk_test_...`. Audit log entry written with actor_id, timestamp.                                                                    |           |
| 10.3 | Stripe key in any API response           | Masked to last 4 chars (e.g. `sk_...4242`) if surfaced at all. Verify no endpoint in admissions returns the key.                                      |           |
| 10.4 | Stripe key in logs                       | `grep -r sk_test_ logs/` during a test flow → 0 matches. Redacted at logger boundary.                                                                 |           |
| 10.5 | Stripe key in stack traces               | Force an error that includes the key in a rejected Promise → verify the stack-trace printer redacts the key.                                          |           |
| 10.6 | Key rotation                             | Deploy a new encryption key alongside old; re-encrypt all tenants. Reads continue to decrypt successfully. Old key can be retired after verification. |           |

Admissions' applicant fields (national_id, DOB, address, phone) are NOT currently encrypted at rest — this may be a compliance gap for GDPR sensitive data. Flag under observations.

---

## 11. PDF / Binary Content Assertions <a id="11-pdf"></a>

Admissions does not currently render PDFs as a primary deliverable. However, the "Export PDF" of application preview (`GET /v1/applications/:id/preview?format=pdf`) and the admin receipt of a payment are candidates.

| #    | Scenario                                                           | Expected                                                                                                                                            | Pass/Fail |
| ---- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1 | GET `/v1/applications/:id/preview?format=pdf` (if endpoint exists) | 200. `Content-Type: application/pdf`. `Content-Disposition: attachment; filename="application-{application_number}.pdf"`. Body starts with `%PDF-`. |           |
| 11.2 | Parseable by `pdf-parse`                                           | `pdf-parse(body)` returns text with student name, application_number, submitted_at.                                                                 |           |
| 11.3 | Arabic locale                                                      | `?locale=ar` → PDF body contains Arabic text (verify non-ASCII characters present). Gregorian dates + Western numerals.                             |           |
| 11.4 | Tenant branding                                                    | PDF header references tenant_branding (logo / name). Verify extracted text includes tenant name.                                                    |           |
| 11.5 | Cross-tenant                                                       | Tenant A user requesting Tenant B application PDF → 404.                                                                                            |           |

If the endpoint does not exist, rows 11.1–11.5 become N/A with a note "Admissions module ships no PDF export as of 2026-04-12 — flagged for product decision."

---

## 12. Rate-limit precision tests <a id="12-rate-limit"></a>

| #    | Scenario                                             | Expected                                                                                                                                             | Pass/Fail |
| ---- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | 5 requests from IP X in 1-hour window (limit 5/hour) | All 5 succeed.                                                                                                                                       |           |
| 12.2 | 6th request                                          | 429 with `Retry-After` header.                                                                                                                       |           |
| 12.3 | Concurrent burst of 10 requests from same IP         | First 5 succeed, remainder 429. Redis/memcache key is atomic.                                                                                        |           |
| 12.4 | Different IP (separate header)                       | Fresh bucket.                                                                                                                                        |           |
| 12.5 | Per-tenant bucket                                    | Same IP submitting to Tenant A (at limit) can still submit to Tenant B (separate bucket). Verify both via direct request with distinct Host headers. |           |
| 12.6 | IP spoofing via `X-Forwarded-For`                    | Only the configured trust-proxy header (`cf-connecting-ip` preferred) is honoured. Random `X-Forwarded-For` alone does NOT reset the bucket.         |           |
| 12.7 | Rate-limit bypass via missing IP                     | Falls back to `request.ip` (socket IP). Shared gateway IP → all users bucketed together. Security spec tracks this as a gap.                         |           |
| 12.8 | Rate-limit on staff endpoints                        | Staff endpoints are NOT rate-limited by IP (authenticated burst is expected). Verify `@SkipThrottle()` or absence of limiter.                        |           |

---

## 13. Observations <a id="13-observations"></a>

| #     | Severity | Location                                                             | Observation                                                                                                                                                                                                                                     |
| ----- | -------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IN-01 | P1       | `applications.service.ts` / seat allocation                          | Admin spec OB-04 — capacity lock only covers the row, not the year_group. An integration test MUST show either (a) capacity is enforced at insert via DB constraint, (b) a capacity-level lock is taken in the transition path. Otherwise race. |
| IN-02 | P2       | Stripe webhook handler                                               | Confirm raw-body posting tests catch a JSON-re-serialised body. Integration tests have historically been bypassing this by using Stripe SDK mocks that pre-sign the body.                                                                       |
| IN-03 | P2       | Application GDPR fields                                              | `national_id`, `date_of_birth`, `address_line_1`, `medical_notes` are stored as plaintext. Compliance gap: consider column-level encryption (like tenant settings) or field-level access logging.                                               |
| IN-04 | P3       | Public submission response echoes payload back                       | Response includes full applications array — ensure no PII beyond what's necessary for the confirmation page is returned (e.g. do not echo consents back to the client).                                                                         |
| IN-05 | P2       | Rate-limit key derivation                                            | Per admin spec OB-07 — if the deployment is behind a proxy other than Cloudflare, the limiter becomes useless. Integration suite should set a known `cf-connecting-ip` and verify behaviour; staging/prod checks belong elsewhere.              |
| IN-06 | P1       | `admissions_payment_events.stripe_event_id` unique constraint        | Schema: this is globally unique. Test insert of a duplicate id → `P2002` unique violation. Idempotency relies on this — must not be dropped in a future migration.                                                                              |
| IN-07 | P2       | `markApproved` is called from 4 paths (Stripe, cash, bank, override) | Ensure each path sets `payment_source` correctly on the Payment row AND creates an AdmissionsPaymentEvent (even for non-Stripe, for audit symmetry). Current Stripe path always writes; cash/bank may skip it.                                  |
| IN-08 | P2       | Existing-household lookup                                            | If the lookup uses two separate queries (email → parent, household → verify), an attacker could time-attack the responses. Integration test should measure wall-clock response times across success/failure paths.                              |
| IN-09 | P3       | `AdmissionsFinanceBridgeService` invoice line naming                 | Verify line descriptions are locale-neutral (not English-only), since the invoice may be generated for Arabic tenants.                                                                                                                          |
| IN-10 | P2       | Concurrent `manually promote` — see admin spec OB-11                 | Integration tests must exercise the race and verify either a lock or a product-acceptable overshoot.                                                                                                                                            |

---

## 14. Sign-off <a id="14-signoff"></a>

| Section                        | Reviewer | Date | Pass | Fail | Notes |
| ------------------------------ | -------- | ---- | ---- | ---- | ----- |
| 2 — RLS matrix                 |          |      |      |      |       |
| 3 — API contract matrix        |          |      |      |      |       |
| 4 — Public submission contract |          |      |      |      |       |
| 5 — Parent contract            |          |      |      |      |       |
| 6 — Stripe webhook suite       |          |      |      |      |       |
| 7 — Data invariants            |          |      |      |      |       |
| 8 — Concurrency                |          |      |      |      |       |
| 9 — Transactions               |          |      |      |      |       |
| 10 — Encrypted fields          |          |      |      |      |       |
| 11 — PDF (if applicable)       |          |      |      |      |       |
| 12 — Rate-limit                |          |      |      |      |       |
| **Overall**                    |          |      |      |      |       |

**Module integration release-ready when every section passes and the capacity-level race and GDPR fields observations are triaged.**
