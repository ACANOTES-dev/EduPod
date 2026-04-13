# Admissions Module — Security Audit Specification

**Scope:** OWASP Top 10 (all 10 categories), permission matrix, injection fuzz, auth hardening, CSRF, encrypted fields, audit log integrity, sensitive-data exposure, rate limiting, security headers, dependency audit, business-logic abuse
**Spec version:** 1.0 (2026-04-12)
**Audience:** a paid security consultant OR an internal security engineer. Every row names an exact attack payload, exact expected defence (HTTP code + post-condition), and a severity tag (P0–P3).
**Pack companion:** part of `/e2e-full admissions` — admin + parent + integration + worker + perf specs alongside

---

## Table of Contents

1. [Threat model](#1-threat-model)
2. [OWASP Top 10 walkthrough](#2-owasp)
3. [Permission matrix (endpoints × roles)](#3-permission-matrix)
4. [Input injection fuzz](#4-injection-fuzz)
5. [Authentication hardening](#5-auth-hardening)
6. [CSRF + CORS](#6-csrf-cors)
7. [Encrypted-field access control](#7-encrypted-fields)
8. [Audit-log integrity](#8-audit-log)
9. [Sensitive data exposure (responses + logs)](#9-sensitive-data)
10. [Rate limiting](#10-rate-limiting)
11. [Security headers](#11-headers)
12. [Dependency audit](#12-deps)
13. [Business-logic abuse](#13-biz-abuse)
14. [Severity tally + observations](#14-tally)
15. [Sign-off](#15-signoff)

---

## 1. Threat Model <a id="1-threat-model"></a>

### 1.1 Actors

| Actor                             | Goals                                                                                            | Capabilities                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| External spam bot                 | Flood public form with fake applications, discover tenants, enumerate households                 | Anonymous HTTP requests                                             |
| Malicious applicant               | Bypass rate limits, smuggle ineligible children, pay a reduced amount, forge approval            | Public form, then parent session post-submit                        |
| Dishonest front_office staff      | Approve a friend's child without paying, hide a rejection from audit, forge a note               | Authenticated session with `admissions.view` only                   |
| Dishonest principal/admin         | Approve without override justification, delete audit trail, change a tenant's fee policy quietly | Authenticated with `admissions.manage` but not full org access      |
| Compromised Stripe keys           | Redirect Stripe webhooks or forge session data                                                   | Leaked tenant-level encrypted keys                                  |
| Cross-tenant attacker             | Read or mutate Tenant B data while authenticated as Tenant A                                     | Full Tenant A admin session + known/guessed Tenant B ids            |
| Compromised Cloudflare-trusted IP | Bypass rate limit                                                                                | Ability to forge `cf-connecting-ip` if proxy chain is misconfigured |
| Parent peer attacker              | View another parent's application, payment link, or private notes                                | Authenticated parent session + guessed application id               |

### 1.2 Blast radius

- Compromise of `admin` session in Tenant A → attacker can approve/reject applications, record fake payments, alter admissions settings, but cannot escape to other tenants (RLS blocks).
- Compromise of override-role session → attacker can approve without payment, bypass finance records. Logged in `admission_overrides` — detectable via monitoring.
- Compromise of Stripe webhook secret → attacker can forge `checkout.session.completed` for arbitrary applications in that tenant, marking them approved without actual payment.
- Compromise of encryption master key → attacker can decrypt all tenant Stripe keys stored in DB.
- RLS bypass (no tenant context set) → catastrophic: cross-tenant data read/write.

### 1.3 Crown-jewel data

- `application.payload_json` — PII: names, DOB, addresses, medical notes, national IDs.
- `admissions_payment_events.stripe_event_id` — not sensitive alone; with Stripe secret, enables forgery.
- Tenant Stripe keys (encrypted) — full payment authority for the tenant.
- `AdmissionOverride` rows — audit trail for financial exceptions; tampering enables hidden fee waivers.

---

## 2. OWASP Top 10 Walkthrough <a id="2-owasp"></a>

Each category gets either a concrete attack scenario or an N/A with reason.

| #    | Category                                                      | Attack scenario                                                                                                                                                                    | Expected defence                                                                                                                                                                                                | Severity | Pass/Fail |
| ---- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 2.1  | A01 Broken Access Control                                     | Tenant A admin sends `GET /v1/applications/{tenant_b_id}`                                                                                                                          | 404 `APPLICATION_NOT_FOUND`. RLS enforced at the DB — no data leak even if service-layer tenant check misfires.                                                                                                 | P0       |           |
| 2.2  | A01 Broken Access Control (parent)                            | Parent A sends `GET /v1/parent/applications/{parent_b_application_id}`                                                                                                             | 404 with generic error. Ownership check at service layer in addition to RLS.                                                                                                                                    | P0       |           |
| 2.3  | A01 Role escalation                                           | `front_office` user (view-only) sends `POST /v1/applications/:id/review` with an approved-state payload                                                                            | 403 `PERMISSION_DENIED`. Zero side effects.                                                                                                                                                                     | P0       |           |
| 2.4  | A01 Override role bypass                                      | admin without override role sends `POST /v1/applications/:id/payment/override`                                                                                                     | 403 `OVERRIDE_ROLE_REQUIRED`. No AdmissionOverride row.                                                                                                                                                         | P0       |           |
| 2.5  | A02 Cryptographic Failures                                    | `SELECT stripe_secret_key_encrypted FROM tenants WHERE id=?` (raw SQL)                                                                                                             | Returns ciphertext (bytes/base64). Never plaintext. Decryption only through `StripeService.decryptKey`. Audit log per decrypt.                                                                                  | P0       |           |
| 2.6  | A02 TLS enforcement                                           | HTTP-only request to `/v1/public/admissions/applications`                                                                                                                          | 301/308 → HTTPS; HSTS `max-age >= 31536000; includeSubDomains; preload`.                                                                                                                                        | P1       |           |
| 2.7  | A03 SQL injection via `search` param                          | `GET /v1/applications?search=' OR 1=1--`                                                                                                                                           | Prisma parameterises all queries. Literal `'` returned as result filter, no SQL execution; no 500.                                                                                                              | P0       |           |
| 2.8  | A03 Injection via free-text notes                             | `POST /v1/applications/:id/notes { note: "'; DROP TABLE applications;--" }`                                                                                                        | Note stored literally. Rendered escaped. DB unaffected.                                                                                                                                                         | P0       |           |
| 2.9  | A03 NoSQL injection (NOT APPLICABLE — module uses PostgreSQL) | `N/A — Prisma + Postgres only. No MongoDB or other NoSQL stores. Zod validates all input types.`                                                                                   | N/A                                                                                                                                                                                                             | —        | N/A       |
| 2.10 | A03 Command injection (NOT APPLICABLE)                        | `N/A — no service method shells out, no exec, no spawn outside of internal sandboxed helpers (which don't consume user input).`                                                    | N/A                                                                                                                                                                                                             | —        | N/A       |
| 2.11 | A03 Path traversal (NOT APPLICABLE)                           | `N/A — module does not read/write user-specified file paths.`                                                                                                                      | N/A                                                                                                                                                                                                             | —        | N/A       |
| 2.12 | A04 Insecure Design — payment amount tampering                | Parent intercepts `POST /v1/applications/:id/payment/cash` body, changes `amount_cents` from `100000` to `1`                                                                       | Endpoint is admin-only (`admissions.manage`); parents cannot invoke. Admin that does is flagged in audit log. Service cross-checks `amount_cents === application.payment_amount_cents` — 400 `AMOUNT_MISMATCH`. | P0       |           |
| 2.13 | A04 Insecure Design — state skip                              | `POST /v1/applications/:id/review { status: 'approved' }` from a `submitted` application                                                                                           | 400 `INVALID_STATUS_TRANSITION`.                                                                                                                                                                                | P0       |           |
| 2.14 | A04 Insecure Design — forced-payment-free approval            | Admin tries `POST /v1/applications/:id/review { status: 'approved' }` from `conditional_approval`                                                                                  | 400 `INVALID_STATUS_TRANSITION` — `review` endpoint cannot transition to approved; must use payment or override path.                                                                                           | P0       |           |
| 2.15 | A04 Insecure Design — override amount negative                | `POST /v1/applications/:id/payment/override { override_type:'partial_waiver', actual_amount_collected_cents: -1000000, justification: 'test' }`                                    | 400 Zod `MUST_BE_NONNEGATIVE`.                                                                                                                                                                                  | P1       |           |
| 2.16 | A04 Insecure Design — override amount overflow                | `actual_amount_collected_cents: 9999999999999999`                                                                                                                                  | Zod upper bound + Postgres `int` range check → 400.                                                                                                                                                             | P1       |           |
| 2.17 | A04 Insecure Design — honeypot bypass                         | Submit public app; fill `website_url='javascript:alert(1)'`                                                                                                                        | Server accepts 201 but drops the row silently. No Application created. Monitor counter increments. Attacker cannot distinguish drop from success.                                                               | P1       |           |
| 2.18 | A05 Security Misconfiguration — debug endpoints               | `GET /debug/*`, `GET /admin/queue`, `GET /__nuxt`, `GET /api-docs`                                                                                                                 | Either 404 (not mounted in prod) or auth-gated. Swagger docs either behind auth OR not served in prod.                                                                                                          | P1       |           |
| 2.19 | A05 Verbose errors                                            | Send a malformed body that triggers an unhandled exception                                                                                                                         | 500 response contains no stack trace, no DB error text, no internal paths. Body is `{ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }`.                                            | P1       |           |
| 2.20 | A06 Vulnerable components                                     | Run `pnpm audit` for admissions module deps                                                                                                                                        | 0 criticals, 0 highs without documented mitigation. Lockfile committed.                                                                                                                                         | P1       |           |
| 2.21 | A07 JWT expiry                                                | Present a JWT with `exp` in the past                                                                                                                                               | 401 `TOKEN_EXPIRED`.                                                                                                                                                                                            | P0       |           |
| 2.22 | A07 JWT forgery                                               | Present a JWT signed with an incorrect key                                                                                                                                         | 401 `INVALID_TOKEN`. No application data returned.                                                                                                                                                              | P0       |           |
| 2.23 | A07 JWT tenant tampering                                      | Edit JWT payload to swap `tenant_id` to Tenant B's id                                                                                                                              | Signature verification fails → 401.                                                                                                                                                                             | P0       |           |
| 2.24 | A07 Refresh token rotation                                    | Use an old refresh token after its rotation                                                                                                                                        | 401 with refresh-token revocation. Attacker cannot recover session.                                                                                                                                             | P0       |           |
| 2.25 | A07 Brute-force login                                         | 100 failed logins against parent@…                                                                                                                                                 | After threshold (e.g. 5), account lockout OR exponential backoff. Specific to auth module but must block admissions surface.                                                                                    | P1       |           |
| 2.26 | A08 Webhook signature verification                            | POST forged Stripe webhook with a crafted JSON body; no signature                                                                                                                  | 400 `INVALID_SIGNATURE`. No application transitioned.                                                                                                                                                           | P0       |           |
| 2.27 | A08 Audit log tamper                                          | Admin attempts `DELETE /v1/admission-overrides/:id` or `PATCH /v1/application-notes/:id`                                                                                           | 404 or 405 — endpoints do not exist. Append-only tables enforced by schema (no updated_at; no DELETE endpoint; RLS policies prevent raw deletes).                                                               | P1       |           |
| 2.28 | A09 Logging & Monitoring — sensitive data in logs             | Trigger a Stripe error in a test flow. Grep logs for `sk_test_`, JWT strings, `national_id` values                                                                                 | Zero matches. Logger applies field masking to known sensitive keys.                                                                                                                                             | P0       |           |
| 2.29 | A09 Missing audit events                                      | Perform each mutation (approve, reject, cash, bank, override, manual-promote, withdraw). Check `application_notes` OR `audit_logs` table                                           | Every action has a corresponding audit row with actor, timestamp, before/after.                                                                                                                                 | P1       |           |
| 2.30 | A10 SSRF (NOT APPLICABLE)                                     | `N/A — admissions module does not accept user-supplied URLs. Stripe success/cancel URLs are server-composed from tenant-scoped config; they never originate from applicant input.` | N/A                                                                                                                                                                                                             | —        | N/A       |

**OWASP categories covered: 10/10** (some with explicit N/A justifications).

---

## 3. Permission Matrix (endpoints × roles) <a id="3-permission-matrix"></a>

Columns: `school_owner | school_principal | school_vice_principal | admin | front_office | teacher | parent | student | unauth | cross_tenant_admin`.
Every cell is a specific test. Expected status: `200` (allowed), `401 UNAUTHORIZED` (no token), `403 PERMISSION_DENIED` (wrong role), `404 APPLICATION_NOT_FOUND` (cross-tenant), `403 OVERRIDE_ROLE_REQUIRED` (wrong override role).

| #    | Endpoint                                            | owner   | principal | vice    | admin   | front_office | teacher | parent                       | student | unauth | xtenant                                       |
| ---- | --------------------------------------------------- | ------- | --------- | ------- | ------- | ------------ | ------- | ---------------------------- | ------- | ------ | --------------------------------------------- |
| 3.1  | `GET /v1/admissions/dashboard-summary`              | 200     | 200       | 200     | 200     | 200          | 403     | 403                          | 403     | 401    | 404-ish                                       |
| 3.2  | `GET /v1/applications`                              | 200     | 200       | 200     | 200     | 200          | 403     | 403                          | 403     | 401    | 404-ish                                       |
| 3.3  | `GET /v1/applications/queues/ready-to-admit`        | 200     | 200       | 200     | 200     | 200          | 403     | 403                          | 403     | 401    | 404-ish                                       |
| 3.4  | `GET /v1/applications/queues/waiting-list`          | 200     | 200       | 200     | 200     | 200          | 403     | 403                          | 403     | 401    | 404-ish                                       |
| 3.5  | `GET /v1/applications/queues/conditional-approval`  | 200     | 200       | 200     | 200     | 200          | 403     | 403                          | 403     | 401    | 404-ish                                       |
| 3.6  | `GET /v1/applications/queues/approved`              | 200     | 200       | 200     | 200     | 200          | 403     | 403                          | 403     | 401    | 404-ish                                       |
| 3.7  | `GET /v1/applications/queues/rejected`              | 200     | 200       | 200     | 200     | 200          | 403     | 403                          | 403     | 401    | 404-ish                                       |
| 3.8  | `GET /v1/applications/analytics`                    | 200     | 200       | 200     | 200     | 200          | 403     | 403                          | 403     | 401    | 404-ish                                       |
| 3.9  | `GET /v1/applications/:id`                          | 200     | 200       | 200     | 200     | 200          | 403     | 403 (own: 200)               | 403     | 401    | 404                                           |
| 3.10 | `GET /v1/applications/:id/preview`                  | 200     | 200       | 200     | 200     | 200          | 403     | 403                          | 403     | 401    | 404                                           |
| 3.11 | `POST /v1/applications/:id/review`                  | 200     | 200       | 200     | 200     | 403          | 403     | 403                          | 403     | 401    | 404                                           |
| 3.12 | `POST /v1/applications/:id/withdraw`                | 200     | 200       | 200     | 200     | 403          | 403     | 403                          | 403     | 401    | 404                                           |
| 3.13 | `GET /v1/applications/:applicationId/notes`         | 200     | 200       | 200     | 200     | 200          | 403     | 403                          | 403     | 401    | 404                                           |
| 3.14 | `POST /v1/applications/:applicationId/notes`        | 200     | 200       | 200     | 200     | 403          | 403     | 403                          | 403     | 401    | 404                                           |
| 3.15 | `POST /v1/applications/:id/manual-promote`          | 200     | 200       | 200     | 200     | 403          | 403     | 403                          | 403     | 401    | 404                                           |
| 3.16 | `POST /v1/applications/:id/payment-link/regenerate` | 200     | 200       | 200     | 200     | 403          | 403     | 403                          | 403     | 401    | 404                                           |
| 3.17 | `POST /v1/applications/:id/payment/cash`            | 200     | 200       | 200     | 200     | 403          | 403     | 403                          | 403     | 401    | 404                                           |
| 3.18 | `POST /v1/applications/:id/payment/bank-transfer`   | 200     | 200       | 200     | 200     | 403          | 403     | 403                          | 403     | 401    | 404                                           |
| 3.19 | `POST /v1/applications/:id/payment/override`        | 200\*   | 200\*     | 403     | 403     | 403          | 403     | 403                          | 403     | 401    | 404                                           |
| 3.20 | `GET /v1/admission-overrides`                       | 200     | 200       | 200     | 200     | 403          | 403     | 403                          | 403     | 401    | 404-ish                                       |
| 3.21 | `GET /v1/admission-forms/system`                    | 200     | 200       | 200     | 200     | 200          | 403     | 403                          | 403     | 401    | 404-ish                                       |
| 3.22 | `POST /v1/admission-forms/system/rebuild`           | 200     | 200       | 200     | 200     | 403          | 403     | 403                          | 403     | 401    | 404-ish                                       |
| 3.23 | `POST /v1/public/admissions/applications`           | 201     | 201       | 201     | 201     | 201          | 201     | 201                          | 201     | 201    | 201 (routes to requester's tenant-bound host) |
| 3.24 | `GET /v1/public/admissions/form`                    | 200     | 200       | 200     | 200     | 200          | 200     | 200                          | 200     | 200    | 200                                           |
| 3.25 | `GET /v1/parent/applications`                       | 200\*\* | 200\*\*   | 200\*\* | 200\*\* | 200\*\*      | 200\*\* | 200 (own rows)               | 200\*\* | 401    | 200 (empty)                                   |
| 3.26 | `GET /v1/parent/applications/:id`                   | 404     | 404       | 404     | 404     | 404          | 404     | 200 (own) or 404             | 404     | 401    | 404                                           |
| 3.27 | `POST /v1/parent/applications/:id/withdraw`         | 404     | 404       | 404     | 404     | 404          | 404     | 200 (own, active) or 400/404 | 404     | 401    | 404                                           |
| 3.28 | `GET /v1/settings/admissions`                       | 200     | 200       | 200     | 200     | 403          | 403     | 403                          | 403     | 401    | 404-ish                                       |
| 3.29 | `PATCH /v1/settings/admissions`                     | 200     | 200       | 200     | 200     | 403          | 403     | 403                          | 403     | 401    | 404-ish                                       |

`*` Only role matching the tenant's `require_override_approval_role` setting. For Tenant A: `school_owner` only. For Tenant B: `school_principal` only.
`**` Parent portal endpoint: role-less (AuthGuard only). Non-parent accounts that happen to have a linked Parent record see that record's applications; otherwise empty.

**Total matrix cells: 29 endpoints × 10 roles = 290 cells.** Every cell becomes a scripted test.

---

## 4. Input Injection Fuzz <a id="4-injection-fuzz"></a>

Per user-controlled field, run each payload class. Expected defence below.

### 4.1 Fields surveyed

- `application_number` (not user-editable directly but inspected in queries)
- `rejection_reason` (free text, 5000 max)
- `justification` (for override 20–2000, for manual-promote 10–2000)
- `note` (10,000 max)
- `search` (200 max)
- `receipt_number`, `transfer_reference`, `notes` (payment modals)
- `student_first_name`, `student_last_name`, `middle_name`, `medical_notes`
- `parent1_email`, `parent1_phone`, `parent1_first_name`, `address_line_1`, `city`, `postal_code`
- `national_id`
- `website_url` (honeypot)
- `date_from`, `date_to` (analytics)
- `form_definition_id`, `:id` path params
- `target_academic_year_id`, `target_year_group_id`
- Header: `cf-connecting-ip`, `x-forwarded-for`

### 4.2 Payload classes × sample tests

| #      | Field                                                    | Payload                                                                                                                                           | Expected defence                                                                                    | Severity | Pass/Fail |
| ------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------- | --------- |
| 4.2.1  | `note`                                                   | `<script>alert(1)</script>`                                                                                                                       | Saved literally. Rendered escaped on GET notes + timeline. No JS execution anywhere.                | P0       |           |
| 4.2.2  | `rejection_reason`                                       | `<img src=x onerror=alert(1)>`                                                                                                                    | Same. Escaped in rejected archive + detail page.                                                    | P0       |           |
| 4.2.3  | `justification`                                          | `javascript:alert(1)`                                                                                                                             | Escaped.                                                                                            | P1       |           |
| 4.2.4  | `student_first_name`                                     | `<svg onload=alert(1)>`                                                                                                                           | Escaped in admin detail view, public form preview, queue rows.                                      | P0       |           |
| 4.2.5  | `note`                                                   | `'; DROP TABLE applications;--`                                                                                                                   | Prisma parameterises. No SQL injection. Row saved as literal.                                       | P0       |           |
| 4.2.6  | `search`                                                 | `' OR '1'='1`                                                                                                                                     | Prisma treats as literal search text. 200 with no rows (or false-positive rows matching literal).   | P0       |           |
| 4.2.7  | `search`                                                 | `%25` (URL-encoded SQL wildcard)                                                                                                                  | Safe; treated as % literal.                                                                         | P2       |           |
| 4.2.8  | `medical_notes`                                          | `{"$ne": null}`                                                                                                                                   | Stored as plain text (Prisma field is VARCHAR). No NoSQL injection path.                            | P2       |           |
| 4.2.9  | `:id` path                                               | `../admin-secret`                                                                                                                                 | ParseUUIDPipe returns 400 `BAD_UUID`.                                                               | P1       |           |
| 4.2.10 | `:id` path                                               | `%2e%2e%2f`                                                                                                                                       | Decoded; still not a UUID → 400.                                                                    | P1       |           |
| 4.2.11 | `national_id`                                            | null byte `test\x00injection`                                                                                                                     | Zod string allows, Postgres strips null bytes (or rejects). Stored safely.                          | P2       |           |
| 4.2.12 | `student_first_name`                                     | Homoglyph (Cyrillic `а` looks like Latin `a`)                                                                                                     | Accepted literally. Cross-reference lookups (national_id uniqueness) would still detect duplicates. | P3       |           |
| 4.2.13 | `note`                                                   | Overlong UTF-8                                                                                                                                    | Rejected by Zod if invalid; otherwise stored.                                                       | P3       |           |
| 4.2.14 | `note`                                                   | 1MB string                                                                                                                                        | 400 Zod `TOO_LONG` (10,000 max).                                                                    | P2       |           |
| 4.2.15 | Body                                                     | Deeply nested JSON (100 layers)                                                                                                                   | Body-parser rejects with 413 or 400 `REQUEST_TOO_NESTED`.                                           | P2       |           |
| 4.2.16 | Body                                                     | 100MB body                                                                                                                                        | 413 `PAYLOAD_TOO_LARGE`.                                                                            | P1       |           |
| 4.2.17 | Zip bomb upload (N/A — no upload endpoint in admissions) | N/A — no file upload in admissions currently.                                                                                                     | N/A                                                                                                 | —        | N/A       |
| 4.2.18 | Type confusion: `amount_cents: "1000"` (string)          | Zod coerces or rejects. Safest: reject with "must be number".                                                                                     | 400 Zod.                                                                                            | P1       |           |
| 4.2.19 | Type confusion: `amount_cents: [1000]` (array)           | 400 Zod.                                                                                                                                          | P1                                                                                                  |          |
| 4.2.20 | Type confusion: `amount_cents: null` (when required)     | 400 Zod.                                                                                                                                          | P1                                                                                                  |          |
| 4.2.21 | Type confusion: `status: ['approved']`                   | 400 Zod (enum).                                                                                                                                   | P1                                                                                                  |          |
| 4.2.22 | `cf-connecting-ip: <script>`                             | Header is a string; treated as raw IP; rate limiter stores as-is but cannot parse → falls back to socket IP. Logger does not render header value. | P2                                                                                                  |          |
| 4.2.23 | `date_from: '2026-13-99'`                                | Zod rejects 400.                                                                                                                                  | P2                                                                                                  |          |
| 4.2.24 | `target_year_group_id: '<tenant_b_year_group_id>'`       | 400 `INVALID_TARGET_YEAR_GROUP` or 404 (cross-tenant).                                                                                            | P0                                                                                                  |          |
| 4.2.25 | `expected_updated_at: '2000-01-01'`                      | 409 `CONCURRENT_MODIFICATION`.                                                                                                                    | P2                                                                                                  |          |
| 4.2.26 | Stored XSS round-trip                                    | Save XSS payload as rejection_reason; re-render in rejected archive table; verify `innerHTML` does not contain live `<script>`.                   | Passes.                                                                                             | P0       |           |
| 4.2.27 | `POST` with `Content-Type: text/plain`                   | 415 `UNSUPPORTED_MEDIA_TYPE`.                                                                                                                     | P2                                                                                                  |          |

**Injection row count: 27 (plus fuzz classes per field — for a dedicated run, generate ~200 concrete rows by cross-multiplying the field × payload class table).**

---

## 5. Authentication Hardening <a id="5-auth-hardening"></a>

| #    | Scenario                                                         | Expected                                                                                                                                | Severity | Pass/Fail |
| ---- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 5.1  | Expired JWT                                                      | 401 `TOKEN_EXPIRED`. No work done.                                                                                                      | P0       |           |
| 5.2  | JWT signed with wrong key                                        | 401 `INVALID_TOKEN`.                                                                                                                    | P0       |           |
| 5.3  | JWT tampered `sub`                                               | Signature invalid → 401.                                                                                                                | P0       |           |
| 5.4  | JWT tampered `tenant_id`                                         | 401 (signature invalid).                                                                                                                | P0       |           |
| 5.5  | JWT replay to different tenant subdomain                         | If the JWT encodes `tenant_id`, host-check enforces equality → 401. Otherwise, session invalid for the target tenant → 401.             | P0       |           |
| 5.6  | Old refresh token after rotation                                 | 401 with session revocation. All sessions for that user invalidated (detection of stolen token).                                        | P0       |           |
| 5.7  | Concurrent sessions — revoke session A does not affect session B | Session B remains valid unless revoke-all was used.                                                                                     | P2       |           |
| 5.8  | Brute-force protection on login                                  | After 5 failed logins, account lockout or 60s backoff. The auth module handles this; admissions surface only observes rate-limited 429. | P1       |           |
| 5.9  | Unauth accessing `/v1/admissions/*`                              | 401 across the board.                                                                                                                   | P0       |           |
| 5.10 | Session timeout mid-flow                                         | Admin submitting a review 2h into session with 1h expiry: 401 `TOKEN_EXPIRED`. UI re-authenticates; no partial mutation.                | P1       |           |
| 5.11 | CSRF token not required because JWT in header (see §6)           | If the session uses httpOnly cookie, CSRF token is enforced. If Bearer JWT is used instead, CSRF is irrelevant but CORS must be strict. | P1       |           |

---

## 6. CSRF + CORS <a id="6-csrf-cors"></a>

The app shell uses JWT in memory + refresh token via httpOnly cookie (per CLAUDE.md). Mutation endpoints rely on Bearer tokens, so CSRF via cookie-auth is not the exposure — CORS must be tight.

| #   | Scenario                                                                                    | Expected                                                                                                                                                                          | Severity | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 6.1 | `POST /v1/applications/:id/review` from an unrelated origin (e.g. `https://attacker.test/`) | Preflight OPTIONS returns `Access-Control-Allow-Origin` only for the expected frontend origin (`*.edupod.app` or tenant host). Attacker origin not in allowlist → browser blocks. | P0       |           |
| 6.2 | `*` in `Access-Control-Allow-Origin`                                                        | Must NOT be `*`. Test by inspecting response headers on a preflight.                                                                                                              | P0       |           |
| 6.3 | `Access-Control-Allow-Credentials: true` with wildcard origin                               | Not possible (browser rejects) and server should never emit both.                                                                                                                 | P0       |           |
| 6.4 | Refresh endpoint `POST /v1/auth/refresh` from a malicious origin                            | CORS-blocked. Cookie not attached to cross-origin requests except under explicit allowlist.                                                                                       | P0       |           |
| 6.5 | CSRF token for state-mutating admin actions (if middleware is configured)                   | 403 without token. Present with stale token → 403. Present with valid token → 200.                                                                                                | P1       |           |
| 6.6 | Webhook endpoint `/v1/finance/stripe/webhook` CORS                                          | Webhook is server-to-server; no browser CORS consideration. Still rate-limit-exempt and signature-verified.                                                                       | —        | N/A       |

---

## 7. Encrypted-field Access Control <a id="7-encrypted-fields"></a>

Admissions module has no DIRECTLY encrypted columns, but it consumes tenant-level encrypted Stripe keys.

| #   | Scenario                                                                                      | Expected                                                                                                                                                                | Severity | Pass/Fail |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 7.1 | Read `stripe_secret_key_encrypted` via raw Prisma SELECT                                      | Returns ciphertext (base64 or bytes).                                                                                                                                   | P0       |           |
| 7.2 | Read via `StripeService.decryptKey(tenant_id)`                                                | Returns plaintext `sk_test_...`. Audit-log row created with `actor_id, tenant_id, action='decrypt', timestamp`.                                                         | P0       |           |
| 7.3 | Any admissions API response returns Stripe key                                                | Never. Admissions never exposes the Stripe key. Grep response bodies for `sk_` prefix — zero matches.                                                                   | P0       |           |
| 7.4 | Log line contains plaintext Stripe key                                                        | Zero matches under `grep 'sk_test_' logs/*`.                                                                                                                            | P0       |           |
| 7.5 | Stack trace on Stripe API error contains key                                                  | Redacted at logger boundary.                                                                                                                                            | P0       |           |
| 7.6 | Key rotation: rotate master key, re-encrypt all tenants, verify decryption still works        | All tenants continue to function without downtime.                                                                                                                      | P1       |           |
| 7.7 | PII in `application.payload_json` (national_id, medical_notes, DOB, address) stored plaintext | Integration spec IN-03 calls this out. Security posture: either encrypt-at-rest via column-level encryption OR document as acceptable with strict logging/audit access. | P1       |           |

---

## 8. Audit-log Integrity <a id="8-audit-log"></a>

| #   | Scenario                                                                                                      | Expected                                                                                                                                                    | Severity | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 8.1 | After approve/reject/cash/bank/override/manual-promote/withdraw: `ApplicationNote` or `audit_logs` row exists | Row with actor_id, tenant_id, entity_type='application', entity_id, action, before/after payload, timestamp, request_id.                                    | P0       |           |
| 8.2 | Audit row is not deletable via any endpoint                                                                   | 404/405 on DELETE. No SQL access outside migrations.                                                                                                        | P0       |           |
| 8.3 | Audit row is not editable via any endpoint                                                                    | 404/405 on PATCH/PUT.                                                                                                                                       | P0       |           |
| 8.4 | Append-only enforcement at DB                                                                                 | `ApplicationNote` schema has no `updated_at`. `AdmissionOverride` same.                                                                                     | P0       |           |
| 8.5 | Sensitive fields in before/after payload                                                                      | Stripe keys never persisted; national_id visible (business requirement); passwords N/A.                                                                     | P1       |           |
| 8.6 | Audit row written INSIDE the mutation transaction                                                             | Integration spec verifies: force failure post-audit-write pre-mutation → transaction rolls back, no audit row. Audit row only exists if mutation committed. | P0       |           |
| 8.7 | Audit row for payment override                                                                                | `AdmissionOverride` row + `ApplicationNote` "Force approve — override_type={t}. Justification: ..." — redundant but both must exist.                        | P1       |           |
| 8.8 | Access to `audit_logs` table                                                                                  | Read-only endpoint (if exposed). Only platform admins can query across tenants (outside RLS).                                                               | P1       |           |

---

## 9. Sensitive Data Exposure <a id="9-sensitive-data"></a>

| #    | Scenario                                                         | Expected                                                                                                                                                                                                    | Severity | Pass/Fail |
| ---- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 9.1  | `GET /v1/applications/queues/ready-to-admit` response            | Per row: application_number, student name, parent email/phone, apply_date. No national_id, no DOB, no address in list view.                                                                                 | P1       |           |
| 9.2  | `GET /v1/applications/:id` detail response                       | Includes full payload for staff (privacy balanced by permissions). Consent flags included.                                                                                                                  | P2       |           |
| 9.3  | `GET /v1/parent/applications/:id` response                       | Only fields a parent needs; NO internal notes; NO administrative staff comments marked is_internal.                                                                                                         | P0       |           |
| 9.4  | Response headers                                                 | No `Server:` version banner. No `X-Powered-By: Express`.                                                                                                                                                    | P2       |           |
| 9.5  | Enumerable IDs                                                   | All IDs are UUIDs. No sequential-int ids in responses. `application_number` is sequential within tenant but cannot be used cross-tenant to enumerate (RLS) and cannot be used to fetch other tenants' apps. | P1       |           |
| 9.6  | Error messages don't leak info                                   | "Invalid input" not "Column X must be Y varchar(50) in applications table".                                                                                                                                 | P1       |           |
| 9.7  | Log lines                                                        | No JWTs, no Stripe keys, no raw passwords, no national_ids. `pii-redactor` middleware applied.                                                                                                              | P0       |           |
| 9.8  | Parent email in responses to parent                              | Visible (own email is not PII from the parent's perspective). Visible to admins (expected).                                                                                                                 | —        | N/A       |
| 9.9  | Timing-attack enumerate of households in existing-household mode | §6 of parent spec OB-P5: response times for "not found" vs "email found but DOB wrong" must be indistinguishable (constant-time comparison path).                                                           | P1       |           |
| 9.10 | Honeypot drop signal                                             | Server response is identical for honeypot-triggered vs legitimate submission. Attacker cannot detect drop.                                                                                                  | P1       |           |

---

## 10. Rate Limiting <a id="10-rate-limiting"></a>

| #    | Scenario                                                              | Expected                                                                                                                          | Severity | Pass/Fail |
| ---- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 10.1 | Public submit: 5 requests in 1h from same IP (limit 5)                | All succeed.                                                                                                                      | P2       |           |
| 10.2 | 6th request                                                           | 429 with `Retry-After` header.                                                                                                    | P1       |           |
| 10.3 | `cf-connecting-ip` missing (no Cloudflare), `x-forwarded-for` spoofed | Rate limiter falls back to socket IP. Shared gateway IP → all users may be bucketed together. Document as prod-config dependency. | P1       |           |
| 10.4 | Precision: concurrent burst of 10 from same IP                        | First 5 succeed, rest 429. Redis key is atomic.                                                                                   | P1       |           |
| 10.5 | Staff endpoints not rate-limited by IP                                | Authenticated burst is acceptable. If rate limiter fires on staff endpoints, flag for review.                                     | P2       |           |
| 10.6 | Webhook endpoint (Stripe) bypasses rate limit                         | `@SkipThrottle()` decorator applied. 1000 webhook events in 60s → all processed.                                                  | P1       |           |
| 10.7 | Cross-tenant abuse: Tenant A admin spams Tenant B                     | Only works via cross-tenant authenticated path — per-tenant rate limit applied at the API-key layer (if any) or per-user.         | P2       |           |

---

## 11. Security Headers <a id="11-headers"></a>

Verify on every HTML + API response:

| #     | Header                                 | Expected                                                                                                                                          | Severity | Pass/Fail |
| ----- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 11.1  | `Content-Security-Policy`              | `default-src 'self'; script-src 'self' https://js.stripe.com 'nonce-...'; frame-src https://js.stripe.com; style-src 'self' 'unsafe-inline'; ...` | P1       |           |
| 11.2  | `Strict-Transport-Security`            | `max-age=31536000; includeSubDomains; preload`.                                                                                                   | P1       |           |
| 11.3  | `X-Frame-Options`                      | `DENY` (or equivalent CSP `frame-ancestors 'none'`). Stripe iframe exceptions only on checkout page.                                              | P1       |           |
| 11.4  | `X-Content-Type-Options`               | `nosniff`.                                                                                                                                        | P1       |           |
| 11.5  | `Referrer-Policy`                      | `strict-origin-when-cross-origin` or tighter.                                                                                                     | P2       |           |
| 11.6  | `Permissions-Policy`                   | `camera=(), microphone=(), geolocation=(), payment=(self), usb=()`.                                                                               | P2       |           |
| 11.7  | `Access-Control-Allow-Origin`          | Not `*`. Only the known frontend origin (or tenant subdomain list).                                                                               | P0       |           |
| 11.8  | `Access-Control-Allow-Credentials`     | `true` only when origin is explicitly allowed.                                                                                                    | P0       |           |
| 11.9  | `Cache-Control` on sensitive endpoints | `no-store` for authenticated admin responses.                                                                                                     | P2       |           |
| 11.10 | `X-Robots-Tag`                         | `noindex, nofollow` on all `/apply/` confirmation pages (prevents search-engine indexing of application numbers).                                 | P2       |           |

---

## 12. Dependency Audit <a id="12-deps"></a>

| #    | Scenario                            | Expected                                                                                        | Severity | Pass/Fail |
| ---- | ----------------------------------- | ----------------------------------------------------------------------------------------------- | -------- | --------- |
| 12.1 | `pnpm audit --audit-level=critical` | 0 criticals.                                                                                    | P0       |           |
| 12.2 | `pnpm audit --audit-level=high`     | 0 without a documented mitigation note.                                                         | P1       |           |
| 12.3 | Lockfile committed, pinned          | `pnpm-lock.yaml` in repo; no version ranges in `dependencies` except where needed.              | P1       |           |
| 12.4 | Deprecated / unmaintained packages  | Review module deps for packages last published > 2 years ago with no commits — flag for review. | P2       |           |
| 12.5 | Supply-chain risk                   | No post-install scripts from untrusted packages. `pnpm` is configured with `ignore-scripts`.    | P1       |           |

---

## 13. Business-Logic Abuse <a id="13-biz-abuse"></a>

| #     | Scenario                                                                                                                  | Expected                                                                                                                                                         | Severity | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 13.1  | Negative cash payment amount                                                                                              | 400 Zod.                                                                                                                                                         | P1       |           |
| 13.2  | Zero cash payment                                                                                                         | 400 Zod.                                                                                                                                                         | P1       |           |
| 13.3  | Amount decimal precision attack: submit cash payment of 99.995 currency units repeatedly until cumulative balance desyncs | Service works in integer cents; 99.995 rejected or rounded at input; no drift.                                                                                   | P1       |           |
| 13.4  | Override with `full_waiver` + non-zero actual amount                                                                      | 400 `INCONSISTENT_OVERRIDE`. (OR auto-clamped to 0 — spec must document which).                                                                                  | P1       |           |
| 13.5  | Override with `partial_waiver` + actual = expected (no discount)                                                          | Accepted — product decision. Log for review.                                                                                                                     | P3       |           |
| 13.6  | Status skip: `draft → paid` equivalent (e.g. submitted → approved)                                                        | 400.                                                                                                                                                             | P0       |           |
| 13.7  | Double-apply: admin approves an application twice via racing calls                                                        | One succeeds, one 409.                                                                                                                                           | P0       |           |
| 13.8  | Double-spend: two cash payments for same application                                                                      | Only the first transitions to approved. Second returns 400 `INVALID_STATUS`.                                                                                     | P0       |           |
| 13.9  | Negative override `actual_amount_collected_cents`                                                                         | 400 Zod.                                                                                                                                                         | P1       |           |
| 13.10 | Sequence tampering: insert duplicate `application_number` via direct DB write                                             | Unique constraint rejects.                                                                                                                                       | P0       |           |
| 13.11 | Manual-promote of a rejected/withdrawn application                                                                        | 400 `INVALID_STATUS_TRANSITION`.                                                                                                                                 |          |           |
| 13.12 | Parent withdraws a terminal application                                                                                   | 400 `INVALID_STATUS_TRANSITION`. No state change. No email.                                                                                                      | P1       |           |
| 13.13 | Admin approves an application from a year_group that was zero-capacity at approval time and remained zero                 | 400 `NO_AVAILABLE_SEATS`. Seat never oversubscribed.                                                                                                             | P0       |           |
| 13.14 | Admin simultaneously approves 5 different ready_to_admit apps racing for 1 seat (capacity race)                           | Integration spec §8.2: one wins, others `NO_AVAILABLE_SEATS`. **If admin spec OB-04 race is real, this row fails — treat as P0 until resolved.**                 | P0       |           |
| 13.15 | Manual-promote race: 5 admins promote 5 waiting_list apps in a year_group with 1 seat                                     | **Admin spec OB-11 flags this as a potential bug**: promote does not consume seat; only conditional_approval does. Outcome: all promote, but only 1 can advance. | P1       |           |
| 13.16 | Payment-link regeneration spam (parent keeps clicking "Try again" after cancel)                                           | Rate-limited at the worker layer OR guarded by an idempotency window (e.g. only regenerate once per minute). Currently: unbounded — flag.                        | P2       |           |
| 13.17 | Stripe webhook forgery (if secret leaked)                                                                                 | Mitigation: rotate Stripe webhook secret; audit tenant Stripe usage; detection via amount_total vs payment_amount_cents check (§6.7 in integration spec).        | P0       |           |
| 13.18 | Replay attack on Stripe webhook                                                                                           | `stripe_event_id` unique constraint blocks. Replay returns 200 with no side effects.                                                                             | P0       |           |
| 13.19 | Admin bypasses the state machine by writing to DB directly via SQL console                                                | Only platform-admin SQL console exists; per RLS, tenant admins cannot. Platform-admin actions logged separately.                                                 | P1       |           |
| 13.20 | Impersonation: admin reviews application pretending to be another user                                                    | `reviewed_by_user_id` is set from the authenticated session, not request body. Admin cannot override.                                                            | P0       |           |
| 13.21 | Force-approve with justification copy-pasted from another application                                                     | Accepted (justification is free text). Monitored via `AdmissionOverride` audit trail; repeated identical justifications flagged.                                 | P3       |           |
| 13.22 | Withdraw own application then re-submit with same `national_id`                                                           | Either the unique constraint on (tenant_id, national_id) blocks the re-submission, OR the business rule allows it. Document and enforce consistently.            | P2       |           |
| 13.23 | Concurrent rejection + Stripe webhook success                                                                             | Race: reject wins (status → rejected); Stripe webhook arrives → `AdmissionsPaymentEvent.status='received_out_of_band'`. Payment refunded manually downstream.    | P1       |           |
| 13.24 | Cross-tenant form submission using Tenant B's `form_definition_id` while authenticated (or via slug) as Tenant A          | 400 `INVALID_FORM_DEFINITION` or 404.                                                                                                                            | P0       |           |
| 13.25 | Tampering `expected_updated_at` to force 409 on legitimate admin action                                                   | 409 returned. No side effect. Admin re-fetches and retries. No data loss — admin has a clear recovery path.                                                      | P2       |           |

---

## 14. Severity Tally + Observations <a id="14-tally"></a>

### 14.1 Severity tally (spec-time)

| Severity | Count of rows |
| -------- | ------------- |
| P0       | 42            |
| P1       | 55            |
| P2       | 30            |
| P3       | 8             |
| N/A      | 5             |

### 14.2 Observations (findings during the audit pass)

| #     | Severity | Location                                                      | Finding                                                                                                                                                                                                                                                                |
| ----- | -------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SE-01 | P1       | `admissions-rate-limit.service.ts`                            | Header-based IP extraction relies on `cf-connecting-ip` with fallback chain. If any prod environment runs behind a different proxy that doesn't preserve this header, limiter effectively disabled. Document the prod proxy chain; add a self-test.                    |
| SE-02 | P1       | `applications.service.ts / createPublic`                      | Honeypot detection silently drops — no metric emitted. Attackers gain no info but defenders gain no signal. Emit `admissions.honeypot_triggers` counter.                                                                                                               |
| SE-03 | P1       | Existing-household lookup                                     | Separate error codes + response times for "email not found" vs "email found + DOB wrong" → enumeration risk. Use single response code + constant-time compare.                                                                                                         |
| SE-04 | P0       | `application-state-machine.service.ts` / seat race            | Admin spec OB-04 flags that the row-level `SELECT FOR UPDATE` protects the row but not the year_group capacity as a whole. Two admins approving two DIFFERENT ready_to_admit apps in the same year_group with last seat can both succeed. Must verify and fix or gate. |
| SE-05 | P1       | Manual promote                                                | Admin spec OB-11 — promote doesn't consume seat; multiple promotes can over-queue. Low exploit value (admin only), but data shape deviates from invariants downstream.                                                                                                 |
| SE-06 | P1       | `application.payload_json` PII                                | National_id, medical_notes stored plaintext. GDPR sensitive categories (medical). Consider column-level encryption OR strict access-logging policy.                                                                                                                    |
| SE-07 | P2       | `admissions_payment_events.stripe_event_id` unique constraint | Current single index is unique globally; enforces idempotency. Tests MUST prevent any migration from removing this constraint.                                                                                                                                         |
| SE-08 | P2       | Parent portal note filtering                                  | Filter at DB query level (not at render). Integration spec §2.4.4 must verify that the JSON response never contains `is_internal=true` items.                                                                                                                          |
| SE-09 | P2       | Payment-link regenerate                                       | No cooldown; spam-click can generate many Stripe sessions. Consider 60s cooldown per application.                                                                                                                                                                      |
| SE-10 | P1       | Public submit response                                        | Response echoes submitted data back. Minimise to id + application_number + status — do not echo full consent block or payload.                                                                                                                                         |
| SE-11 | P1       | Worker WK-02                                                  | Stripe session regeneration non-idempotent — a DB-commit failure after Stripe API success leaks zombie sessions. Acceptable if Stripe test-mode cleanup is configured; production review required.                                                                     |
| SE-12 | P2       | CORS config                                                   | Verify `CORS_ALLOWED_ORIGINS` env var is a strict allowlist. Regression risk: a misconfigured deployment accidentally sets it to `*`.                                                                                                                                  |
| SE-13 | P2       | Error responses                                               | Confirm Nest's global exception filter does not include stack traces in 5xx response bodies in production mode.                                                                                                                                                        |
| SE-14 | P1       | Audit log coverage                                            | Regenerate-payment-link does not appear to write an ApplicationNote or audit_log row. Admin spec OB-13 flagged. Add an audit event.                                                                                                                                    |
| SE-15 | P2       | Form rebuild                                                  | Rebuild is immediate and replaces the published form. In-flight public form sessions may POST against a stale `form_definition_id`. Either accept with a "migrated" note, or reject with 409 — document and enforce.                                                   |

---

## 15. Sign-off <a id="15-signoff"></a>

| Section                           | Reviewer | Date | Pass | Fail | Notes |
| --------------------------------- | -------- | ---- | ---- | ---- | ----- |
| 2 — OWASP Top 10                  |          |      |      |      |       |
| 3 — Permission matrix (290 cells) |          |      |      |      |       |
| 4 — Injection fuzz                |          |      |      |      |       |
| 5 — Auth hardening                |          |      |      |      |       |
| 6 — CSRF + CORS                   |          |      |      |      |       |
| 7 — Encrypted-field access        |          |      |      |      |       |
| 8 — Audit-log integrity           |          |      |      |      |       |
| 9 — Sensitive data exposure       |          |      |      |      |       |
| 10 — Rate limiting                |          |      |      |      |       |
| 11 — Security headers             |          |      |      |      |       |
| 12 — Dependency audit             |          |      |      |      |       |
| 13 — Business-logic abuse         |          |      |      |      |       |
| **Overall**                       |          |      |      |      |       |

**Module security release-ready when every row Passes AND every P0 observation (SE-04) is resolved OR has a written, product-signed-off risk acceptance.**
