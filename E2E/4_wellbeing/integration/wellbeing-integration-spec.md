# Wellbeing — Integration Test Specification

> **Generated:** 2026-04-21
> **Module slug:** `wellbeing`
> **Scope:** RLS leakage, API contract edges, state-machine invariants, concurrency / transaction boundaries, encrypted / sealed record access control, PDF / binary contracts, cross-module invariants, IP-audit correctness for safeguarding/CP.
> **Companion specs:** `../admin_view/`, `../teacher_view/`, `../parent_view/`, `../student_view/` (UI), `../worker/` (queues + crons + chains), `../perf/`, `../security/`.

Every row in this spec is a machine-executable HTTP + SQL assertion. The target harness is Jest + supertest (or equivalent) with a dedicated test Redis and a two-tenant Postgres fixture. Raw-HTTP execution only — do NOT exercise these rows through Playwright; the UI is covered by role specs.

The wellbeing umbrella is the largest module in the product: **8 backend modules, ~250 endpoint signatures, 54 tenant-scoped tables, 18 BullMQ processors, 10 cron registrations, 8 roles × ~44 permission keys**. This spec prioritises:

1. RLS tenant isolation across **every** tenant-scoped wellbeing table.
2. Contract edges on **mutation** endpoints (happy + ≥ 3 boundary + permission denial per mutation).
3. State-machine invariants across the 7 lifecycles that ship in the umbrella.
4. Cross-module chains (behaviour → pastoral → safeguarding → early warning → notifications).
5. Sealed-record + CP-record custom RLS tiered gating.
6. Anonymous-survey invariant (no `tenant_id` / `user_id` on `survey_responses` and `survey_participation_tokens`).
7. IP-audit capture on safeguarding + CP + pastoral concern flows.

Reads are sampled, not exhaustive; the expectation is that every mutation-endpoint row in this spec has a passing paired UI row in the role specs.

---

## Table of contents

