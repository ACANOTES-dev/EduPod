# Phase C: Survey Results & Trust Layer

**Module:** Staff Wellbeing & Workload Intelligence
**Master Spec:** `Next_Feature/Staff_Wellbeing/staff-wellbeing-spec-v1-master.md`
**Identity:** The threshold enforcement system that makes aggregate data safe to show principals. These are the rules that make unions accept the system.
**Dependencies:** Phase B (survey engine — surveys must exist with responses)
**Blocks:** Phase F (admin frontend needs results endpoints)
**Parallel with:** Phase D (zero code overlap)

---

## Prerequisites

- Phase B complete and verified
- Read master spec Sections 3.1 (Anonymity Rules — all threshold rules), 3.3 (Free-Text Safety Rules — moderation queue, principal view options), 3.4 (Correlation Display Rules — not directly this phase, but context), 7 (API Endpoints — Survey Results section)
- Have test survey data: at least one closed survey with responses above and below threshold counts

---

## Deliverables

### C1. Survey Results Aggregation Service

**Service:** `apps/api/src/modules/staff-wellbeing/services/survey-results.service.ts`

Computes aggregate results per question for a closed survey. This service is the ONLY code path that reads from `survey_responses` for result display purposes.

**Aggregation by question type:**

| Question Type | Aggregation |
|---------------|-------------|
| `likert_5` | Mean score, median, distribution (count per value 1-5), response count |
| `single_choice` | Count per option, percentage per option, response count |
| `freeform` | Count of responses, list of approved/redacted texts (redacted shown as "[Response redacted by moderator]") |

**Trigger:** Results are computed when the survey is closed (B3 close action triggers `wellbeing:release-survey-results` job). Results are cached and served from cache thereafter.

### C2. Minimum Response Threshold Enforcement

**Rule (master spec 3.1):** If total response count for a survey < `min_response_threshold` (default 5, floor 3), ALL results are suppressed.

**Implementation:**
- Before returning any results, check: `total_unique_submissions >= survey.min_response_threshold`
- If below threshold: return `{ suppressed: true, reason: 'Not enough responses to maintain anonymity.', responseCount: N, threshold: T }`
- The response count IS returned (e.g., "3 of 35 staff responded") — this is the only per-survey statistic visible when suppressed
- No question-level data, no scores, no distributions, no comments

