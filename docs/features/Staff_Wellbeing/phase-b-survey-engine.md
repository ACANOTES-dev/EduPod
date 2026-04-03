# Phase B: Anonymous Survey Engine

**Module:** Staff Wellbeing & Workload Intelligence
**Master Spec:** `Next_Feature/Staff_Wellbeing/staff-wellbeing-spec-v1-master.md`
**Identity:** The privacy-critical core. This is the piece a union representative would audit.
**Dependencies:** Phase A (foundation, tables, module skeleton, HMAC infrastructure)
**Blocks:** Phase C (survey results), Phase E (staff frontend)
**Parallel with:** Phase D (zero code overlap)

---

## Prerequisites

- Phase A complete and verified
- Read master spec Sections 3.1 (Anonymity Rules), 3.3 (Free-Text Safety Rules), 6.1 (survey tables), 7 (API Endpoints — Survey + Submission), 7.1 (Double-Vote Prevention), 9.1-9.2 (Worker Jobs + Moderation Scan Scope)
- Read `architecture/danger-zones.md` (updated in Phase A — survey_responses exception)
- Verify `survey_responses` table exists with NO tenant_id, NO user_id

---

## Deliverables

### B1. Survey CRUD Service + Controller

**Service:** `apps/api/src/modules/staff-wellbeing/services/survey.service.ts`
**Controller:** `apps/api/src/modules/staff-wellbeing/controllers/survey.controller.ts`

#### Create Survey

- `POST /api/v1/staff-wellbeing/surveys`
- Permission: `wellbeing.manage_surveys`
- Input: title, description, frequency, window_opens_at, window_closes_at, questions array, optional threshold overrides
- Validation: window_closes_at > window_opens_at, question_type valid, options required for single_choice, thresholds respect floors (min >= 3, dept >= 8)
- Creates `staff_surveys` record + `survey_questions` records in a single transaction
- Sets `status = 'draft'`, `results_released = false`
- Sets `created_by` to current user

#### List Surveys

- `GET /api/v1/staff-wellbeing/surveys`
- Permission: `wellbeing.manage_surveys`
- Returns all surveys for tenant with status, response count (if closed), window dates
- Paginated (standard offset pagination)
- Sortable by created_at, status, window_opens_at

#### Get Survey Detail

- `GET /api/v1/staff-wellbeing/surveys/:id`
- Permission: `wellbeing.manage_surveys`
- Returns survey with questions
- When status is `active`: include `response_count` and `eligible_staff_count` (count of staff profiles for this tenant)
- When status is `closed`/`archived`: include `response_count` and `response_rate`

#### Update Draft Survey

- `PATCH /api/v1/staff-wellbeing/surveys/:id`
- Permission: `wellbeing.manage_surveys`
- Only allowed when `status = 'draft'` — return 409 otherwise
- Can update: title, description, frequency, window dates, questions (full replace), thresholds
- Questions are replaced entirely (delete existing + insert new) — no partial question updates

### B2. Clone-as-Draft

- `POST /api/v1/staff-wellbeing/surveys/:id/clone`
- Permission: `wellbeing.manage_surveys`
- Source survey can be in any status (including closed/archived — this is the reuse mechanism)
- Creates new `staff_surveys` record with:
  - `status = 'draft'`
  - `created_by = current user`
  - `window_opens_at` and `window_closes_at` blank/null (must be set before activation)
  - `results_released = false`
  - All threshold settings copied from source
- Copies all `survey_questions` from source survey into new survey
- No separate template table needed

### B3. Survey Lifecycle Management

#### Activate Survey

- `POST /api/v1/staff-wellbeing/surveys/:id/activate`
- Permission: `wellbeing.manage_surveys`
- **Single-active enforcement:** Query for any other survey in this tenant with `status = 'active'`. If found, return 409 Conflict: `{ error: { code: 'SURVEY_ALREADY_ACTIVE', message: 'Only one survey may be active at a time. Close the current survey before activating a new one.' } }`
- Validation: status must be `draft`, window dates must be set, at least 1 question required
- Sets `status = 'active'`
- Triggers `wellbeing:survey-open-notify` job (B7)

#### Close Survey

- `POST /api/v1/staff-wellbeing/surveys/:id/close`
- Permission: `wellbeing.manage_surveys`
- Validation: status must be `active`
- Sets `status = 'closed'`
- Triggers `wellbeing:release-survey-results` job — computes and caches aggregates, sets `results_released = true`
- After this point, results endpoints become accessible (Phase C)

### B4. Anonymous Response Submission