1. [Prerequisites & fixture seeding](#1-prerequisites--fixture-seeding)
2. [RLS leakage matrix — behaviour tables (30)](#2-rls-leakage-matrix--behaviour-tables)
3. [RLS leakage matrix — pastoral tables (19)](#3-rls-leakage-matrix--pastoral-tables)
4. [RLS leakage matrix — safeguarding tables (5)](#4-rls-leakage-matrix--safeguarding-tables)
5. [RLS leakage matrix — early-warning tables (4)](#5-rls-leakage-matrix--early-warning-tables)
6. [RLS leakage matrix — staff-wellbeing tables (4, incl. anonymous)](#6-rls-leakage-matrix--staff-wellbeing-tables)
7. [RLS leakage matrix — infrastructure tables (3)](#7-rls-leakage-matrix--infrastructure-tables)
8. [Tiered & gated RLS — pastoral_concerns tier 3 + cp_records](#8-tiered--gated-rls--pastoral_concerns-tier-3--cp_records)
9. [API contract matrix — behaviour incidents](#9-api-contract-matrix--behaviour-incidents)
10. [API contract matrix — behaviour sanctions](#10-api-contract-matrix--behaviour-sanctions)
11. [API contract matrix — behaviour exclusions](#11-api-contract-matrix--behaviour-exclusions)
12. [API contract matrix — behaviour appeals](#12-api-contract-matrix--behaviour-appeals)
13. [API contract matrix — behaviour recognition + publications](#13-api-contract-matrix--behaviour-recognition--publications)
14. [API contract matrix — behaviour documents + templates](#14-api-contract-matrix--behaviour-documents--templates)
15. [API contract matrix — behaviour amendments + acknowledgements](#15-api-contract-matrix--behaviour-amendments--acknowledgements)
16. [API contract matrix — behaviour interventions + tasks + alerts + guardian restrictions](#16-api-contract-matrix--behaviour-interventions--tasks--alerts--guardian-restrictions)
17. [API contract matrix — behaviour admin (policies, legal holds, retention, repair)](#17-api-contract-matrix--behaviour-admin-policies-legal-holds-retention-repair)
18. [API contract matrix — pastoral concerns + versions](#18-api-contract-matrix--pastoral-concerns--versions)
19. [API contract matrix — pastoral cases + ownership transfer](#19-api-contract-matrix--pastoral-cases--ownership-transfer)
20. [API contract matrix — pastoral interventions + reviews](#20-api-contract-matrix--pastoral-interventions--reviews)
21. [API contract matrix — pastoral referrals (NEPS lifecycle) + recommendations + visits](#21-api-contract-matrix--pastoral-referrals--recommendations--visits)
22. [API contract matrix — pastoral critical incidents + response plan](#22-api-contract-matrix--pastoral-critical-incidents--response-plan)
23. [API contract matrix — pastoral SST (roster, meetings, agenda, actions)](#23-api-contract-matrix--pastoral-sst)
24. [API contract matrix — pastoral check-ins + flagged + escalate + dismiss](#24-api-contract-matrix--pastoral-check-ins)
25. [API contract matrix — pastoral DSAR reviews + stats](#25-api-contract-matrix--pastoral-dsar-reviews--stats)
26. [API contract matrix — pastoral import (CSV idempotency + dry-run)](#26-api-contract-matrix--pastoral-import)
27. [API contract matrix — safeguarding concerns + actions + referrals](#27-api-contract-matrix--safeguarding-concerns--actions--referrals)
28. [API contract matrix — safeguarding seal workflow (dual-control)](#28-api-contract-matrix--safeguarding-seal-workflow)
29. [API contract matrix — safeguarding break-glass + access-log + after-action review](#29-api-contract-matrix--safeguarding-break-glass)
30. [API contract matrix — safeguarding keywords + message-scan integration](#30-api-contract-matrix--safeguarding-keywords--message-scan)
31. [API contract matrix — early warning profiles + signals + config](#31-api-contract-matrix--early-warning-profiles--signals--config)
32. [API contract matrix — staff wellbeing surveys + responses + moderation](#32-api-contract-matrix--staff-wellbeing)
33. [API contract matrix — wellbeing aggregate dashboard summary](#33-api-contract-matrix--wellbeing-aggregate)
34. [API contract matrix — AI flags + flag-gated endpoints](#34-api-contract-matrix--ai-flags--flag-gated-endpoints)
35. [API contract matrix — wellbeing notification preferences](#35-api-contract-matrix--wellbeing-notification-preferences)
36. [API contract matrix — child protection (cp-records) with IP audit](#36-api-contract-matrix--child-protection-cp-records)
37. [State-machine invariants — 7 lifecycles](#37-state-machine-invariants)
38. [Concurrency / race tests](#38-concurrency--race-tests)
39. [Transaction boundary tests](#39-transaction-boundary-tests)
40. [Cross-module invariants (behaviour ↔ pastoral ↔ safeguarding ↔ early-warning ↔ notifications)](#40-cross-module-invariants)
41. [PDF / binary content invariants](#41-pdf--binary-content-invariants)
42. [Audit-log + IP-audit correctness](#42-audit-log--ip-audit-correctness)
43. [Webhook tests (N/A for wellbeing — none inbound)](#43-webhook-tests)
44. [Sequence & numbering invariants (per-tenant sequences)](#44-sequence--numbering-invariants)
45. [Sign-off](#45-sign-off)

---

## 1. Prerequisites & fixture seeding

### 1.1 Fixture tenants

| #     | What to run                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Expected                                                                                                              | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.1.1 | Provision **Tenant A** (`nhqs`) and **Tenant B** (`acme-test`) per the People integration spec §1. Overlay the wellbeing-seeding fixture so both tenants have: ≥ 25 behaviour incidents, ≥ 8 sanctions, ≥ 3 exclusion cases, ≥ 2 appeals, ≥ 5 pastoral concerns (tier 1+2+3), ≥ 2 pastoral cases, ≥ 3 safeguarding concerns (incl. 1 sealed), ≥ 1 critical incident, ≥ 10 early-warning profiles (≥ 1 red, ≥ 3 amber), ≥ 2 staff surveys (1 active, 1 closed), ≥ 10 recognition awards, ≥ 1 guardian restriction, ≥ 1 intervention per subject domain. | `SELECT COUNT(*)` per table reaches the seed thresholds.                                                              |           |
| 1.1.2 | Seeder is **deterministic**: dropping wellbeing tables + re-seeding produces identical counts and stable UUIDs derived from a seeded PRNG so test assertions can pin to known IDs.                                                                                                                                                                                                                                                                                                                                                                     | `SELECT MD5(string_agg(id::text, ',' ORDER BY id)) FROM behaviour_incidents WHERE tenant_id=<A>` matches golden hash. |           |
| 1.1.3 | Capture **known-ID constants** per tenant for this spec: `KNOWN_INCIDENT_A`, `KNOWN_INCIDENT_B`, `KNOWN_CONCERN_A`, `KNOWN_CONCERN_B`, `KNOWN_CASE_A`, `KNOWN_CASE_B`, `KNOWN_SAFE_CONCERN_A`, `KNOWN_SAFE_CONCERN_B`, `KNOWN_SEALED_CONCERN_A`, `KNOWN_EXCLUSION_A`, `KNOWN_APPEAL_A`, `KNOWN_SURVEY_A`, `KNOWN_STUDENT_A`, `KNOWN_STUDENT_B`, `KNOWN_PARENT_A`.                                                                                                                                                                                      | All 15 constants saved.                                                                                               |           |

### 1.2 Users + tokens

| #     | What to run                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Expected                                                                                            | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------- |
| 1.2.1 | Seed users per tenant: `owner`, `principal`, `vp`, `admin` (school_admin), `teacher_t1` (class_teacher of class X), `teacher_t2` (subject_teacher), `counsellor`, `parent1`, `parent2`, `student1`, `student2` — 11 users × 2 tenants = 22 users.                                                                                                                                                                                                                                                                          | 22 JWTs cached in `(tenant, role)` map.                                                             |           |
| 1.2.2 | Harness helper `await request(token, method, path, body?)` wraps fetch, sets `Authorization: Bearer <token>`.                                                                                                                                                                                                                                                                                                                                                                                                              | Helper works.                                                                                       |           |
| 1.2.3 | Harness helper `await sql(query, params)` runs `prisma.$queryRawUnsafe` **without** tenant context so cross-tenant reads are visible to the test harness only.                                                                                                                                                                                                                                                                                                                                                             | Helper works.                                                                                       |           |
| 1.2.4 | Harness helper `await enqueue(queueName, jobName, payload)` + `await drainQueue(queueName, timeout=10_000)` for worker chain assertions in §40.                                                                                                                                                                                                                                                                                                                                                                            | Helpers work.                                                                                       |           |
| 1.2.5 | Permissions backfilled per the user's directive — admin roles (`school_owner`, `school_principal`, `school_vice_principal`, `school_admin`) hold **every** wellbeing umbrella permission. Teacher holds `behaviour.log/view/view_sensitive`, `pastoral.log_concern/view_tier1/view_tier2`, `safeguarding.report`, `early_warning.view/acknowledge`, `wellbeing.view_own_workload`, `wellbeing.view_dashboard`, `behaviour.ai_query`. Parent holds `behaviour.appeal`, `pastoral.parent_self_referral`. Student holds none. | `SELECT COUNT(*) FROM role_permissions WHERE permission_key LIKE 'behaviour.%'` matches the matrix. |           |

### 1.3 Test Redis + worker

| #     | What to run                                                                                                                     | Expected           | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------- |
| 1.3.1 | Dedicated test Redis at `redis://localhost:6380/1` (env `REDIS_URL`). All BullMQ queues in test bind here, never the dev Redis. | Redis reachable.   |           |
| 1.3.2 | Worker process booted in the test harness (`apps/worker` with test env).                                                        | Worker running.    |           |
| 1.3.3 | Pre-test Redis is empty: `FLUSHDB` on `redis://localhost:6380/1` before each file / test suite.                                 | DB empty pre-test. |           |
| 1.3.4 | Helper `queueState(queueName)` returns `{waiting, active, completed, failed, delayed}` via BullMQ admin API.                    | Helper works.      |           |

### 1.4 Anonymity sanity (survey tables)

| #     | What to run                                                                                                                                  | Expected                                                  | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------- |
| 1.4.1 | `sql("SELECT column_name FROM information_schema.columns WHERE table_name='survey_responses'")` — returns neither `tenant_id` NOR `user_id`. | Confirmed: anonymity invariant holds at the schema level. |           |
| 1.4.2 | `sql("SELECT column_name FROM information_schema.columns WHERE table_name='survey_participation_tokens'")` — no tenant_id / user_id.         | Same.                                                     |           |
| 1.4.3 | `sql("SELECT relrowsecurity FROM pg_class WHERE relname='survey_responses'")` = `false`. RLS off by design.                                  | RLS disabled (anonymity by design).                       |           |

---

## 2. RLS leakage matrix — behaviour tables

Tables in scope (30):
`behaviour_categories`, `behaviour_description_templates`, `behaviour_incidents`, `behaviour_incident_participants`, `behaviour_sanctions`, `behaviour_appeals`, `behaviour_amendment_notices`, `behaviour_exclusion_cases`, `behaviour_documents`, `behaviour_document_templates`, `behaviour_parent_acknowledgements`, `behaviour_interventions`, `behaviour_intervention_incidents`, `behaviour_intervention_reviews`, `behaviour_recognition_awards`, `behaviour_award_types`, `behaviour_house_teams`, `behaviour_house_memberships`, `behaviour_policy_rules`, `behaviour_policy_rule_actions`, `behaviour_policy_rule_versions`, `behaviour_policy_evaluations`, `behaviour_policy_action_executions`, `behaviour_alerts`, `behaviour_alert_recipients`, `behaviour_guardian_restrictions`, `behaviour_publication_approvals`, `behaviour_entity_history`, `behaviour_tasks`, `behaviour_attachments`, `behaviour_legal_holds`, `behaviour_ai_query_history`.

Per-table pattern: 6 rows × N tables. This section shows the canonical pattern against `behaviour_incidents`; §2.N applies the same pattern to each other table. Full matrix size: 30 × 6 = **180 rows**.

### 2.1 `behaviour_incidents`

| #     | What to run                                                                                                                                                                                    | Expected                                                                                                                                           | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1.1 | `request(tokenA_owner, 'GET', '/v1/behaviour/incidents?pageSize=50')` → every row `tenant_id`=A.                                                                                               | 200. `meta.total` ≥ 25. No row from B.                                                                                                             |           |
| 2.1.2 | `request(tokenB_owner, 'GET', '/v1/behaviour/incidents?pageSize=50')` → every row B.                                                                                                           | 200. No row from A.                                                                                                                                |           |
| 2.1.3 | `request(tokenA_owner, 'GET', '/v1/behaviour/incidents/<KNOWN_INCIDENT_B>')`.                                                                                                                  | **404** `INCIDENT_NOT_FOUND`. Body contains no tenant B data.                                                                                      |           |
| 2.1.4 | `request(tokenA_owner, 'PATCH', '/v1/behaviour/incidents/<KNOWN_INCIDENT_B>', {description: 'hacked'})`.                                                                                       | 404. `sql("SELECT description FROM behaviour_incidents WHERE id=<KNOWN_INCIDENT_B>")` unchanged.                                                   |           |
| 2.1.5 | `request(tokenA_owner, 'POST', '/v1/behaviour/incidents', {...validPayload, tenant_id: <B>})`. Zod `createIncidentSchema` doesn't include `tenant_id` key; it's injected from session context. | 201 in A **OR** 400 if strict-mode rejects the extra key. Confirm via `sql("SELECT tenant_id FROM behaviour_incidents WHERE id=<newId>")` = **A**. |           |
| 2.1.6 | `sql("SELECT relforcerowsecurity FROM pg_class WHERE relname='behaviour_incidents'")` = `true`.                                                                                                | Confirmed.                                                                                                                                         |           |

### 2.2 Remaining behaviour tables (apply same 6-row template)

| Table                                                                                       | Endpoint(s) to hit                                            | Known ID constants needed            |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------ |
| `behaviour_categories`                                                                      | `GET/POST/PATCH /v1/behaviour/categories`                     | `CATEGORY_A`, `CATEGORY_B`           |
| `behaviour_description_templates`                                                           | `GET/POST /v1/behaviour/categories/:id/templates`             | same as above                        |
| `behaviour_incident_participants`                                                           | `POST /v1/behaviour/incidents/:id/participants`               | `PARTICIPANT_A`, `PARTICIPANT_B`     |
| `behaviour_sanctions`                                                                       | `/v1/behaviour/sanctions/*`                                   | `SANCTION_A`, `SANCTION_B`           |
| `behaviour_appeals`                                                                         | `/v1/behaviour/appeals/*`                                     | `APPEAL_A`, `APPEAL_B`               |
| `behaviour_amendment_notices`                                                               | `/v1/behaviour/amendments/*`                                  | `AMENDMENT_A`, `AMENDMENT_B`         |
| `behaviour_exclusion_cases`                                                                 | `/v1/behaviour/exclusion-cases/*`                             | `EXCLUSION_A`, `EXCLUSION_B`         |
| `behaviour_documents`                                                                       | `/v1/behaviour/documents/*`                                   | `DOCUMENT_A`, `DOCUMENT_B`           |
| `behaviour_document_templates`                                                              | `/v1/behaviour/documents/templates/*`                         | `TEMPLATE_A`, `TEMPLATE_B`           |
| `behaviour_parent_acknowledgements`                                                         | `/v1/behaviour/acknowledgements/*`                            | `ACK_A`, `ACK_B`                     |
| `behaviour_interventions`                                                                   | `/v1/behaviour/interventions/*`                               | `INTERVENTION_A`, `INTERVENTION_B`   |
| `behaviour_intervention_incidents`                                                          | junction: reached via intervention detail                     | derived                              |
| `behaviour_intervention_reviews`                                                            | `/v1/behaviour/interventions/:id/reviews`                     | `REVIEW_A`, `REVIEW_B`               |
| `behaviour_recognition_awards`                                                              | `/v1/behaviour/recognition/awards/*`                          | `AWARD_A`, `AWARD_B`                 |
| `behaviour_award_types`                                                                     | `/v1/behaviour/recognition/award-types/*`                     | `AWARD_TYPE_A`, `AWARD_TYPE_B`       |
| `behaviour_house_teams`                                                                     | `/v1/behaviour/recognition/houses/*`                          | `HOUSE_A`, `HOUSE_B`                 |
| `behaviour_house_memberships`                                                               | `/v1/behaviour/recognition/houses/:id/members`                | derived                              |
| `behaviour_policy_rules` / `_actions` / `_versions` / `_evaluations` / `_action_executions` | `/v1/behaviour/policies/*`, `/v1/behaviour/policies/replay/*` | `RULE_A`, `RULE_B`                   |
| `behaviour_alerts` / `_alert_recipients`                                                    | `/v1/behaviour/alerts/*`                                      | `ALERT_A`, `ALERT_B`                 |
| `behaviour_guardian_restrictions`                                                           | `/v1/behaviour/guardian-restrictions/*`                       | `RESTRICTION_A`, `RESTRICTION_B`     |
| `behaviour_publication_approvals`                                                           | `/v1/behaviour/recognition/publications/*`                    | `PUBLICATION_A`, `PUBLICATION_B`     |
| `behaviour_entity_history`                                                                  | read-only; `/v1/behaviour/incidents/:id/history`              | assert cross-tenant read returns 404 |
| `behaviour_tasks`                                                                           | `/v1/behaviour/tasks/*`                                       | `TASK_A`, `TASK_B`                   |
| `behaviour_attachments`                                                                     | `/v1/behaviour/incidents/:id/attachments/*`                   | derived                              |
| `behaviour_legal_holds`                                                                     | `/v1/behaviour/admin/legal-holds/*`                           | `HOLD_A`, `HOLD_B`                   |
| `behaviour_ai_query_history`                                                                | `/v1/behaviour/analytics/ai-query/history`                    | `QUERY_A`, `QUERY_B`                 |

Execute the 6-row RLS template against each row of this table. **30 tables × 6 rows = 180 RLS rows**.

---

## 3. RLS leakage matrix — pastoral tables

Tables (19): `pastoral_cases`, `pastoral_case_students`, `pastoral_concerns`, `pastoral_concern_versions`, `pastoral_concern_involved_students`, `pastoral_interventions`, `pastoral_intervention_actions`, `pastoral_intervention_progress`, `pastoral_referrals`, `pastoral_referral_recommendations`, `pastoral_neps_visits`, `pastoral_neps_visit_students`, `sst_members`, `sst_meetings`, `sst_meeting_agenda_items`, `sst_meeting_actions`, `pastoral_parent_contacts`, `pastoral_events`, `pastoral_dsar_reviews`, `critical_incidents`, `critical_incident_affected`, `student_checkins`.

Apply the 6-row template. **22 × 6 = 132 RLS rows**.

### 3.1 Canonical — `pastoral_cases`

| #     | What to run                                                                                                     | Expected               | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------- | ---------------------- | --------- |
| 3.1.1 | `request(tokenA_owner, 'GET', '/v1/pastoral/cases?pageSize=50')` → only A rows.                                 | 200. `meta.total` ≥ 2. |           |
| 3.1.2 | `request(tokenB_owner, 'GET', '/v1/pastoral/cases?pageSize=50')` → only B rows.                                 | 200.                   |           |
| 3.1.3 | `request(tokenA_owner, 'GET', '/v1/pastoral/cases/<KNOWN_CASE_B>')` → 404.                                      | 404 `CASE_NOT_FOUND`.  |           |
| 3.1.4 | `request(tokenA_owner, 'PATCH', '/v1/pastoral/cases/<KNOWN_CASE_B>', {status: 'closed'})` → 404; row unchanged. | 404 + DB intact.       |           |
| 3.1.5 | `request(tokenA_owner, 'POST', '/v1/pastoral/cases', {...valid, tenant_id: <B>})` — body field stripped.        | 201 with tenant_id=A.  |           |
| 3.1.6 | `FORCE ROW LEVEL SECURITY` enabled.                                                                             | Confirmed.             |           |

### 3.2 Same template against each remaining pastoral table.

---

## 4. RLS leakage matrix — safeguarding tables

Tables (5): `safeguarding_concerns`, `safeguarding_actions`, `safeguarding_concern_incidents`, `safeguarding_break_glass_grants`, `safeguarding_keywords`.

Apply template. **5 × 6 = 30 RLS rows**.

### 4.1 `safeguarding_concerns` — includes sealed cross-tenant

| #     | What to run                                                                                                                                                                                              | Expected                     | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------- |
| 4.1.1 | `request(tokenA_owner, 'GET', '/v1/safeguarding/concerns?pageSize=50')` — only A.                                                                                                                        | 200.                         |           |
| 4.1.2 | `request(tokenB_owner, 'GET', '/v1/safeguarding/concerns/<KNOWN_SEALED_CONCERN_A>')` — 404. Even tenant B owner cannot see a Tenant A sealed concern. (A's owner can see it only via `/sealed` archive.) | 404.                         |           |
| 4.1.3 | `request(tokenA_owner, 'PATCH', '/v1/safeguarding/concerns/<KNOWN_SAFE_CONCERN_B>', ...)` — 404.                                                                                                         | 404. Tenant B row unchanged. |           |
| 4.1.4 | `request(tokenA_owner, 'POST', '/v1/safeguarding/concerns', {...valid, tenant_id: <B>})` — tenant_id stripped, created in A.                                                                             | 201 in A.                    |           |
| 4.1.5 | Cross-tenant break-glass: `request(tokenA_owner, 'POST', '/v1/safeguarding/break-glass', {...valid, concern_ids: [<KNOWN_SAFE_CONCERN_B>]})` — 400 `CONCERN_NOT_FOUND` for each B concern.               | 400 rejects every B id.      |           |
| 4.1.6 | `FORCE ROW LEVEL SECURITY` + policy `safeguarding_concerns_tenant_isolation` present.                                                                                                                    | Confirmed.                   |           |

### 4.2–4.5 Apply template to remaining 4 safeguarding tables.

---

## 5. RLS leakage matrix — early-warning tables

Tables (4): `student_risk_profiles`, `student_risk_signals`, `early_warning_tier_transitions`, `early_warning_configs`.

Apply template. **4 × 6 = 24 rows**.

| #   | Table                            | Endpoint                                                      | Pass/Fail |
| --- | -------------------------------- | ------------------------------------------------------------- | --------- |
| 5.1 | `student_risk_profiles`          | `GET /v1/early-warnings`, `GET /v1/early-warnings/:studentId` |           |
| 5.2 | `student_risk_signals`           | `GET /v1/early-warnings/:studentId` (nested)                  |           |
| 5.3 | `early_warning_tier_transitions` | `GET /v1/early-warnings/:studentId/transitions`               |           |
| 5.4 | `early_warning_configs`          | `GET/PUT /v1/early-warnings/config`                           |           |

---

## 6. RLS leakage matrix — staff-wellbeing tables

Tables (4): `staff_surveys`, `survey_questions` (RLS + tenant), `survey_responses` (anonymous, NO RLS), `survey_participation_tokens` (anonymous, NO RLS).

### 6.1 `staff_surveys`

Apply 6-row template. Endpoints: `/v1/staff-wellbeing/surveys/*`. **6 rows**.

### 6.2 `survey_questions`

Apply template (nested on survey). **6 rows**.

### 6.3 Anonymous invariants

| #     | What to run                                                                                                                                                                                                                         | Expected                                                           | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------- |
| 6.3.1 | `sql("SELECT COUNT(*) FROM survey_responses")` total ≥ 1 after §32 submissions. Every row has NO tenant_id / user_id.                                                                                                               | Anonymity proof via schema.                                        |           |
| 6.3.2 | `request(tokenA_teacher, 'POST', '/v1/staff-wellbeing/respond/<KNOWN_SURVEY_A>', {...})` — 201; response body has no user id.                                                                                                       | 201.                                                               |           |
| 6.3.3 | Re-post with identical token — second request returns 409 `DUPLICATE_RESPONSE` OR silently no-ops. No duplicate row.                                                                                                                | Idempotency enforced via `survey_participation_tokens.token_hash`. |           |
| 6.3.4 | Impersonation blocked — `POST /v1/staff-wellbeing/respond/:surveyId` with admin-impersonating-teacher JWT returns 403 (BlockImpersonationGuard). Survey responses must never have actor identity.                                   | 403 per the guard.                                                 |           |
| 6.3.5 | Cross-tenant respond: `request(tokenB_teacher, 'POST', '/v1/staff-wellbeing/respond/<KNOWN_SURVEY_A>', ...)` — 404 `SURVEY_NOT_FOUND` since the tenant-scoped survey lookup returns nothing for Tenant B.                           | 404. No cross-tenant survey response.                              |           |
| 6.3.6 | Token cleanup cron `wellbeing:cleanup-participation-tokens` purges tokens for surveys closed > 7 days. Verify via `sql("SELECT COUNT(*) FROM survey_participation_tokens WHERE survey_id IN (<closed >7d>)" )` = 0 after cron fire. | Cleanup works.                                                     |           |

---

## 7. RLS leakage matrix — infrastructure tables

Tables (3): `tenant_ai_flags`, `tenant_notification_preferences`, `tenant_sequences`.

### 7.1 `tenant_ai_flags`

Apply 6-row template. Endpoints: `GET/PATCH /v1/ai-flags/*`. **6 rows**.

### 7.2 `tenant_notification_preferences`

Apply template. Endpoint: `GET/PATCH /v1/tenants/notification-preferences` (or equivalent). **6 rows**.

### 7.3 `tenant_sequences`

RLS-protected. `current_value` never leaks across tenants; per-tenant monotonic.

| #     | What to run                                                                                                                                                                                     | Expected                                                                                                                             | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 7.3.1 | `sql("SELECT sequence_type, current_value FROM tenant_sequences WHERE tenant_id=<A>")` — returns all A sequences.                                                                               | Sequences present (behaviour_incident_number, sanction, appeal, exclusion, intervention, pastoral_case, safeguarding_concern, etc.). |           |
| 7.3.2 | Tenant A creates an incident. `sql("SELECT current_value FROM tenant_sequences WHERE tenant_id=<A> AND sequence_type='behaviour_incident_number'")` incremented by 1. Tenant B's row unchanged. | Isolation holds.                                                                                                                     |           |
| 7.3.3 | `SELECT ... FOR UPDATE` contention test — see §38 concurrency.                                                                                                                                  | Locked correctly.                                                                                                                    |           |

---

## 8. Tiered & gated RLS — pastoral_concerns tier 3 + cp_records

These tables use **custom** RLS policies beyond the standard tenant_isolation.

### 8.1 `pastoral_concerns` — tier 3 gate

Policy: `tier < 3 OR EXISTS (SELECT 1 FROM cp_access_grants WHERE user_id = current_user_id() AND tenant_id = current_tenant_id() AND revoked_at IS NULL)`.

| #     | What to run                                                                                                                                                                                                                                        | Expected                        | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------- |
| 8.1.1 | Seed: 3 concerns in Tenant A with `tier=1`, 2 with `tier=2`, 2 with `tier=3`. `cp_access_grants` has 1 active grant for `counsellor` user in Tenant A.                                                                                             | Counts in place.                |           |
| 8.1.2 | `request(tokenA_teacher, 'GET', '/v1/pastoral/concerns?pageSize=50')` — returns `tier=1` + `tier=2` rows only (5 rows). Zero tier-3 rows.                                                                                                          | 200. No tier-3 exposure.        |           |
| 8.1.3 | `request(tokenA_counsellor, 'GET', '/v1/pastoral/concerns?pageSize=50')` — sees all 7 rows (including tier 3) because of grant.                                                                                                                    | 200. All rows visible.          |           |
| 8.1.4 | Revoke the grant: `UPDATE cp_access_grants SET revoked_at = now() WHERE user_id = counsellor.id`. Counsellor's same request now returns 5 rows.                                                                                                    | Tier-3 hidden after revocation. |           |
| 8.1.5 | `request(tokenA_owner, 'GET', '/v1/pastoral/concerns?pageSize=50')` — all 7 rows (owner has every permission per user directive). This uses `pastoral.manage_cp_access` + `pastoral.export_tier3` in the application layer on top of the RLS gate. | All 7 visible.                  |           |
| 8.1.6 | `request(tokenA_teacher, 'GET', '/v1/pastoral/concerns/<KNOWN_TIER3_CONCERN>')` — 404 (RLS masks it).                                                                                                                                              | 404. No data leakage.           |           |
| 8.1.7 | `request(tokenA_teacher, 'PATCH', '/v1/pastoral/concerns/<KNOWN_TIER3_CONCERN>/narrative', {...})` — 404 (RLS masks; row effectively doesn't exist for teacher).                                                                                   | 404. No mutation.               |           |

### 8.2 `cp_records` — CP-access-grant-only

Policy: `EXISTS (cp_access_grants WHERE user_id=current_user_id() AND tenant_id=current_tenant_id() AND revoked_at IS NULL)`.

| #     | What to run                                                                                                                                                                                           | Expected                                                                                | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------- |
| 8.2.1 | Seed: 2 cp_records for Tenant A students.                                                                                                                                                             | Seed ready.                                                                             |           |
| 8.2.2 | `request(tokenA_teacher, 'GET', '/v1/child-protection/cp-records?student_id=<S>')` — 403 (guard blocks) or empty array (RLS masks all rows).                                                          | 403 or 200 with 0 rows. Document which.                                                 |           |
| 8.2.3 | `request(tokenA_counsellor, 'GET', '/v1/child-protection/cp-records?student_id=<S>')` — 200 with rows. IP audit written.                                                                              | 200. `pastoral_events` row with event_type `cp_record_accessed`, `ip_address` not null. |           |
| 8.2.4 | Revoke grant. Same request now 403 / 0 rows.                                                                                                                                                          | Grant revocation honoured.                                                              |           |
| 8.2.5 | Cross-tenant — `request(tokenB_owner, 'GET', '/v1/child-protection/cp-records?student_id=<tenantA_student_id>')` — 404 `STUDENT_NOT_FOUND`. No way to enumerate.                                      | 404.                                                                                    |           |
| 8.2.6 | IP capture — when a cp_record is created via `POST /v1/child-protection/cp-records`, the resulting `pastoral_events` row has `ip_address` populated from the request's `X-Forwarded-For` or `req.ip`. | `ip_address` is not null.                                                               |           |

### 8.3 Break-glass bypass

| #     | What to run                                                                                                                                                                                                 | Expected            | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------- |
| 8.3.1 | Seal a safeguarding concern (§28). Non-admin with no break-glass grant: `GET /v1/safeguarding/concerns/:sealed` → 403 `CONCERN_SEALED`.                                                                     | 403.                |           |
| 8.3.2 | Create break-glass grant for that user scoped to this concern: `POST /v1/safeguarding/break-glass {granted_to, scope: 'specific_concerns', scoped_concern_ids: [<id>], expires_at: now()+1h, reason}`. 201. | 201. Grant saved.   |           |
| 8.3.3 | Same user now `GET /v1/safeguarding/concerns/:sealed` → 200. Access-log row added via `pastoral_events` (or `safeguarding_actions` per DZ-Wellbeing-7 projection).                                          | 200. Audit written. |           |
| 8.3.4 | After `expires_at`, worker `behaviour:break-glass-expiry` (daily 00:00 UTC) revokes. Same user now gets 403.                                                                                                | 403 after expiry.   |           |
| 8.3.5 | `scope: 'all_concerns'` grant allows any sealed concern. Scoped grant blocks other sealed concerns.                                                                                                         | Scope respected.    |           |
| 8.3.6 | Grant reasons are required — missing reason returns 400 `REASON_REQUIRED`.                                                                                                                                  | 400.                |           |

---

## 9. API contract matrix — behaviour incidents

For each endpoint: happy + boundary (Zod) + permission + existence + uniqueness + state-machine where applicable.

### 9.1 `POST /v1/behaviour/incidents`

| #      | What to run                                                                                                                                                                  | Expected                                                           | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------- |
| 9.1.1  | Happy: `{category_id, description, occurred_at, location, participants: [{student_id, role}]}`. As owner.                                                                    | 201. `incident_number` matches `^INC-\d{6}-\d{4}$`. `tenant_id`=A. |           |
| 9.1.2  | Missing `category_id`.                                                                                                                                                       | 400 Zod: `category_id: Required`.                                  |           |
| 9.1.3  | `description` length 0.                                                                                                                                                      | 400 Zod.                                                           |           |
| 9.1.4  | `description` length > 5000.                                                                                                                                                 | 400 Zod: exceeds max.                                              |           |
| 9.1.5  | `occurred_at` in the future (> now + 1h).                                                                                                                                    | 400 Zod or accept per spec; document actual behaviour.             |           |
| 9.1.6  | Unknown `category_id` (valid UUID, not in A).                                                                                                                                | 400 `CATEGORY_NOT_FOUND`.                                          |           |
| 9.1.7  | `participants` empty array.                                                                                                                                                  | 400 `AT_LEAST_ONE_PARTICIPANT_REQUIRED`.                           |           |
| 9.1.8  | `participants[0].student_id` is a Tenant B student. Tenant-A existence check fails.                                                                                          | 400 `STUDENT_NOT_FOUND`.                                           |           |
| 9.1.9  | As parent JWT — 403 (no `behaviour.log`).                                                                                                                                    | 403.                                                               |           |
| 9.1.10 | As student JWT — 403.                                                                                                                                                        | 403.                                                               |           |
| 9.1.11 | As teacher, `participants.student_id` not in their taught set (logical scoping) — 403 `STUDENT_OUT_OF_SCOPE` OR 400 depending on how scope is enforced.                      | Documented; tester asserts one consistent behaviour.               |           |
| 9.1.12 | **Idempotency** — two parallel POSTs with same `Idempotency-Key` header produce 1 row. Confirm via `SELECT COUNT(*) FROM behaviour_incidents WHERE idempotency_key=<k>` = 1. | No duplicate.                                                      |           |
| 9.1.13 | Missing `Authorization` header → 401.                                                                                                                                        | 401.                                                               |           |
| 9.1.14 | Malformed `Authorization` header ("Bearer garbage") → 401.                                                                                                                   | 401.                                                               |           |

### 9.2 `POST /v1/behaviour/incidents/quick`

| #     | What to run                                          | Expected                          | Pass/Fail |
| ----- | ---------------------------------------------------- | --------------------------------- | --------- |
| 9.2.1 | Happy: shorter payload using a template. As teacher. | 201. `incident_number` generated. |           |
| 9.2.2 | Template id not in tenant → 400.                     | 400.                              |           |
| 9.2.3 | As parent → 403.                                     | 403.                              |           |

### 9.3 `POST /v1/behaviour/incidents/bulk-positive`

| #     | What to run                                                                           | Expected                                             | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------- |
| 9.3.1 | Happy: 5 positive incidents for 5 different students.                                 | 201 `{data: [ ... ]}` array length 5. All persisted. |           |
| 9.3.2 | Array length 0 → 400.                                                                 | 400.                                                 |           |
| 9.3.3 | Array length 101 → 400 `MAX_BATCH_EXCEEDED`.                                          | 400.                                                 |           |
| 9.3.4 | One student_id not in tenant → 400 on that entry; transactionally reverts the others. | 400 + no partial writes.                             |           |

### 9.4 `GET /v1/behaviour/incidents` + `/my`, `/stats`, `/feed`

Smoke + pagination + filter correctness.

| #     | What to run                                                                                              | Expected                      | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------- | ----------------------------- | --------- |
| 9.4.1 | `GET /v1/behaviour/incidents?page=1&pageSize=20` — happy.                                                | 200 `{data, meta}` shape.     |           |
| 9.4.2 | `GET /v1/behaviour/incidents?pageSize=0` — 400.                                                          | 400.                          |           |
| 9.4.3 | `GET /v1/behaviour/incidents?pageSize=101` — 400 (max 100) OR clamp-to-100; document.                    | Either behaviour, documented. |           |
| 9.4.4 | `GET /v1/behaviour/incidents/my` — returns only `reported_by_id = currentUser`.                          | Filter correct.               |           |
| 9.4.5 | `GET /v1/behaviour/incidents/stats` — 200 aggregate counts matching a `GROUP BY polarity, status` query. | Counts match DB.              |           |
| 9.4.6 | `GET /v1/behaviour/incidents/feed?pageSize=20` — 200, rows match recent-activity subset.                 | 200 + feed shape.             |           |

### 9.5 `GET/PATCH/DELETE /v1/behaviour/incidents/:id`

| #     | What to run                                                                                                                | Expected           | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------- |
| 9.5.1 | GET existing — 200 full detail incl. participants.                                                                         | Shape matches DTO. |           |
| 9.5.2 | GET non-existent UUID — 404.                                                                                               | 404.               |           |
| 9.5.3 | GET non-UUID (e.g. "foo") — 400 from ParseUUIDPipe.                                                                        | 400.               |           |
| 9.5.4 | PATCH valid fields.                                                                                                        | 200.               |           |
| 9.5.5 | PATCH locking — `parent_description_locked=true`, attempt to change `parent_description`. 400 `PARENT_DESCRIPTION_LOCKED`. | 400.               |           |
| 9.5.6 | PATCH `approval_status` directly — 400 (requires a workflow endpoint, not free mutation).                                  | 400.               |           |

### 9.6 `PATCH /v1/behaviour/incidents/:id/status`

Valid transitions: `draft → submitted → approved → escalated → resolved → archived`.

| #     | Transition                           | Expected                        | Pass/Fail |
| ----- | ------------------------------------ | ------------------------------- | --------- |
| 9.6.1 | draft → submitted                    | 200.                            |           |
| 9.6.2 | submitted → approved                 | 200.                            |           |
| 9.6.3 | approved → escalated                 | 200.                            |           |
| 9.6.4 | escalated → resolved                 | 200.                            |           |
| 9.6.5 | draft → resolved (invalid)           | 400 `INVALID_STATE_TRANSITION`. |           |
| 9.6.6 | resolved → draft (invalid backwards) | 400.                            |           |
| 9.6.7 | archived → \* (locked)               | 400 `INCIDENT_ARCHIVED`.        |           |

### 9.7 `POST /v1/behaviour/incidents/:id/withdraw`

| #     | What to run                                                       | Expected                                                            | Pass/Fail |
| ----- | ----------------------------------------------------------------- | ------------------------------------------------------------------- | --------- |
| 9.7.1 | Happy: submitted incident, reason provided.                       | 201. Status → withdrawn. `parent_notification_status=not_required`. |           |
| 9.7.2 | Missing reason → 400.                                             | 400.                                                                |           |
| 9.7.3 | Already-withdrawn incident → 400 or 409 `ALREADY_WITHDRAWN`.      | 400/409.                                                            |           |
| 9.7.4 | Draft incident (not yet submitted) — 400 `CANNOT_WITHDRAW_DRAFT`. | 400.                                                                |           |

### 9.8 `POST /v1/behaviour/incidents/:id/follow-up`

File upload. Tested in §9.12 attachment contract.

### 9.9 `POST /v1/behaviour/incidents/:id/participants`

| #     | What to run                                                  | Expected                                               | Pass/Fail |
| ----- | ------------------------------------------------------------ | ------------------------------------------------------ | --------- |
| 9.9.1 | Happy — add student participant, role=witness.               | 201.                                                   |           |
| 9.9.2 | Duplicate — same student + role twice.                       | 409 `PARTICIPANT_EXISTS` or 200 idempotent — document. |           |
| 9.9.3 | Participant student from Tenant B — 400 `STUDENT_NOT_FOUND`. | 400.                                                   |           |
| 9.9.4 | Role invalid — 400 Zod.                                      | 400.                                                   |           |
| 9.9.5 | Participant of type external with no `external_name` — 400.  | 400.                                                   |           |

### 9.10 `DELETE /v1/behaviour/incidents/:id/participants/:pid`

| #      | What to run                                                     | Expected | Pass/Fail |
| ------ | --------------------------------------------------------------- | -------- | --------- |
| 9.10.1 | Happy.                                                          | 204.     |           |
| 9.10.2 | Non-existent pid — 404.                                         | 404.     |           |
| 9.10.3 | Cross-tenant pid — 404.                                         | 404.     |           |
| 9.10.4 | Deleting the last subject participant — 400 `SUBJECT_REQUIRED`. | 400.     |           |

### 9.11 AI parse endpoint — `POST /v1/behaviour/incidents/ai-parse`

| #      | What to run                                                                                             | Expected                        | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------- | ------------------------------- | --------- |
| 9.11.1 | Flag off — `PATCH /v1/ai-flags/behaviour {enabled: false}` first. Then POST parse. → 403 `AI_DISABLED`. | 403.                            |           |
| 9.11.2 | Flag on + API key missing — 503 `AI_SERVICE_UNAVAILABLE`.                                               | 503.                            |           |
| 9.11.3 | Flag on + key present (if wired in test env) — 200 with parsed fields.                                  | 200.                            |           |
| 9.11.4 | Narrative > 10_000 chars — 400 `NARRATIVE_TOO_LONG`.                                                    | 400.                            |           |
| 9.11.5 | PII-only narrative (e.g. just "John") — 200 with minimal fields + low confidence score.                 | 200 + `confidence < threshold`. |           |

### 9.12 Attachment contract — `POST /v1/behaviour/incidents/:id/attachments`

| #      | What to run                                                                                              | Expected                                                                                               | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------- |
| 9.12.1 | Happy: multipart upload 2MB JPG. `Content-Disposition: form-data; name="file"; filename="evidence.jpg"`. | 201. Row returned with `scan_status=pending_scan`, `file_size_bytes=2097152`, `sha256_hash` populated. |           |
| 9.12.2 | 100MB file → 413 `PAYLOAD_TOO_LARGE` (limit typically 25MB).                                             | 413.                                                                                                   |           |
| 9.12.3 | .exe file → 400 `FILE_TYPE_NOT_ALLOWED`.                                                                 | 400.                                                                                                   |           |
| 9.12.4 | 0-byte file → 400 `EMPTY_FILE`.                                                                          | 400.                                                                                                   |           |
| 9.12.5 | Missing `file` field → 400.                                                                              | 400.                                                                                                   |           |
| 9.12.6 | Same file uploaded twice — second returns new row; SHA256 allows for intentional duplicates.             | 201 × 2 rows.                                                                                          |           |

### 9.13 History + policy evaluation endpoints

| #      | What to run                                                                                        | Expected                   | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------- | -------------------------- | --------- |
| 9.13.1 | `GET /v1/behaviour/incidents/:id/history` returns paginated `behaviour_entity_history` rows.       | 200 `{data, meta}`.        |           |
| 9.13.2 | Each row has `change_type`, `previous_values`, `new_values`, `changed_by_id`, `created_at`.        | Shape correct.             |           |
| 9.13.3 | Rows are append-only — no PATCH endpoint for history.                                              | No write endpoint exposed. |           |
| 9.13.4 | `GET /v1/behaviour/incidents/:id/policy-evaluation` — 200 returns last evaluation + matched rules. | 200.                       |           |

---

## 10. API contract matrix — behaviour sanctions

(For brevity, per-endpoint contract rows follow the §9 pattern; expand each.)

### 10.1 `POST /v1/behaviour/sanctions`

| #      | What to run                                                                                            | Expected                          | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------ | --------------------------------- | --------- |
| 10.1.1 | Happy: type=detention, student, scheduled_date, supervised_by.                                         | 201. `sanction_number` formatted. |           |
| 10.1.2 | Missing student_id — 400.                                                                              | 400.                              |           |
| 10.1.3 | `scheduled_date` in the past — 400 `SCHEDULE_IN_PAST`.                                                 | 400.                              |           |
| 10.1.4 | type=external_suspension — must include `suspension_start_date`, `suspension_end_date`. Missing → 400. | 400.                              |           |
| 10.1.5 | `suspension_end_date` < `suspension_start_date` → 400.                                                 | 400.                              |           |
| 10.1.6 | `suspension_days` disagreement with start/end (e.g. 3 days but dates span 5) → 400 cross-field refine. | 400.                              |           |
| 10.1.7 | supervised_by_id user not in tenant → 400 `USER_NOT_FOUND`.                                            | 400.                              |           |
| 10.1.8 | As parent / student → 403.                                                                             | 403.                              |           |

### 10.2 `POST /v1/behaviour/sanctions/bulk-mark-served`

| #      | What to run                                                                                                 | Expected                                                           | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------- |
| 10.2.1 | Happy: list of 5 sanctions.                                                                                 | 201 `{data: [{id, status}, ...]}` all `served`.                    |           |
| 10.2.2 | Array includes a sanction from Tenant B — rejected as 400 `SANCTION_NOT_FOUND` per id; no tenant mutations. | 400 per B id. Tenant A sanctions also NOT flipped (transactional). |           |
| 10.2.3 | Array length > 100 — 400 `MAX_BATCH_EXCEEDED`.                                                              | 400.                                                               |           |

### 10.3 `PATCH /v1/behaviour/sanctions/:id/status` — state machine

Valid: pending → scheduled → served / voided. Invalid: served → pending, voided → served.

| #      | Transition                 | Expected                                     | Pass/Fail |
| ------ | -------------------------- | -------------------------------------------- | --------- |
| 10.3.1 | pending → scheduled        | 200.                                         |           |
| 10.3.2 | scheduled → served         | 200. `served_at` + `served_by_id` populated. |           |
| 10.3.3 | scheduled → voided         | 200.                                         |           |
| 10.3.4 | served → pending (invalid) | 400.                                         |           |
| 10.3.5 | voided → served (invalid)  | 400.                                         |           |

### 10.4 `POST /v1/behaviour/sanctions/:id/parent-meeting`

| #      | What to run                                                             | Expected                              | Pass/Fail |
| ------ | ----------------------------------------------------------------------- | ------------------------------------- | --------- |
| 10.4.1 | Happy: meeting_date, attendees, notes.                                  | 201. `parent_meeting_date` populated. |           |
| 10.4.2 | meeting_date in past more than a year — 400 `MEETING_DATE_UNREALISTIC`. | 400 (if enforced; else 201).          |           |

### 10.5 Read endpoints

Sample rows; match §9.4 pattern for `today`, `my-supervision`, `calendar`, `active-suspensions`, `returning-soon`.

---

## 11. API contract matrix — behaviour exclusions

Full lifecycle flow tested as 1 ordered sequence.

| #     | What to run                                                                                                                                                                          | Expected                                        | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | --------- |
| 11.1  | `POST /v1/behaviour/exclusion-cases {sanction_id, student_id, type}` — happy.                                                                                                        | 201. Status = drafted. `case_number` formatted. |           |
| 11.2  | Attempt `POST /...:id/finalise` while drafted → 400 `INVALID_STATE_TRANSITION`.                                                                                                      | 400.                                            |           |
| 11.3  | `POST /...:id/issue-notice` → status=hearing_scheduled (if hearing required) or implemented (else). Document. Notice document generated.                                             | 201. `behaviour_documents` row exists.          |           |
| 11.4  | `POST /...:id/schedule-hearing {hearing_date, attendees}` → 201. `hearing_date` set.                                                                                                 | 201.                                            |           |
| 11.5  | `POST /...:id/record-hearing {minutes, student_representation}` → 201. Status → hearing_held.                                                                                        | 201.                                            |           |
| 11.6  | `POST /...:id/generate-board-pack` → 202 (async). Worker renders PDF. Poll until document status=generated. `board_pack_document_id` populated.                                      | 202 + async complete.                           |           |
| 11.7  | `POST /...:id/record-decision {decision, decision_reasoning}` → 201. `decision_letter_document_id` populated.                                                                        | 201.                                            |           |
| 11.8  | `POST /...:id/finalise` — status → implemented. `decision_date` populated.                                                                                                           | 201.                                            |           |
| 11.9  | `POST /...:id/overturn {reason}` → status=closed with overturn audit. Student's sanction `status=voided`.                                                                            | 201 + cascade.                                  |           |
| 11.10 | Negative: `POST /...:id/overturn` on a case already closed — 400 `ALREADY_CLOSED`.                                                                                                   | 400.                                            |           |
| 11.11 | Cross-tenant: any of the above against a Tenant B exclusion id from Tenant A JWT — 404.                                                                                              | 404.                                            |           |
| 11.12 | Zod boundary: `type` outside enum → 400.                                                                                                                                             | 400.                                            |           |
| 11.13 | Statutory timeline: `appeal_deadline` auto-computed from `decision_date` + jurisdiction default. Past-deadline overturn triggers `APPEAL_WINDOW_CLOSED` warning but still processes. | Documented.                                     |           |

---

## 12. API contract matrix — behaviour appeals

| #     | What to run                                                                                                            | Expected                                                 | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------- |
| 12.1  | `POST /v1/behaviour/appeals {entity_type:'incident', incident_id, grounds, appellant_type, grounds_category}` — happy. | 201.                                                     |           |
| 12.2  | `entity_type='sanction'` + `sanction_id` set.                                                                          | 201.                                                     |           |
| 12.3  | Missing both `incident_id` and `sanction_id` — 400.                                                                    | 400.                                                     |           |
| 12.4  | `appellant_type='parent'` + `appellant_parent_id` set. Parent must be linked to the student involved.                  | 201 if valid; 403 `PARENT_NOT_LINKED_TO_STUDENT` if not. |           |
| 12.5  | `PATCH /v1/behaviour/appeals/:id` — update grounds before submission.                                                  | 200.                                                     |           |
| 12.6  | `POST /...:id/decide {decision, decision_reasoning}` — 201. Status → decided.                                          | 201. `resulting_amendments` JSON populated.              |           |
| 12.7  | Decide already-decided appeal — 400 `ALREADY_DECIDED`.                                                                 | 400.                                                     |           |
| 12.8  | Decide invalid enum value — 400 Zod.                                                                                   | 400.                                                     |           |
| 12.9  | `POST /...:id/withdraw {reason}` — 201. Status=withdrawn.                                                              | 201.                                                     |           |
| 12.10 | `POST /...:id/generate-decision-letter` — 202. Document rendered.                                                      | Document available after worker.                         |           |
| 12.11 | `GET /...:id/evidence-bundle` — 200 PDF. Content-Type `application/pdf`. Content-Disposition attachment.               | Binary valid PDF.                                        |           |

---

## 13. API contract matrix — behaviour recognition + publications

| #     | What to run                                                                                                                                           | Expected                                                 | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------- |
| 13.1  | `POST /v1/behaviour/recognition/awards {student_id, award_type_id}`.                                                                                  | 201.                                                     |           |
| 13.2  | Award type in cooldown (`repeat_max_per_year` reached) → 409 `AWARD_LIMIT_REACHED`.                                                                   | 409.                                                     |           |
| 13.3  | `award_type_id` from Tenant B — 400.                                                                                                                  | 400.                                                     |           |
| 13.4  | `GET /v1/behaviour/recognition/leaderboard?limit=10` — 200 ordered desc by net points for current academic year.                                      | Correct sort.                                            |           |
| 13.5  | `POST /v1/behaviour/recognition/publications {award_id}` — creates pending publication.                                                               | 201. `requires_parent_consent` computed from award type. |           |
| 13.6  | `PATCH /...:id/approve` — 200. Status = approved.                                                                                                     | 200.                                                     |           |
| 13.7  | `PATCH /...:id/reject {reason}` — 200.                                                                                                                | 200.                                                     |           |
| 13.8  | Parent-consent-required publication — approve requires `parent_consent_status=granted`. Otherwise 409 `PARENT_CONSENT_PENDING`.                       | 409 when consent pending.                                |           |
| 13.9  | `POST /v1/behaviour/recognition/houses/bulk-assign {student_ids, house_team_id}` — 200 `{affected: N}`. Each student's previous membership end-dated. | 200.                                                     |           |
| 13.10 | `GET /v1/behaviour/recognition/public/feed` — 200 returns ONLY approved+published publications with `unpublished_at IS NULL`.                         | Filter correct.                                          |           |

---

## 14. API contract matrix — behaviour documents + templates

| #     | What to run                                                                                                                       | Expected                                              | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------- |
| 14.1  | `POST /v1/behaviour/documents/generate {template_id, entity_type, entity_id, locale}` — 202 async.                                | 202. Worker `pdf-rendering` job enqueued.             |           |
| 14.2  | Invalid `entity_type` — 400.                                                                                                      | 400.                                                  |           |
| 14.3  | `template_id.locale` mismatch with request `locale` — 400 `LOCALE_MISMATCH`.                                                      | 400.                                                  |           |
| 14.4  | After worker completes, `GET /v1/behaviour/documents/:id` — status=generated, `file_key` populated.                               | 200.                                                  |           |
| 14.5  | `GET /v1/behaviour/documents/:id/download` — returns signed S3 URL (200 with URL in body, or 302 redirect).                       | URL valid for < 15 min.                               |           |
| 14.6  | `GET /v1/behaviour/documents/:id/preview` — same as download but inline-disposition.                                              | 200.                                                  |           |
| 14.7  | `PATCH /v1/behaviour/documents/:id/finalise` — status=sent. Double-finalise → 409.                                                | 200; then 409.                                        |           |
| 14.8  | `POST /v1/behaviour/documents/:id/send {channel: 'email', recipient_parent_id}` — 201. Notification enqueued.                     | 201.                                                  |           |
| 14.9  | Send with `channel: 'sms'` and no tenant SMS provider wired — 201 at API level; worker-side `PROVIDER_NOT_WIRED` visible in logs. | 201 + log. (Per PLAN §8 delivery providers deferred.) |           |
| 14.10 | Document supersession — re-generate for same entity triggers a new row with `superseded_by_id=<orig>`.                            | Chain correct.                                        |           |

---

## 15. API contract matrix — behaviour amendments + acknowledgements

### 15.1 Amendments

| #    | What to run                                                                       | Expected | Pass/Fail |
| ---- | --------------------------------------------------------------------------------- | -------- | --------- |
| 15.1 | `GET /v1/behaviour/amendments?status=pending` — 200 list.                         | 200.     |           |
| 15.2 | `GET /v1/behaviour/amendments/pending?pageSize=20` — 200.                         | 200.     |           |
| 15.3 | `POST /v1/behaviour/amendments/:id/send-correction` — 201. Notification enqueued. | 201.     |           |
| 15.4 | Double-send — 409 `CORRECTION_ALREADY_SENT`.                                      | 409.     |           |

### 15.2 Acknowledgements

| #    | What to run                                                                                                         | Expected                              | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------- |
| 15.5 | `GET /v1/behaviour/acknowledgements?parent_id=<currentParent>` — 200 list scoped to linked students.                | 200.                                  |           |
| 15.6 | `POST /v1/behaviour/acknowledgements/:id/read` — flips `read_at` + `acknowledged_at`. Parent only (403 for others). | 201.                                  |           |
| 15.7 | Acknowledge a non-parent-linked ack — 403.                                                                          | 403.                                  |           |
| 15.8 | Ack cannot be un-acknowledged (append-only).                                                                        | No endpoint; 404 on attempted DELETE. |           |

---

## 16. API contract matrix — behaviour interventions + tasks + alerts + guardian restrictions

Full-suite coverage; condensed here.

| #    | What to run                                                                                                          | Expected       | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------- | -------------- | --------- |
| 16.1 | `POST /v1/behaviour/interventions` — happy + boundary matrix (Zod: `review_frequency_days > 0`, goals array ≥ 1).    | 201.           |           |
| 16.2 | `PATCH /...:id/status` state machine — active → paused → completed → ceased; invalid transitions 400.                | State correct. |           |
| 16.3 | `POST /...:id/progress` — 201.                                                                                       | 201.           |           |
| 16.4 | `POST /...:id/review` — 201. `next_review_date` updated on parent row.                                               | 201.           |           |
| 16.5 | `POST /...:id/link-incidents {incident_ids}` — junction rows created. Duplicates → 409.                              | 201.           |           |
| 16.6 | Guardian restriction `POST /v1/behaviour/guardian-restrictions` happy + boundary (effective_until > effective_from). | 201.           |           |
| 16.7 | Revoke: `PATCH /...:id/revoke {revoke_reason}` — 200.                                                                | 200.           |           |
| 16.8 | Alert acknowledge: `PATCH /v1/behaviour/alerts/:id/acknowledge` — 200.                                               | 200.           |           |
| 16.9 | Task complete: `PATCH /v1/behaviour/tasks/:id {status: 'completed'}` — 200. Overdue auto-detect via worker cron.     | 200.           |           |

---

## 17. API contract matrix — behaviour admin (policies, legal holds, retention, repair)

| #    | What to run                                                                                                   | Expected                                                   | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------- |
| 17.1 | `POST /v1/behaviour/admin/legal-holds {entity_type, entity_id, hold_reason, legal_basis}` — 201.              | 201.                                                       |           |
| 17.2 | Attempt to archive an entity under hold — 400 `LEGAL_HOLD_ACTIVE`.                                            | 400.                                                       |           |
| 17.3 | `PATCH /...:id/release {release_reason}` — 200.                                                               | 200.                                                       |           |
| 17.4 | Policy dry-run `POST /v1/behaviour/policy-dry-run {category_id, severity, participants}` — 200 action matrix. | 200.                                                       |           |
| 17.5 | Policy replay `POST /v1/behaviour/policies/replay/preview?incident_id=<id>&rule_version=<n>` — 200 diff view. | 200.                                                       |           |
| 17.6 | Admin repair: `POST /v1/behaviour/admin/repair-orphans` — 200 `{affected: N}`. All as BullMQ job.             | 200. (Per DZ-Wellbeing-8 there is no dedicated table yet.) |           |
| 17.7 | Admin confirm_phrase endpoint (destructive operations guard) — missing `confirm` body → 400.                  | 400.                                                       |           |

---

## 18. API contract matrix — pastoral concerns + versions

| #     | What to run                                                                                                                                         | Expected                                               | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------- |
| 18.1  | `POST /v1/pastoral/concerns {student_id, category, severity, tier, occurred_at, witnesses, actions_taken}` — happy with IP audit.                   | 201. `ip_address` captured in `pastoral_events` entry. |           |
| 18.2  | Missing student_id — 400.                                                                                                                           | 400.                                                   |           |
| 18.3  | Tier=3 without CP grant — 201 at creation (any staff can create tier-3) but only CP-grant users can READ. RLS enforces downstream.                  | 201.                                                   |           |
| 18.4  | `PATCH /v1/pastoral/concerns/:id/narrative {narrative, amendment_reason}` — 200. Creates `pastoral_concern_versions` row `version_number+1`.        | 200 + new version.                                     |           |
| 18.5  | `POST /...:id/escalate {new_tier, reason}` — 201. Tier updated. Pastoral_events row (`escalated`). If new_tier=3, worker notifications fire to DSL. | 201 + chain.                                           |           |
| 18.6  | Escalate from 3 → 2 — 400 `TIER_DOWNGRADE_NOT_ALLOWED` (policy decision; document).                                                                 | 400.                                                   |           |
| 18.7  | `POST /...:id/share-with-parent {parent_id, share_level: 'category_only' \| 'full'}` — 201. `parent_shareable=true`, `shared_at` set.               | 201.                                                   |           |
| 18.8  | Share with a parent not linked to the student — 400 `PARENT_NOT_LINKED_TO_STUDENT`.                                                                 | 400.                                                   |           |
| 18.9  | `GET /...:id/events?pageSize=50` — 200 paginated events. Shape matches `pastoral_events`.                                                           | 200.                                                   |           |
| 18.10 | Duplicate escalate with same target tier — 409 `ALREADY_AT_TIER`.                                                                                   | 409.                                                   |           |

---

## 19. API contract matrix — pastoral cases + ownership transfer

| #    | What to run                                                                                      | Expected                      | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------ | ----------------------------- | --------- |
| 19.1 | `POST /v1/pastoral/cases {student_ids, opened_reason, owner_user_id}` — 201.                     | 201. `case_number` formatted. |           |
| 19.2 | Owner not a staff user — 400.                                                                    | 400.                          |           |
| 19.3 | `PATCH /...:id/status` state machine open→active→review_due→closed; invalid → 400.               | State correct.                |           |
| 19.4 | `POST /...:id/transfer {new_owner, reason}` — 201. Old owner's `my cases` no longer includes it. | 201.                          |           |
| 19.5 | Transfer to self — 400 `SAME_OWNER`.                                                             | 400.                          |           |
| 19.6 | `POST /...:id/concerns {concern_id}` — links existing concern.                                   | 201.                          |           |
| 19.7 | `DELETE /...:id/concerns/:concernId` — unlinks.                                                  | 204.                          |           |
| 19.8 | Link concern already linked to another case — 409 `CONCERN_ALREADY_IN_CASE`.                     | 409.                          |           |
| 19.9 | Close case with open interventions — 400 `INTERVENTIONS_ACTIVE` OR auto-closes them; document.   | Behaviour documented.         |           |

---

## 20. API contract matrix — pastoral interventions + reviews

Mirror §16 with pastoral analogs.

| #    | What to run                                                                                                         | Expected                | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------- |
| 20.1 | `POST /v1/pastoral/interventions {case_id, student_id, intervention_type, continuum_level, target_outcomes}` — 201. | 201.                    |           |
| 20.2 | Status enum uses `pc_*` prefix (DZ-Wellbeing-1). UI maps `active` → `pc_active` correctly.                          | State validation works. |           |
| 20.3 | `POST /...:id/review` — 201; `next_review_date` updated.                                                            | 201.                    |           |
| 20.4 | Invalid `review_cycle_weeks` (0 or negative) — 400.                                                                 | 400.                    |           |
| 20.5 | Action completion chain — mark action completed triggers aggregate recompute on parent intervention.                | Correct.                |           |

---

## 21. API contract matrix — pastoral referrals + recommendations + visits

| #     | What to run                                                                                                                                                          | Expected         | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------- |
| 21.1  | `POST /v1/pastoral/referrals {student_id, referral_type, referral_body_name, reason}` — 201 draft.                                                                   | 201.             |           |
| 21.2  | Full lifecycle: `/submit` → `/acknowledge` → `/schedule-assessment` → `/complete-assessment` → `/receive-report` → `/complete`. Each step only valid in prior state. | All 201.         |           |
| 21.3  | Invalid state step — e.g. submit before complete — 400.                                                                                                              | 400.             |           |
| 21.4  | `POST /...:id/pre-populate` — 201 snapshot injected into manual_additions JSON.                                                                                      | 201.             |           |
| 21.5  | `POST /...:id/withdraw {reason}` — 201.                                                                                                                              | 201.             |           |
| 21.6  | Recommendations CRUD: `POST /...:referralId/recommendations`, `PATCH`, status enum `rec_pending/in_progress/completed`. Invalid state → 400.                         | Correct.         |           |
| 21.7  | NEPS visits: `POST /v1/pastoral/neps-visits` + junction via `/...:visitId/students`.                                                                                 | 201.             |           |
| 21.8  | Junction uniqueness — duplicate (visit_id, student_id) → 409.                                                                                                        | 409.             |           |
| 21.9  | Update visit-student outcome: `PATCH /...:visitId/students/:id`.                                                                                                     | 200.             |           |
| 21.10 | Delete visit: cascades to junction, preserves recommendations.                                                                                                       | Cascade correct. |           |

---

## 22. API contract matrix — pastoral critical incidents + response plan

| #    | What to run                                                                                                                                                    | Expected                          | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------- | --- |
| 22.1 | `POST /v1/pastoral/critical-incidents {incident_type, description, occurred_at, scope, scope_ids}` — 201.                                                      | 201. `incident_number` formatted. |           |
| 22.2 | `incident_type='other'` without `incident_type_other` — 400.                                                                                                   | 400.                              |           |
| 22.3 | Add affected: `POST /...:id/affected {affected_type, student_id                                                                                                | staff_profile_id, impact_level}`. | 201.      |     |
| 22.4 | Affected without `student_id` or `staff_profile_id` — 400.                                                                                                     | 400.                              |           |
| 22.5 | `PATCH /...:id/status` state machine ci_active → managed → resolved → closed; closure requires closure_notes.                                                  | Correct.                          |           |
| 22.6 | `GET /v1/pastoral/critical-incidents/:id/affected/:personId/support` — 200 support log.                                                                        | 200.                              |           |
| 22.7 | Wellbeing flag auto-expiry — `criticalIncidentAffected.wellbeing_flag_active` flips false after `expires_at` via worker cron `pastoral:wellbeing-flag-expiry`. | Correct after cron fire.          |           |

---

## 23. API contract matrix — pastoral SST

| #    | What to run                                                                                                                                       | Expected            | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------- |
| 23.1 | `POST /v1/pastoral/sst/members {user_id, role_description}` — 201.                                                                                | 201.                |           |
| 23.2 | Duplicate (user_id) — 409.                                                                                                                        | 409.                |           |
| 23.3 | `POST /v1/pastoral/sst/meetings {scheduled_at, general_notes}` — 201.                                                                             | 201.                |           |
| 23.4 | `POST /...:id/agenda/precompute` or worker `pastoral:precompute-agenda` fires on meeting create. After 5s, agenda items populated from 6 sources. | Correct.            |           |
| 23.5 | Re-precompute within 5-min idempotency window — silent no-op.                                                                                     | No duplicate items. |           |
| 23.6 | `POST /...:id/agenda/refresh` — AI-flag gated. Flag off → 403.                                                                                    | 403.                |           |
| 23.7 | `POST /...:meetingId/actions {assigned_to_user_id, due_date, description}` — 201.                                                                 | 201.                |           |
| 23.8 | Overdue action auto-flip — worker `pastoral:overdue-actions` hourly cron.                                                                         | Correct after cron. |           |
| 23.9 | `PATCH /...:meetingId/status {to: 'held'}` + minutes.                                                                                             | 200.                |           |

---

## 24. API contract matrix — pastoral check-ins

| #    | What to run                                                                                                         | Expected                                                                   | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------- |
| 24.1 | `POST /v1/pastoral/checkins {mood_score, freeform_text}` as student — 201.                                          | 201.                                                                       |           |
| 24.2 | Same student, same day — second POST returns 200 with existing row OR 409 `CHECKIN_ALREADY_SUBMITTED`. Document.    | Documented. Unique index `(tenant_id, student_id, checkin_date)` enforces. |           |
| 24.3 | `mood_score` out of range (0 or > 5) — 400.                                                                         | 400.                                                                       |           |
| 24.4 | `freeform_text` > 500 chars — 400.                                                                                  | 400.                                                                       |           |
| 24.5 | Content triggers a safeguarding keyword → server sets `flagged=true`, creates auto pastoral concern (worker chain). | Concern appears in `/pastoral/checkins/flagged` view.                      |           |
| 24.6 | `GET /v1/pastoral/checkins/my?pageSize=10` — 200 own.                                                               | 200.                                                                       |           |
| 24.7 | `GET /v1/pastoral/checkins/status` — 200 `{eligible, next_window_opens_at, last_checkin_at}`.                       | 200.                                                                       |           |
| 24.8 | `POST /v1/pastoral/checkins/:id/escalate` by counsellor — 201. Concern flagged=true.                                | 201.                                                                       |           |
| 24.9 | `POST /...:id/dismiss {reason}` — 200. flagged=false.                                                               | 200.                                                                       |           |

---

## 25. API contract matrix — pastoral DSAR reviews + stats

| #    | What to run                                                                         | Expected | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------- | -------- | --------- |
| 25.1 | `GET /v1/pastoral/dsar-reviews?compliance_request_id=<id>&pageSize=50` — 200.       | 200.     |           |
| 25.2 | `PATCH /v1/pastoral/dsar-reviews/:id {decision, legal_basis, justification}` — 200. | 200.     |           |
| 25.3 | Decision enum not in allowed set — 400.                                             | 400.     |           |
| 25.4 | Tier-3 DSAR review — requires `pastoral.export_tier3`; teacher → 403.               | 403.     |           |
| 25.5 | `GET /v1/pastoral/dsar-reviews/stats` — 200 aggregate.                              | 200.     |           |

---

## 26. API contract matrix — pastoral import

| #    | What to run                                                                                                                    | Expected                 | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | --------- |
| 26.1 | `POST /v1/pastoral/import/dry-run {csv_base64}` — 200 validation report per row.                                               | 200.                     |           |
| 26.2 | Invalid student emails in CSV — reported per row.                                                                              | Reported.                |           |
| 26.3 | `POST /v1/pastoral/import/commit {upload_id}` — 202 async. Worker import chain runs.                                           | 202.                     |           |
| 26.4 | Same CSV re-committed — import_hash de-dupes; no duplicate rows.                                                               | Idempotent.              |           |
| 26.5 | Large CSV (10k rows) — 202; progress endpoint `GET /v1/pastoral/import/:uploadId/status` returns `{processed, total, errors}`. | Progress endpoint works. |           |

---

## 27. API contract matrix — safeguarding concerns + actions + referrals

| #     | What to run                                                                                                        | Expected                                                                            | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | --------- |
| 27.1  | `POST /v1/safeguarding/concerns {student_id, concern_type, severity, description, immediate_actions_taken}` — 201. | 201. `concern_number` formatted. `sla_first_response_due` = now + tenant-SLA-hours. |           |
| 27.2  | Missing `description` — 400.                                                                                       | 400.                                                                                |           |
| 27.3  | `concern_type` outside enum — 400.                                                                                 | 400.                                                                                |           |
| 27.4  | Invalid `student_id` (cross-tenant) — 400.                                                                         | 400.                                                                                |           |
| 27.5  | As student — 403.                                                                                                  | 403.                                                                                |           |
| 27.6  | As teacher (has `safeguarding.report` only) — 201.                                                                 | 201.                                                                                |           |
| 27.7  | As teacher, then `GET /v1/safeguarding/concerns/:id` — 403 (teacher lacks `safeguarding.view`).                    | 403.                                                                                |           |
| 27.8  | Teacher `GET /v1/safeguarding/my-reports` — returns only what they reported.                                       | 200.                                                                                |           |
| 27.9  | `POST /...:id/assign {assigned_to_user_id}` — 201.                                                                 | 201.                                                                                |           |
| 27.10 | `POST /...:id/actions {action_type, description, metadata}` — 201.                                                 | 201.                                                                                |           |
| 27.11 | `POST /...:id/tusla-referral {tusla_reference_number}` — 201. `is_tusla_referral=true`.                            | 201.                                                                                |           |
| 27.12 | Double TUSLA referral — 400 `ALREADY_REFERRED`.                                                                    | 400.                                                                                |           |
| 27.13 | `POST /...:id/garda-referral {garda_reference_number}` — 201.                                                      | 201.                                                                                |           |
| 27.14 | Attachment upload with ClamAV stub returning "clean" — row scan_status=clean after worker chain.                   | Clean.                                                                              |           |
| 27.15 | Attachment with simulated infected file (EICAR string) — scan_status=flagged; concern marked `virus_detected`.     | Flagged.                                                                            |           |
| 27.16 | `POST /...:id/case-file` — 202 async. PDF rendered; includes all actions / referrals / attachments index.          | 202 + valid PDF.                                                                    |           |
| 27.17 | `POST /...:id/case-file/redacted` — student name redacted, no attachments.                                         | Redacted PDF.                                                                       |           |
| 27.18 | `GET /v1/safeguarding/dashboard` — 200 aggregate counts.                                                           | 200.                                                                                |           |

---

## 28. API contract matrix — safeguarding seal workflow

Dual-control: owner + principal.

| #     | What to run                                                                                                                                         | Expected      | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------- |
| 28.1  | `POST /v1/safeguarding/concerns/:id/seal/initiate {reason, retention_until}` as owner — 201. Seal-status=pending.                                   | 201.          |           |
| 28.2  | `POST /.../seal/approve` as the SAME owner (who initiated) — 403 `SEAL_REQUIRES_DUAL_CONTROL`.                                                      | 403.          |           |
| 28.3  | `POST /.../seal/approve` as principal (different admin) — 201. `sealed_at`, `sealed_by_id`, `seal_approved_by_id` populated with distinct user ids. | 201.          |           |
| 28.4  | Post-seal mutations — any PATCH / POST action on a sealed concern → 403 `CONCERN_SEALED`.                                                           | 403.          |           |
| 28.5  | Post-seal read from a non-sealed-view user (without Tier-3 role AND without break-glass) — 403.                                                     | 403.          |           |
| 28.6  | `GET /.../seal-status` — 200 `{state, sealed_at, sealed_by, approved_by, retention_until, reason}`.                                                 | 200.          |           |
| 28.7  | `POST /.../seal/reject {reason}` before approve — 201. Pending-seal state cleared.                                                                  | 201.          |           |
| 28.8  | `POST /.../seal/approve` with no pending seal — 400 `NO_PENDING_SEAL`.                                                                              | 400.          |           |
| 28.9  | Unseal — no endpoint exposed. Confirm: `POST /.../unseal` returns 404 route-not-found. Sealed is irreversible.                                      | 404.          |           |
| 28.10 | Sealed concern appears in `/v1/safeguarding/sealed` archive only; normal list excludes it.                                                          | Archive-only. |           |

---

## 29. API contract matrix — safeguarding break-glass

| #     | What to run                                                                                                                    | Expected                                           | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | --------- |
| 29.1  | `POST /v1/safeguarding/break-glass {granted_to_id, reason, scope: 'specific_concerns', scoped_concern_ids, expires_at}` — 201. | 201.                                               |           |
| 29.2  | Missing `reason` — 400.                                                                                                        | 400.                                               |           |
| 29.3  | `expires_at` in past — 400 `EXPIRY_IN_PAST`.                                                                                   | 400.                                               |           |
| 29.4  | `scope: 'all_concerns'` without `scoped_concern_ids` — valid; 201.                                                             | 201.                                               |           |
| 29.5  | `scope: 'specific_concerns'` without ids — 400.                                                                                | 400.                                               |           |
| 29.6  | Grant to a user in Tenant B — 400 `USER_NOT_FOUND`.                                                                            | 400.                                               |           |
| 29.7  | `GET /v1/safeguarding/break-glass` — 200 list of active + expired.                                                             | 200.                                               |           |
| 29.8  | `GET /...:id/access-log` — 200 list of access events.                                                                          | 200.                                               |           |
| 29.9  | After `expires_at`, the daily worker `behaviour:break-glass-expiry` revokes the grant. `revoked_at` populated.                 | Revoked.                                           |           |
| 29.10 | `POST /...:id/review {notes, appropriate_use}` — 201.                                                                          | 201. `after_action_review_completed_at` populated. |           |
| 29.11 | Unexpired + unused grant — worker still creates review task if `after_action_review_required=true`.                            | Task present.                                      |           |
| 29.12 | Grant creation as a non-admin without `safeguarding.seal` — 403.                                                               | 403.                                               |           |

---

## 30. API contract matrix — safeguarding keywords + message-scan

| #    | What to run                                                                                                                            | Expected       | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------- |
| 30.1 | `POST /v1/safeguarding/keywords {keyword, severity, category}` — 201.                                                                  | 201.           |           |
| 30.2 | Duplicate keyword — 409.                                                                                                               | 409.           |           |
| 30.3 | `PATCH /...:id {active: false}` — 200.                                                                                                 | 200.           |           |
| 30.4 | Message containing active keyword triggers `safeguarding:message-scan` worker; creates safeguarding_concern with `breach_detected_at`. | Correct chain. |           |
| 30.5 | Inactive keyword doesn't trigger.                                                                                                      | No chain.      |           |

---

## 31. API contract matrix — early warning profiles + signals + config

| #    | What to run                                                                          | Expected | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------ | -------- | --------- |
| 31.1 | `GET /v1/early-warnings?pageSize=50` — 200 paginated.                                | 200.     |           |
| 31.2 | `GET /v1/early-warnings/summary` — 200 aggregate (amber/red counts per year group).  | 200.     |           |
| 31.3 | `GET /v1/early-warnings/cohort?year_group_id=...` — 200 pivot.                       | 200.     |           |
| 31.4 | `GET /v1/early-warnings/:studentId` — 200 full detail.                               | 200.     |           |
| 31.5 | `POST /v1/early-warnings/:studentId/acknowledge` — 204.                              | 204.     |           |
| 31.6 | Double-acknowledge — 200 idempotent.                                                 | 200.     |           |
| 31.7 | `POST /v1/early-warnings/:studentId/assign {assigned_staff_id}` — 201.               | 201.     |           |
| 31.8 | `PUT /v1/early-warnings/config {signal_threshold, tier_criteria}` — 200. Admin only. | 200.     |           |
| 31.9 | As teacher — `PUT config` → 403.                                                     | 403.     |           |

---

## 32. API contract matrix — staff wellbeing surveys + responses + moderation

| #     | What to run                                                                                                                       | Expected                   | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------- |
| 32.1  | `POST /v1/staff-wellbeing/surveys {title, description, frequency, questions: [...]}` — 201.                                       | 201.                       |           |
| 32.2  | `POST /...:id/clone` — 201 draft clone.                                                                                           | 201.                       |           |
| 32.3  | `POST /...:id/activate` — 201. Status=active. `wellbeing:survey-open-notify` enqueued.                                            | 201 + notification chain.  |           |
| 32.4  | `POST /...:id/activate` on already-active survey — 400 `ALREADY_ACTIVE`.                                                          | 400.                       |           |
| 32.5  | `POST /...:id/close` — 201. Status=closed.                                                                                        | 201.                       |           |
| 32.6  | `POST /v1/staff-wellbeing/respond/:surveyId {answers: [...]}` with participation token — 201. NO user identifier in row.          | 201.                       |           |
| 32.7  | Impersonation blocked — 403 BlockImpersonationGuard.                                                                              | 403.                       |           |
| 32.8  | Duplicate respond with same token — 409 or silent no-op.                                                                          | Documented.                |           |
| 32.9  | `GET /v1/staff-wellbeing/respond/active` — 200 survey or 204 no-content if none active.                                           | 200/204.                   |           |
| 32.10 | Moderation: `POST /v1/staff-wellbeing/surveys/:id/moderate/:responseId {status: 'flagged'}` — 200.                                | 200.                       |           |
| 32.11 | Moderation scan triggered on content with identifying info — `moderation_status=flagged` after worker.                            | Correct.                   |           |
| 32.12 | Results endpoint with response count < min_response_threshold — 403 `INSUFFICIENT_RESPONSES` or returns partial.                  | Documented.                |           |
| 32.13 | Survey cannot have identity leakage at any layer — `sql("SELECT * FROM survey_responses WHERE user_id IS NOT NULL")` = no column. | Confirmed earlier in §6.3. |           |

---

## 33. API contract matrix — wellbeing aggregate

| #    | What to run                                                                                                                                            | Expected                | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | --------- |
| 33.1 | `GET /v1/wellbeing/dashboard-summary` — 200. `{data: {kpis, pending_attention, hub_counts, recent_activity}}` shape.                                   | Shape matches PLAN §3b. |           |
| 33.2 | Sub-queries failure tolerance — simulate `safeguarding` module DB failure; response should still 200 with zeros for that section and a logged warning. | Resilient.              |           |
| 33.3 | Disabled module — `tenant_modules.is_active=false` for `staff_wellbeing` — `hub_counts.staff_wellbeing=0`. Other sections unaffected.                  | Correct.                |           |
| 33.4 | Cache — repeated call within 30s returns same response (if caching wired). Otherwise fresh compute.                                                    | Documented.             |           |
| 33.5 | Cross-tenant — Tenant A request only contains Tenant A numbers.                                                                                        | Correct.                |           |

---

## 34. API contract matrix — AI flags + flag-gated endpoints

| #    | What to run                                                                                                                                                      | Expected                                                                                                                       | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 34.1 | `GET /v1/ai-flags` — 200 list of module_key/enabled pairs.                                                                                                       | 200.                                                                                                                           |           |
| 34.2 | `PATCH /v1/ai-flags/:moduleKey {enabled: true}` — 200.                                                                                                           | 200. `updated_at` + `updated_by` populated.                                                                                    |           |
| 34.3 | Unknown moduleKey — 400.                                                                                                                                         | 400.                                                                                                                           |           |
| 34.4 | As teacher — 403.                                                                                                                                                | 403.                                                                                                                           |           |
| 34.5 | After `PATCH /v1/ai-flags/behaviour {enabled: false}`, `POST /v1/behaviour/incidents/ai-parse` → 403 `AI_DISABLED`.                                              | 403.                                                                                                                           |           |
| 34.6 | After enabling + missing `ANTHROPIC_API_KEY` — 503 `AI_SERVICE_UNAVAILABLE`.                                                                                     | 503.                                                                                                                           |           |
| 34.7 | All AI-flag-gated endpoints consistently use the same decorator behaviour — grep the codebase for `@RequiresAiFlag` to list them, then run a smoke per endpoint. | Consistent across `behaviour.ai-parse`, `behaviour.ai-summary`, `behaviour.analytics.ai-query`, `pastoral.sst.agenda/refresh`. |           |

---

## 35. API contract matrix — wellbeing notification preferences

| #    | What to run                                                                                                                                                               | Expected                                                           | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------- |
| 35.1 | `GET /v1/tenants/notification-preferences` (or equivalent) — 200.                                                                                                         | 200.                                                               |           |
| 35.2 | `PATCH /v1/tenants/notification-preferences {wellbeing_channels: {defaults: {email: true, sms: false, whatsapp: false}, overrides: {...}}}` — 200. JSONB shape validated. | 200. `tenant_notification_preferences.wellbeing_channels` matches. |           |
| 35.3 | Invalid JSON shape (e.g. `defaults.email` not boolean) — 400.                                                                                                             | 400.                                                               |           |
| 35.4 | As teacher — 403.                                                                                                                                                         | 403.                                                               |           |
| 35.5 | In-app is always on invariant — attempts to disable in-app via override fail silently or 400 `IN_APP_CANNOT_BE_DISABLED`.                                                 | Invariant honoured.                                                |           |

---

## 36. API contract matrix — child protection (cp-records)

IP audit is mandatory on every CP endpoint.

| #    | What to run                                                                                                          | Expected                                    | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------- |
| 36.1 | `POST /v1/child-protection/cp-records {student_id, record_type, narrative}` with CP-access-grant — 201. IP captured. | 201. `pastoral_events.ip_address` not null. |           |
| 36.2 | Without CP-access — 403 (CpAccessGuard).                                                                             | 403.                                        |           |
| 36.3 | `GET /v1/child-protection/cp-records?student_id=X` with grant — 200. IP audit.                                       | 200.                                        |           |
| 36.4 | `PATCH /v1/child-protection/cp-records/:id {narrative}` — 201. IP captured.                                          | 201.                                        |           |
| 36.5 | Cross-tenant cp_record id — 404.                                                                                     | 404.                                        |           |
| 36.6 | Revoke grant mid-session — subsequent GET returns 403 immediately.                                                   | 403 after revocation.                       |           |
| 36.7 | Grant with `scope='specific_concerns'` — access only to linked concerns' CP records; 403 for others.                 | Scope enforced.                             |           |

---

## 37. State-machine invariants — 7 lifecycles

| Machine               | States                                                                      | Valid transitions                                         | Invalid (400)              |
| --------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------- |
| Incident status       | draft → submitted → approved → escalated → resolved → archived              | forward only                                              | reverse + skip             |
| Sanction status       | pending → scheduled → served / voided                                       | forward                                                   | served→pending, voided→any |
| Exclusion case        | drafted → hearing_scheduled → hearing_held → decided → implemented → closed | forward                                                   | skip, reverse              |
| Appeal                | draft → submitted → scheduled → hearing_held → decided                      | forward                                                   | skip, reverse              |
| Pastoral case         | open → active → review_due → closed                                         | forward                                                   | reverse                    |
| Pastoral intervention | pc_pending → pc_active → pc_paused → pc_completed → pc_ceased               | forward + pc_active ↔ pc_paused                           | others                     |
| Safeguarding concern  | open → under_review → referred → resolved → closed                          | forward + under_review → resolved (skip referred) allowed | reverse, resolved → open   |
| Survey status         | draft → active → closed → archived                                          | forward                                                   | reverse, draft → closed    |

For each row, run:

- 2 valid transition cases (200).
- 2 invalid transition cases (400 `INVALID_STATE_TRANSITION`).
- Status transition audit — each state change creates an `_entity_history` / `_events` row.

**Total ~48 state-machine rows.**

---

## 38. Concurrency / race tests

### 38.1 Parallel incident creation — unique idempotency

| #      | What to run                                                                                                                                                       | Expected                                                   | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------- |
| 38.1.1 | `Promise.all([POST /incidents with Idempotency-Key=X × 3])` — 3 parallel with same key.                                                                           | Exactly 1 new row. 3 responses all 201 with the same body. |           |
| 38.1.2 | 10 parallel POSTs with distinct idempotency keys but identical payloads.                                                                                          | 10 new rows; 10 distinct incident_numbers.                 |           |
| 38.1.3 | Sequence under contention — `tenant_sequences.current_value` with `SELECT ... FOR UPDATE`. 50 parallel creations yield 50 unique sequential numbers with no gaps. | No gaps, no duplicates.                                    |           |

### 38.2 Dual-control seal — race

| #      | What to run                                                                                                                | Expected                                          | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------- |
| 38.2.1 | Owner initiates seal. Two principals **simultaneously** call approve. Only one succeeds (row-level lock on pending state). | One 201, one 409 `ALREADY_APPROVED` (or similar). |           |
| 38.2.2 | Same admin who initiated simultaneously calls approve (dual-control self-bypass). 403 regardless of timing.                | 403.                                              |           |

### 38.3 Break-glass revocation race

| #      | What to run                                                                                                                    | Expected                                                                           | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | --------- |
| 38.3.1 | User holds active grant. Admin revokes the grant at T=0. User fires GET at T=0 (race).                                         | Either 200 (read slipped in) or 403 (revocation landed first). Never partial/leak. |           |
| 38.3.2 | Worker `behaviour:break-glass-expiry` fires while user is mid-read — user sees 403 on the next request after `revoked_at` set. | Consistent.                                                                        |           |

### 38.4 SST agenda precompute dedup

| #      | What to run                                                                                   | Expected                                                                          | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------- |
| 38.4.1 | 3 parallel enqueues of `pastoral:precompute-agenda` for the same meeting within 5-min window. | Only one processor run produces items; other 2 short-circuit (idempotency check). |           |
| 38.4.2 | Re-run after 6 minutes — runs fresh and replaces items.                                       | Fresh compute.                                                                    |           |

### 38.5 Check-in daily uniqueness

| #      | What to run                                           | Expected                                                               | Pass/Fail |
| ------ | ----------------------------------------------------- | ---------------------------------------------------------------------- | --------- |
| 38.5.1 | Same student, 10 parallel POSTs for today's check-in. | 1 row created; 9 others either 200 with existing or 409. No duplicate. |           |

### 38.6 Bulk-mark-served race

| #      | What to run                                                                  | Expected                                                                                                        | Pass/Fail |
| ------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| 38.6.1 | Two admins simultaneously `POST /bulk-mark-served` with overlapping id sets. | Transactional; each sanction flips exactly once. Second request's response shows some `already_served` entries. |           |

### 38.7 Notification dispatch race

| #      | What to run                                                                                                                                                                      | Expected                                             | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------- |
| 38.7.1 | Critical incident declared + escalated simultaneously — two `pastoral:notify-concern` jobs with identical concern_id. Worker de-dupes via `pastoral_events` read before writing. | No duplicate notifications; one event, one dispatch. |           |

---

## 39. Transaction boundary tests

| #    | What to run                                                                                                                                                                                                                                                                       | Expected                        | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------- |
| 39.1 | RLS only in **interactive** transactions. Test harness asserts no `prisma.$transaction([...])` (sequential/batch) mode used in any wellbeing service. ESLint rule `no-sequential-transaction` covers this.                                                                        | Grep confirms zero usages.      |           |
| 39.2 | Every wellbeing mutation fires the Prisma middleware `SET LOCAL app.current_tenant_id = <tenant>` at transaction start. Simulate with `sql("SHOW app.current_tenant_id")` inside a wrapped tx.                                                                                    | Correct tenant set per request. |           |
| 39.3 | Transaction rollback on mid-tx failure: create an incident + participant + attachment in one service call where the attachment upload raises. Expected: incident and participant rolled back; no partial state in DB.                                                             | Rollback clean.                 |           |
| 39.4 | Cross-module chain: creating an incident with `auto_create_pastoral_concern=true` runs in a single tx (or is async enqueued in an outbox pattern). If tx fails, neither incident nor concern persists.                                                                            | Atomicity holds.                |           |
| 39.5 | Sealing a concern inside a tx — tx completion updates concern + creates `safeguarding_actions` audit row atomically. Simulate a crash between updates: DB state is consistent (all-or-nothing).                                                                                   | Atomic.                         |           |
| 39.6 | PgBouncer transaction-mode safety: verify RLS variable set within the tx is reset by the subsequent tx from a different tenant on the same connection. Test: interleave two requests with different tenants; neither should see the other's data even if they share a connection. | Tenant context isolated.        |           |
| 39.7 | Deadlock scenario: simulate two interactive txs both touching `tenant_sequences` and `behaviour_incidents`. Prisma's retry logic should surface `TRANSACTION_ABORTED` eventually; no silent data corruption.                                                                      | Deadlock surfaces cleanly.      |           |

---

## 40. Cross-module invariants

### 40.1 Behaviour → Pastoral auto-concern chain

| #      | What to run                                                                                                                                                                                                                   | Expected                                                                    | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------- |
| 40.1.1 | Create a behaviour_incident with a category where `auto_create_pastoral_concern=true`. After worker `pastoral:sync-behaviour-safeguarding` runs, a `pastoral_concerns` row exists with `behaviour_incident_id=<incident_id>`. | Concern created; bi-directional link intact.                                |           |
| 40.1.2 | Category with `converts_to_safeguarding=true` — after chain, a `safeguarding_concerns` row exists linked to the pastoral concern via `pastoral_concern_id`.                                                                   | Safeguarding concern created.                                               |           |
| 40.1.3 | Chain failures: if pastoral creation throws, safeguarding is NOT attempted. Behavior row still exists. Dead-letter queue captures the failure.                                                                                | Atomicity of chain: failures upstream don't cascade downstream incorrectly. |           |

### 40.2 Pastoral concern escalate → early-warning compute

| #      | What to run                                                                                                                                                                                        | Expected                                                      | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------- |
| 40.2.1 | Escalate a pastoral_concern to `severity='critical'`. Worker `pastoral:notify-concern` enqueues `early-warning:compute-student` for that student. Profile tier updated if signals cross threshold. | Chain executes; `student_risk_profiles.current_tier` updates. |           |

### 40.3 Safeguarding SLA breach → behaviour task

| #      | What to run                                                                                                                                         | Expected                                                                                            | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------- |
| 40.3.1 | Create a safeguarding_concern. Wait past SLA window. Cron `behaviour:cron-dispatch-sla` (every 5 min) enqueues `safeguarding:sla-check` per tenant. | After SLA breach: a `behaviour_tasks` row created with `type=sla_breach_followup`, `priority=high`. |           |
| 40.3.2 | Notification to the assignee (in_app + email per `tenant_notification_preferences`).                                                                | Notification enqueued; visible via `/v1/notifications`.                                             |           |

### 40.4 Exclusion decision → Document → Notification → Parent Acknowledgement

| #      | What to run                                                                                                                                                        | Expected                                                                                                                   | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | --------- |
| 40.4.1 | Complete exclusion lifecycle (§11). Decision letter document generated, sent to parent. A `behaviour_parent_acknowledgements` row is created with `channel=email`. | Chain: exclusion.record-decision → document.generate → document.send → notification.dispatch → parent_acknowledgement row. |           |
| 40.4.2 | Parent acknowledges via `POST /v1/behaviour/acknowledgements/:id/read`. `acknowledged_at` populated.                                                               | 201.                                                                                                                       |           |

### 40.5 Recognition award → Publication → Parent Consent

| #      | What to run                                                                                                                                                                            | Expected                                                        | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------- |
| 40.5.1 | Admin creates award → creates publication (if award_type.requires_parent_consent). Worker `wellbeing-notifications:dispatch` sends consent request to parent.                          | Notification sent. Publication `parent_consent_status=pending`. |           |
| 40.5.2 | Parent approves via `PATCH /v1/behaviour/recognition/publications/:id/approve`. Admin then `approve` same publication → published; appears on `/v1/behaviour/recognition/public/feed`. | Published.                                                      |           |
| 40.5.3 | Parent declines → publication rejected; no public feed entry.                                                                                                                          | Hidden.                                                         |           |

### 40.6 Survey open → member notifications

| #      | What to run                                                                                                                                                                            | Expected                           | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------- |
| 40.6.1 | Activate a survey. Worker `wellbeing:survey-open-notify` creates in-app notifications for every active member. Assert count via `sql("SELECT COUNT(*) FROM notifications WHERE ...")`. | Count matches active member count. |           |
| 40.6.2 | Duplicates prevented — re-activation after a close doesn't spam users.                                                                                                                 | Idempotent.                        |           |

### 40.7 Check-in flagged → pastoral concern → escalation

| #      | What to run                                                                                                                   | Expected                                                   | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------- |
| 40.7.1 | Student submits check-in with keyword. `flagged=true`. Worker `pastoral:checkin-alert` notifies monitoring owners.            | Alert delivered (or logged if notification infra stubbed). |           |
| 40.7.2 | Counsellor escalates via `POST /checkins/:id/escalate`. Concern created with tier matching category; further chain per §40.1. | Full chain.                                                |           |

### 40.8 In-app always-on invariant

| #      | What to run                                                                                                                  | Expected                                           | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------- |
| 40.8.1 | Every event-dispatched notification in the wellbeing umbrella writes an in-app row regardless of email/sms/whatsapp toggles. | Count of in_app rows ≥ count of dispatched events. |           |
| 40.8.2 | Turning off all channels in `tenant_notification_preferences` still yields in-app rows.                                      | Always on.                                         |           |

---

## 41. PDF / binary content invariants

| #     | What to run                                                                                                                                        | Expected                                                | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------- |
| 41.1  | Generate exclusion notice via the worker chain. Download `GET /v1/behaviour/documents/:id/download`.                                               | PDF valid (first bytes `%PDF-1.`).                      |           |
| 41.2  | Parse via `pdf-parse` — contains student name, incident summary, decision text, school letterhead.                                                 | Content matches.                                        |           |
| 41.3  | Board pack PDF: multiple sections (incident history, intervention history, hearing minutes). `pdf-parse` returns ≥ N pages (> 1).                  | Multi-page correct.                                     |           |
| 41.4  | Safeguarding case-file PDF — includes action log and referral records. `pdf-parse` can extract them.                                               | Content present.                                        |           |
| 41.5  | Redacted case-file — grep for student's full name → NOT present (replaced with `[REDACTED]`). SQL join shows redaction applied.                    | Redaction correct.                                      |           |
| 41.6  | Appeal evidence bundle — concatenation of individual attachments + index page. Byte count roughly sum of components.                               | Concatenation correct.                                  |           |
| 41.7  | Content-Type + Content-Disposition headers correct on all PDF endpoints.                                                                           | `application/pdf`; `attachment; filename="<name>.pdf"`. |           |
| 41.8  | SHA256 hash stored in `behaviour_documents.sha256_hash` matches recomputed hash of downloaded bytes.                                               | Matches.                                                |           |
| 41.9  | Signed-URL TTL — download URL works within 15 minutes; expired URL returns 403 from S3.                                                            | TTL correct.                                            |           |
| 41.10 | Cross-tenant download attempt — Tenant A JWT attempting to download a Tenant B document's URL (even if leaked) — blocked at API layer first (404). | 404 before URL exposed.                                 |           |

---

## 42. Audit-log + IP-audit correctness

| #    | What to run                                                                                                                       | Expected                         | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------- |
| 42.1 | Every mutation endpoint creates an `audit_log` row with `action`, `entity_type`, `entity_id`, `actor_user_id`, `tenant_id`, `ip`. | Audit rows present per mutation. |           |
| 42.2 | Sensitive mutations (seal approve, break-glass grant, amendment send-correction) have `classification=high` in audit.             | Classification correct.          |           |
| 42.3 | Pastoral concern creation captures `req.ip` in `pastoral_events.ip_address`. Behind a proxy, honours `X-Forwarded-For`.           | IP captured.                     |           |
| 42.4 | CP record access (GET + PATCH) creates `pastoral_events` with kind=`cp_record_accessed` + IP.                                     | Correct.                         |           |
| 42.5 | Safeguarding break-glass access — each read creates an access-log row with IP + user + endpoint.                                  | Correct.                         |           |
| 42.6 | Audit rows cannot be mutated — no PATCH/DELETE endpoints.                                                                         | None exposed.                    |           |
| 42.7 | Bulk ops (e.g. bulk-mark-served) create one audit row per affected entity, not one aggregate row.                                 | N rows.                          |           |
| 42.8 | Failed mutations (400/404/409) do NOT create audit rows.                                                                          | No rows for failures.            |           |

---

## 43. Webhook tests

**N/A — the wellbeing umbrella has no inbound webhooks.** Outbound delivery providers (email/SMS/WhatsApp) are stubbed (PLAN §8 defers hardening). Provider stubs emit `PROVIDER_NOT_WIRED` logs. Confirm no `@Webhook` decorator exists under `apps/api/src/modules/{behaviour,pastoral,safeguarding,staff-wellbeing,early-warning,wellbeing-*}`.

| #    | What to run                                                                                                                 | Expected    | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | ----------- | --------- |
| 43.1 | `grep -rn "@Webhook\|webhook" apps/api/src/modules/behaviour`                                                               | No results. |           |
| 43.2 | Same across pastoral, safeguarding, staff-wellbeing, early-warning, wellbeing-aggregate, wellbeing-notifications, ai-flags. | No results. |           |

---

## 44. Sequence & numbering invariants

Sequences in `tenant_sequences` (per-tenant): `behaviour_incident_number`, `behaviour_sanction_number`, `behaviour_appeal_number`, `behaviour_exclusion_number`, `behaviour_intervention_number`, `pastoral_case_number`, `safeguarding_concern_number`, `pastoral_concern_number` (if present), `critical_incident_number`.

| #    | What to run                                                                                                                                                                    | Expected                                                | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | --------- |
| 44.1 | After 5 sequential incident creations, `current_value` increased by 5.                                                                                                         | Correct.                                                |           |
| 44.2 | Tenant A and Tenant B can both have `INC-202604-0001` — `@@unique([tenant_id, sequence_type])` enforces per-tenant uniqueness only.                                            | Same format, separate values.                           |           |
| 44.3 | Format matches per type: `INC-YYYYMM-NNNN`, `SANC-YYYYMM-NNNN`, `APP-YYYYMM-NNNN`, `EXC-YYYYMM-NNNN`, `INT-YYYYMM-NNNN`, `PC-YYYYMM-NNNN`, `SG-YYYYMM-NNNN`, `CI-YYYYMM-NNNN`. | Regex match.                                            |           |
| 44.4 | Month rollover — new year-month prefix resets the sequence counter to 0001. Confirm on the 1st of a new month.                                                                 | Rollover behaviour consistent with seed data; document. |           |
| 44.5 | Concurrency safety per §38.1.3.                                                                                                                                                | No duplicates.                                          |           |

---

## 45. Sign-off

| Reviewer | Date | Pass / Fail | Notes |
| -------- | ---- | ----------- | ----- |
|          |      |             |       |
|          |      |             |       |
|          |      |             |       |

**This spec is release-ready when every row above is Pass. Companion specs (`admin_view`, `teacher_view`, `parent_view`, `student_view`, `worker`, `perf`, `security`) must likewise be Pass before the full `/e2e-full` pack is signed off.**

**Total rows in this spec (estimated): ~650 machine-executable assertions across 44 section groups.**
