# Security Audit Specification: Communications Module

> **Leg 5 of the `/e2e-full` release-readiness pack.** This spec adversarially exercises the module against OWASP Top 10 (2021), injection vectors, authentication hardening, permission-matrix enforcement, encrypted-field leak surfaces, and business-logic abuse. Runnable by an internal security engineer, a paid pen-tester, or a Burp-Suite / ZAP-driven harness.

**Module:** Communications (inbox, announcements, notifications, parent inquiries, safeguarding, oversight)
**Target executor:** Security engineer or pen-tester; automation via OWASP ZAP, Burp Community, and custom curl + jq scripts
**Base URL:** staging (`https://api-staging.edupod.app`, `https://staging.edupod.app`) and production (only once staging clean)

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Out of scope](#2-out-of-scope)
3. [OWASP Top 10 — A01 Broken Access Control](#3-owasp-a01)
4. [OWASP Top 10 — A02 Cryptographic Failures](#4-owasp-a02)
5. [OWASP Top 10 — A03 Injection](#5-owasp-a03)
6. [OWASP Top 10 — A04 Insecure Design](#6-owasp-a04)
7. [OWASP Top 10 — A05 Security Misconfiguration](#7-owasp-a05)
8. [OWASP Top 10 — A06 Vulnerable Components](#8-owasp-a06)
9. [OWASP Top 10 — A07 Identification & Authentication Failures](#9-owasp-a07)
10. [OWASP Top 10 — A08 Software & Data Integrity Failures](#10-owasp-a08)
11. [OWASP Top 10 — A09 Security Logging & Monitoring Failures](#11-owasp-a09)
12. [OWASP Top 10 — A10 Server-Side Request Forgery](#12-owasp-a10)
13. [Permission matrix — every endpoint × every role (hostile)](#13-permission-matrix)
14. [Injection fuzz — every text input](#14-injection-fuzz)
15. [Encrypted / sensitive field round-trip](#15-encrypted-fields)
16. [Business-logic abuse scenarios](#16-business-logic-abuse)
17. [HTTP hardening headers](#17-http-hardening)
18. [Rate limiting & DoS surface](#18-rate-limiting)
19. [Severity tally](#19-severity-tally)
20. [Sign-off](#20-sign-off)

---

## 1. Prerequisites

- Two tenants (`nhqs`, `test-b`) provisioned per the other legs
- At least one user in every role: `school_owner`, `school_principal`, `school_vice_principal`, `admin`, `teacher`, `front_office`, `accounting`, `parent`, `student` — per tenant
- One "attacker" account with no role assigned (if supported) or a freshly-created student account without prior relational scope
- Burp Suite / OWASP ZAP configured as an HTTPS proxy with the CA cert trusted
- Valid JWTs for each role + one expired + one tampered token prepared in advance
- Scripts to mass-assemble payloads: curl + bash loops acceptable

---

## 2. Out of Scope

This spec covers security. It does **NOT** cover:

- Functional correctness (leg-1 UI specs)
- RLS happy-path correctness (covered in integration spec — but this leg tests adversarial RLS attacks)
- Performance (leg-4 perf spec) — DoS via pathological payloads is tested here
- Physical / infrastructure security (out of scope for app-level pack)

---

## 3. OWASP Top 10 — A01 Broken Access Control

### 3.1 Cross-tenant access (IDOR)

| #      | Attempt                                                                             | Expected                                               | Severity | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------ | -------- | --------- |
| 3.1.1  | As `nhqs` owner: `GET /v1/inbox/conversations/{test-b_conv_id}` (direct ID swap)    | 404 (never 200, never 403 with body)                   | P0       |           |
| 3.1.2  | As `nhqs` owner: `POST /v1/inbox/conversations/{test-b_conv_id}/messages` with body | 404; no row inserted                                   | P0       |           |
| 3.1.3  | As `nhqs` owner: `PATCH /v1/inbox/messages/{test-b_msg_id}`                         | 404                                                    | P0       |           |
| 3.1.4  | As `nhqs` owner: `DELETE /v1/inbox/messages/{test-b_msg_id}`                        | 404                                                    | P0       |           |
| 3.1.5  | As `nhqs` owner: `POST /v1/inbox/oversight/conversations/{test-b_conv_id}/freeze`   | 404                                                    | P0       |           |
| 3.1.6  | As `nhqs` owner: `POST /v1/inbox/oversight/conversations/{test-b_conv_id}/export`   | 404; no PDF generated; no presigned URL returned       | P0       |           |
| 3.1.7  | As `nhqs` owner: `GET /v1/announcements/{test-b_announcement_id}`                   | 404                                                    | P0       |           |
| 3.1.8  | As `nhqs` owner: `POST /v1/announcements/{test-b_announcement_id}/publish`          | 404                                                    | P0       |           |
| 3.1.9  | As `nhqs` owner: `PATCH /v1/safeguarding/keywords/{test-b_keyword_id}`              | 404                                                    | P0       |           |
| 3.1.10 | As `nhqs` parent: `GET /v1/inquiries/{other_nhqs_parent_inquiry_id}/parent`         | 404 (same tenant, different parent; RLS + owner check) | P0       |           |
| 3.1.11 | Burp Intruder: fuzz 1,000 random UUIDs in `/v1/inbox/conversations/{id}`            | 404 rate = 100%                                        | P0       |           |

### 3.2 Horizontal privilege escalation

| #     | Attempt                                                                              | Expected                                                                  | Severity | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | -------- | --------- |
| 3.2.1 | As parent A, `GET /v1/inquiries/{parent_B_inquiry_id}/parent`                        | 404 — parent may only read own inquiries                                  | P0       |           |
| 3.2.2 | As parent A, `POST /v1/inquiries/{parent_B_inquiry_id}/messages/parent`              | 404 or 403                                                                | P0       |           |
| 3.2.3 | As teacher A, `PATCH /v1/inbox/messages/{teacher_B_message_id}` (within edit window) | 403 EDIT_NOT_OWN_MESSAGE                                                  | P0       |           |
| 3.2.4 | As teacher, `POST /v1/inbox/conversations` broadcast                                 | 403 BROADCAST_NOT_ALLOWED_FOR_ROLE                                        | P0       |           |
| 3.2.5 | As student, `POST /v1/inbox/messages/{id}` with body                                 | Route doesn't exist — 404; no students may POST to `/messages/:id` anyway | P1       |           |

### 3.3 Vertical privilege escalation

| #     | Attempt                                                             | Expected                                   | Severity | Pass/Fail |
| ----- | ------------------------------------------------------------------- | ------------------------------------------ | -------- | --------- |
| 3.3.1 | As teacher: `GET /v1/inbox/oversight/conversations`                 | 403 (AdminTierOnlyGuard)                   | P0       |           |
| 3.3.2 | As `admin` role (not tier): `GET /v1/inbox/oversight/conversations` | 403 — verify the non-tier admin is blocked | P0       |           |
| 3.3.3 | As teacher: `POST /v1/safeguarding/keywords` with valid body        | 403                                        | P0       |           |
| 3.3.4 | As parent: `PUT /v1/inbox/settings/inbox`                           | 403                                        | P0       |           |
| 3.3.5 | As front_office: `POST /v1/announcements` (communications.manage)   | 403                                        | P1       |           |
| 3.3.6 | As accounting: `POST /v1/announcements/:id/publish`                 | 403                                        | P1       |           |

### 3.4 Permission field injection

| #     | Attempt                                                                                  | Expected                                           | Severity | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------- | -------------------------------------------------- | -------- | --------- |
| 3.4.1 | Submit body with `tenant_id = <other_tenant>` → server MUST ignore (RLS middleware wins) | Body value ignored; row persists with JWT's tenant | P1       |           |
| 3.4.2 | Submit body with `role_at_join = 'admin'` on conversation create                         | Field ignored (server-derived from user role)      | P0       |           |
| 3.4.3 | Submit body with `created_by_user_id = <other_user>` on conversation create              | Ignored; server uses JWT user_id                   | P0       |           |
| 3.4.4 | Submit body with `frozen_at = <timestamp>` on message create                             | Ignored                                            | P1       |           |

### 3.5 Force-browse protected routes

| #     | Attempt                                                                 | Expected                     | Severity | Pass/Fail |
| ----- | ----------------------------------------------------------------------- | ---------------------------- | -------- | --------- |
| 3.5.1 | As unauthenticated: `GET /v1/inbox/conversations`                       | 401                          | P0       |           |
| 3.5.2 | As unauthenticated: `GET /v1/announcements`                             | 401                          | P0       |           |
| 3.5.3 | As unauthenticated: `POST /v1/inbox/oversight/conversations/:id/freeze` | 401                          | P0       |           |
| 3.5.4 | As unauthenticated: `GET /v1/notifications/unsubscribe?token=<valid>`   | 302 (public endpoint, valid) | —        |           |
| 3.5.5 | As unauthenticated: `POST /v1/webhooks/resend` without signature        | 400                          | P1       |           |

### 3.6 CORS / CSRF

| #     | Attempt                                                   | Expected                                                  | Severity | Pass/Fail |
| ----- | --------------------------------------------------------- | --------------------------------------------------------- | -------- | --------- |
| 3.6.1 | `OPTIONS /v1/inbox/conversations` from `evil.com` origin  | CORS denies (either no ACAO header or specific allowlist) | P1       |           |
| 3.6.2 | XHR from `evil.com` with user's refresh-token cookie      | Browser blocks (cookie SameSite=Strict / Lax)             | P0       |           |
| 3.6.3 | JWT in httpOnly cookie: cannot be read by document.cookie | Yes                                                       | P0       |           |

---

## 4. OWASP Top 10 — A02 Cryptographic Failures

### 4.1 TLS

| #     | Assertion                                        | Expected                       | Severity | Pass/Fail |
| ----- | ------------------------------------------------ | ------------------------------ | -------- | --------- |
| 4.1.1 | HTTPS enforced on all paths; HTTP → 301 redirect | HSTS header present            | P0       |           |
| 4.1.2 | TLS ≥ 1.2; 1.0 / 1.1 disabled                    | `sslscan` reports only 1.2/1.3 | P0       |           |
| 4.1.3 | Ciphers: no RC4, 3DES, CBC                       | Verified                       | P1       |           |

### 4.2 Secret storage

| #     | Assertion                                                                                         | Expected                                            | Severity | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------- | --------- |
| 4.2.1 | `RESEND_API_KEY`, `TWILIO_AUTH_TOKEN`, `RESEND_WEBHOOK_SECRET` are env vars, not checked into git | `git log --all -S 'API_KEY'` returns nothing leaked | P0       |           |
| 4.2.2 | API response never returns these secrets                                                          | 404 / filtered                                      | P0       |           |
| 4.2.3 | Error messages never echo secrets                                                                 | Verified                                            | P0       |           |
| 4.2.4 | Sentry + log aggregation redacts (or doesn't capture) request bodies containing secrets           | Verified                                            | P1       |           |

### 4.3 Unsubscribe token

| #     | Assertion                                                                                   | Expected | Severity | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------- | -------- | -------- | --------- |
| 4.3.1 | Unsubscribe token is HMAC-SHA256 signed with a dedicated secret (not JWT secret)            | Verified | P1       |           |
| 4.3.2 | Token includes `exp` claim; 30-day validity                                                 | Verified | P1       |           |
| 4.3.3 | Tampered token → signature mismatch → 400                                                   | Verified | P1       |           |
| 4.3.4 | Signature uses constant-time comparison (`crypto.timingSafeEqual`)                          | Verified | P2       |           |
| 4.3.5 | Token cannot be forged by modifying `user_id` and re-signing (attacker doesn't know secret) | Verified | P0       |           |

### 4.4 Presigned S3 URLs for attachments

| #     | Assertion                                                                                                 | Expected                  | Severity | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------- | ------------------------- | -------- | --------- |
| 4.4.1 | Presigned URLs expire ≤ 15 minutes                                                                        | Verified                  | P1       |           |
| 4.4.2 | Presigned URL contains tenant prefix in `storage_key`; cannot be used to access other tenants' S3 objects | Bucket policy enforces    | P0       |           |
| 4.4.3 | Shared-link sharing: a revoked user still has 15 min of access via a pre-generated URL                    | Accepted risk, documented | P2       |           |

---

## 5. OWASP Top 10 — A03 Injection

### 5.1 SQL injection

| #     | Input                                                                                           | Expected                                              | Severity | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------- | --------- |
| 5.1.1 | Body field `title = "'; DROP TABLE announcements;--"`                                           | Persisted verbatim; DB intact; no log of failed query | P0       |           |
| 5.1.2 | Query param `?q=foo' OR '1'='1`                                                                 | Zod may accept as string; parameter-bound in SQL      | P0       |           |
| 5.1.3 | UUID param `/v1/inbox/conversations/00000000-0000-0000-0000-000000000000'%20OR%20'1'='1'%20--`  | ParseUUIDPipe rejects 400                             | P0       |           |
| 5.1.4 | Search query with UNION: `?q=test%20UNION%20SELECT%20*%20FROM%20users`                          | tsvector doesn't parse SQL; safely handled            | P0       |           |
| 5.1.5 | Sort param: `?sort=title;DROP%20TABLE` (no enum match)                                          | 422 Zod enum mismatch                                 | P0       |           |
| 5.1.6 | Prisma `$executeRawUnsafe` / `$queryRawUnsafe` usage in service layer other than RLS middleware | Lint-blocked; zero occurrences                        | P0       |           |

### 5.2 XSS

| #      | Input                                                            | Expected                                                   | Severity | Pass/Fail |
| ------ | ---------------------------------------------------------------- | ---------------------------------------------------------- | -------- | --------- |
| 5.2.1  | Message body `<script>alert(1)</script>`                         | Rendered escaped (React escapes by default); no alert      | P0       |           |
| 5.2.2  | Announcement `body_html` with `<script>`                         | HTML sanitized server-side; `<script>` stripped or escaped | P0       |           |
| 5.2.3  | Announcement `body_html` with `<img src=x onerror=alert(1)>`     | `onerror` stripped by sanitizer                            | P0       |           |
| 5.2.4  | Announcement `body_html` with `<a href="javascript:alert(1)">`   | `javascript:` URL stripped                                 | P0       |           |
| 5.2.5  | User display name `<img src=x onerror>` in PeoplePicker          | Escaped on render                                          | P0       |           |
| 5.2.6  | Inquiry subject with XSS payload                                 | Escaped                                                    | P0       |           |
| 5.2.7  | Attachment filename with HTML: `"><script>alert(1)</script>.pdf` | Escaped in UI; filename normalized or rejected in upload   | P1       |           |
| 5.2.8  | Saved audience name with XSS payload                             | Escaped                                                    | P0       |           |
| 5.2.9  | Safeguarding keyword with HTML                                   | Escaped in keyword management UI                           | P1       |           |
| 5.2.10 | Message body with emoji or special chars                         | Rendered correctly; no XSS                                 | P2       |           |

### 5.3 NoSQL-style / prototype-pollution injection

| #     | Input                                            | Expected                              | Severity | Pass/Fail |
| ----- | ------------------------------------------------ | ------------------------------------- | -------- | --------- |
| 5.3.1 | Body with `__proto__: { isAdmin: true }`         | Zod strips unknown keys; no pollution | P0       |           |
| 5.3.2 | Body with `constructor.prototype.isAdmin = true` | Rejected / stripped                   | P1       |           |

### 5.4 Command injection / file-path traversal

| #     | Input                                                | Expected                                               | Severity | Pass/Fail |
| ----- | ---------------------------------------------------- | ------------------------------------------------------ | -------- | --------- |
| 5.4.1 | Attachment filename `../../etc/passwd`               | Storage key normalized via path.basename; no traversal | P0       |           |
| 5.4.2 | Audience provider key `handpicked' && rm -rf /`      | Zod enum rejects                                       | P0       |           |
| 5.4.3 | Handlebars template with `{{#eval "shell command"}}` | Handlebars does not have eval; sandboxed               | P1       |           |

### 5.5 LDAP / header injection

| #     | Input                                                     | Expected                         | Severity | Pass/Fail |
| ----- | --------------------------------------------------------- | -------------------------------- | -------- | --------- |
| 5.5.1 | `Accept-Language: en\r\nX-Evil: injected`                 | Rejected at HTTP layer           | P1       |           |
| 5.5.2 | Email address in unsubscribe token with newline injection | URL-safe base64 prevents newline | P1       |           |

### 5.6 tsvector / FTS injection

| #     | Input                                     | Expected                                                | Severity | Pass/Fail |
| ----- | ----------------------------------------- | ------------------------------------------------------- | -------- | --------- |
| 5.6.1 | Search query `'); DROP TABLE messages;--` | `websearch_to_tsquery` sanitizes; no SQL injection      | P0       |           |
| 5.6.2 | Search query with 10,000 chars            | 422 max length (must be capped at 500 chars or similar) | P2       |           |

---

## 6. OWASP Top 10 — A04 Insecure Design

### 6.1 Business-logic flaws

| #     | Scenario                                                                                                           | Expected                                                                                                                     | Severity | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 6.1.1 | Parent creates inquiry → admin closes → parent creates a new inquiry with same subject                             | Allowed — each inquiry has its own ID                                                                                        | —        |           |
| 6.1.2 | Admin freezes conversation; student tries to work around by creating a new conversation with the same participants | New conversation is a new entity; admin may freeze that too — not a vulnerability unless student can bypass messaging policy | P2       |           |
| 6.1.3 | Parent initiates DM to teacher when `parents_can_initiate=false` via enabling via request body `override=true`     | Body field ignored; 403                                                                                                      | P0       |           |
| 6.1.4 | Saved-audience cycle (A → B → A)                                                                                   | Resolver detects and 409                                                                                                     | P1       |           |
| 6.1.5 | Student attempts broadcast to entire school                                                                        | 403 BROADCAST_NOT_ALLOWED_FOR_ROLE                                                                                           | P0       |           |
| 6.1.6 | Teacher sends same message 1,000 times to parent (mass-mailing abuse)                                              | Rate-limiting in place (§18)                                                                                                 | P1       |           |
| 6.1.7 | Admin publishes announcement, then patches body to change content after users already read it                      | Published announcements immutable (PATCH returns 409 CANNOT_EDIT_PUBLISHED)                                                  | P0       |           |
| 6.1.8 | Admin tries to freeze a conversation to suppress a flagged message                                                 | Freeze creates audit log; flag persists; oversight can unfreeze                                                              | P0       |           |
| 6.1.9 | Attacker creates many saved audiences targeting random user sets, then spams broadcasts                            | Rate-limit on broadcast creation; size limit on audience                                                                     | P1       |           |

### 6.2 State machine bypass

| #     | Scenario                                                                            | Expected                     | Severity | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------- | ---------------------------- | -------- | --------- |
| 6.2.1 | Attempt to PATCH a `published` announcement back to `draft` via status manipulation | 409 INVALID_STATE_TRANSITION | P0       |           |
| 6.2.2 | Attempt to PATCH an `archived` announcement back to `published`                     | 409                          | P0       |           |
| 6.2.3 | Double-freeze a conversation                                                        | 409 ALREADY_FROZEN           | P1       |           |
| 6.2.4 | Double-close an inquiry                                                             | 409 ALREADY_CLOSED           | P1       |           |

---

## 7. OWASP Top 10 — A05 Security Misconfiguration

| #     | Assertion                                                                                            | Expected                                  | Severity | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------- | --------- |
| 7.1.1 | Default credentials: no default admin accounts on fresh tenant (seed requires change on first login) | Verified                                  | P0       |           |
| 7.1.2 | Directory listing disabled on web server (nginx / Vercel)                                            | 404 on directory roots                    | P1       |           |
| 7.1.3 | Error responses do not expose stack traces                                                           | Generic error message in prod             | P1       |           |
| 7.1.4 | `X-Powered-By` header absent                                                                         | Verified                                  | P2       |           |
| 7.1.5 | `NODE_ENV=production` in production                                                                  | Yes                                       | P1       |           |
| 7.1.6 | Dev-only endpoints (test fallback, swagger, debug) not exposed in prod                               | `INBOX_ALLOW_TEST_FALLBACK=false` in prod | P1       |           |
| 7.1.7 | `.env`, `.git/`, `/admin-panel` not accessible                                                       | 404 each                                  | P0       |           |
| 7.1.8 | GraphQL introspection (if any) disabled in prod                                                      | —                                         | P2       |           |
| 7.1.9 | Prisma Studio not exposed in prod                                                                    | Yes                                       | P0       |           |

---

## 8. OWASP Top 10 — A06 Vulnerable Components

| #     | Assertion                                                                                      | Expected | Severity | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------- | -------- | -------- | --------- |
| 8.1.1 | `npm audit --production` in `apps/api` shows 0 high/critical                                   | Zero     | P0       |           |
| 8.1.2 | Same for `apps/worker`, `apps/web`                                                             | Zero     | P0       |           |
| 8.1.3 | Handlebars, Resend SDK, Twilio SDK, ioredis, bullmq, @nestjs/\* all within 12 months of latest | Verified | P1       |           |
| 8.1.4 | No deprecated packages without replacement plan                                                | Reviewed | P2       |           |
| 8.1.5 | pdfkit / puppeteer (for export PDF) — if used — not running arbitrary JS from message bodies   | Verified | P0       |           |
| 8.1.6 | Snyk / Dependabot alerts zero-outstanding on comms paths                                       | Verified | P1       |           |

---

## 9. OWASP Top 10 — A07 Identification & Authentication Failures

| #      | Attempt                                                                                | Expected                                           | Severity | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------- | -------------------------------------------------- | -------- | --------- |
| 9.1.1  | Brute-force login 1,000 attempts from single IP                                        | Rate-limited after N attempts                      | P1       |           |
| 9.1.2  | JWT with `alg=none`                                                                    | Rejected                                           | P0       |           |
| 9.1.3  | JWT with tampered payload (re-signed with wrong key)                                   | Rejected                                           | P0       |           |
| 9.1.4  | JWT expired → API returns 401                                                          | Yes                                                | P0       |           |
| 9.1.5  | Refresh-token rotation: using an old refresh token after rotation → invalidated family | Yes                                                | P1       |           |
| 9.1.6  | JWT stored in localStorage?                                                            | No — memory only; refresh token in httpOnly cookie | P0       |           |
| 9.1.7  | Session fixation: login invalidates any pre-existing session ID                        | Verified                                           | P1       |           |
| 9.1.8  | Password reset token: single-use, time-limited                                         | Verified                                           | P1       |           |
| 9.1.9  | Login with known-leaked password: prompt change or block                               | Accepted risk; documented                          | P2       |           |
| 9.1.10 | Multi-tenant impersonation: admin in one tenant gets a JWT minted for another tenant   | Impossible — JWT includes tenant_id, RLS enforces  | P0       |           |

---

## 10. OWASP Top 10 — A08 Software & Data Integrity Failures

| #      | Assertion                                                                                    | Expected                                         | Severity | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------- | --------- |
| 10.1.1 | CI builds produce signed artefacts (if release pipeline includes code-signing)               | Documented                                       | P2       |           |
| 10.1.2 | Dependency lockfile (`pnpm-lock.yaml` / `package-lock.json`) committed and matches installed | Verified                                         | P1       |           |
| 10.1.3 | Webhook signatures verified before processing (see §§5–6 of integration spec)                | Verified                                         | P0       |           |
| 10.1.4 | Message edits log previous body immutably                                                    | Verified                                         | P1       |           |
| 10.1.5 | Oversight access log immutable (no UPDATE / DELETE path exposed)                             | Verified via DB-level trigger or app-level guard | P0       |           |
| 10.1.6 | Announcement publish audit (who + when) cannot be tampered                                   | Verified                                         | P1       |           |

---

## 11. OWASP Top 10 — A09 Security Logging & Monitoring Failures

| #      | Assertion                                                                       | Expected                               | Severity | Pass/Fail |
| ------ | ------------------------------------------------------------------------------- | -------------------------------------- | -------- | --------- |
| 11.1.1 | Every oversight action writes an audit log (freeze/unfreeze/export/read)        | Verified — see §12 of integration spec | P0       |           |
| 11.1.2 | Failed login attempts logged (not silently dropped)                             | Verified                               | P1       |           |
| 11.1.3 | Webhook signature failures logged + alerted                                     | Verified                               | P1       |           |
| 11.1.4 | Dead-letter jobs alert after > 10 entries                                       | Sentry / Prometheus alert fires        | P1       |           |
| 11.1.5 | Rate-limit violations logged                                                    | Verified                               | P2       |           |
| 11.1.6 | PII in logs: email, phone, message body NOT logged                              | Audit log review; only entity IDs      | P0       |           |
| 11.1.7 | Log retention: audit logs retained ≥ 7 years (GDPR / safeguarding requirements) | Verified in log sink config            | P1       |           |

---

## 12. OWASP Top 10 — A10 Server-Side Request Forgery

| #      | Attempt                                                                                                   | Expected                                                                      | Severity | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------- | --------- |
| 12.1.1 | Announcement `body_html` with `<img src="http://internal-metadata-endpoint">` — server attempts to fetch? | No — server never fetches body_html contents; it's delivered as-is to clients | P0       |           |
| 12.1.2 | Attachment upload where body is a URL (e.g., server-side fetch remotely)                                  | Not applicable — attachments are binary uploads only                          | P0       |           |
| 12.1.3 | Webhook URL configurable per tenant? No — webhooks are fixed, so no SSRF surface                          | Verified                                                                      | P0       |           |
| 12.1.4 | Resend / Twilio API calls from worker — URLs hardcoded; no user-controlled URL                            | Verified                                                                      | P0       |           |
| 12.1.5 | PDF export: does PDF generator fetch external resources (images, fonts)?                                  | If yes, whitelist only same-origin or tenant S3                               | P1       |           |

---

## 13. Permission Matrix — Every Endpoint × Every Role (Hostile)

Cross-check with §4 of the integration spec. This §13 focuses on the hostile-attacker angle — i.e., every cell where the matrix says `X` (403) is re-tested with a variety of attack payloads to ensure the 403 holds under modified headers, tampered JWTs, and race conditions.

### 13.1 Matrix re-verification

| #      | Endpoint                                            | Role             | Attempted payload                         | Expected                       | Pass/Fail |
| ------ | --------------------------------------------------- | ---------------- | ----------------------------------------- | ------------------------------ | --------- |
| 13.1.1 | `POST /v1/announcements`                            | teacher          | with body                                 | 403                            |           |
| 13.1.2 | `POST /v1/announcements`                            | teacher          | with body + `X-Role: school_owner` header | 403 (headers ignored for auth) |           |
| 13.1.3 | `POST /v1/announcements`                            | teacher          | with JWT modified `role` claim            | 401 (signature mismatch)       |           |
| 13.1.4 | `GET /v1/inbox/oversight/conversations`             | teacher          | normal                                    | 403                            |           |
| 13.1.5 | `POST /v1/safeguarding/keywords`                    | admin (non-tier) | normal                                    | 403 (AdminTierOnlyGuard)       |           |
| 13.1.6 | `POST /v1/inbox/oversight/conversations/:id/export` | parent           | normal                                    | 403                            |           |
| 13.1.7 | All remaining X cells from integration §4           | each             | normal                                    | 403 each                       |           |

### 13.2 Race-condition permission revocation

| #      | Scenario                                                                                   | Expected                                      | Severity | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------ | --------------------------------------------- | -------- | --------- |
| 13.2.1 | Admin revokes user's role mid-request                                                      | In-flight requests complete; next request 403 | P2       |           |
| 13.2.2 | JWT issued before role revocation remains valid until expiry — accepted, but refresh fails | Documented limit                              | P1       |           |

---

## 14. Injection Fuzz — Every Text Input

Use Burp Intruder / ZAP fuzzer with a dictionary of 100 payloads (SQLi, XSS, SSRF, command, LDAP, NoSQL, header) against every free-text body field.

### 14.1 Fields to fuzz

| #       | Field                                     | Endpoint                                            | Pass/Fail |
| ------- | ----------------------------------------- | --------------------------------------------------- | --------- |
| 14.1.1  | Message body                              | `POST /v1/inbox/conversations/:id/messages`         |           |
| 14.1.2  | Message body (edit)                       | `PATCH /v1/inbox/messages/:id`                      |           |
| 14.1.3  | Announcement title                        | `POST /v1/announcements`                            |           |
| 14.1.4  | Announcement body_html                    | `POST /v1/announcements`                            |           |
| 14.1.5  | Audience name                             | `POST /v1/inbox/audiences`                          |           |
| 14.1.6  | Audience description                      | `POST /v1/inbox/audiences`                          |           |
| 14.1.7  | Inquiry subject                           | `POST /v1/inquiries`                                |           |
| 14.1.8  | Inquiry message body                      | `POST /v1/inquiries`                                |           |
| 14.1.9  | Safeguarding keyword                      | `POST /v1/safeguarding/keywords`                    |           |
| 14.1.10 | Freeze reason                             | `POST /v1/inbox/oversight/conversations/:id/freeze` |           |
| 14.1.11 | Flag notes (dismiss/escalate)             | `POST /v1/inbox/oversight/flags/:id/dismiss`        |           |
| 14.1.12 | Notification template subject_template    | `POST /v1/notification-templates`                   |           |
| 14.1.13 | Notification template body_template       | `POST /v1/notification-templates`                   |           |
| 14.1.14 | Attachment filename                       | `POST /v1/inbox/attachments`                        |           |
| 14.1.15 | Search query (inbox + oversight + people) | `GET /v1/inbox/search?q=...` etc.                   |           |

For each: verify every payload is stored verbatim (or rejected at Zod), rendered escaped in UI, not executed, and does not trigger DB / shell / network attack.

### 14.2 Large-payload DoS

| #      | Attempt                                  | Expected                                         | Severity | Pass/Fail |
| ------ | ---------------------------------------- | ------------------------------------------------ | -------- | --------- |
| 14.2.1 | Message body 10 MB                       | 413 Payload Too Large (body size capped at 1 MB) | P1       |           |
| 14.2.2 | Announcement body_html 5 MB              | 413 or Zod refine max                            | P1       |           |
| 14.2.3 | Bulk-import 10,000 keywords              | 422 Zod refine max 2000                          | P1       |           |
| 14.2.4 | Audience definition tree nested 100 deep | Zod refine or stack-overflow safeguard           | P1       |           |

---

## 15. Encrypted / Sensitive Field Round-Trip

### 15.1 User phone and email

| #      | Assertion                                                                                          | Expected          | Severity | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------- | ----------------- | -------- | --------- |
| 15.1.1 | User phone is stored plain or encrypted? If encrypted, round-trip verified                         | Policy documented | P1       |           |
| 15.1.2 | Phone/email shown in API responses only to users who should see them (e.g., inbox participants)    | Verified          | P0       |           |
| 15.1.3 | Admin can see phone/email of all users in tenant; parent can only see staff phones (if documented) | Verified          | P1       |           |

### 15.2 provider_message_id exposure

| #      | Assertion                                                                         | Expected                                       | Severity | Pass/Fail |
| ------ | --------------------------------------------------------------------------------- | ---------------------------------------------- | -------- | --------- |
| 15.2.1 | Parent accessing `/v1/notifications` — does response include provider_message_id? | Only internal; parent-facing responses omit it | P1       |           |
| 15.2.2 | Admin `/v1/notifications/admin/failed` includes provider_message_id for debugging | Yes                                            | —        |           |

### 15.3 Freeze reason exposure

| #      | Assertion                                                          | Expected                                                              | Severity | Pass/Fail |
| ------ | ------------------------------------------------------------------ | --------------------------------------------------------------------- | -------- | --------- |
| 15.3.1 | Parent reading a frozen conversation: is `freeze_reason` returned? | Only admin-tier sees reason; parent sees "frozen" flag without reason | P1       |           |
| 15.3.2 | Teacher in a frozen thread (admin-initiated): sees reason?         | Verify tenant policy — documented choice                              | P2       |           |

### 15.4 Safeguarding keyword exposure

| #      | Assertion                                                                           | Expected                                  | Severity | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------- | ----------------------------------------- | -------- | --------- |
| 15.4.1 | Keyword list visible only to admin-tier                                             | Verified                                  | P0       |           |
| 15.4.2 | Flag `matched_keywords` visible only to admin-tier                                  | Verified                                  | P0       |           |
| 15.4.3 | Teacher / parent / student in a flagged conversation sees NO indication of flagging | No UI affordance for non-admin-tier roles | P0       |           |

---

## 16. Business-Logic Abuse Scenarios

### 16.1 Broadcast abuse

| #      | Scenario                                                                                                     | Expected                                                        | Severity | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | -------- | --------- |
| 16.1.1 | Admin creates 1,000 broadcasts with 10-user audiences each in rapid succession                               | Rate-limit kicks in after N broadcasts/min                      | P1       |           |
| 16.1.2 | Admin creates broadcast with school-wide audience including nested unions that resolve to every user         | Audience cap enforced; warn at > 5,000 users; block at > 20,000 | P1       |           |
| 16.1.3 | Attacker with `inbox.send` creates a broadcast to exfiltrate data via subject line visible to all recipients | Broadcasts always audit-logged (future)                         | P2       |           |

### 16.2 Unsubscribe abuse

| #      | Scenario                                                   | Expected                                           | Severity | Pass/Fail |
| ------ | ---------------------------------------------------------- | -------------------------------------------------- | -------- | --------- |
| 16.2.1 | Attacker replays a victim's unsubscribe URL multiple times | Idempotent; no error                               | P2       |           |
| 16.2.2 | Attacker enumerates user IDs via unsubscribe tokens        | Tokens signed + user_id internal; cannot enumerate | P1       |           |

### 16.3 Attachment abuse

| #      | Scenario                                                               | Expected                                                                   | Severity | Pass/Fail |
| ------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------- | --------- |
| 16.3.1 | Upload 100 × 25 MB PDFs in rapid succession (storage exhaustion)       | Rate-limit + tenant quota enforced                                         | P1       |           |
| 16.3.2 | Upload a file that is a PDF shell but contains malicious content       | MIME sniffed and verified; virus scan (if wired); otherwise documented gap | P1       |           |
| 16.3.3 | Upload zip bomb disguised as .docx                                     | File size capped; decompression not attempted                              | P1       |           |
| 16.3.4 | Attach someone else's S3 storage key (key starts with their tenant_id) | AttachmentValidator rejects with 403 ATTACHMENT_CROSS_TENANT               | P0       |           |

### 16.4 Flag manipulation abuse

| #      | Scenario                                                                       | Expected                                           | Severity | Pass/Fail |
| ------ | ------------------------------------------------------------------------------ | -------------------------------------------------- | -------- | --------- |
| 16.4.1 | Admin-tier user dismisses safeguarding flag without reason                     | Reason optional for dismiss; audit-logged          | P1       |           |
| 16.4.2 | Admin-tier dismisses then user posts same keyword again                        | New flag created for new message                   | P0       |           |
| 16.4.3 | Admin freezes conversation then deletes the message containing flagged keyword | Soft-delete retains DB row; flag remains for audit | P0       |           |

### 16.5 Inquiry abuse

| #      | Scenario                                                               | Expected                            | Severity | Pass/Fail |
| ------ | ---------------------------------------------------------------------- | ----------------------------------- | -------- | --------- |
| 16.5.1 | Parent creates 100 inquiries in 10 minutes                             | Rate-limit                          | P1       |           |
| 16.5.2 | Parent attaches attachments to inquiry messages — any filename/malware | Same attachment validation as inbox | P1       |           |

---

## 17. HTTP Hardening Headers

### 17.1 Required headers on every response

| #      | Header                         | Expected value                                                                                     | Pass/Fail |
| ------ | ------------------------------ | -------------------------------------------------------------------------------------------------- | --------- |
| 17.1.1 | `Strict-Transport-Security`    | `max-age=31536000; includeSubDomains; preload`                                                     |           |
| 17.1.2 | `X-Content-Type-Options`       | `nosniff`                                                                                          |           |
| 17.1.3 | `X-Frame-Options`              | `DENY` (or CSP frame-ancestors none)                                                               |           |
| 17.1.4 | `Content-Security-Policy`      | Strict: `default-src 'self'; script-src 'self' 'strict-dynamic' <nonces>; object-src 'none';` etc. |           |
| 17.1.5 | `Referrer-Policy`              | `strict-origin-when-cross-origin`                                                                  |           |
| 17.1.6 | `Permissions-Policy`           | restrict geolocation, camera, microphone, etc.                                                     |           |
| 17.1.7 | `Cross-Origin-Opener-Policy`   | `same-origin`                                                                                      |           |
| 17.1.8 | `Cross-Origin-Embedder-Policy` | `require-corp` (if feasible)                                                                       |           |

### 17.2 Content-Type correctness

| #      | Endpoint                                                                  | Expected Content-Type                                                 | Pass/Fail |
| ------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------- |
| 17.2.1 | `GET /v1/inbox/conversations`                                             | `application/json; charset=utf-8`                                     |           |
| 17.2.2 | `POST /v1/inbox/oversight/conversations/:id/export` response (PDF stream) | `application/pdf` + `Content-Disposition: attachment; filename="..."` |           |

---

## 18. Rate Limiting & DoS Surface

### 18.1 Per-user rate limits

| #      | Endpoint                                          | Proposed rate limit                              | Enforced? | Pass/Fail |
| ------ | ------------------------------------------------- | ------------------------------------------------ | --------- | --------- |
| 18.1.1 | `POST /v1/inbox/conversations` (create new)       | 30 / min / user                                  |           |           |
| 18.1.2 | `POST /v1/inbox/conversations/:id/messages`       | 120 / min / user                                 |           |           |
| 18.1.3 | `POST /v1/announcements/:id/publish`              | 10 / min / user                                  |           |           |
| 18.1.4 | `POST /v1/inquiries`                              | 10 / hour / parent                               |           |           |
| 18.1.5 | `GET /v1/inbox/search`                            | 60 / min / user                                  |           |           |
| 18.1.6 | `POST /v1/inbox/attachments`                      | 30 / min / user                                  |           |           |
| 18.1.7 | `POST /v1/webhooks/resend`, `/v1/webhooks/twilio` | 1000 / min / IP (provider IP ranges whitelisted) |           |           |
| 18.1.8 | `GET /v1/notifications/unread-count`              | 10 / sec / user (polled every 30 s normal)       |           |           |

### 18.2 Per-tenant limits

| #      | Metric                                      | Expected                   | Pass/Fail |
| ------ | ------------------------------------------- | -------------------------- | --------- |
| 18.2.1 | Max queued notifications per tenant at once | 10,000 (hard block beyond) |           |
| 18.2.2 | Max announcements in draft per tenant       | 100                        |           |
| 18.2.3 | Max saved audiences per tenant              | 200                        |           |

### 18.3 Global abuse protections

| #      | Scenario                                                   | Expected                                       | Pass/Fail |
| ------ | ---------------------------------------------------------- | ---------------------------------------------- | --------- |
| 18.3.1 | Single IP sends 1,000 requests in 1 minute to any endpoint | IP-level rate-limit (e.g., nginx / Cloudflare) |           |
| 18.3.2 | Login brute-force                                          | Account lockout after N failed attempts        |           |
| 18.3.3 | Distributed brute-force across IPs                         | Application-level account lockout              |           |

---

## 19. Severity Tally

Record observations from the walkthrough here:

| Severity | Count | Items                                                                                      |
| -------- | ----- | ------------------------------------------------------------------------------------------ |
| P0       |       | (tenant isolation failures, injection bypasses, auth failures, missing audit on oversight) |
| P1       |       | (rate-limit gaps, missing security header, logging gaps, dependency alerts)                |
| P2       |       | (edge cases, documented-and-accepted risks, minor misconfigs)                              |
| P3       |       | (informational / style)                                                                    |

**Expectation: zero P0/P1 findings outstanding before release. P2/P3 triaged to backlog with owner and date.**

---

## 20. Sign-off

| Section                       | Reviewer | Date | Pass | Fail | Notes |
| ----------------------------- | -------- | ---- | ---- | ---- | ----- |
| 3. A01 access control         |          |      |      |      |       |
| 4. A02 crypto                 |          |      |      |      |       |
| 5. A03 injection              |          |      |      |      |       |
| 6. A04 design                 |          |      |      |      |       |
| 7. A05 misconfig              |          |      |      |      |       |
| 8. A06 components             |          |      |      |      |       |
| 9. A07 auth                   |          |      |      |      |       |
| 10. A08 integrity             |          |      |      |      |       |
| 11. A09 logging               |          |      |      |      |       |
| 12. A10 SSRF                  |          |      |      |      |       |
| 13. Permission matrix hostile |          |      |      |      |       |
| 14. Injection fuzz            |          |      |      |      |       |
| 15. Encrypted fields          |          |      |      |      |       |
| 16. Business-logic abuse      |          |      |      |      |       |
| 17. HTTP headers              |          |      |      |      |       |
| 18. Rate limiting             |          |      |      |      |       |

**Security spec is release-ready when all 16 sections signed off at Pass, all OWASP categories have coverage, zero P0/P1 findings outstanding, and P2/P3 triaged. A new P0 at signoff blocks release. This spec is re-run quarterly minimum.**
