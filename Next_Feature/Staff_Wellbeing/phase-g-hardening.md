# Phase G: Security Verification & Hardening

**Module:** Staff Wellbeing & Workload Intelligence
**Master Spec:** `Next_Feature/Staff_Wellbeing/staff-wellbeing-spec-v1-master.md`
**Identity:** The cross-cutting integration tests that prove the module is production-safe. These are the tests you'd show an auditor.
**Dependencies:** All previous phases (A-F) — full module must be assembled
**Blocks:** Nothing — this is the final V1 phase

---

## Prerequisites

- All phases A-F complete and individually verified
- Full module functional end-to-end: surveys, results, workload dashboards, frontend
- Read master spec Sections 3 (Non-Negotiable Rules — ALL), 10 (Audit & Trust), 16 (Testing Requirements), 17 (Risks), 20 (Architecture Documentation)
- Read `architecture/danger-zones.md` (verify survey_responses exception is documented)

---

## Purpose

Each phase (B-F) includes its own unit and integration tests. This phase is different — it runs **cross-cutting security and privacy tests** that span the entire module and can only be verified when all components are assembled. These tests validate the module's core privacy guarantees as a system, not as individual components.

This phase also performs the final architecture documentation pass and a manual security audit checklist.

---

## Deliverables

### G1. Cross-Tenant Isolation Tests (THE Critical Tests)

The `survey_responses` table has NO `tenant_id` and NO RLS policy. Tenant isolation depends entirely on the application layer joining through `staff_surveys.tenant_id`. These tests verify that no API path can leak responses across tenants.

| Test | Steps | Expected |
|------|-------|----------|
| **Survey results cross-tenant** | Create survey as Tenant A → submit responses → auth as Tenant B → GET survey results | 404 (survey not found for Tenant B) |
| **Survey detail cross-tenant** | Create survey as Tenant A → auth as Tenant B → GET survey detail by ID | 404 |
| **Moderation queue cross-tenant** | Create survey as Tenant A → submit freeform → auth as Tenant B → GET moderation queue | 404 or empty |
| **Survey comments cross-tenant** | Create survey as Tenant A → submit + close → auth as Tenant B → GET comments | 404 |
| **Active survey cross-tenant** | Activate survey for Tenant A → auth as Tenant B → GET /respond/active | null/204 (no active survey for B) |
| **Submit response cross-tenant** | Activate survey for Tenant A → auth as Tenant B staff → POST /respond/:surveyId | 404 (survey not found for Tenant B) |
| **Workload cross-tenant** | Auth as Tenant A staff → GET /my-workload/summary → verify data is only from Tenant A's schedules |
| **Aggregate cross-tenant** | Auth as Tenant A principal → GET /aggregate/workload-summary → verify data is only from Tenant A |
| **Board report cross-tenant** | Auth as Tenant A → GET /reports/termly-summary → verify data is only from Tenant A |

### G2. Impersonation Block Tests

Platform admin impersonation is blocked on ALL wellbeing endpoints. These tests verify the `@BlockImpersonation()` guard works module-wide.

| Test | Steps | Expected |
|------|-------|----------|
| **Personal workload** | Impersonate staff → GET /my-workload/summary | 403 IMPERSONATION_BLOCKED |
| **Cover history** | Impersonate staff → GET /my-workload/cover-history | 403 |
| **Timetable quality** | Impersonate staff → GET /my-workload/timetable-quality | 403 |
| **Aggregate summary** | Impersonate principal → GET /aggregate/workload-summary | 403 |
| **Cover fairness** | Impersonate principal → GET /aggregate/cover-fairness | 403 |
| **Correlation** | Impersonate principal → GET /aggregate/correlation | 403 |
| **Survey list** | Impersonate principal → GET /surveys | 403 |
| **Survey detail** | Impersonate principal → GET /surveys/:id | 403 |
| **Survey create** | Impersonate principal → POST /surveys | 403 |
| **Survey activate** | Impersonate principal → POST /surveys/:id/activate | 403 |
| **Survey close** | Impersonate principal → POST /surveys/:id/close | 403 |
| **Survey results** | Impersonate principal → GET /surveys/:id/results | 403 |
| **Survey comments** | Impersonate principal → GET /surveys/:id/results/comments | 403 |
| **Moderation queue** | Impersonate principal → GET /surveys/:id/moderation | 403 |
| **Moderate response** | Impersonate principal → PATCH /surveys/:id/moderation/:rid | 403 |
| **Active survey** | Impersonate staff → GET /respond/active | 403 |
| **Submit response** | Impersonate staff → POST /respond/:surveyId | 403 |
| **Resources** | Impersonate staff → GET /resources | 403 |
| **Board report** | Impersonate board member → GET /reports/termly-summary | 403 |