- `POST /api/v1/staff-wellbeing/respond/:surveyId`
- Permission: Any authenticated staff member at this tenant
- **Authentication is required** (to verify staff membership + prevent duplicate) but **response is stored anonymously**

**Submission flow (master spec Section 7.1):**

1. Verify survey exists and `status = 'active'`
2. Verify current time is within `window_opens_at` to `window_closes_at`
3. Verify user is a staff member at this tenant (has a `staff_profile` for this tenant)
4. **Double-vote check:**
   a. Retrieve per-tenant HMAC secret via `getOrCreateHmacSecret(tenantId)`
   b. Compute `token = HMAC-SHA256(survey_id + user_id, tenant_hmac_secret)`
   c. Compute `token_hash = SHA256(token)`
   d. Check if `(survey_id, token_hash)` exists in `survey_participation_tokens`
   e. If exists → return 409: `{ error: { code: 'ALREADY_RESPONDED', message: 'You have already submitted a response to this survey.' } }`
5. **Write participation token:** Insert `(survey_id, token_hash, today's DATE)` into `survey_participation_tokens`
6. **Write responses:** For each answer in the submission:
   - Insert into `survey_responses` with `survey_id`, `question_id`, `answer_value` or `answer_text`, `submitted_date = today's DATE`
   - For Likert/single_choice: set `moderation_status = 'approved'` (auto-approved)
   - For freeform: set `moderation_status = 'pending'` (if moderation enabled for this survey) or `'approved'` (if disabled)
   - **NO user_id, NO staff_profile_id, NO timestamp more granular than date**
7. If freeform responses exist and moderation is enabled, enqueue `wellbeing:moderation-scan` job for each freeform response (B6)
8. Return 201 with `{ submitted: true }` — no response IDs returned

**Critical implementation notes:**

- Steps 5 and 6 MUST be in the same database transaction
- The token insert and response writes are atomic — if either fails, both roll back
- The HMAC secret is decrypted in-memory only, never logged
- No join path exists from response to user after this endpoint returns

### B5. Active Survey for Staff

- `GET /api/v1/staff-wellbeing/respond/active`
- Permission: Any authenticated staff member
- Returns the current active survey (if any) for this tenant with questions
- Returns `null` / 204 if no active survey
- Also returns whether the current user has already responded (via HMAC token check — same computation as B4 step 4, returns boolean `hasResponded` without exposing the token)

### B6. Moderation Scan Worker Job

**Job:** `wellbeing:moderation-scan`
**Queue:** `wellbeing`
**Trigger:** On freeform response submission (B4 step 7)
**Payload:** `{ tenantId, surveyId, responseId }` — note: tenantId derived from survey, not from response

**Scan scope (master spec Section 9.2):**

| Data Source      | Match Strategy                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff names      | Match against `staff_profiles` for this tenant — first name, last name, full name, case-insensitive. Handle Irish names: O'Brien, Mac Giolla, Ni Bhriain, etc. |
| Room identifiers | Match against `rooms` table — room name, room code                                                                                                             |
| Subject names    | Match against `subjects` table — subject name, subject code                                                                                                    |

**What is NOT scanned (moderator handles manually):**

- Nicknames, shortened names, initials
- Indirect identification ("the 6th year maths teacher")
- Specific dates or incident references
- Cultural references specific to the school

**Behaviour:**

- Scans `answer_text` against all three data sources
- If matches found: update `moderation_status` to `'flagged'`, store match details in a separate field or metadata (for moderator review)
- If no matches found: leave as `'pending'` (moderator still reviews if moderation enabled) or set to `'approved'` (if moderation disabled)
- The scan **flags** but does **not auto-redact** — the moderator decides

**Tenant isolation:** The job receives `tenantId` and sets RLS context before querying staff_profiles, rooms, subjects. The response is accessed via survey join (standard pattern for survey_responses).

### B7. Survey Notification Jobs

#### Survey Open Notification

**Job:** `wellbeing:survey-open-notify`
**Trigger:** On survey activation (B3)
**Payload:** `{ tenantId, surveyId }`
**Behaviour:** Send in-app notification to all staff at this tenant: "A new staff wellbeing survey is available." Uses existing `CommunicationsModule` notification infrastructure. Notification links to `/wellbeing/survey`.

#### Survey Closing Reminder

**Job:** `wellbeing:survey-closing-reminder`
**Trigger:** Daily cron 08:00 UTC
**Payload:** none (processes all tenants)
**Behaviour:** For each tenant with an active survey where `window_closes_at` is within the next 24 hours: send in-app reminder to all staff: "The current wellbeing survey closes tomorrow." Uses existing notification infrastructure.

### B8. Participation Token Cleanup Job

