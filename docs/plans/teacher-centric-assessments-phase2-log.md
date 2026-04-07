# Teacher-Centric Assessments — Phase 2 Implementation Log

**Date**: 2026-04-07
**Commit**: `b7edd708` on `main`
**Status**: Deployed to production, verified

---

## What Was Built

Phase 2 delivers the **assessment lifecycle state machine, unlock request flow, grade edit audit trail, and reopened assessment support**. This phase makes the new status transitions operational so assessments follow the full teacher-centric lifecycle.

---

## Assessment Lifecycle — New State Machine

```
draft → open → submitted_locked → [unlock_requested → reopened → final_locked]
```

### Valid Transitions (AssessmentsService.transitionStatus)

| From               | To                 | Triggered By                                    |
| ------------------ | ------------------ | ----------------------------------------------- |
| `draft`            | `open`             | Teacher opens for grade entry                   |
| `open`             | `submitted_locked` | Teacher final-submits grades                    |
| `submitted_locked` | `unlock_requested` | UnlockRequestService (auto on request creation) |
| `unlock_requested` | `reopened`         | UnlockRequestService (approval)                 |
| `unlock_requested` | `submitted_locked` | UnlockRequestService (rejection)                |
| `reopened`         | `final_locked`     | Teacher resubmits after amendment               |

**Terminal states**: `submitted_locked` (until unlock), `final_locked` (permanent)
**Legacy compat**: `closed → submitted_locked`, `locked → final_locked` still accepted in transition map

---

## UnlockRequestService (`unlock-request.service.ts`)

New service managing the full unlock request lifecycle.

### Methods

| Method                                             | Purpose                                                                                                                                            |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create(tenantId, assessmentId, userId, reason)`   | Teacher requests unlock. Validates assessment is locked. Creates request with `pending` status. Auto-transitions assessment to `unlock_requested`. |
| `findPending(tenantId, { page, pageSize })`        | Leadership view: paginated list of pending requests with assessment/requester details.                                                             |
| `findByAssessment(tenantId, assessmentId)`         | All unlock requests for a specific assessment with requester/reviewer names.                                                                       |
| `review(tenantId, requestId, reviewerUserId, dto)` | Approve/reject. Approved → assessment moves to `reopened`. Rejected → assessment returns to `submitted_locked`.                                    |

### Validation Rules

- Can only request unlock when assessment is `submitted_locked` or `final_locked`
- Cannot have multiple pending requests for same assessment
- Rejection requires a reason
- All writes in RLS transactions

---

## Grade Edit Audit Trail

When an assessment is in `reopened` status, `GradesService.bulkUpsert()` now:

1. Loads existing grade `id`, `raw_score`, and `comment` alongside entry metadata
2. After upserting grades, compares old vs new `raw_score` for each student
3. Creates `GradeEditAudit` entries for any scores that changed, capturing:
   - `old_raw_score` / `new_raw_score`
   - `old_comment` / `new_comment`
   - `edited_by_user_id`
   - `reason` ("Grade amended after assessment unlock")
4. All audit entries created within the same RLS transaction as the grade upserts

---

## Reopened Assessment Support

### Assessment Updates

`AssessmentsService.update()` now allows edits when status is `reopened` (in addition to `draft` and `open`).

### Grade Entry

`GradesService.bulkUpsert()` now allows grade entry when status is `reopened` (in addition to `draft` and `open`).

---

## New API Endpoints (4)

| Method | Path                                            | Permission                 |
| ------ | ----------------------------------------------- | -------------------------- |
| POST   | `/v1/gradebook/assessments/:id/unlock-request`  | `gradebook.request_unlock` |
| GET    | `/v1/gradebook/unlock-requests`                 | `gradebook.approve_unlock` |
| GET    | `/v1/gradebook/assessments/:id/unlock-requests` | `gradebook.view`           |
| POST   | `/v1/gradebook/unlock-requests/:id/review`      | `gradebook.approve_unlock` |

---

## New Zod Schemas

- `createUnlockRequestSchema` — `{ reason: string }` (1-1000 chars)
- `reviewUnlockRequestSchema` — `{ status: 'approved'|'rejected', rejection_reason?: string }` with cross-field validation

---

## Test Results

- **Type-check**: ✅ All packages pass
- **Gradebook tests**: ✅ 1,085 tests pass across 53 suites
- **API surface snapshot**: ✅ Updated (1,466 endpoints total, +4 new)
- **Assessment transition tests**: ✅ Updated for new state machine
- **Assessment update tests**: ✅ Added `reopened` allowed test

---

## Production Verification

| Check                          | Result                                    |
| ------------------------------ | ----------------------------------------- |
| API health                     | ✅ PostgreSQL UP, Redis UP                |
| PM2 services                   | ✅ API, Web, Worker all online and stable |
| Gradebook page (Playwright)    | ✅ No regression                          |
| Navigation intact (Playwright) | ✅ Grouped sub-strip working              |

---

## Files Changed (10 files, +448/-49 lines)

### New Files

- `apps/api/src/modules/gradebook/unlock-request.service.ts`

### Modified Files

- `apps/api/src/modules/gradebook/assessments/assessments.service.ts` — New state machine, reopened edit support
- `apps/api/src/modules/gradebook/assessments/assessments.service.spec.ts` — Tests updated for new transitions
- `apps/api/src/modules/gradebook/grades.service.ts` — Reopened support + audit trail
- `apps/api/src/modules/gradebook/gradebook.controller.ts` — 4 unlock request endpoints
- `apps/api/src/modules/gradebook/gradebook.controller.spec.ts` — UnlockRequestService mock
- `apps/api/src/modules/gradebook/gradebook.module.ts` — UnlockRequestService registered
- `apps/api/src/modules/gradebook/dto/gradebook.dto.ts` — Unlock request DTO types
- `packages/shared/src/schemas/gradebook.schema.ts` — Unlock request Zod schemas
- `api-surface.snapshot.json` — Updated

---

## What's Next (Phase 3)

Phase 3 will implement the **frontend dashboard and configuration pages**:

- Teacher assessments dashboard with class×subject allocation matrix
- Teacher-facing assessment categories, grading weights, rubric templates, curriculum standards pages
- Navigation restructure (Learning > Assessments L2 with L3 tabs)
- Role-aware rendering (teacher vs leadership views)