**Every single endpoint must return 403.** No exceptions.

### G3. Anonymous Submission Integrity Tests

These tests verify that no join path exists from a response to a user, at the database level.

| Test | Steps | Expected |
|------|-------|----------|
| **No user_id in responses** | Submit response → query `survey_responses` table directly (via raw SQL in test) → inspect ALL columns | No column contains user_id, staff_profile_id, session_id, ip_address |
| **No timestamp precision** | Submit response → check `submitted_date` column | TYPE is DATE (not TIMESTAMPTZ), value is date only |
| **No tenant_id on responses** | Inspect `survey_responses` table schema | No `tenant_id` column exists |
| **No RLS on responses** | Check pg_policies for `survey_responses` | No RLS policies exist |
| **Participation token one-way** | Submit response → read `survey_participation_tokens` → verify token_hash is a SHA256 hash (64 hex chars) | Hash exists, cannot be reversed to user_id without HMAC secret |
| **Token cleanup destroys linkability** | Close survey → advance 8 days → run cleanup → verify tokens deleted → verify responses still exist | Tokens gone, responses intact, no path from response to user |

### G4. Threshold Enforcement End-to-End Tests

These tests verify the complete threshold system works as a coherent unit.

| Test | Steps | Expected |
|------|-------|----------|
| **Below min threshold** | Create survey, submit 3 responses (threshold = 5) → close → GET results | Suppressed with message |
| **At min threshold** | Add 2 more responses (total = 5) → GET results | Results visible |
| **Department below threshold** | Create survey with dept filter, dept has 5 members (threshold = 10) → GET results with dept filter | Department hidden |
| **Cross-filter attack** | Create survey, 20 responses total, apply dept filter isolating 3 → GET results | 403 FILTER_BELOW_THRESHOLD |
| **Freeform in dept drill-down** | Apply dept filter → request comments | Freeform never shown in department view |
| **Small-N cycle comparison** | Compare two surveys where identity change could be inferred → check if comparison is suppressed | Comparison suppressed or safely aggregated |

### G5. Batch Release Enforcement End-to-End

| Test | Steps | Expected |
|------|-------|----------|
| **Results during active** | Activate survey → submit responses → GET /surveys/:id/results | 403 SURVEY_STILL_ACTIVE |
| **Comments during active** | Activate survey → submit freeform → GET /surveys/:id/results/comments | 403 |
| **Results after close** | Close survey → GET /surveys/:id/results | 200 with data |
| **Single active enforcement** | Activate survey A → POST /surveys/:id/activate for survey B | 409 SURVEY_ALREADY_ACTIVE |

### G6. Audit Log Verification

Verify that all privacy-sensitive actions generate audit log entries.

| Action | Audit Log Entry Expected |
|--------|--------------------------|
| Principal views aggregate dashboard | user_id, timestamp, dashboard_section |
| Principal views survey results | user_id, timestamp, survey_id |
| Principal opens raw freeform comments | user_id, timestamp, survey_id (explicit action) |
| Survey created | user_id, timestamp, survey_id, action: 'created' |
| Survey activated | user_id, timestamp, survey_id, action: 'activated' |
| Survey closed | user_id, timestamp, survey_id, action: 'closed' |
| Survey cloned | user_id, timestamp, source_survey_id, new_survey_id, action: 'cloned' |
| Moderation: approve | user_id, timestamp, response_id, action: 'approved' |
| Moderation: flag | user_id, timestamp, response_id, action: 'flagged', reason |
| Moderation: redact | user_id, timestamp, response_id, action: 'redacted', reason |
| Board report generated | user_id, timestamp, report_period |
| Threshold enforcement triggered | timestamp, survey_id, filter_attempted, reason_blocked |
| Impersonation attempt blocked | user_id, timestamp, endpoint_attempted |

### G7. Permission Model Verification