**Edge case:** A survey that was above threshold but later had responses removed (e.g., via freeform moderation that removes entire submissions — note: this doesn't actually happen in the current design since moderation only changes status, not deletes). Still, threshold check runs on every request, not just at close time.

### C3. Department Drill-Down Threshold

**Rule (master spec 3.1):** Department-level breakdown only shown when department has >= `dept_drill_down_threshold` (default 10, floor 8) members.

**Implementation:**
- When results include department filter/breakdown: check department staff count
- If department staff count < `dept_drill_down_threshold`: suppress that department's results
- Departments below threshold are completely hidden — not shown with "not enough data"
- Free-text responses are NEVER shown in department drill-down view (regardless of count)

**Small school behaviour:** If NO department in the school exceeds the threshold, the department drill-down section is hidden entirely from the UI (Phase F handles the UI; this phase ensures the API returns the correct metadata to enable that).

### C4. Cross-Filter Blocking

**Rule (master spec 3.1):** No combination of filters (department + time period + question) that reduces a result set below the anonymity threshold.

**Implementation:**
- Results endpoint accepts optional filters: `department`, `timePeriod`
- Before applying any filter, compute the resulting response count
- If the filtered count < `min_response_threshold`: return 403 with explanation
  ```json
  {
    "error": {
      "code": "FILTER_BELOW_THRESHOLD",
      "message": "This filter combination would reduce results below the anonymity threshold. Remove a filter to see results."
    }
  }
  ```
- This check runs BEFORE any aggregation — no partial data leaks

**Algorithm:**
1. Start with full result set count
2. Apply each requested filter
3. After each filter application, check count >= threshold
4. If any filter application drops below threshold, reject the entire query
5. This prevents iterative narrowing attacks (applying filters one at a time to isolate individuals)

### C5. Batch Release Enforcement

**Rule (master spec 3.1):** Survey results are released ONLY after the survey window closes. No real-time result viewing during an active survey.

**Implementation:**
- Results endpoint: `GET /api/v1/staff-wellbeing/surveys/:id/results`
- Permission: `wellbeing.view_survey_results`
- If survey `status = 'active'`: return 403 `{ error: { code: 'SURVEY_STILL_ACTIVE', message: 'Results are only available after the survey closes. This prevents timing inference.' } }`
- If survey `status = 'draft'`: return 404 (no results exist)
- If survey `status = 'closed'` or `'archived'`: return aggregated results (subject to threshold checks)
- The `results_released` flag on the survey is set by the close action (Phase B). This endpoint double-checks both status AND the flag.

**Why this matters:** If a principal could watch results arrive in real-time, they could correlate submission timing with who was in a meeting, who just left the staff room, etc. Batch release eliminates timing inference attacks entirely.

### C6. Moderation Queue Endpoints

#### List Pending Moderation
- `GET /api/v1/staff-wellbeing/surveys/:id/moderation`
- Permission: `wellbeing.moderate_surveys`
- Returns freeform responses with `moderation_status = 'pending'` or `'flagged'`
- Each response includes: response text, submitted_date (DATE only), moderation_status, flagged matches (if any from moderation scan)
- **NO user identifier** — the moderator sees text only
- Ordered by submitted_date (ascending — oldest first)

#### Moderate Response
- `PATCH /api/v1/staff-wellbeing/surveys/:id/moderation/:responseId`
- Permission: `wellbeing.moderate_surveys`
- Input: `{ status: 'approved' | 'flagged' | 'redacted', reason?: string }`
- `approved`: response will appear in results (Phase C1 aggregation)
- `flagged`: response stays in queue for further review
- `redacted`: response text replaced with "[Response redacted by moderator]" in results. Original text is overwritten in the database (not soft-deleted) — once redacted, the original text is gone
- Moderation action is audit-logged: user_id, timestamp, response_id, action, reason

### C7. Moderated Comments Endpoint

- `GET /api/v1/staff-wellbeing/surveys/:id/results/comments`
- Permission: `wellbeing.view_survey_results`
- Returns freeform responses with `moderation_status = 'approved'` or `'redacted'`
- Subject to same threshold enforcement as C2 (if total response count < threshold, no comments returned)
- Redacted responses shown as "[Response redacted by moderator]"
- `pending` and `flagged` responses are NOT included
- This is the endpoint the principal uses — it is NOT the default view (Phase F UI shows themed summaries by default, with an explicit "view raw comments" action that triggers this endpoint + audit log)

---

## Unit Tests

| Test | Assertion |
|------|-----------|
| Aggregate likert_5 results | Correct mean, median, distribution for known data |
| Aggregate single_choice results | Correct counts and percentages |
| Aggregate freeform results | Only approved + redacted texts returned |
| Threshold suppression (below) | Results suppressed, response count still visible |
| Threshold suppression (at threshold) | Results visible |
| Threshold suppression (above) | Results visible |
| Department drill-down (below dept threshold) | Department suppressed entirely |
| Department drill-down (above dept threshold) | Department results visible |
| Department drill-down (no departments above) | Entire section metadata indicates hidden |
| Cross-filter blocking (filter drops below) | 403 FILTER_BELOW_THRESHOLD |
| Cross-filter blocking (filter stays above) | Results returned normally |
| Cross-filter blocking (multiple filters) | Each filter checked, reject if any drops below |
| Batch release (survey active) | 403 SURVEY_STILL_ACTIVE |
| Batch release (survey draft) | 404 |
| Batch release (survey closed) | Results returned |
| Moderation list | Only pending/flagged responses returned |
| Moderate: approve | Status changes, appears in results |
| Moderate: redact | Original text overwritten, "[Response redacted]" in results |
| Moderate: flag | Status changes, stays in queue |
| Comments endpoint | Only approved + redacted, threshold-enforced |
| Comments endpoint (below threshold) | Suppressed |
| Freeform in dept drill-down | Never shown regardless of count |

## Integration Tests

| Test | Assertion |
|------|-----------|
| **Threshold transition** | Create survey, add 3 responses → verify suppressed → add 2 more → verify visible |
| **Batch release end-to-end** | Submit responses during active window → GET results → verify 403 → close survey → GET results → verify 200 with data |
| **Moderation flow** | Submit freeform → verify pending in moderation queue → approve → verify appears in comments → submit another → redact → verify "[Response redacted]" in comments |
| **Cross-filter attack** | Create survey with responses from 2 departments → apply department filter that isolates 2 responses → verify 403 |
| **Department drill-down** | Create survey with responses, department has 5 members → verify department hidden → grow department to 12 → verify department visible |

---

## Verification Checklist

- [ ] Results aggregation computes correct values for all question types
- [ ] Min response threshold suppresses results when count < threshold
- [ ] Department drill-down threshold hides departments below threshold
- [ ] Cross-filter blocking returns 403 when filter combination drops below threshold
- [ ] Batch release returns 403 during active survey, 200 after close
- [ ] Moderation queue shows pending/flagged responses (no user identifiers)
- [ ] Moderate action changes status and is audit-logged
- [ ] Redaction overwrites original text permanently
- [ ] Comments endpoint returns only approved/redacted, threshold-enforced
- [ ] Freeform responses never appear in department drill-down
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] `turbo lint` passes
- [ ] `turbo type-check` passes
