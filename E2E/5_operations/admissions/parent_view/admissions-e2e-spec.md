# Admissions Module — Parent / Public E2E Test Specification

**Module:** Admissions (Operations)
**Perspective:** Prospective applicant (public, unauthenticated) + authenticated Parent portal user
**Pages Covered:** 7 public routes + 2 authenticated parent routes
**Backend endpoints exercised:** 5 (see §13)
**Spec version:** 1.0 (2026-04-12)
**Pack companion:** part of `/e2e-full admissions` — admin + integration + worker + perf + security specs live alongside

**Note on teacher_view / student_view:** Admissions does NOT have teacher-facing or student-facing surfaces. Teachers have zero permissions on the module; students do not exist as users until an approved application materialises a Student record. See `RELEASE-READINESS.md` for the justified N/A.

---

## Table of Contents

1. [Prerequisites & Test Data](#1-prerequisites)
2. [Out of Scope](#2-out-of-scope)
3. [Public Apply — Landing `/apply`](#3-public-apply-landing)
4. [Public Apply — Tenant Form `/apply/[tenantSlug]`](#4-public-apply-tenant)
5. [Public Apply — Students section (repeater)](#5-students-section)
6. [Public Apply — Submit + confirmation](#6-public-submit)
7. [Public Apply — Payment Success / Cancelled](#7-payment-callbacks)
8. [Parent Portal — `/applications` list](#8-parent-list)
9. [Parent Portal — `/applications/:id` detail & withdraw](#9-parent-detail)
10. [Honeypot + Rate Limiting (UI-visible side)](#10-honeypot-ratelimit)
11. [Arabic / RTL](#11-rtl)
12. [Console & Network Health](#12-console-network)
13. [Backend Endpoint Map](#13-endpoint-map)
14. [Observations](#14-observations)
15. [Sign-off](#15-signoff)

---

## 1. Prerequisites & Test Data <a id="1-prerequisites"></a>

Multi-tenant, as in the admin spec (§1 of `admin_view/admissions-e2e-spec.md`). Additional requirements for this spec:

### 1.1 Two tenant slugs reachable without auth

- `tenant-a` — form published, Year 1 + Year 2 seeded
- `tenant-b` — form published, different currency, different field label translations

### 1.2 Existing-household credentials

Tenant A must have at least one pre-existing `Household` with:

- Two Parent rows (primary + secondary) with known email addresses
- At least one enrolled Student (so the Household appears in the "existing family" picker)

The test will later submit a "sibling" application against this household.

### 1.3 Public apply URLs

- `/en/apply` — tenant picker
- `/en/apply/tenant-a` — tenant-a multi-step form
- `/en/apply/tenant-b` — tenant-b form
- `/en/apply/tenant-a/submitted` — confirmation page
- `/en/apply/payment-success` — Stripe success callback (root, no tenant slug)
- `/en/apply/payment-cancelled` — Stripe cancelled callback (root)

Plus per-tenant variants: `/en/apply/tenant-a/payment-success`, `/en/apply/tenant-a/payment-cancelled`.

### 1.4 Seeded applications for parent portal

For the parent account `parent@tenant-a`:

- 1 application in `submitted` (unlikely — transient)
- 1 in `ready_to_admit`
- 1 in `conditional_approval` (active payment link)
- 1 in `approved`
- 1 in `rejected` (with `rejection_reason`)
- 1 in `withdrawn`
- 1 sibling batch of 2 students (one approved, one waiting_list)

### 1.5 Rate-limit fixture

The public endpoint enforces `AdmissionsRateLimitService.checkPublicFormSubmission(tenantId, ip, limit?, window?)`. Configure known limit (e.g. 5 submissions per IP per hour) for a test tenant so §10 can hit the limit deterministically.

### 1.6 Notification fixtures

Parent account must have a valid email address so parent-visible notifications (submission confirmation, payment-link, approval, rejection, withdrawal, force-approved) reach a mailbox the tester can read. Use a catch-all mail relay like MailHog for local runs.

---

## 2. Out of Scope <a id="2-out-of-scope"></a>

- Admin-side approval / payment recording → admin spec §§18-25
- RLS / webhook / DB invariants → `integration/admissions-integration-spec.md`
- BullMQ + cron → `worker/admissions-worker-spec.md`
- Perf budgets on public form submission → `perf/admissions-perf-spec.md`
- Honeypot bypass fuzzing, IP spoofing, OWASP — hardening covered in `security/admissions-security-spec.md` (this spec only covers UI-visible signals)

---

## 3. Public Apply — Landing `/apply` <a id="3-public-apply-landing"></a>

File: `apps/web/src/app/[locale]/(public)/apply/page.tsx`.

| #   | What to Check                    | Expected Result                                                                                                                                 | Pass/Fail |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1 | Navigate to `/en/apply`          | Page loads unauthenticated — no 401. No morph bar (public shell). Brand logo + page title "Apply to a school".                                  |           |
| 3.2 | Tenant picker                    | Dropdown or card grid listing all tenants that have a published admission form. Each entry shows school name + brand logo.                      |           |
| 3.3 | Select a tenant                  | Navigates to `/en/apply/{tenant-a-slug}`.                                                                                                       |           |
| 3.4 | Visit `/en/apply/unknown-tenant` | Shows "School not found" with link back to `/en/apply`. Backend: `GET /v1/public/admissions/form?tenant={slug}` returns 404 `TENANT_NOT_FOUND`. |           |
| 3.5 | Arabic landing `/ar/apply`       | Same content, RTL. Brand names remain LTR.                                                                                                      |           |
| 3.6 | Mobile 375px                     | Tenant picker collapses to single-column cards; no horizontal scroll.                                                                           |           |
| 3.7 | Console                          | No errors. Page source does not leak any env strings (`NEXT_PUBLIC_` only).                                                                     |           |

---

## 4. Public Apply — Tenant form `/apply/[tenantSlug]` <a id="4-public-apply-tenant"></a>

File: `apps/web/src/app/[locale]/(public)/apply/[tenantSlug]/page.tsx`. Backend fetch: `GET /v1/public/admissions/form` (tenant inferred by Host header in multi-tenant prod, or by slug query).

### 4.1 Mode picker

| #     | What to Check             | Expected Result                                                                                                                                                                                              | Pass/Fail |
| ----- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 4.1.1 | Page load                 | `GET /v1/public/admissions/form` returns 200 with `{ definition, fields }`. First-step "Are you a new family or existing family?" card renders.                                                              |           |
| 4.1.2 | Click "New family"        | Step 2 reveals: household form (parent1 fields) + students section.                                                                                                                                          |           |
| 4.1.3 | Click "Existing family"   | Step 2 reveals a credentials-lookup card (email + last_name + DOB of any existing student OR household number). Household identity verified server-side (no mass-enumeration — see security spec OWASP A07). |           |
| 4.1.4 | Tenant form not published | Backend returns 404 `FORM_NOT_PUBLISHED`. UI shows "Admissions not open yet — please check back later".                                                                                                      |           |

### 4.2 New-family household form

| #      | What to Check                     | Expected Result                                                                                                                              | Pass/Fail |
| ------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.2.1  | Parent 1 required fields          | `parent1_first_name`, `parent1_last_name`, `parent1_email`, `parent1_phone`, `parent1_relationship` — all required. Inline error when blank. |           |
| 4.2.2  | Parent 1 email validation         | Must be valid RFC-5322 email; Zod rejects `not-an-email`. Inline error "Invalid email".                                                      |           |
| 4.2.3  | Parent 1 phone validation         | International format accepted. Country-dial-code selector. Phone input LTR even in Arabic locale.                                            |           |
| 4.2.4  | Parent 2 optional                 | Entire Parent 2 block collapsible. Filling any Parent 2 field requires all core Parent 2 fields (server-side refine).                        |           |
| 4.2.5  | Address required                  | `address_line_1`, `city`, `country` (2-char ISO) all required. `address_line_2`, `postal_code` optional.                                     |           |
| 4.2.6  | Emergency contact                 | Entirely optional; if any is filled, all three are recommended (soft warning, not block).                                                    |           |
| 4.2.7  | Consents block — health data      | Checkbox required. Cannot proceed without checking.                                                                                          |           |
| 4.2.8  | Consents block — WhatsApp channel | Optional.                                                                                                                                    |           |
| 4.2.9  | Consents block — AI features      | Four sub-checkboxes: ai_grading, ai_comments, ai_risk_detection, ai_progress_summary. Optional individually.                                 |           |
| 4.2.10 | Honeypot `website_url` field      | Hidden from sighted users (aria-hidden + CSS off-screen). Any value placed in this field triggers silent server-side drop (§10).             |           |
| 4.2.11 | Country selector                  | ISO 2-letter codes. Test with `IE`, `US`, `AE`, `EG`.                                                                                        |           |

### 4.3 Existing-family mode

| #     | What to Check                           | Expected Result                                                                                                                                                                                                                                  | Pass/Fail |
| ----- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 4.3.1 | Lookup form fields                      | `email` (existing parent email) + `household_number` OR `last_name + existing_student_dob`. Server does the lookup, returns `{ household_id }` or 404.                                                                                           |           |
| 4.3.2 | Unknown email                           | Server returns 404 `HOUSEHOLD_NOT_FOUND` (or semantic-equivalent code). UI shows "No family found with those details — please double-check or start a new application" without leaking which field was wrong (security spec covers enumeration). |           |
| 4.3.3 | Successful lookup                       | Step 2 pre-fills household fields as read-only, then moves to students section.                                                                                                                                                                  |           |
| 4.3.4 | Session token                           | Frontend MAY cache the `household_id` in memory for this session only; must NOT persist to localStorage/sessionStorage.                                                                                                                          |           |
| 4.3.5 | Submit uses `mode='existing_household'` | Payload omits `household_payload`; includes `existing_household_id`. Server validates the id belongs to the current tenant and email matches (additional anti-enumeration).                                                                      |           |

---

## 5. Public Apply — Students section (repeater) <a id="5-students-section"></a>

Component: `apps/web/src/app/[locale]/(public)/apply/[tenantSlug]/_components/students-section.tsx`.

| #    | What to Check                      | Expected Result                                                                                                                                                              | Pass/Fail |
| ---- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1  | Default state: 1 student card      | One student card visible at start, marked "Student 1".                                                                                                                       |           |
| 5.2  | Student required fields            | `first_name`, `last_name`, `date_of_birth` (YYYY-MM-DD), `gender` (male/female), `national_id`, `target_academic_year_id`, `target_year_group_id`. Inline errors when blank. |           |
| 5.3  | Middle_name optional               | Accepted.                                                                                                                                                                    |           |
| 5.4  | `date_of_birth`                    | Gregorian date picker. Must be in the past. Age must be within plausible bounds for the target year group (soft warning if outside — admin reviews).                         |           |
| 5.5  | `gender` enum                      | Dropdown offers only `male`, `female`. No free text.                                                                                                                         |           |
| 5.6  | `national_id` uniqueness           | Client does not check; server validates against tenant-scoped unique index AFTER submission. If duplicate, submit returns 409 `DUPLICATE_NATIONAL_ID`.                       |           |
| 5.7  | `target_academic_year_id` dropdown | Options populated from `/v1/public/admissions/form` response; only this tenant's academic years (cross-tenant ids would fail server-side validation).                        |           |
| 5.8  | `target_year_group_id` dropdown    | Options cascade from academic year; only year groups configured on that year for this tenant.                                                                                |           |
| 5.9  | `medical_notes` optional           | Freetext, max 2000 chars.                                                                                                                                                    |           |
| 5.10 | `has_allergies` yes/no             | If yes, reveals optional allergies textarea.                                                                                                                                 |           |
| 5.11 | Add Student button                 | Adds a second student card (Student 2). Reveal with smooth height transition.                                                                                                |           |
| 5.12 | Max 20 students                    | Button disables when 20 cards present. Attempting to bypass by client manipulation → server 400 `TOO_MANY_STUDENTS`.                                                         |           |
| 5.13 | Remove student                     | X button on each card (except card 1 while only one exists) removes that card. If removed card had partial data, a confirmation dialog prevents accidental loss.             |           |
| 5.14 | `national_id` XSS payload          | Rendered escaped in the card summary; no script execution.                                                                                                                   |           |
| 5.15 | 375px layout                       | Student cards stack; inputs full-width with font-size ≥ 16px (no iOS zoom on focus).                                                                                         |           |

---

## 6. Public Apply — Submit + confirmation <a id="6-public-submit"></a>

### 6.1 Submit button

| #     | What to Check                       | Expected Result                                                                                                                                                                        | Pass/Fail |
| ----- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1.1 | Button disabled until form valid    | When any required field is empty or invalid, button shows "Complete all required fields" tooltip and is disabled.                                                                      |           |
| 6.1.2 | Progress indicator while submitting | Spinner + "Submitting…" text. Double-click ignored.                                                                                                                                    |           |
| 6.1.3 | Success                             | `POST /v1/public/admissions/applications` returns 201 with `{ applications: [{ id, application_number, status }...] }`. Redirects to `/apply/{tenantSlug}/submitted?batch={batch_id}`. |           |
| 6.1.4 | 400 Zod validation error            | Toast "Please fix the highlighted fields". UI scrolls to first invalid field.                                                                                                          |           |
| 6.1.5 | 429 rate limit                      | Toast "Too many submissions — please try again later". Button re-enables.                                                                                                              |           |
| 6.1.6 | 500 unexpected                      | Toast "Something went wrong — please try again. If the problem persists contact the school."                                                                                           |           |
| 6.1.7 | Network offline                     | Toast "No internet connection". Button re-enables.                                                                                                                                     |           |
| 6.1.8 | Duplicate `national_id`             | 409. Toast "A student with that national ID already has an application on file".                                                                                                       |           |

### 6.2 Confirmation page `/apply/[tenantSlug]/submitted`

| #     | What to Check                                           | Expected Result                                                                                                                                                                        | Pass/Fail |
| ----- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.2.1 | Page renders                                            | Shows "Application submitted" headline, list of `application_number` per student with current status badges, contact email of the school admissions office, and next-step explanation. |           |
| 6.2.2 | Per-student status                                      | If some routed to `ready_to_admit` and others to `waiting_list`, each is shown individually with the right status badge.                                                               |           |
| 6.2.3 | "Apply for another child" link                          | Returns to the form with fresh state.                                                                                                                                                  |           |
| 6.2.4 | "View my applications" link (visible only if logged in) | If parent is authenticated (rare since submission is public), link to `/applications`. Otherwise hidden.                                                                               |           |
| 6.2.5 | Email confirmation                                      | Check mail relay: email "Application received" arrived to `parent1_email`. Body contains each student name + application_number. No internal note content.                             |           |
| 6.2.6 | URL without `batch` query                               | If the confirmation URL is visited directly without `batch`, generic "Your application was submitted — check your email for confirmation" message (no PII).                            |           |

---

## 7. Public Apply — Payment Success / Cancelled <a id="7-payment-callbacks"></a>

### 7.1 `/apply/payment-success` (root)

| #     | What to Check                                           | Expected Result                                                                                                                                                                          | Pass/Fail |
| ----- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1.1 | Arrive from Stripe with `?session_id=...`               | Page calls `GET /v1/public/admissions/payment-callback?session_id=...` (if endpoint exists) OR decodes Stripe session client-side (metadata-only) and shows success message.             |           |
| 7.1.2 | Invalid session id                                      | Page shows neutral "Payment processed — please check your email for confirmation" without exposing whether the id was valid (anti-enumeration).                                          |           |
| 7.1.3 | Webhook racing with page                                | Even if the Stripe webhook has not yet been processed, page still shows success — the webhook is the authoritative recorder. Parent told "you'll receive an email confirmation shortly". |           |
| 7.1.4 | Security — session_id should not be used as a privilege | Page does NOT show the application id, applicant name, or any PII. Display is intentionally generic. See OWASP A01 in security spec.                                                     |           |

### 7.2 `/apply/[tenantSlug]/payment-success`

Same as 7.1 but branded per tenant (logo, school name).

### 7.3 `/apply/payment-cancelled` and `/apply/[tenantSlug]/payment-cancelled`

| #     | What to Check                                           | Expected Result                                                                                                                                                      | Pass/Fail |
| ----- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.3.1 | Arrive from Stripe cancel                               | "Payment was not completed" message. Explain deadline still applies. Show "Try again" CTA that re-opens the Stripe session via a fresh link (regenerated on demand). |           |
| 7.3.2 | Expiry of deadline                                      | If current time > `application.payment_deadline`, show "Payment window has closed — please contact the school".                                                      |           |
| 7.3.3 | Deep-link to cancelled page without any session context | Generic message. No state loaded from any query param.                                                                                                               |           |

---

## 8. Parent Portal — `/applications` list <a id="8-parent-list"></a>

File: `apps/web/src/app/[locale]/(school)/applications/page.tsx`. Backend: `GET /v1/parent/applications` (AuthGuard only).

| #   | What to Check                                                                           | Expected Result                                                                                                                                                                                             | Pass/Fail |
| --- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | Load `/en/applications` as authenticated parent                                         | 200 response filtered to only applications where `submitted_by_parent_id` matches the authenticated user's parent record. Columns: application_number, student_name, form_name, status badge, submitted_at. |           |
| 8.2 | No applications                                                                         | Empty state: "You haven't submitted any applications yet — use /apply to start one". Illustration + CTA.                                                                                                    |           |
| 8.3 | Pagination                                                                              | Client pager with pageSize 20. `?page=` parameter passed to backend.                                                                                                                                        |           |
| 8.4 | Sort order                                                                              | Most recent first (by submitted_at DESC, fallback created_at DESC).                                                                                                                                         |           |
| 8.5 | Row click                                                                               | Navigates to `/en/applications/{id}`.                                                                                                                                                                       |           |
| 8.6 | Cross-parent leak check — `GET /v1/parent/applications` with parent-b token on tenant-a | Returns only parent-b's rows. If parent-b has zero rows, empty list. Never returns parent-a's rows.                                                                                                         |           |
| 8.7 | Cross-tenant parent leak — same parent logged in via tenant-b subdomain                 | Returns only applications where `tenant_id=tenant-b`. Never shows tenant-a's applications even if the parent has both.                                                                                      |           |
| 8.8 | Unauth                                                                                  | Redirects to login with `?next=/en/applications`.                                                                                                                                                           |           |
| 8.9 | Role: staff user (admin)                                                                | This page is the parent-portal shell. Admin accessing it gets either their own parent-role applications (if they also have a linked parent account) or empty. Should NOT return all applications.           |           |

---

## 9. Parent Portal — `/applications/:id` detail & withdraw <a id="9-parent-detail"></a>

Backend: `GET /v1/parent/applications/:id` (AuthGuard + ownership). POST `/v1/parent/applications/:id/withdraw`.

| #    | What to Check                                                             | Expected Result                                                                                                                                                                           | Pass/Fail |
| ---- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1  | Open own application                                                      | 200. Page shows: status badge, student name, application_number, apply_date, target year group, payment info (if applicable).                                                             |           |
| 9.2  | Notes visibility                                                          | Only `is_internal=false` notes visible. Internal notes NEVER appear in response JSON (verify response body, not just rendered text). Confirmed via devtools Network tab.                  |           |
| 9.3  | Payment info (conditional_approval)                                       | Shows expected amount + currency, deadline, and "Pay now" button linking to the live Stripe checkout URL.                                                                                 |           |
| 9.4  | Payment info (approved)                                                   | Shows "Payment received on {date}" with amount + source (stripe/cash/bank_transfer/override).                                                                                             |           |
| 9.5  | Withdraw button                                                           | Visible for states: submitted, waiting_list, ready_to_admit, conditional_approval. HIDDEN for terminal states (approved/rejected/withdrawn).                                              |           |
| 9.6  | Withdraw confirm dialog                                                   | "Are you sure you want to withdraw this application? This cannot be undone." Cancel + Withdraw. On confirm: `POST /v1/parent/applications/:id/withdraw` 200.                              |           |
| 9.7  | After withdraw                                                            | Status → withdrawn. Page re-fetches and removes the withdraw button. Admin timeline adds "Withdrawn by parent" entry.                                                                     |           |
| 9.8  | Withdraw on terminal state                                                | Button absent; direct POST returns 400 `INVALID_STATUS_TRANSITION`.                                                                                                                       |           |
| 9.9  | Open another parent's application                                         | 404 `APPLICATION_NOT_FOUND` (ownership guard). UI shows "Application not found". Never reveals the existence of the other parent's row.                                                   |           |
| 9.10 | Open own application from tenant-b while on tenant-a subdomain            | Cross-tenant → 404.                                                                                                                                                                       |           |
| 9.11 | Open deep-linked URL while unauthenticated                                | Redirects to login with `?next=/en/applications/:id`. After login with wrong account, 404.                                                                                                |           |
| 9.12 | 375px                                                                     | Status badge wraps; withdraw button full-width at bottom.                                                                                                                                 |           |
| 9.13 | Arabic                                                                    | Entire detail page RTL; application_number + amounts LTR inside bidirectional context.                                                                                                    |           |
| 9.14 | Sibling applications visible                                              | If `submission_batch_id` is shared, the page shows "Other applications in the same submission" chips linking to each sibling's detail. Only sibling rows owned by this parent are listed. |           |
| 9.15 | Try to hit admin's `POST /v1/applications/:id/review` from parent session | 403 `PERMISSION_DENIED` (parent role doesn't have `admissions.manage`).                                                                                                                   |           |

---

## 10. Honeypot + Rate Limiting (UI-visible side) <a id="10-honeypot-ratelimit"></a>

| #    | What to Check                                                           | Expected Result                                                                                                                                                                        | Pass/Fail |
| ---- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1 | Submit a public application with `website_url='http://spam.com'`        | Server accepts request, returns 201 (or 200), BUT no `Application` row is created (verify via admin query). UI thanks the user same as a real submission — no bot detection disclosed. |           |
| 10.2 | Submit public applications from the same IP 6 times in 1 hour (limit 5) | 6th request → 429. UI toast "Too many submissions — please try again later".                                                                                                           |           |
| 10.3 | IP change (different proxy)                                             | Rate limit resets per IP. Test by using a different `x-forwarded-for` value (if the proxy forwards it) — see security spec for precision.                                              |           |
| 10.4 | Multiple tenants                                                        | Rate limit is per (tenant, IP) — spamming tenant-a does not affect tenant-b.                                                                                                           |           |

---

## 11. Arabic / RTL <a id="11-rtl"></a>

| #    | What to Check                    | Expected Result                                                                 | Pass/Fail |
| ---- | -------------------------------- | ------------------------------------------------------------------------------- | --------- |
| 11.1 | `/ar/apply` loads                | RTL. Brand/locale switcher visible.                                             |           |
| 11.2 | Form labels localised            | Zod error messages also localised (Arabic). Test with deliberate invalid input. |           |
| 11.3 | Phone, email fields              | LTR input regardless of locale.                                                 |           |
| 11.4 | Date picker                      | Gregorian calendar; Western numerals 0-9.                                       |           |
| 11.5 | National ID                      | LTR.                                                                            |           |
| 11.6 | Country selector                 | Lists show Arabic country names alongside ISO codes; codes stay LTR.            |           |
| 11.7 | Submission confirmation          | Arabic headline; application_number wrapped LTR.                                |           |
| 11.8 | Parent portal `/ar/applications` | Entire shell RTL; status badges translated.                                     |           |

---

## 12. Console & Network Health <a id="12-console-network"></a>

| #    | What to Check          | Expected Result                                                                                                                     | Pass/Fail |
| ---- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | Public apply page      | No uncaught console errors. No React hydration warnings. No leaked env keys.                                                        |           |
| 12.2 | Single form-load fetch | Exactly one `GET /v1/public/admissions/form` on landing a tenant page. Repeat navigations re-fetch (no stale cache across tenants). |           |
| 12.3 | Submission response    | Response size ≤ 50KB (student list echoed back). If ≥ 20 students, response may grow up to ≈ 100KB.                                 |           |
| 12.4 | No auth tokens         | Public pages never read or write JWT cookies/localStorage. Devtools → Application tab → no admissions-related tokens.               |           |
| 12.5 | CSP                    | Page enforces CSP that allows Stripe Checkout iframe (if used). No unsafe-inline scripts.                                           |           |
| 12.6 | Parent portal          | Navigate 20 applications detail pages. No memory leak. RSS growth < 30MB.                                                           |           |

---

## 13. Backend Endpoint Map <a id="13-endpoint-map"></a>

| Method | Path                                   | Auth                    | Exercised in section | Notes                                        |
| ------ | -------------------------------------- | ----------------------- | -------------------- | -------------------------------------------- |
| GET    | `/v1/public/admissions/form`           | PUBLIC                  | §3, §4.1.1           | Returns published system form                |
| POST   | `/v1/public/admissions/applications`   | PUBLIC, IP rate-limited | §6                   | Multi-student submission with honeypot check |
| GET    | `/v1/parent/applications`              | AuthGuard               | §8                   | Filter to own applications                   |
| GET    | `/v1/parent/applications/:id`          | AuthGuard + ownership   | §9                   | Excludes is_internal notes                   |
| POST   | `/v1/parent/applications/:id/withdraw` | AuthGuard + ownership   | §9.6                 | Withdraw own application                     |

5 endpoints total. Public endpoints rate-limited; parent endpoints ownership-scoped.

---

## 14. Observations <a id="14-observations"></a>

| #     | Severity | Location                            | Observation                                                                                                                                                                           |
| ----- | -------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OB-P1 | P2       | `/apply/[tenantSlug]/page.tsx`      | Tenant slug is user-controlled — ensure the URL parameter cannot be used to enumerate private tenants (e.g. `tenant-alpha-private`). Slug-to-id mapping must fail-closed on mismatch. |
| OB-P2 | P2       | Honeypot spam drop                  | Currently drops silently per admin spec OB-01. Consider logging a metric counter `admissions.honeypot_triggers` so detection signal isn't lost.                                       |
| OB-P3 | P3       | Parent portal — multi-tenant parent | A parent that has applications in tenant-a AND tenant-b must sign in per-tenant (different sessions). UI does not show cross-tenant consolidated view. Product decision.              |
| OB-P4 | P2       | Parent withdraw                     | No email notification sent to parent on withdraw confirmation (mail relay shows no message). Expected?                                                                                |
| OB-P5 | P3       | Existing-household lookup           | Lookup form exposes separate error codes for "email not found" vs "email found but DOB mismatch". Security spec will check the response timing / wording for enumeration leaks.       |
| OB-P6 | P2       | Stripe Cancel page                  | "Try again" CTA should re-use an existing active Stripe session if available rather than generating a new one every time — creates unused sessions. Verify.                           |

---

## 15. Sign-off <a id="15-signoff"></a>

| Section                           | Reviewer | Date | Pass | Fail | Notes |
| --------------------------------- | -------- | ---- | ---- | ---- | ----- |
| 3 — Landing                       |          |      |      |      |       |
| 4 — Tenant form (modes)           |          |      |      |      |       |
| 5 — Students repeater             |          |      |      |      |       |
| 6 — Submit + confirmation         |          |      |      |      |       |
| 7 — Payment callbacks             |          |      |      |      |       |
| 8 — Parent portal list            |          |      |      |      |       |
| 9 — Parent portal detail/withdraw |          |      |      |      |       |
| 10 — Honeypot + rate-limit        |          |      |      |      |       |
| 11 — Arabic / RTL                 |          |      |      |      |       |
| 12 — Console & network            |          |      |      |      |       |
| **Overall**                       |          |      |      |      |       |

**Parent/public release-ready when every section is Pass with zero P0/P1 observations outstanding.**