| Test | Expected |
|------|----------|
| Staff without `wellbeing.view_own_workload` → GET /my-workload/summary | 403 |
| Staff without aggregate permission → GET /aggregate/workload-summary | 403 |
| Staff → GET /surveys (manage) | 403 |
| Staff → GET /surveys/:id/results | 403 |
| Staff → GET /surveys/:id/moderation | 403 |
| Board member → GET /aggregate/workload-summary | 403 (board gets report only) |
| Board member → GET /reports/termly-summary | 200 |
| Board member → GET /surveys/:id/results | 403 |

### G8. Architecture Documentation Final Pass

Verify all architecture files are complete and accurate:

#### `architecture/module-blast-radius.md`
- [ ] `StaffWellbeingModule` listed with all dependencies
- [ ] Read-only dependencies noted: SchedulingModule, SubstitutionModule, StaffProfilesModule
- [ ] No modules depend on StaffWellbeingModule (confirmed)
- [ ] CommunicationsModule listed as notification dependency

#### `architecture/event-job-catalog.md`
- [ ] `wellbeing:compute-workload-metrics` — daily cron 04:00 UTC
- [ ] `wellbeing:release-survey-results` — on survey close
- [ ] `wellbeing:cleanup-participation-tokens` — daily cron 05:00 UTC
- [ ] `wellbeing:moderation-scan` — on freeform submission
- [ ] `wellbeing:survey-open-notify` — on survey activation
- [ ] `wellbeing:survey-closing-reminder` — daily cron 08:00 UTC
- [ ] `wellbeing:eap-refresh-check` — daily cron 06:00 UTC
- [ ] Each job has: queue, trigger, payload, description, side effects

#### `architecture/state-machines.md`
- [ ] Survey lifecycle: `draft → active → closed → archived`
- [ ] Valid transitions documented:
  - `draft → active` (requires: questions exist, window dates set, no other active survey)
  - `active → closed` (side effects: results computed, results_released set)
  - `closed → archived` (no side effects, cleanup only)
- [ ] Invalid transitions documented: no backward transitions, no draft→closed, no active→draft
- [ ] Moderation status lifecycle: `pending → approved | flagged | redacted`

#### `architecture/danger-zones.md`
- [ ] `survey_responses` exception documented as CRITICAL
- [ ] No tenant_id, no RLS, access only through survey join
- [ ] Only `StaffWellbeingSurveyService` may query this table
- [ ] Cross-tenant leakage risk and mitigation documented
- [ ] HMAC reversibility window (7 days) documented
- [ ] Integration test references included

---

## Manual Security Audit Checklist

This is a manual review, not automated tests. Walk through each item:

- [ ] **No API endpoint returns raw `survey_response` rows** — all endpoints return aggregated data
- [ ] **No log statement anywhere in the module logs user_id alongside survey_id** during response submission
- [ ] **HMAC secret never appears in logs, API responses, or error messages**
- [ ] **No console.log or debug statement leaks participation tokens**
- [ ] **Error responses from anonymous submission don't leak user identity** (e.g., "User X already responded" — should be generic "Already responded")
- [ ] **No timing side-channel on double-vote check** — response time for first submit vs duplicate should be similar (both do HMAC computation)
- [ ] **Redacted text is truly overwritten** — original text not in any column, not in audit log, not in deleted records
- [ ] **Frontend doesn't store survey responses in browser state** (no localStorage, no sessionStorage, no URL params with answers)
- [ ] **Active survey indicator doesn't leak response status to nearby observers** — the indicator changes state, but the change should be subtle (dot disappears, not a celebratory animation)

---

## Regression Testing

After all hardening work is complete:

```bash
turbo test          # Full test suite — all packages
turbo lint          # No lint errors
turbo type-check    # No type errors
```

Every existing test must still pass. The wellbeing module must not have broken any other module.

---

## Verification Checklist (Phase G Complete = V1 Ship-Ready)

- [ ] All 9 cross-tenant isolation tests pass
- [ ] All 19 impersonation block tests pass (every endpoint)
- [ ] All 6 anonymous submission integrity tests pass
- [ ] All 6 threshold enforcement end-to-end tests pass
- [ ] All 4 batch release tests pass
- [ ] All 13 audit log entries verified
- [ ] All 8 permission model tests pass
- [ ] Architecture documentation complete and accurate (4 files)
- [ ] Manual security audit checklist complete (9 items)
- [ ] `turbo test` passes (full suite, no regressions)
- [ ] `turbo lint` passes
- [ ] `turbo type-check` passes
- [ ] Module is production-ready
