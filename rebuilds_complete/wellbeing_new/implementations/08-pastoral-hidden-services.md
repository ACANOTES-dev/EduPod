# Implementation 08 — Pastoral Hidden Services (DSAR, Import, SST AI, Critical Plans, Check-in Flagged)

> **Wave:** 3 (parallel-safe — owns endpoints under `apps/api/src/modules/pastoral/`)
> **Classification:** backend + worker
> **Depends on:** 01, 04
> **Deploys:** API + worker restart

---

## Goal

Five pastoral capabilities exist in the backend but are not surfaced. This impl audits each, hardens shapes, gates AI features with `@RequiresAiFlag('pastoral')`, ensures all writes go through RLS-aware transactions, and adds the missing list/filter endpoints the Wave 6 UI (impl 22) consumes.

1. **Pastoral DSAR review** — per-concern / per-case include/redact/exclude decisions for compliance team
2. **CSV/Excel import** — bulk pastoral data ingestion with validate-then-confirm two-phase flow
3. **SST agenda AI pre-population** — auto-populate meeting agendas from open concerns and interventions
4. **Critical incident response plans** — structured response items + per-affected-person support log
5. **Wellbeing check-in flagged list** — escalation queue for student self-reported wellbeing flags

## Shared files this impl touches

- `apps/api/src/modules/pastoral/pastoral.module.ts` — register sub-controllers + processors. Edit late.
- `apps/worker/src/processors/pastoral/` — new processors. Yours.
- `apps/worker/src/processors/cron-scheduler.service.ts` — register new cron entries. Edit late.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **low.**

## What to build

### 1. Pastoral DSAR review

#### Endpoints (verify exist)

```
GET    /v1/pastoral/dsar-reviews                                  — list pending reviews
GET    /v1/pastoral/dsar-reviews/by-request/:complianceRequestId  — fetch all items for a compliance request
POST   /v1/pastoral/dsar-reviews/:id/decide                       — body: { decision: 'include'|'redact'|'exclude', justification }
GET    /v1/pastoral/dsar-reviews/stats                            — counts by status for dashboard
```

Permissions: `pastoral.dsar_review` (new permission — add via impl 01 if not present, OR add it here in a small follow-up; coordinate with the user).

DSAR review items are auto-generated when a Compliance module DSAR request is filed and references pastoral data. The review service inspects each concern/case in scope and creates a review item per record. Designated reviewers decide each item, and the compliance module exports the final dataset.

### 2. CSV/Excel pastoral import

#### Endpoints

```
GET    /v1/pastoral/import/template                — returns CSV template (headers only)
POST   /v1/pastoral/import/validate                — multipart upload; returns { valid_rows, invalid_rows: [{ row, errors }] }
POST   /v1/pastoral/import/confirm                 — accepts the validation_token from validate; ingests valid rows
```

Permissions: `pastoral.import` (new — same flow as DSAR permission).

Validate is stateless — never persists the file. Returns a `validation_token` (signed JWT, 5-minute TTL) that confirm step requires. Confirm re-validates server-side and persists.

CSV columns (initial set; tenants may extend per their own template): `student_id`, `concern_type`, `severity`, `narrative`, `occurred_on`, `reported_by_email`, `tier`, `assigned_to_email`.

### 3. SST agenda AI pre-population

#### Endpoint

```
POST   /v1/pastoral/sst/meetings/:id/agenda/refresh
```

Apply `@RequiresAiFlag('pastoral')` + `@RequiresPermission('pastoral.sst.manage')`.

Service:

1. Resolve meeting + all linked students (`SstMeetingAttendee` rows).
2. For each student, gather: open concerns (last 90 days), open interventions, recent incidents, attendance pattern, recent grades trend.
3. Call LLM with structured input → returns suggested agenda items (per student) + cross-cutting themes.
4. Enqueue `pastoral:precompute-agenda` job to write the agenda items to `sst_meeting_agenda_items` table.
5. Return the meeting with `agenda_refresh_started_at` set; the actual rows appear async.

Worker `pastoral:precompute-agenda.processor.ts` does the LLM call + DB write. Idempotent — clears prior AI-generated agenda items (`source = 'ai'`) and re-inserts.

### 4. Critical incident response plans

#### Endpoints

```
GET    /v1/pastoral/critical-incidents/:id/response-plan                          — get current plan
PATCH  /v1/pastoral/critical-incidents/:id/response-plan/items/:itemId            — update plan item
POST   /v1/pastoral/critical-incidents/:id/affected/:personId/support             — log support offered
GET    /v1/pastoral/critical-incidents/:id/affected/:personId/support             — list support log
```

Response plan = structured action items (template-driven by incident type — bereavement, accident, violence, etc.). On critical-incident creation, the service auto-instantiates a plan from a template (existing seed data; verify). Items have `title`, `assigned_to_user_id`, `due_at`, `status`, `notes`.

Support log = per-affected-person record of conversations, referrals, offered services. Append-only.

### 5. Wellbeing check-in flagged list

#### Endpoints

```
GET    /v1/pastoral/checkins/flagged              — list flagged check-ins awaiting escalation
POST   /v1/pastoral/checkins/:id/escalate         — converts to pastoral concern + assigns to designated staff
POST   /v1/pastoral/checkins/:id/dismiss          — marks as reviewed without escalation
```

Permissions: `pastoral.checkin.review`.

Filter logic in flagged: `flagged_at IS NOT NULL AND escalated_at IS NULL AND dismissed_at IS NULL`. Order by severity then by `flagged_at`.

When a student check-in is submitted with low mood scores (existing behaviour — verify), the existing `POST /pastoral/checkins` endpoint sets `flagged_at`. This impl adds the queue UI's read endpoint plus the two action endpoints.

## Tests

- DSAR: review item creation, decide flow, stats endpoint
- Import: template returns CSV with headers; validate returns errors per row; confirm only persists rows that re-validate
- SST agenda AI: refresh enqueues job; processor writes agenda items; idempotent on re-run
- Response plans: per-template instantiation; item update transitions; support log append-only
- Check-in flagged: escalate creates concern + clears flag; dismiss clears flag without concern

## Watch out for

- **DSAR permission gating** — DSAR data is the most sensitive in the system. Reviewer access must be tightly scoped (typically `school_owner`, `principal`, `data_protection_officer`). Don't let a generic teacher role gain access.
- **Import file size** — cap at 5MB / 5000 rows per validate call. Larger files require chunking; out of scope for this impl (flag as follow-up).
- **SST AI cost** — like impl 05, cache for 24h or until manually refreshed. Don't auto-refresh on every meeting view.
- **Critical incident templates** — verify the existing template seed is comprehensive. If only one template exists, leave a follow-up note for content expansion.
- **Check-in escalation auto-assignment** — to whom does it route? Resolve by the student's year-group designated pastoral lead; if unset, route to the school's safeguarding lead. Do not silently drop on the floor.

## Deployment notes

- Restart: API + worker.
- Smoke: NHQS — DSAR list returns empty; import template downloads; check-in flagged returns empty; SST meeting agenda refresh returns immediately with timestamp set, agenda items appear in DB within ~30s.
