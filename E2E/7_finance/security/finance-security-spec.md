# Finance Module — Security Audit Specification

**Scope:** OWASP Top 10 (2021) coverage × finance surface, full permission matrix (every endpoint × every role), input injection fuzzing, authentication hardening, CSRF/CORS, encrypted field access control, audit log integrity, sensitive data exposure, rate limiting, security headers, dependency audit, business-logic abuse.
**Mindset:** Adversarial. Not verifying "it's secure"; hunting for the attack that hasn't been considered.
**Last updated:** 2026-04-12
**Baseline commit:** `384ba761`

---

## Table of Contents

1. [Threat Model Summary](#1-threat-model-summary)
2. [OWASP Top 10 Walkthrough](#2-owasp-top-10-walkthrough)
3. [Permission Matrix — Every Endpoint × Every Role](#3-permission-matrix--every-endpoint--every-role)
4. [Input Injection Fuzz](#4-input-injection-fuzz)
5. [Authentication Hardening](#5-authentication-hardening)
6. [CSRF + CORS](#6-csrf--cors)
7. [Encrypted Field Access Control](#7-encrypted-field-access-control)
8. [Audit Log Integrity](#8-audit-log-integrity)
9. [Sensitive Data Exposure Review (Responses + Logs)](#9-sensitive-data-exposure-review-responses--logs)
10. [Rate Limiting](#10-rate-limiting)
11. [Security Headers](#11-security-headers)
12. [Dependency Audit](#12-dependency-audit)
13. [Business-Logic Abuse](#13-business-logic-abuse)
14. [Findings Severity Tally](#14-findings-severity-tally)
15. [Sign-Off](#15-sign-off)

---

## 1. Threat Model Summary

**Target:** Multi-tenant SaaS financial module processing tuition payments, refunds, and school-finance data.

**Likely attackers:**

- **Malicious tenant admin** trying to read / mutate other tenants' data
- **Malicious parent** trying to access other households' data (same tenant), or other tenants' data
- **External attacker** with stolen credentials (refresh token, JWT, Stripe key)
- **Insider with limited permissions** (e.g., teacher, front-office clerk) attempting privilege escalation
- **Stripe webhook spoofer** sending forged `checkout.session.completed` events
- **Bot / automated** attacker probing for SQLi / XSS / rate-limit bypass

**What they want:**

- Read other tenants' invoice / payment / household data
- Refund themselves (or a confederate) — effectively siphon money
- Issue fraudulent invoices
- Obtain Stripe secret keys (to charge the tenant's own Stripe account)
- Manipulate audit logs to cover tracks
- DoS the API to disrupt operations

**Blast radius if successful:**

- **Tenant data leak** → GDPR breach, lost trust, regulatory action
- **Stripe key exfiltration** → tenant's Stripe account can be used to charge cards (or drain balance)
- **Refund fraud** → direct monetary loss to tenant
- **Audit log tamper** → incident investigation impossible
- **Cross-tenant access** → systemic breach, all onboarded tenants affected

---

## 2. OWASP Top 10 Walkthrough

### A01 — Broken Access Control

| #      | Attack                                                                        | Expected defence                                                                        | Severity | Pass/Fail |
| ------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------- | --------- |
| A01.1  | Teacher JWT against `GET /v1/finance/invoices`                                | 403 `FORBIDDEN`. Covered fully in §3 matrix.                                            | P0       |           |
| A01.2  | finance.view only, POST /invoices                                             | 403.                                                                                    | P0       |           |
| A01.3  | Parent JWT, any /v1/finance/\* admin endpoint                                 | 403.                                                                                    | P0       |           |
| A01.4  | Tenant A admin, direct URL to Tenant B invoice id                             | 404 `INVOICE_NOT_FOUND` (RLS makes it look nonexistent). NEVER 200 with B data. See §3. | P0       |           |
| A01.5  | IDOR — Tenant A admin tries Tenant B household id in `/statements/:id`        | 404. No household_name leak in error message.                                           | P0       |           |
| A01.6  | Parent accesses another household's invoice id via `/parent/invoices/:id/pay` | 403 `INVOICE_ACCESS_DENIED`.                                                            | P0       |           |
| A01.7  | Horizontal privilege — parent tries admin-style query params                  | Admin endpoints require `finance.*` which parents don't have. Verify via §3.            | P0       |           |
| A01.8  | Vertical privilege — teacher escalates via exporting audit logs               | 403. `GET /finance/audit-trail` requires finance.view.                                  | P0       |           |
| A01.9  | Approval endpoint — non-approver POSTs /approve on a pending_approval refund  | 403 (role check + self-approval block).                                                 | P1       |           |
| A01.10 | Self-approval block — requester approves their own refund                     | 403 `CANNOT_APPROVE_OWN_REFUND`.                                                        | P1       |           |

### A02 — Cryptographic Failures

| #     | Attack                                                               | Expected defence                                                                                                          | Severity | Pass/Fail |
| ----- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| A02.1 | Read `tenant_stripe_configs.stripe_secret_key_encrypted` via raw SQL | Returns ciphertext (not plaintext).                                                                                       | P0       |           |
| A02.2 | API response from any endpoint contains Stripe secret in plaintext   | Zero occurrences. Grep response bodies.                                                                                   | P0       |           |
| A02.3 | Stripe secret in application logs                                    | Zero. Grep log streams.                                                                                                   | P0       |           |
| A02.4 | TLS enforcement                                                      | HTTPS only; HTTP redirects with `Strict-Transport-Security` header. No plaintext API access in prod.                      | P0       |           |
| A02.5 | Weak cipher suites                                                   | TLS 1.2+ only. No RC4, no SSLv3, no TLS 1.0/1.1.                                                                          | P1       |           |
| A02.6 | Encryption key storage                                               | `encryption_key_ref` points to KMS; actual keys never in the DB or env files.                                             | P0       |           |
| A02.7 | KMS key rotation                                                     | Rotation supported; re-encryption happens on next write. Old ciphertext still decryptable during rotation window.         | P1       |           |
| A02.8 | Password storage                                                     | Not applicable for finance module — passwords are in the auth module. Confirm no finance code stores plaintext passwords. | P0       |           |
| A02.9 | Receipt / invoice PDFs served over TLS                               | Yes. Signed URLs (if used) expire.                                                                                        | P2       |           |

### A03 — Injection

| #     | Attack                                                               | Expected defence                                                                                                        | Severity | Pass/Fail |
| ----- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| A03.1 | SQL injection via every user-controlled string input                 | Zod validates; Prisma parameterises. No raw SQL with interpolation. Covered in §4.                                      | P0       |           |
| A03.2 | `$queryRawUnsafe` / `$executeRawUnsafe` usage outside RLS middleware | Zero. Lint rule enforces. Audit: `grep -rn "queryRawUnsafe\|executeRawUnsafe" apps/api/src/modules/finance` — expect 0. | P0       |           |
| A03.3 | NoSQL injection — not applicable (no MongoDB). Verify                | Zero MongoDB queries in finance module. N/A.                                                                            | P3 (N/A) |           |
| A03.4 | Command injection — not applicable (no shell-out)                    | Grep `exec\|spawn\|execSync` in finance — expect 0.                                                                     | P3 (N/A) |           |
| A03.5 | Template injection                                                   | PDF templates use parametrised rendering (not eval). Verify.                                                            | P1       |           |
| A03.6 | XSS via invoice description / reason / scholarship name / etc.       | React auto-escapes. No `dangerouslySetInnerHTML` in finance components. Persisted XSS stored-then-rendered is safe.     | P1       |           |
| A03.7 | CSV formula injection (reports export)                               | CSV cells starting with `=`, `+`, `-`, `@` must be escaped (leading apostrophe) or backend rejects. **Verify.**         | P1       |           |

### A04 — Insecure Design

| #     | Attack                                                           | Expected defence                                                                      | Severity | Pass/Fail |
| ----- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------- | --------- |
| A04.1 | Negative-amount refund                                           | Zod `amount > 0` refine → 400. Never processed.                                       | P0       |           |
| A04.2 | Negative-amount payment                                          | Zod `amount > 0` → 400.                                                               | P0       |           |
| A04.3 | Decimal-precision abuse — e.g. 0.005 rounded over N transactions | `roundMoney()` used consistently. Balance invariant holds ± 0.01 across N operations. | P1       |           |
| A04.4 | Integer overflow via very large amounts                          | Zod max value or Postgres `NUMERIC(12,2)` overflow rejects > 9,999,999,999.99.        | P1       |           |
| A04.5 | Status-skipping — POST /void on already-paid invoice             | 400 `INVALID_STATUS_TRANSITION`. Covered in /e2e-integration §11.                     | P0       |           |
| A04.6 | Race: same refund executed twice                                 | One succeeds, one fails. No double Stripe refund. Covered in /e2e-integration §7.     | P0       |           |
| A04.7 | Same credit-note applied twice                                   | Sum ≤ remaining_balance enforced; second attempt fails. §7.                           | P0       |           |
| A04.8 | Apply-late-fee without config                                    | 404 `LATE_FEE_CONFIG_NOT_FOUND`.                                                      | P2       |           |
| A04.9 | Over-allocate payment                                            | Sum of allocations ≤ payment.amount. 400 `ALLOCATION_EXCEEDS_PAYMENT`.                | P0       |           |

### A05 — Security Misconfiguration

| #     | Attack                                                  | Expected defence                                                                       | Severity | Pass/Fail |
| ----- | ------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------- | --------- |
| A05.1 | Missing CSP header                                      | Present (see §11).                                                                     | P1       |           |
| A05.2 | Missing HSTS                                            | Present with max-age ≥ 1y.                                                             | P1       |           |
| A05.3 | Missing X-Frame-Options                                 | Present: `DENY` or CSP `frame-ancestors 'none'`.                                       | P1       |           |
| A05.4 | Verbose error in 5xx                                    | Production errors return `{ code, message }` only. No stack traces. No internal paths. | P1       |           |
| A05.5 | Debug endpoints exposed                                 | None — no `/debug`, `/_profiler`, `/phpinfo`, etc. Confirm via route listing.          | P1       |           |
| A05.6 | Source maps exposed                                     | `.map` files not served in prod. Verify with `curl`.                                   | P2       |           |
| A05.7 | Admin endpoints exposed on public internet without auth | No. Every `/finance/*` requires auth + permission.                                     | P0       |           |

### A06 — Vulnerable and Outdated Components

| #     | What to check                                       | Expected                                         | Severity | Pass/Fail |
| ----- | --------------------------------------------------- | ------------------------------------------------ | -------- | --------- |
| A06.1 | `pnpm audit --audit-level=critical`                 | Zero critical CVEs.                              | P0       |           |
| A06.2 | `pnpm audit --audit-level=high`                     | Zero high CVEs, or each has a mitigation note.   | P1       |           |
| A06.3 | Stripe SDK version                                  | Latest minor. Pinned in package.json.            | P1       |           |
| A06.4 | `pdfkit` / `puppeteer` version (if used for PDFs)   | Latest minor.                                    | P2       |           |
| A06.5 | `zod`, `@nestjs/*`, `prisma` versions               | Latest minors.                                   | P2       |           |
| A06.6 | Lockfile committed                                  | `pnpm-lock.yaml` in git.                         | P1       |           |
| A06.7 | No deprecated / single-maintainer-risk dependencies | Manual review. Flag for follow-up if any appear. | P3       |           |

### A07 — Identification and Authentication Failures

| #      | Attack                                                              | Expected defence                                                                                                                | Severity | Pass/Fail |
| ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| A07.1  | Expired JWT                                                         | 401 `INVALID_TOKEN`. No work done, no data leaked in error.                                                                     | P0       |           |
| A07.2  | JWT signed with wrong key                                           | 401.                                                                                                                            | P0       |           |
| A07.3  | JWT with tampered `sub` claim                                       | Signature invalid → 401.                                                                                                        | P0       |           |
| A07.4  | JWT with tampered `tenant_id` claim                                 | Signature invalid → 401.                                                                                                        | P0       |           |
| A07.5  | JWT replay across tenants (A's JWT against B's host)                | 401/403. Token's tenant_id mismatches host tenant.                                                                              | P0       |           |
| A07.6  | Refresh token rotation                                              | Old refresh invalid after use. Stolen-refresh-detection: using an old refresh after new has been issued invalidates the family. | P0       |           |
| A07.7  | Concurrent sessions                                                 | Per product policy. Default: sessions are independent. Revoking one does not kill others unless explicitly requested.           | P2       |           |
| A07.8  | Brute force login (if login endpoint is in scope for finance audit) | N/A for finance — this is the auth module's concern. Note.                                                                      | N/A      |           |
| A07.9  | Session fixation                                                    | JWT regenerated on login; refresh token rotates. No fixed session ID reused.                                                    | P1       |           |
| A07.10 | Parent JWT used as admin JWT (role-swap via token tamper)           | Signature invalid → 401.                                                                                                        | P0       |           |

### A08 — Software and Data Integrity Failures

| #     | Attack                                                            | Expected defence                                                           | Severity | Pass/Fail |
| ----- | ----------------------------------------------------------------- | -------------------------------------------------------------------------- | -------- | --------- |
| A08.1 | Stripe webhook signature bypass — POST without `stripe-signature` | 400 `INVALID_SIGNATURE`.                                                   | P0       |           |
| A08.2 | Stripe webhook replay (same event.id twice)                       | Second delivery deduplicated. Covered in /e2e-integration §5.8.            | P0       |           |
| A08.3 | Stripe webhook event forgery with valid-but-old signature         | HMAC timestamp check rejects stale events (Stripe SDK handles).            | P0       |           |
| A08.4 | Audit log tamper via API                                          | No PATCH/DELETE endpoint exists. Verified by route inventory.              | P0       |           |
| A08.5 | Audit log tamper via direct DB                                    | Limited to DB operators. Postgres audit extensions (if enabled) catch DDL. | P2       |           |
| A08.6 | Package integrity — pnpm                                          | `pnpm-lock.yaml` present; `pnpm install --frozen-lockfile` in CI.          | P1       |           |
| A08.7 | CI artifact tamper                                                | Signed commits (if enabled); protected branch rules; required reviewers.   | P2       |           |

### A09 — Security Logging and Monitoring Failures

| #     | What to check                                          | Expected                                                                                  | Severity | Pass/Fail |
| ----- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------- | --------- |
| A09.1 | Every mutation writes audit_log                        | Verified in /e2e-integration §6.25.                                                       | P0       |           |
| A09.2 | Audit log contains actor, tenant, entity, before/after | §6.26.                                                                                    | P0       |           |
| A09.3 | Failed-auth attempts logged                            | 401s from JWT failures are logged.                                                        | P1       |           |
| A09.4 | Permission denials logged (403)                        | Log level info. Enables threat detection (repeat 403s from same IP/user).                 | P1       |           |
| A09.5 | Stripe webhook failures logged                         | Signature failures, tenant mismatch, event processing errors — all logged.                | P1       |           |
| A09.6 | Sensitive data NOT in logs                             | No JWT tokens, Stripe keys, raw passwords, bank details. Grep verify.                     | P0       |           |
| A09.7 | Alerting on elevated failure rates                     | Metrics + alerting (Grafana / Datadog) on 5xx spike, 401 spike, audit-log write failures. | P1       |           |
| A09.8 | Canary alert on queue SLA breach                       | `finance` queue 5-min SLA alert configured (per worker survey).                           | P1       |           |

### A10 — Server-Side Request Forgery (SSRF)

| #     | Attack                                           | Expected defence                                                                                                                                      | Severity | Pass/Fail |
| ----- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| A10.1 | User-supplied URL in any field                   | `success_url` + `cancel_url` in parent checkout. Backend validates to be a URL; no server-side fetch of user URLs — Stripe owns them. No SSRF vector. | P1       |           |
| A10.2 | Tenant branding logo URL                         | Stored; not fetched server-side by finance. PDF rendering may fetch — confirm allow-list.                                                             | P2       |           |
| A10.3 | PDF rendering (if it fetches external resources) | Templates should NOT fetch arbitrary URLs. If they do, restrict to same-origin or signed URLs.                                                        | P2       |           |
| A10.4 | Webhook callback URL (outbound from finance)     | Finance doesn't call outbound webhooks currently. Future: require allow-list.                                                                         | N/A      |           |

---

## 3. Permission Matrix — Every Endpoint × Every Role

**Roles:** `unauthenticated`, `parent` (with parent.view_finances), `parent` (with parent.make_payments added), `teacher`, `front_office` (no finance._), `accounting` (finance.manage, finance.view, finance.process_payments, finance.issue_refunds), `school_principal` (all finance._), `school_owner` (all finance.\*), `cross_tenant_admin` (school_principal on Tenant B), `platform_admin` (if platform routes are reachable from tenant hosts).

Matrix format: cell = expected HTTP status + error code.

### Admin endpoints

| Endpoint                                                       | unauth | teacher | parent | frontoffice | accounting                     | principal/owner | cross_tenant_admin |
| -------------------------------------------------------------- | ------ | ------- | ------ | ----------- | ------------------------------ | --------------- | ------------------ |
| GET /v1/finance/dashboard                                      | 401    | 403     | 403    | 403         | 200                            | 200             | 404 (or 403)       |
| GET /v1/finance/dashboard/debt-breakdown                       | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| GET /v1/finance/dashboard/household-overview                   | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| GET /v1/finance/dashboard/currency                             | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| PATCH /v1/finance/dashboard/currency                           | 401    | 403     | 403    | 403         | 403 (manage only)              | 200             | 404                |
| GET /v1/finance/invoices                                       | 401    | 403     | 403    | 403         | 200                            | 200             | 404 (A data)       |
| POST /v1/finance/invoices                                      | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| PATCH /v1/finance/invoices/:id                                 | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/invoices/:id/issue                            | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/invoices/:id/void                             | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/invoices/:id/cancel                           | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/invoices/:id/write-off                        | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| GET /v1/finance/invoices/:id/pdf                               | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/invoices/:id/installments                     | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/invoices/:id/apply-late-fee                   | 401    | 403     | 403    | 403         | 403                            | 200             | 404                |
| GET /v1/finance/payments                                       | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| GET /v1/finance/payments/staff                                 | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/payments                                      | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/payments/:id/allocations                      | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| GET /v1/finance/payments/:id/receipt                           | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| GET /v1/finance/payments/:id/receipt/pdf                       | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| GET /v1/finance/refunds                                        | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/refunds                                       | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/refunds/:id/approve                           | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/refunds/:id/reject                            | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/refunds/:id/execute                           | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| GET /v1/finance/credit-notes                                   | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/credit-notes                                  | 401    | 403     | 403    | 403         | 403 (manage_credit_notes only) | 200             | 404                |
| POST /v1/finance/credit-notes/apply                            | 401    | 403     | 403    | 403         | 403                            | 200             | 404                |
| POST /v1/finance/scholarships                                  | 401    | 403     | 403    | 403         | 403 (manage_scholarships only) | 200             | 404                |
| POST /v1/finance/scholarships/:id/revoke                       | 401    | 403     | 403    | 403         | 403                            | 200             | 404                |
| POST /v1/finance/late-fee-configs                              | 401    | 403     | 403    | 403         | 403 (manage_late_fees only)    | 200             | 404                |
| PATCH /v1/finance/late-fee-configs/:id                         | 401    | 403     | 403    | 403         | 403                            | 200             | 404                |
| GET /v1/finance/recurring-configs                              | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/recurring-configs/generate                    | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/reminders/due-soon                            | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/reminders/overdue                             | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/reminders/final-notice                        | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| GET /v1/finance/reports/aging                                  | 401    | 403     | 403    | 403         | 200 (view_reports)             | 200             | 404                |
| GET /v1/finance/reports/custom                                 | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| GET /v1/finance/reports/export                                 | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| GET /v1/finance/payment-plans                                  | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/payment-plans/admin-create                    | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/payment-plans/:id/approve                     | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/payment-plans/:id/reject                      | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/payment-plans/:id/counter-offer               | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/payment-plans/:id/cancel                      | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| GET /v1/finance/audit-trail                                    | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/bulk/issue                                    | 401    | 403     | 403    | 403         | 403 (bulk_operations only)     | 200             | 404                |
| POST /v1/finance/bulk/void                                     | 401    | 403     | 403    | 403         | 403                            | 200             | 404                |
| POST /v1/finance/bulk/remind                                   | 401    | 403     | 403    | 403         | 403                            | 200             | 404                |
| POST /v1/finance/bulk/export                                   | 401    | 403     | 403    | 403         | 403                            | 200             | 404                |
| GET /v1/finance/household-statements/:id                       | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| GET /v1/finance/household-statements/:id/pdf                   | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| GET /v1/finance/fee-types / POST / PATCH / DELETE              | 401    | 403     | 403    | 403         | 200 (manage)                   | 200             | 404                |
| GET /v1/finance/fee-structures / POST / PATCH / DELETE         | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| GET /v1/finance/fee-assignments / POST / PATCH / POST /:id/end | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| POST /v1/finance/fee-generation/preview / confirm              | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |
| GET /v1/finance/discounts / POST / PATCH / DELETE              | 401    | 403     | 403    | 403         | 200                            | 200             | 404                |

### Parent endpoints

| Endpoint                                          | unauth | teacher | parent_view_finances      | parent_make_payments | accounting | principal | cross_tenant_parent |
| ------------------------------------------------- | ------ | ------- | ------------------------- | -------------------- | ---------- | --------- | ------------------- |
| GET /v1/parent/students/:studentId/finances       | 401    | 403     | 200 (own students)        | 200                  | 403        | 403       | 403/404             |
| POST /v1/parent/invoices/:id/pay                  | 401    | 403     | 403 (needs make_payments) | 200 (own invoice)    | 403        | 403       | 403                 |
| POST /v1/parent/invoices/:id/request-payment-plan | 401    | 403     | 200                       | 200                  | 403        | 403       | 403                 |
| POST /v1/parent/payment-plans/:id/accept          | 401    | 403     | 200 (own plan)            | 200                  | 403        | 403       | 403                 |

### Webhook

| Endpoint                | no sig | valid sig correct tenant | valid sig wrong tenant | replay same event_id | unknown event type |
| ----------------------- | ------ | ------------------------ | ---------------------- | -------------------- | ------------------ |
| POST /v1/stripe/webhook | 400    | 200 (processed)          | 400 TENANT_MISMATCH    | 200 (deduplicated)   | 200 (ignored)      |

**Coverage:** 90 endpoints × 9 roles ≈ 810 cells. Every cell must be explicitly tested — a missing cell is a permission hole.

---

## 4. Input Injection Fuzz

For every user-controlled field, send each payload class and verify defensive behaviour.

### Fields to fuzz

- String inputs: `household_name` (via invoice create indirectly), `description` (invoice line), `reason` (payment, refund, credit note), `write_off_reason`, `name` (fee type, discount, scholarship, late fee config), `admin_notes` (payment plan), `comment` (refund approve/reject), `search` query (all list endpoints), `invoice_number` filter, `payment_reference` filter, `entity_type` filter.
- UUID inputs: any `:id` param; `household_id`, `student_id`, `fee_structure_id`, `fee_type_id`, `discount_id`, `payment_id`, `invoice_id`, `credit_note_id` in bodies.
- Numeric inputs: `amount`, `quantity`, `unit_amount`, `discount_amount`, `grace_period_days`, `max_applications`, `frequency_days`.
- Date inputs: `due_date`, `received_at`, `effective_from`, `effective_to`, `billing_period_start`, `billing_period_end`, `award_date`, `renewal_date`, `date_from`, `date_to`.
- Enum inputs: `status`, `payment_method`, `fee_type`, `discount_type`, `billing_frequency`, `frequency`.

### Payload classes and expected defence

| #    | Payload                                                         | Applied to                    | Expected defence                                                                                                                        | Severity | Pass/Fail |
| ---- | --------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 4.1  | `<script>alert(1)</script>`                                     | All string inputs             | Stored as-is; React escapes on render. No execution in admin UI, parent UI, or PDFs.                                                    | P0       |           |
| 4.2  | `"><img src=x onerror=alert(1)>`                                | All strings                   | Same. No DOM XSS.                                                                                                                       | P0       |           |
| 4.3  | `javascript:alert(1)`                                           | All URL-like fields           | Stored; not rendered as href without `http(s)://` validation.                                                                           | P1       |           |
| 4.4  | Polyglot SVG XSS                                                | All strings                   | React renders as text.                                                                                                                  | P1       |           |
| 4.5  | `'; DROP TABLE invoices; --`                                    | All strings                   | Prisma parameterises. Zod validates where applicable. Stored as text safely.                                                            | P0       |           |
| 4.6  | `' OR '1'='1`                                                   | search + id fields            | ID fields rejected by `ParseUUIDPipe` with 400. String fields stored.                                                                   | P0       |           |
| 4.7  | `' UNION SELECT * FROM tenant_stripe_configs --`                | String fields                 | Safe; parameterised.                                                                                                                    | P0       |           |
| 4.8  | NoSQL — `{"$ne": null}` (JSON body)                             | N/A (Prisma, not MongoDB)     | Zod rejects extra fields → 400.                                                                                                         | P3 (N/A) |           |
| 4.9  | Command injection `; rm -rf /`                                  | All strings                   | Not used in shell. Safe by absence of exec paths.                                                                                       | P3 (N/A) |           |
| 4.10 | Path traversal `../../etc/passwd`                               | filename-like fields (if any) | Finance does not read user-supplied file paths. PDF filenames are server-constructed.                                                   | P2       |           |
| 4.11 | `%2e%2e%2f` URL-encoded traversal                               | Path params                   | ParseUUIDPipe rejects.                                                                                                                  | P2       |           |
| 4.12 | Null byte `%00`                                                 | All strings                   | Postgres stores null bytes in `TEXT`/`VARCHAR` as-is (or rejects if NULLs not allowed). Length validation catches in Zod if max-length. | P2       |           |
| 4.13 | Homoglyph characters (Cyrillic 'а' vs Latin 'a')                | name / description            | Stored verbatim. Search may miss. Acceptable.                                                                                           | P3       |           |
| 4.14 | Overlong UTF-8                                                  | All strings                   | Postgres accepts valid UTF-8 only. Invalid → error.                                                                                     | P3       |           |
| 4.15 | 1MB string in `description`                                     | String fields                 | Zod max-length rejects (varies per field: 150/500/2000).                                                                                | P1       |           |
| 4.16 | Deeply nested JSON (100 levels)                                 | body                          | Express body-parser limits depth. 400 / 413.                                                                                            | P2       |           |
| 4.17 | 10MB JSON body                                                  | body                          | body-parser limit (default 100KB / 1MB) rejects with 413.                                                                               | P2       |           |
| 4.18 | Type confusion: `{"amount": "100"}` (string instead of number)  | numeric fields                | Zod coerces or rejects with 400 VALIDATION_ERROR.                                                                                       | P2       |           |
| 4.19 | `{"amount": []}` (array instead of scalar)                      | —                             | 400.                                                                                                                                    | P2       |           |
| 4.20 | `{"amount": null}` when required                                | —                             | 400 (required).                                                                                                                         | P2       |           |
| 4.21 | `{"amount": undefined}` (literal undefined via JS)              | —                             | Equivalent to missing → 400.                                                                                                            | P2       |           |
| 4.22 | Negative `quantity`: `-1`                                       | invoice lines                 | 400 (positive refine).                                                                                                                  | P0       |           |
| 4.23 | Very large amount: `999999999999.99`                            | `amount`                      | Stored if within NUMERIC(12,2); > max rejected at DB or Zod.                                                                            | P1       |           |
| 4.24 | Decimal precision: `0.001`                                      | `amount`                      | NUMERIC(12,2) rounds to 2dp. Zod may reject > 2dp.                                                                                      | P2       |           |
| 4.25 | Malformed UUID: `'not-a-uuid'`                                  | :id params                    | ParseUUIDPipe 400 `INVALID_UUID`.                                                                                                       | P2       |           |
| 4.26 | UUID v1 instead of v4                                           | :id params                    | Accepted (Prisma doesn't distinguish). Document.                                                                                        | P3       |           |
| 4.27 | Malformed date: `'tomorrow'`                                    | date fields                   | Zod 400.                                                                                                                                | P2       |           |
| 4.28 | Date in year 9999                                               | date fields                   | Accepted if within Postgres DATE range. Edge case — document.                                                                           | P3       |           |
| 4.29 | Enum outside set: `status=invalid`                              | status, fee_type, etc.        | Zod 400.                                                                                                                                | P2       |           |
| 4.30 | CSV in array: `?invoice_ids=uuid1,uuid2` correctly preprocessed | bulk array inputs             | `preprocess` parses. Malformed → 400.                                                                                                   | P2       |           |
| 4.31 | XSS in CSV export (cell starting with `=`)                      | CSV reports                   | Must escape with leading apostrophe or quote-wrap. Confirm — if not, CSV formula injection is P1.                                       | P1       |           |
| 4.32 | Second-order XSS: save XSS string, then view                    | admin UI                      | Safely rendered.                                                                                                                        | P0       |           |
| 4.33 | Second-order XSS in PDF                                         | PDF text rendering            | Rendered as text, not code. No script execution in PDF viewers.                                                                         | P1       |           |

---

## 5. Authentication Hardening

| #    | Attack                                                           | Expected defence                                                                              | Severity | Pass/Fail |
| ---- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------- | --------- |
| 5.1  | Expired JWT (exp < now)                                          | 401 `TOKEN_EXPIRED` or generic 401.                                                           | P0       |           |
| 5.2  | JWT signed with wrong secret                                     | 401.                                                                                          | P0       |           |
| 5.3  | JWT with `alg: 'none'`                                           | 401 (no `alg: none` allowed).                                                                 | P0       |           |
| 5.4  | JWT with alg downgrade (RS256 → HS256 with public key as secret) | 401.                                                                                          | P0       |           |
| 5.5  | JWT with tampered payload                                        | Signature invalid → 401.                                                                      | P0       |           |
| 5.6  | Refresh token reuse after rotation                               | Old refresh invalid. Entire session family revoked (if stolen-refresh-detection implemented). | P0       |           |
| 5.7  | Refresh token replay across tenants                              | Rejected; refresh is bound to tenant.                                                         | P0       |           |
| 5.8  | JWT in URL query string                                          | Never. Only in `Authorization: Bearer` header.                                                | P1       |           |
| 5.9  | Session fixation                                                 | New JWT issued on login. Old JWT invalidated if explicit logout. Refresh rotates every use.   | P1       |           |
| 5.10 | Missing JWT on a protected endpoint                              | 401.                                                                                          | P0       |           |
| 5.11 | Parent JWT against admin endpoint                                | 403 (permission), not 401 (token valid but insufficient perms).                               | P1       |           |

---

## 6. CSRF + CORS

| #   | Attack                               | Expected defence                                                                                                                                          | Severity | Pass/Fail |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 6.1 | Classic CSRF POST from attacker site | Bearer-token auth in Authorization header — cookies alone don't authenticate. Browser won't add the Authorization header automatically from cross-origin. | P0       |           |
| 6.2 | CORS preflight                       | `Access-Control-Allow-Origin: https://<tenant>.edupod.app` only. No `*`. Methods/headers explicitly listed.                                               | P0       |           |
| 6.3 | CORS with credentials flag           | `Access-Control-Allow-Credentials: true` ONLY for the trusted frontend origin.                                                                            | P0       |           |
| 6.4 | Null origin                          | CORS rejects.                                                                                                                                             | P1       |           |
| 6.5 | Any origin wildcard                  | Never. Per-tenant origin only.                                                                                                                            | P0       |           |
| 6.6 | Refresh cookie — SameSite            | `SameSite=Strict` or `Lax`. `Secure` flag. `HttpOnly`.                                                                                                    | P0       |           |
| 6.7 | Attacker sub-subdomain takeover      | Cookie `Domain` scope is tight (`.edupod.app` or a specific tenant subdomain only).                                                                       | P1       |           |
| 6.8 | CSRF via stripe webhook (forged)     | Signature verification (A08.1). Origin not checked — Stripe sends from its own IPs.                                                                       | P0       |           |

---

## 7. Encrypted Field Access Control

Same as /e2e-integration §9 but adversarial:

| #   | What to attempt                                             | Expected defence                                                                                         | Severity | Pass/Fail |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 7.1 | Select `stripe_secret_key_encrypted` via any admin endpoint | Not exposed by any endpoint. Verify via route audit.                                                     | P0       |           |
| 7.2 | Include `encryption_key_ref` in API response                | Never. KMS ref is operational-only.                                                                      | P0       |           |
| 7.3 | Decrypt call without KMS permission                         | Throws `KMS_ACCESS_DENIED`; no leak in error message.                                                    | P0       |           |
| 7.4 | Grep logs for Stripe key plaintext                          | Zero.                                                                                                    | P0       |           |
| 7.5 | Error message exposing key                                  | Never. Errors use generic messages.                                                                      | P0       |           |
| 7.6 | Key rotation — old ciphertext readable during grace period  | Yes; decryption tries each active key.                                                                   | P1       |           |
| 7.7 | Old ciphertext after rotation grace period expires          | Either auto-migrates on write, OR a migration job re-encrypts.                                           | P2       |           |
| 7.8 | Memory dump / heap snapshot                                 | Plaintext key exists briefly in memory during decrypt. Minimise lifetime: re-fetch per request vs cache. | P2       |           |
| 7.9 | Swap / hibernation file                                     | Production runs with `vm.swappiness=0` or no swap (platform config).                                     | P2       |           |

---

## 8. Audit Log Integrity

| #   | What to attempt                                    | Expected                                                                                                                     | Severity | Pass/Fail |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 8.1 | PATCH /v1/finance/audit-trail/:id                  | 404 — no such route.                                                                                                         | P0       |           |
| 8.2 | DELETE /v1/finance/audit-trail/:id                 | 404.                                                                                                                         | P0       |           |
| 8.3 | Direct SQL UPDATE audit_logs WHERE id=?            | Requires direct DB access. Operational-only. Document that DB access is strictly limited.                                    | P1       |           |
| 8.4 | Every refund executed has an audit row             | `SELECT COUNT(*) FROM audit_logs WHERE entity_type='refund' AND action='execute'` matches `refunds WHERE status='executed'`. | P0       |           |
| 8.5 | Audit row contains before/after JSON               | `SELECT before_payload, after_payload FROM audit_logs LIMIT 10` — both present and parseable.                                | P1       |           |
| 8.6 | Audit row redacts sensitive fields in before/after | No stripe_secret / JWT / password fields in audit payload.                                                                   | P0       |           |
| 8.7 | Audit row has actor_id + tenant_id + request_id    | All three present.                                                                                                           | P1       |           |
| 8.8 | Audit logs retained per policy                     | Per product policy (e.g. 7 years for finance records). No auto-prune for finance audit.                                      | P1       |           |

---

## 9. Sensitive Data Exposure Review (Responses + Logs)

| #    | Response / log source                            | Expected                                                                                                            | Severity | Pass/Fail |
| ---- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 9.1  | GET /finance/invoices response                   | No JWT, Stripe key, password, refresh token, bank details.                                                          | P0       |           |
| 9.2  | GET /finance/payments response                   | Same.                                                                                                               | P0       |           |
| 9.3  | GET /parent/students/:id/finances response       | No data from other households. No admin-only fields (e.g. tenant_id leaked beyond necessity).                       | P0       |           |
| 9.4  | Error 500 body                                   | Generic `{ code: 'INTERNAL_ERROR', message: '...' }`. No stack, no DB errors verbatim.                              | P1       |           |
| 9.5  | Error 400 body                                   | `{ code, message, details? }` — details may list field paths but not internal state.                                | P2       |           |
| 9.6  | Log line for a successful payment                | Includes payment_id, tenant_id, amount, currency — but NOT stripe_secret or card details.                           | P0       |           |
| 9.7  | Log line for Stripe webhook verification failure | Includes event.id, tenant_id — NOT the full payload or signature.                                                   | P1       |           |
| 9.8  | Log line for refund failure                      | Includes refund_id, amount — NOT full Stripe error with plaintext keys.                                             | P1       |           |
| 9.9  | PII in logs                                      | Parent names, emails, phones may appear in audit_log payloads — acceptable. JWT tokens must NOT.                    | P1       |           |
| 9.10 | Integer ID enumeration                           | All IDs are UUIDs. No sequential integer primary keys on any finance table.                                         | P0       |           |
| 9.11 | Invoice number format — sequential per tenant    | Per-tenant sequential, but with date-prefix and zero-padding. Admin-only visibility. Parent sees own invoices only. | P2       |           |

---

## 10. Rate Limiting

| #     | Endpoint                                           | Limit                                                        | Expected                                       | Severity             | Pass/Fail |
| ----- | -------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------- | -------------------- | --------- |
| 10.1  | GET /v1/finance/dashboard                          | e.g., 60 req/min/user                                        | 429 after threshold with `Retry-After` header. | P2                   |           |
| 10.2  | POST /v1/finance/payments                          | e.g., 20 req/min/user                                        | 429.                                           | P1                   |           |
| 10.3  | POST /v1/finance/bulk/issue                        | e.g., 5 req/min/user (heavy)                                 | 429.                                           | P1                   |           |
| 10.4  | POST /v1/parent/invoices/:id/pay                   | e.g., 5 req/min/user (prevents Stripe session spam)          | 429.                                           | P0                   |           |
| 10.5  | POST /v1/stripe/webhook                            | `@SkipThrottle` — NO rate limit                              | 200 under burst. Confirm.                      | P1                   |           |
| 10.6  | Cross-tenant rate-limit isolation                  | Tenant A flood doesn't trigger 429 for Tenant B              | Separate buckets per tenant or per user.       | P1                   |           |
| 10.7  | IP-based limit vs user-based limit                 | Both — IP-based for unauth; user-based for authenticated.    | —                                              | P2                   |           |
| 10.8  | Parent `POST /pay` rate limit                      | Tight enough to prevent Stripe session abuse (e.g., 10/min). | —                                              | P0                   |           |
| 10.9  | Failed login rate limit (auth module, not finance) | 5 failed attempts → 15min lockout.                           | —                                              | P1 (N/A for finance) |           |
| 10.10 | PDF render rate limit                              | e.g., 30 req/min — render is CPU-heavy.                      | —                                              | P2                   |           |

---

## 11. Security Headers

| #     | Header                               | Expected                                                                                                                                              | Pass/Fail |
| ----- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1  | `Content-Security-Policy`            | Strict. No `unsafe-inline` scripts. `default-src 'self'`; `script-src 'self' 'nonce-<xxx>'`; `img-src 'self' data: https:`; `frame-ancestors 'none'`. |           |
| 11.2  | `Strict-Transport-Security`          | `max-age=31536000; includeSubDomains; preload`.                                                                                                       |           |
| 11.3  | `X-Frame-Options`                    | `DENY` (or CSP `frame-ancestors 'none'`).                                                                                                             |           |
| 11.4  | `X-Content-Type-Options`             | `nosniff`.                                                                                                                                            |           |
| 11.5  | `Referrer-Policy`                    | `strict-origin-when-cross-origin` or tighter.                                                                                                         |           |
| 11.6  | `Permissions-Policy`                 | Explicit allow-list for camera, microphone, geolocation, payment. Most disabled.                                                                      |           |
| 11.7  | `X-Powered-By`                       | Removed (no NestJS banner).                                                                                                                           |           |
| 11.8  | `Cache-Control` on API responses     | `no-store` for authenticated GETs. No caching of sensitive data by intermediate proxies.                                                              |           |
| 11.9  | `Set-Cookie` for refresh             | `HttpOnly; Secure; SameSite=Strict; Path=/; Domain=...`.                                                                                              |           |
| 11.10 | Responses do not leak server version | Nginx / Node version not disclosed.                                                                                                                   |           |
| 11.11 | PDF response                         | `Content-Disposition` + `Content-Type: application/pdf` + same security headers.                                                                      |           |

---

## 12. Dependency Audit

| #    | What to run                                                  | Expected                                                     | Pass/Fail |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------------ | --------- |
| 12.1 | `pnpm audit --audit-level=critical`                          | 0 critical CVEs.                                             |           |
| 12.2 | `pnpm audit --audit-level=high`                              | 0 high CVEs, or each has a mitigation commit + note.         |           |
| 12.3 | Dependency list                                              | Lockfile `pnpm-lock.yaml` committed; matches `package.json`. |           |
| 12.4 | Stripe SDK version                                           | Current minor; not EOL.                                      |           |
| 12.5 | Prisma version                                               | 5.x latest; patch-upgraded in the past month.                |           |
| 12.6 | NestJS version                                               | 10.x latest minor.                                           |           |
| 12.7 | Zod version                                                  | 3.x latest minor.                                            |           |
| 12.8 | Any package with single maintainer + > 100k weekly downloads | Flag for ecosystem-risk review.                              |           |
| 12.9 | No unmaintained packages (last publish > 2 years)            | Flag.                                                        |           |

---

## 13. Business-Logic Abuse

| #     | Attack                                                                                      | Expected defence                                                                                                           | Severity | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 13.1  | Refund amount: negative                                                                     | 400 Zod.                                                                                                                   | P0       |           |
| 13.2  | Refund amount: zero                                                                         | 400 (positive refine).                                                                                                     | P0       |           |
| 13.3  | Refund exceeding payment amount                                                             | 400 `AMOUNT_EXCEEDS_AVAILABLE`.                                                                                            | P0       |           |
| 13.4  | Refund on already-fully-refunded payment                                                    | 400.                                                                                                                       | P0       |           |
| 13.5  | Two concurrent refunds totalling > payment.amount                                           | At most one succeeds up to the cap; second fails with available-amount check.                                              | P0       |           |
| 13.6  | Decimal precision exploit: repeat small refunds to accumulate                               | Not exploitable — each refund goes through allocation-check. Sum stays bounded by payment.amount.                          | P1       |           |
| 13.7  | Refund Stripe charge then re-allocate the original payment                                  | payment.status → `refunded_partial` / `refunded_full`. Invoice balance reverts. Re-allocating must re-charge Stripe first. | P1       |           |
| 13.8  | Self-approve own refund                                                                     | 403.                                                                                                                       | P0       |           |
| 13.9  | Credit note amount: negative                                                                | 400.                                                                                                                       | P0       |           |
| 13.10 | Credit note apply: amount > remaining_balance                                               | 400.                                                                                                                       | P0       |           |
| 13.11 | Credit note apply: amount > invoice.balance_amount                                          | 400 (if enforced — /e2e-integration §3D.6).                                                                                | P1       |           |
| 13.12 | Discount percent > 100                                                                      | 400.                                                                                                                       | P1       |           |
| 13.13 | Scholarship percent > 100                                                                   | 400.                                                                                                                       | P1       |           |
| 13.14 | Invoice issue → void → re-issue                                                             | Cannot re-issue a voided invoice. 400 `INVALID_STATUS_TRANSITION`.                                                         | P1       |           |
| 13.15 | Write-off then "un-write-off"                                                               | No un-write-off path. Terminal.                                                                                            | P1       |           |
| 13.16 | Parent requests payment plan on already-paid invoice                                        | 400 `INVALID_INVOICE_STATUS`.                                                                                              | P1       |           |
| 13.17 | Parent proposes plan sum > invoice.balance (double-bill themselves)                         | 400 `INSTALLMENT_SUM_MISMATCH`.                                                                                            | P1       |           |
| 13.18 | Parent proposes plan sum < invoice.balance (under-bill)                                     | 400 `INSTALLMENT_SUM_MISMATCH`.                                                                                            | P1       |           |
| 13.19 | Fee-generation idempotency bypass — deleting the unique index partial constraint            | Backend enforces uniqueness at service layer + Prisma constraint. Test: concurrent confirm → one succeeds.                 | P0       |           |
| 13.20 | Late fee max_applications bypass — concurrent applications                                  | Sum ≤ max_applications (§13 /e2e-integration concurrency §7.5).                                                            | P1       |           |
| 13.21 | Invoice write-off then payment allocation                                                   | 400 `INVALID_INVOICE_STATUS` — written_off is terminal for allocations.                                                    | P1       |           |
| 13.22 | Payment on void invoice                                                                     | 400.                                                                                                                       | P1       |           |
| 13.23 | Fee assignment effective_to in the past                                                     | 400 (or accepted if product allows historical).                                                                            | P2       |           |
| 13.24 | Race: two credit-note apply calls racing, each within budget but together exceeding balance | Atomic update on remaining_balance. Exactly one succeeds up to the cap.                                                    | P0       |           |
| 13.25 | Refund on a payment allocated across 3 invoices — LIFO vs FIFO reversal                     | Verify reversal order matches LIFO (most-recent-allocation-first). Document and test.                                      | P1       |           |
| 13.26 | Stripe refund succeeds but DB update fails                                                  | Refund status = `failed` with failure_reason. Compensating admin action required. Document the recovery procedure.         | P1       |           |
| 13.27 | Discount auto-apply evasion — household with 3 students but only 1 meets criteria           | Only students meeting auto_condition get the discount. Verify.                                                             | P2       |           |
| 13.28 | Sequence number collision across tenants                                                    | Impossible — `tenant_sequences` keyed on (tenant_id, sequence_type).                                                       | P0       |           |
| 13.29 | Negative sequence number                                                                    | Impossible — always incremented via `SELECT ... FOR UPDATE + n+1`.                                                         | P0       |           |
| 13.30 | Currency change mid-stream                                                                  | PATCH /dashboard/currency with existing data — should warn or block (no multi-currency per CLAUDE.md).                     | P1       |           |

---

## 14. Findings Severity Tally

Fill in after audit run.

| Severity | Count | Examples                                    |
| -------- | ----- | ------------------------------------------- |
| P0       |       | (critical — immediate exploit or data leak) |
| P1       |       | (high — significant risk)                   |
| P2       |       | (medium — defence-in-depth)                 |
| P3       |       | (low / informational)                       |

### Observations from code walkthrough (pre-audit)

1. **P1 — parent endpoint mismatch exposes all parent finance flows to 404.** Frontend calls paths backend doesn't expose. In prod, parents cannot pay invoices, cannot download receipts, cannot request plans. This is a functional bug but also denies parents from performing actions they SHOULD be able to — flag as access issue (not a leak, but a functionality bug that masks a deeper problem: the frontend was written against a spec the backend didn't match, increasing risk of adversarial-path testing finding real gaps).
2. **P2 — no rate limiting on `POST /parent/invoices/:id/pay`** confirmed in §10.4 — this is a Stripe-abuse vector.
3. **P2 — self-approval block enforcement must be verified** (§5/A01.10). If not enforced, admin1 can refund themselves.
4. **P2 — log sanitization for Stripe failure_reason** — if Stripe error contains the attempted key or metadata, it may leak via §9.8.
5. **P2 — no `idx_invoices_overdue_candidates` partial index** (per perf §9.11) — not a security issue directly, but slow overdue detection becomes a DoS vector at scale.
6. **P3 — the `@SkipThrottle()` on webhook** is correct, but means a flood of malformed webhook POSTs can consume CPU. Verify signature-verification is cheap enough to not be a DoS vector; if not, add an early cheap check.

---

## 15. Sign-Off

| Reviewer Name | Role              | Date | Pass | Fail | Overall Result |
| ------------- | ----------------- | ---- | ---- | ---- | -------------- |
|               | internal security |      |      |      |                |
|               | paid consultant   |      |      |      |                |

**Release gate:** Zero P0 findings unresolved. Every P1 finding has a mitigation note or scheduled fix.

**Bar for passing:** "A paid professional security consultant ($10k for a week) would find nothing new to tell us about this module." If any P0 is still open, the bar is not met.