**Job:** `wellbeing:cleanup-participation-tokens`
**Trigger:** Daily cron 05:00 UTC
**Payload:** none (processes all tenants)
**Behaviour:**

- Find all surveys with `status = 'closed'` where `window_closes_at` < now() - 7 days
- Delete all `survey_participation_tokens` rows for those surveys
- After deletion, even the server cannot determine who participated — anonymity becomes architectural, not just computational

### B9. EAP Resource Endpoint + Refresh Check

#### Resource Endpoint

- `GET /api/v1/staff-wellbeing/resources`
- Permission: Any authenticated staff member
- Returns EAP info + external resources from `tenant_settings.staff_wellbeing` JSONB
- Simple read, no computation

#### EAP Refresh Check

**Job:** `wellbeing:eap-refresh-check`
**Trigger:** Daily cron 06:00 UTC
**Payload:** none (processes all tenants)
**Behaviour:** For each tenant with `staff_wellbeing` enabled: check if `eap_last_verified_date` is >90 days ago or null. If so, send in-app notification to users with `wellbeing.manage_resources` permission: "It's been a while — please verify your EAP provider details are current."

---

## Unit Tests

| Test                                             | Assertion                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| Create survey with valid data                    | Survey + questions created, status = draft                             |
| Create survey with invalid thresholds            | Rejected: min < 3 or dept < 8                                          |
| Create survey with invalid window                | Rejected: closes_at <= opens_at                                        |
| Update draft survey                              | Questions replaced entirely                                            |
| Update non-draft survey                          | 409 returned                                                           |
| Clone survey                                     | New draft with same questions, blank dates, current user as created_by |
| Activate survey (no other active)                | Status changes to active                                               |
| Activate survey (another active exists)          | 409 SURVEY_ALREADY_ACTIVE                                              |
| Activate survey without questions                | Rejected                                                               |
| Close active survey                              | Status changes to closed, results_released eventually true             |
| Close non-active survey                          | 409 returned                                                           |
| HMAC token computation                           | Deterministic: same inputs produce same hash                           |
| HMAC token computation (different tenant)        | Different tenant secret produces different hash                        |
| Submit response (first time)                     | Token created, responses stored, no user_id in response rows           |
| Submit response (duplicate)                      | 409 ALREADY_RESPONDED                                                  |
| Submit response (survey not active)              | 404 or 409                                                             |
| Submit response (outside window)                 | 403                                                                    |
| Moderation scan (staff name in text)             | Response flagged                                                       |
| Moderation scan (room code in text)              | Response flagged                                                       |
| Moderation scan (no matches)                     | Response not flagged                                                   |
| Token cleanup (survey closed >7 days)            | Tokens deleted                                                         |
| Token cleanup (survey closed <7 days)            | Tokens retained                                                        |
| EAP refresh (>90 days)                           | Notification triggered                                                 |
| EAP refresh (<90 days)                           | No notification                                                        |
| Single active enforcement across create+activate | Second activation rejected even if first was created later             |

## Integration Tests

| Test                                  | Assertion                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Anonymous submission flow**         | Submit response → query `survey_responses` directly → verify NO user identifier columns exist on the row                     |
| **Cross-tenant isolation**            | Create survey as Tenant A → submit response → auth as Tenant B → verify response NOT accessible via survey results endpoints |
| **Double-vote prevention end-to-end** | Submit once → submit again with same user → verify 409 → submit with different user → verify success                         |
| **Single-active enforcement**         | Activate survey A → create survey B → activate B → verify 409                                                                |
| **Clone end-to-end**                  | Create survey with 5 questions → close it → clone → verify new draft has 5 questions, blank dates                            |
| **Token cleanup end-to-end**          | Submit response → close survey → advance clock 8 days → run cleanup → verify tokens deleted → verify responses still exist   |
| **Notification dispatch**             | Activate survey → verify notification job enqueued for all staff                                                             |

---

## Verification Checklist

- [ ] Survey CRUD works (create, list, detail, update, clone)
- [ ] Single-active enforcement rejects second activation with 409
- [ ] Anonymous submission stores NO user identifier
- [ ] HMAC double-vote prevention works (same user rejected, different user accepted)
- [ ] Moderation scan flags staff names, room codes, subject names
- [ ] Token cleanup deletes tokens for surveys closed >7 days
- [ ] Survey notifications dispatch on activation and before close
- [ ] EAP resource endpoint returns tenant settings
- [ ] EAP refresh check fires after 90 days
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] `turbo lint` passes
- [ ] `turbo type-check` passes
- [ ] `architecture/event-job-catalog.md` updated with all jobs from this phase
