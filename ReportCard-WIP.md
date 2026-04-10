# Report Cards — Iteration WIP

**Status:** in progress
**Last updated:** 2026-04-10
**Owner of this doc:** whoever is currently driving the Report Cards iteration
**Source branch:** `main` (local, ahead of origin by many commits that deliberately bypass CI — see _Deployment_ section)

This document is a **self-contained handoff**. Any session (human or AI) should be able to pick this up cold, catch up on the background, see what's been done, and execute the remaining phases without needing to re-interrogate the codebase or the user. Treat the **Implementation log** at the bottom as the single source of truth for "what's done vs. what's next" — update it as you go.

---

## 1. Purpose

The Report Cards feature is in its first real QA/iteration cycle after the initial 12-impl build-out. The user (school owner / principal role) walked through the current admin surfaces and flagged **structural, cosmetic, and behavioural issues**. Two additional bugs were found during a Playwright scan. Separately, the user asked for a **substantial redesign** of how the Report Cards surfaces are organised (collapse 5+ tabs into one dashboard, move Report Cards under the Learning hub as its own sub-strip group, route teacher requests into the admin "Needs Your Attention" card).

Everything below is **scoped to the admin view** — `school_owner`, `school_principal`, `school_vice_principal`, `admin`. A separate pass for the `teacher` role will follow **after** the admin pass is shipped and verified.

---

## 2. Context for the incoming session

### 2.1 Test account (production)

- Login page: `https://edupod.app/en/login`
- School Owner: `owner@nhqs.test` / `Password123!` (display name: Yusuf Rahman)
- Staff/Teacher: `Sarah.daly@nhqs.test` / `Password123!`
- Tenant: Nurul Huda School (class 2A has the richest sample data — 25 students, all subjects, both S1 and S2 snapshots)

### 2.2 What you need to know about the codebase

- Turborepo monorepo: `apps/web` (Next.js 14 App Router), `apps/api` (NestJS modular monolith), `apps/worker` (BullMQ), `packages/shared` (Zod schemas + types), `packages/prisma` (schema + migrations).
- **Envelope interceptor is the #1 source of frontend bugs in this feature.** `apps/api/src/common/interceptors/response-transform.interceptor.ts` wraps any non-paginated response in `{ data: T }`. If the response already has a top-level `data` field (paginated lists with `data + meta`), it's passed through untouched. Every `apiClient<T>` call on the frontend must account for this — if you type it as the inner shape and the backend returns a wrapped shape, you get `undefined.whatever` at runtime and a "Something went wrong" screen. **When in doubt, type the frontend call as `apiClient<{ data: T }>` and read `res.data`.**
- **RLS is enforced at the DB layer.** Every tenant-scoped service call goes through `createRlsClient().$transaction()` for writes. Reads use direct `this.prisma.model.findX({ where: { tenant_id } })`. Never `$executeRawUnsafe` outside the RLS middleware.
- **Frontend source of truth is `docs/plans/ux-redesign-final-spec.md`** — morph shell, sub-strip navigation, token-driven theming, logical CSS properties (`ms-`/`me-` never `ml-`/`mr-`), Figtree + JetBrains Mono fonts.
- **No pushing to `origin/main`.** The user is deliberately keeping the CI test gate clear for nightly runs. Deployment goes direct to the server via git bundle + `scripts/deploy-production.sh`. See _Deployment_ section.

### 2.3 Key files you will touch

**Frontend — report cards surfaces:**

- `apps/web/src/app/[locale]/(school)/report-cards/page.tsx` — consolidated dashboard (rebuilt in Phase 2)
- `apps/web/src/app/[locale]/(school)/report-cards/_components/dashboard-panels.tsx` — extracted QuickActionTile / LiveRunStatusPanel / AnalyticsSnapshotPanel
- `apps/web/src/app/[locale]/(school)/report-cards/[classId]/page.tsx` — class matrix (subject grades per student)
- `apps/web/src/app/[locale]/(school)/report-cards/generate/page.tsx` — 6-step generation wizard
- `apps/web/src/app/[locale]/(school)/report-cards/generate/_components/wizard/step-1-scope.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/generate/_components/wizard/step-2-period.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/generate/_components/wizard/step-5-comment-gate.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/settings/page.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/requests/page.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/requests/new/page.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/requests/[id]/page.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/library/page.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/analytics/page.tsx`
- ~~`apps/web/src/app/[locale]/(school)/report-cards/approvals/page.tsx`~~ — **deleted in Phase 2**
- ~~`apps/web/src/app/[locale]/(school)/report-cards/bulk/page.tsx`~~ — **deleted in Phase 2**
- `apps/web/src/app/[locale]/(school)/report-comments/page.tsx` — landing
- `apps/web/src/app/[locale]/(school)/report-comments/overall/[classId]/page.tsx` — overall comment editor

**Frontend — infrastructure:**

- `apps/web/src/lib/nav-config.ts` — morph shell nav + sub-strip groups. Phase 2 adds a new top-level Report Cards group under `hubGroupedSubStripConfigs.learning`.
- `apps/web/src/app/[locale]/(school)/dashboard/page.tsx` — admin home, where teacher requests get routed into `PriorityFeed`
- `apps/web/src/app/[locale]/(school)/dashboard/_components/admin-home.tsx` — `PriorityData` type lives here (line 29)
- `apps/web/src/app/[locale]/(school)/dashboard/_components/priority-feed.tsx` — "Needs Your Attention" card renderer
- `apps/web/messages/en.json` + `apps/web/messages/ar.json` — i18n strings (bilingual, both must be kept in sync)

**Backend — report cards module:**

- `apps/api/src/modules/gradebook/report-cards/report-cards-queries.service.ts` — class matrix builder, library queries (this is where Bug #1 root cause lives, already fixed in `buildMatrixCells` — see Implementation log)
- `apps/api/src/modules/gradebook/report-cards/report-cards.controller.ts` — matrix + library endpoints
- `apps/api/src/modules/gradebook/report-cards/report-card-generation.service.ts` — the generation run orchestrator (heavy touch in Phase 1b)
- `apps/api/src/modules/gradebook/report-cards/report-card-transcript.service.ts` — PDF rendering data assembly (heavy touch in Phase 1b)
- `apps/api/src/modules/gradebook/report-cards/report-card-teacher-requests.controller.ts` — Already exposes `GET /v1/report-card-teacher-requests/pending` — Phase 2 priority card calls this
- `apps/api/src/modules/gradebook/report-cards/report-card-teacher-requests.service.ts`
- `apps/api/src/modules/gradebook/report-cards/report-comment-windows.service.ts`
- `apps/api/src/modules/gradebook/report-cards/report-card-overall-comments.service.ts`
- `apps/api/src/modules/gradebook/report-cards/report-card-subject-comments.service.ts`
- `apps/api/src/modules/gradebook/report-cards/report-card-analytics.service.ts`

**Backend — related gradebook infra:**

- `apps/api/src/modules/gradebook/grading/period-grade-computation.service.ts` — `computeYearOverview` at line 569 is the authoritative full-year aggregation path (used by Phase 1b)
- `apps/api/src/modules/classes/classes.controller.ts` — pageSize cap raised to 500 in a previous session for the wizard's class list (don't regress this)

**Shared schemas:**

- `packages/shared/src/report-cards/generation.schema.ts` — `startGenerationRunSchema`, `dryRunGenerationCommentGateSchema` (heavy touch in Phase 1b to accept nullable period)
- `packages/shared/src/report-cards/comment-window.schema.ts`
- `packages/shared/src/report-cards/overall-comment.schema.ts`
- `packages/shared/src/report-cards/subject-comment.schema.ts`
- `packages/shared/src/report-cards/teacher-request.schema.ts`
- `packages/shared/src/report-cards/matrix-library.schema.ts`

**Prisma:**

- `packages/prisma/schema.prisma` — the schema. Report card models live roughly at lines 3372–4200. Phase 1b migration makes `academic_period_id` nullable on 8+ report-card-related tables and adds `academic_year_id` NOT NULL columns with backfill.
- `packages/prisma/rls/policies.sql` or `packages/prisma/migrations/**/post_migrate.sql` — RLS policy boilerplate (unchanged in Phase 1b, period nullability doesn't touch RLS)

---

## 3. Bug inventory (with reproduction evidence + root causes)

All 9 bugs were reproduced on production via Playwright as Yusuf Rahman (School Owner). Evidence captured in session.

### Bug #1 — Class matrix: Grade toggle shows percentages instead of letters for some cells

**Reproduction:** `/en/report-cards` → click 2A → All Periods + Grade toggle.
Examples seen in the UI:

- `Dylan Brennan → Economics = 70.5%`
- `Theo Collins → Chemistry = 80.3%`
- `Sarah Doyle → Chemistry = 59.8%`
- `Aiden Healy → Economics = 59.2%`, `English = 59.6%`
- `Charlotte Hill → Biology = 80.4%`
- `Jessica McLoughlin → Geography = 59.8%`
- `Jake ONeill → English = 70.8%`

In Score mode the same Economics cell shows `69.8%` — so the Grade-mode string is **not** a fallback to `cell.score` on the frontend. The backend is actively returning a percentage string in the `grade` field for some cells.

**Root cause (confirmed):** `apps/api/src/modules/gradebook/report-cards/report-cards-queries.service.ts`, `buildMatrixCells` method (lines ~896 onwards). Original code:

```ts
let displayValue: string | null = null;
for (const [periodId, row] of periodMap) {
  ...
  displayValue = row.display; // "keep the most recent display token"
}
...
cells[studentId]![subjectId] = {
  score,
  grade: displayValue,  // ← the raw last-period display token, unrelated to aggregated score
  ...
};
```

`display_value` comes straight from `PeriodGradeSnapshot.display_value`, which is a pre-formatted string written when the snapshot was computed. For some subjects/scales it's a letter (`"B"`), for others it's a percentage (`"70.5%"`). The aggregated weighted-average cell was echoing whatever token the last period happened to have, regardless of what the aggregated score actually maps to.

**Fix (already applied this session):** build `subjectScaleMap: Map<subjectId, GradingScaleConfig>` from `classSubjects[*].grading_scale.config_json`, pass it into `buildMatrixCells`, and derive the cell grade from the aggregated score:

```ts
const subjectScale = subjectScaleMap.get(subjectId) ?? null;
const grade =
  score !== null && subjectScale !== null ? this.applyGradingScale(score, subjectScale) : null;
```

This is the same pattern the overall-grade code path already used on lines 506/527. **Test coverage to add:** a unit test in `report-cards-queries.service.spec.ts` that proves the grade is derived from the aggregated score, not from any individual period's stored display token.

---

### Bug #2 — Class matrix: 218px trailing whitespace after the Overall column

**Reproduction:** Same page. Measured via `document.querySelector('table').offsetWidth` vs parent wrapper width: table is 1060px, outer bordered wrapper is 1280px → 218px empty space inside the border, to the right of the Overall column.

**Root cause:** `apps/web/src/app/[locale]/(school)/report-cards/[classId]/page.tsx:266`:

```tsx
<table className="border-collapse" style={{ tableLayout: 'fixed' }}>
```

Columns are `180 + 7×110 + 110 = 1060px`. `table-layout: fixed` with no explicit table width makes the table shrink to its column sum; the wrapper is full-width; the gap appears inside the border.

**Fix (not yet applied):** easiest is to wrap the scroll container in a `w-fit` shell or give the table `className="w-max"`. Alternative: give the table `w-full` and change columns to proportional widths — but proportional widths lose the sticky-column look. Go with `w-max` or wrapper `w-fit`.

---

### Bug #3 — Generate wizard: Scope summary says "1 student selected" when a class was selected ✅ FIXED

**Reproduction:** Wizard Step 1 → Class → click 2A → counter says `1 student selected`. Click 3A too → says `2 students selected`. Should say `N classes selected`.

**Root cause:** `apps/web/src/app/[locale]/(school)/report-cards/generate/_components/wizard/step-1-scope.tsx:335` always called `t('studentsSelected', { count })` regardless of `state.scope.mode`.

**Fix (applied):** branch on `scope.mode`, added new translation keys `classesSelected` and `yearGroupsSelected` in both `en.json` and `ar.json`.

---

### Bug #4 — Generate wizard: No "All periods" option in Step 2 ⚠️ STOPGAP IN PLACE → Phase 1b does the real fix

**Reproduction:** Wizard Step 2 only shows `S1 2025-2026` and `S2 2025-2026`. No way to pick a full-year report.

**Current state:** A disabled "All periods" card with a "Coming soon" badge is in `step-2-period.tsx` as a visible placeholder. **This is a stopgap.** The user confirmed the real implementation should happen via **Option B** (Phase 1b — see section 5).

The user's exact words after pushing back on the stopgap:

> "Wait our gradebook already has 'all period' grade information/grades"
> "let's do this right and go with option B"

---

### Bug #5 — Generate wizard Step 5 crashes page ✅ FIXED

**Reproduction:** Wizard Class → 2A → S1 → Grades Only → Full name → Next → `Something went wrong`. Console:

```
TypeError: Cannot read properties of undefined (reading 'en')
  at report-cards/generate/page-d787377f5f81ebc3.js:1:20488
```

**Root cause:** Envelope mismatch in `apps/web/src/app/[locale]/(school)/report-cards/generate/_components/wizard/step-5-comment-gate.tsx:36`. Called as `apiClient<CommentGateDryRunResult>`, backend returns `{ data: CommentGateDryRunResult }`. Line 100–101 reads `result.languages_preview.en/.ar`, which was `undefined.en`.

**Fix (applied):** wrap type in `{ data: ... }`, dispatch `result: res.data`.

---

### Bug #6 — Report Comments → 2A Overall crashes ✅ FIXED

**Reproduction:** `/en/report-comments` → click 2A card → `Something went wrong`. Console:

```
[OverallCommentEditor] TypeError: Cannot read properties of undefined (reading 'map')
TypeError: Cannot read properties of undefined (reading 'name')
```

**Root cause:** Multiple envelope mismatches in `apps/web/src/app/[locale]/(school)/report-comments/overall/[classId]/page.tsx`:

- Active window fetch (line 119)
- Matrix fetch (line 144)
- Save comment POST (line 209)
- Finalise PATCH (line 245)
- Unfinalise PATCH (line 260)

**Fix (applied):** every single-object `apiClient<T>` call wrapped in `{ data: T }` and results read via `res.data`. Paginated list call (`OverallCommentListResponse` with `{ data, meta }`) left untouched — the interceptor passes that through.

---

### Bug #7 — Admin sees "New request" and "My requests" on /report-cards/requests

**Reproduction:** `/en/report-cards/requests` as Yusuf Rahman shows both a `New request` button and a `My requests` tab. These should be teacher-only.

**Root cause:** `apps/web/src/app/[locale]/(school)/report-cards/requests/page.tsx` — role gating missing. `canManage` is true for admin roles; both elements must be hidden when `canManage === true`.

**Fix (not yet applied):** wrap the button and the tab in `{!canManage && (...)}` or equivalent. Admins see `Pending review` + `All` tabs + approve/reject affordances only.

---

### Bug #8 — /en/report-cards/approvals 404s on data fetch

**Reproduction:** Page loads empty state. Console:

```
GET /api/v1/report-card-approvals?page=1&pageSize=20&status=pending → 404
[ReportCardsApprovalsPage] { error: ... }
```

**Root cause:** The approvals page calls a ghost endpoint `/api/v1/report-card-approvals` that doesn't exist. The real approval flow lives inside `/api/v1/report-card-teacher-requests`.

**Fix (not yet applied):** **retire the approvals route entirely in Phase 2.** For Phase 1a, the minimum is to either delete the page or stop the 404 noise by redirecting `/report-cards/approvals` → `/report-cards/requests`. Recommendation: add a tiny server-side redirect so any bookmarks keep working.

---

### Bug #9 — /en/report-cards/analytics 400s on load

**Reproduction:** Console:

```
GET /api/v1/report-cards/analytics? → 400
[ReportCardsAnalyticsPage] { error: ... }
```

The request URL has an empty query string. The backend Zod schema requires at least one param (likely `academic_period_id`).

**Root cause:** `apps/web/src/app/[locale]/(school)/report-cards/analytics/page.tsx` fires the fetch before any period is resolved.

**Fix (not yet applied):** guard the fetch until `academic_period_id` is set; default to the first loaded period or to `'all'` if the backend supports it. Verify the backend Zod contract first before picking the default.

---

### Additional context (not bugs, but noted during scan)

- ~~`/en/report-cards/bulk` — a 4-step "Generate → Review → Approve → Notify" page exists as an orphan route (no sub-strip link). Duplicates the wizard. Retire in Phase 2.~~ **Deleted in Phase 2 (commit `a8b31af4`).**
- Class matrix page **already supports "All periods"** as the default (combobox shows `All periods`). So "All periods" is a wizard-only missing feature, not a matrix-page missing feature.

---

## 4. Design decisions (user-approved)

### 4.1 Consolidate 5+ Report Cards surfaces into one admin dashboard

**Problem:** When an admin clicks "Report Cards" under Learning, the sub-strip expands into 8 child tabs (Dashboard, Gradebook, Report Cards, Generate, Settings, Requests, Report Comments, Analytics). That's clutter the user explicitly rejected.

**Decision:** `/report-cards` becomes **one dashboard**. All sub-features are reachable from tiles/cards on that dashboard. Sub-pages still exist as dedicated routes (the generation wizard, settings, requests, etc.) but are no longer tabs in the sub-strip. Every sub-page gets a **Back to Report Cards** button in its header.

**Dashboard layout:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  Report Cards                                          [⚙ Settings] │
│  <active period name> · <school name>                              │
├─────────────────────────────────────────────────────────────────────┤
│  QUICK ACTIONS (4 primary tiles)                                    │
│  ▶ Generate new run · 💬 Write comments · 📚 Library · 📥 Requests │
├─────────────────────────────────────────────────────────────────────┤
│  LIVE RUN STATUS            │    ANALYTICS SNAPSHOT                 │
│  (only if a run is active,  │    Avg overall · distribution ·       │
│   otherwise empty state)    │    top performers · trend vs prev    │
├─────────────────────────────────────────────────────────────────────┤
│  CLASSES BY YEAR GROUP                                              │
│  (the current landing content moves here as the bottom section)    │
└─────────────────────────────────────────────────────────────────────┘
```

**Sub-page mapping:**

| Current route                            | New home                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `/report-cards` (classes landing)        | Becomes the dashboard; classes-by-year-group moves to a bottom section              |
| `/report-cards/[classId]` (class matrix) | Unchanged, reached from a class card                                                |
| `/report-cards/generate`                 | Kept as its own page, reached from the Generate tile. Add Back button.              |
| `/report-cards/settings`                 | Reached from the gear icon in the dashboard header. Add Back button.                |
| `/report-cards/requests`                 | Reached from the Teacher Requests tile (with pending-count badge). Add Back button. |
| `/report-comments`                       | Reached from the Write Comments tile. Add Back button.                              |
| `/report-cards/library`                  | Reached from the Library tile (shows `0 documents` or count). Add Back button.      |
| `/report-cards/analytics`                | **Option A — keep standalone + inline snapshot on dashboard.** Add Back button.     |
| `/report-cards/bulk`                     | **Retire** — duplicates the wizard                                                  |
| `/report-cards/approvals`                | **Retire** — calls a ghost endpoint; approvals flow is inside teacher requests      |

### 4.2 Nav: Report Cards as its own Learning sub-strip group

**Current state:** `apps/web/src/lib/nav-config.ts` puts Report Cards inside the Assessment sub-group (line ~392). That's why clicking Report Cards expands 8 child tabs.

**Decision:** Add a new top-level group in `hubGroupedSubStripConfigs.learning` called "Report Cards", parallel to Classes/Curriculum/Assessment/Homework/Attendance. Clicking it goes straight to `/report-cards` with **no children** in the sub-strip — the dashboard handles navigation internally.

**Expected Learning sub-strip after Phase 2:**

```
Learning → Classes | Curriculum | Assessment | Homework | Attendance | Report Cards
```

Remove Report Cards entries (`reportCards`, `reportCardsGenerate`, `reportCardsSettings`, `reportCardsRequests`, `reportComments`, `gradeAnalytics`) from the Assessment group's children while you're there.

### 4.3 Teacher requests → admin home "Needs Your Attention" priority card

**Goal:** When a teacher requests a comment-window reopen, the admin sees a priority card on `/dashboard` saying e.g. "2 teacher requests pending — Review requests →". Clicking it lands on `/report-cards/requests`.

**Wiring:**

1. Add `pending_report_card_requests?: number` to `PriorityData` type in `apps/web/src/app/[locale]/(school)/dashboard/_components/admin-home.tsx:29`.
2. Add `fetchReportCardRequests` in `apps/web/src/app/[locale]/(school)/dashboard/page.tsx` — call `/api/v1/report-card-teacher-requests/pending?pageSize=1` and read `meta.total`. Wire it into the same `useEffect` as the other fetches.
3. Add a new card case in `apps/web/src/app/[locale]/(school)/dashboard/_components/priority-feed.tsx#buildCards` — use `Inbox` or `MessageSquare` icon, link to `/report-cards/requests`. Follow the exact same pattern as the existing `pending-approvals` and `unlock-requests` cards.
4. New i18n keys: `teacherRequestSingular`, `teacherRequestPlural`, `teacherRequestDescription`, `reviewRequests` in both en + ar.

Backend endpoint already exists: `GET /api/v1/report-card-teacher-requests/pending` on `report-card-teacher-requests.controller.ts:80`. Verify response shape (paginated with `meta.total`, or a single count).

---

## 5. Product Q&A (verbatim user decisions)

These answer the product-behaviour questions that surfaced when the user chose Option B for Bug #4. Treat these as the authoritative spec for Phase 1b.

### Q1. When a full-year report card is being written, where do the teacher comments come from?

**User answer:** **Require teachers to write new comments during a full-year comment window.**

Implication: `ReportCommentWindow` gets a new discriminator — a window is either for a single period OR for a full year. When a full-year window is open, teachers write brand new overall + subject comments that are stored with `academic_period_id = NULL` and `academic_year_id = <yearId>`. The full-year report card generation reads these new comments, NOT the last period's comments.

### Q2. Approval workflow for full-year report cards?

**User answer:** **Create a new "full year" approval config row.**

Implication: `ReportCardApprovalConfig` rows gain a `(tenant_id, academic_year_id, NULL period_id)` combination. The approval service resolves configs by period when period is non-null, by year when period is null. **Never silently bypass approvals** for null-period rows — explicit gate: "is this a full-year row? then look up the full-year config for this year; if none exists, error loudly."

### Q3. Teacher request to reopen a comment window — what does "full year" mean?

**User answer:** **Reopening full-year = reopening all other periods together** (could be 1, 2, 3+ periods — depends on how many periods are in the year).

Implication: `ReportCardTeacherRequest.request_type` gains a full-year variant (or the existing reopen type carries a `scope: 'period' | 'full_year'` flag). When an admin approves a full-year reopen, the service runs a single transaction that reopens every period's comment window in that academic year simultaneously, plus the full-year comment window if one exists.

### Q4. Batch job idempotency — how to dedupe when `academic_period_id` can be null?

**User asked for recommendation. Recommendation (accepted):**

- **Add `academic_year_id NOT NULL` column** to `ReportCard` and `ReportCardBatchJob` (backfilled from `academic_period.academic_year_id` in the same migration).
- **Replace the single unique constraint with two partial unique indexes** on each affected table:

  ```sql
  CREATE UNIQUE INDEX uniq_report_card_period
    ON report_cards (class_id, academic_period_id, template_id)
    WHERE academic_period_id IS NOT NULL;

  CREATE UNIQUE INDEX uniq_report_card_full_year
    ON report_cards (class_id, academic_year_id, template_id)
    WHERE academic_period_id IS NULL;
  ```

Rationale: Postgres treats NULL as "not equal to anything" in normal unique constraints, so two `(class, NULL, template)` rows would both be considered unique → double-generation. Partial indexes eliminate that.

### Q5. PDF filename / storage path when period is null?

**User asked for recommendation. Recommendation (accepted):**

- **Centralize all filename/storage-key construction in a single helper** in the generation service:
  ```ts
  function buildReportCardStorageKey(params: {
    tenantId: string;
    academicYearId: string;
    academicPeriodId: string | null;
    studentId: string;
    templateLocale: string;
  }): string {
    const periodSegment = params.academicPeriodId ?? 'full-year';
    return `tenants/${params.tenantId}/report-cards/${params.academicYearId}/${periodSegment}/${params.studentId}-${params.templateLocale}.pdf`;
  }
  ```
- **Human-readable download filenames** use the period name (not UUID): `Oscar-Allen_S1-2025-2026.pdf` or `Oscar-Allen_Full-Year-2025-2026.pdf`.
- **Grep every existing construction site** (`report_card_${`, any `.pdf` template literal) and route through the helper. This is the mechanical piece most prone to being missed.

---

## 6. Phase plan

The work is split into four focused phases so commits stay revertable and blast radius is contained.

### Phase 1a — small bug bundle (IN PROGRESS)

Quick cosmetic + envelope-mismatch fixes. Single commit. No schema or product changes. Aim: unblock the wizard, stop the crashes, fix the cosmetic issues.

**Tasks:**

- [x] Bug #5 — Step 5 envelope mismatch (✅ done)
- [x] Bug #6 — Overall comments envelope mismatch (✅ done)
- [x] Bug #3 — Wizard scope label by mode (✅ done)
- [~] Bug #4 — Stopgap "Coming soon" card in Step 2 (in place; will be REMOVED in Phase 1b and replaced with the real option)
- [x] Bug #1 — Matrix grade derivation in backend (✅ `buildMatrixCells` updated; unit test still to add)
- [ ] Bug #2 — Matrix table width (218px gap)
- [ ] Bug #7 — Hide "New request" / "My requests" for admins
- [ ] Bug #9 — Analytics 400 on empty query
- [ ] Bug #8 — Retire approvals ghost (Phase 1a: redirect or delete; Phase 2: remove from nav)
- [ ] Back-to-dashboard buttons on all sub-pages (generate, settings, requests, report-comments, library, analytics; verify class matrix already has one)
- [ ] Unit test for Bug #1 fix — `report-cards-queries.service.spec.ts` should prove `grade` is derived from aggregated `score`, not from any individual period's `display_value`
- [ ] `turbo test` (affected packages: `@school/api`, `@school/web`, `@school/shared`)
- [ ] Commit: `fix(report-cards): phase 1a bug bundle (envelope, matrix, wizard, role gating)`

**Do NOT touch in Phase 1a:** schema, `ReportCard.academic_period_id`, generation service, transcript service, nav config, dashboard consolidation, priority feed.

### Phase 1b — Full-year report cards (Option B) ✅ COMPLETE (local; awaiting deploy)

This is the real implementation of Bug #4. Separate commit so it's revertable.

**Status (Session 3 — 2026-04-10):** All backend, schema, worker, and frontend pieces landed locally. Type-check + lint clean across all four packages. Full regression suite green: 16,969 tests pass (api 15,057 / shared 845 / worker 803 / web 264). Net-new full-year unit tests deferred to a backlog item — see Backlog at the bottom of the implementation log.

**What changed vs. the original plan in this section:**

- **6 tables affected, not 8+**. `ReportCardApproval`, `ReportCardDelivery`, `ReportCardAcknowledgment`, `ReportCardVerificationToken`, `ReportCardCustomFieldValue` cascade via `report_card_id` and never hold a period field; they need no schema change.
- **`ReportCardApprovalConfig` was NOT touched.** The model has no period or year scoping today (`is_active` flag picks the active config). Q2's "create a new full-year approval config row" is achievable without a schema change — admins can create a second row with a different name; the existing tenant-level lookup keeps working. Adding period/year scoping to approval configs is logged as a Phase 1b backlog item.
- **No new unique constraints on `ReportCard` / `ReportCardBatchJob` / `ReportCommentWindow` / `ReportCardTeacherRequest`.** Q4's `uniq_report_card_period ON (class_id, ...)` couldn't be implemented as written: ReportCard has no `class_id` column. Existing dedup is application-level (worker `findFirst` before insert) and now branches on period vs year, so the safety net is still there. The two comment tables DO get the partial-index split because their existing per-period uniques would silently admit duplicate full-year rows.
- **No `buildReportCardStorageKey` helper.** Storage key construction lives at exactly one site (`apps/worker/src/processors/gradebook/report-card-generation.processor.ts:388`); the full-year branch is inlined there instead of extracted to a helper.
- **Transcript service untouched.** `report-card-transcript.service.ts` is the student-facing transcript generator, not the report-card-generation path. Worker `report-card-generation.processor.ts` has its own per-student render loop and is the file that needed the full-year branch.
- **Approval service lookup change skipped** along with the approval config schema change above.

**Files touched (Session 3):**

Schema + migration:

- `packages/prisma/schema.prisma` — 6 models updated with nullable period + required year + secondary year-scoped indexes.
- `packages/prisma/migrations/20260410000000_add_full_year_report_cards/migration.sql` — full backfill + FK + nullable + partial unique indexes (subj/overall comments).

Shared schemas:

- `packages/shared/src/report-cards/generation.schema.ts` — `startGenerationRunSchema` and `dryRunGenerationCommentGateSchema` accept nullable period + optional year, cross-field `.refine()`.
- `packages/shared/src/report-cards/comment-window.schema.ts` — `createCommentWindowSchema` accepts either period or year.
- `packages/shared/src/report-cards/teacher-request.schema.ts` — `submitTeacherRequestSchema` accepts either period or year via `superRefine`.
- `packages/shared/src/report-cards/overall-comment.schema.ts` + `subject-comment.schema.ts` — same.
- `packages/shared/src/report-cards/matrix-library.schema.ts` — library query accepts `academic_period_id: 'full_year'` sentinel + optional `academic_year_id`.

Backend services:

- `apps/api/src/modules/gradebook/report-cards/report-card-generation.service.ts` — `dryRunCommentGate` and `generateRun` branch on period vs year. New `resolvePeriodOrYear` and `buildYearPeriodInFilter` helpers. `GenerationRunSummary` now has `academic_period_id: string | null` and `academic_year_id: string`. Legacy `generate()` writes both fields.
- `apps/api/src/modules/gradebook/report-cards/report-comment-windows.service.ts` — `open()` accepts both period and year, resolves which is authoritative. New `assertWindowOpen({ periodId, yearId })` and `resolveCommentScope()` helpers. `assertWindowOpenForPeriod` retained as a back-compat wrapper.
- `apps/api/src/modules/gradebook/report-cards/report-card-overall-comments.service.ts` — `upsert` resolves scope, `assertWindowOpen`, writes both period (nullable) and year. `findOne` and `list` filter by period or year (the literal `'full_year'` sentinel selects NULL-period rows). Update/finalise/unfinalise paths use `assertWindowOpen` with the row's stored scope.
- `apps/api/src/modules/gradebook/report-cards/report-card-subject-comments.service.ts` — same pattern. `bulkFinalise` retained per-period semantics (the admin path doesn't need full-year support yet) but routed through `assertWindowOpen` for consistency.
- `apps/api/src/modules/gradebook/report-cards/report-card-teacher-requests.service.ts` — `submit()` resolves period or year, stores both. New `openFullYearReopen()` private method runs a single transaction that closes any other open window, flips every per-period window in the year to `open`, and creates (or reopens) the full-year window. Approve+auto-execute branches on null period to call this path. New `resolvePeriodOrYearInput` helper.
- `apps/api/src/modules/gradebook/report-cards/report-cards-queries.service.ts` — library list filter accepts the `'full_year'` sentinel and the new `academic_year_id` filter. Library response synthesises a `{ id: 'full-year:<yearId>', name: 'Full Year' }` entry for full-year rows. `buildLibraryGroupKey` clusters full-year rows on the year id instead of the period id so multi-locale grouping still works.
- `apps/api/src/modules/gradebook/report-cards/report-cards.service.ts` — revision creation copies `academic_year_id`.
- `apps/api/src/modules/gradebook/report-cards/report-card-verification.service.ts` — public verification page renders "Full Year" when the report card has a null period.
- `apps/api/src/modules/gradebook/ai/ai-comments.service.ts` — branches on null period when loading snapshots; uses `AcademicReadFacade.findPeriodsForYear` (cross-module rule) instead of direct Prisma access. AcademicReadFacade injected as new dependency.
- `apps/api/src/modules/gradebook/gradebook-read.facade.ts` — `REPORT_CARD_SELECT` now includes `academic_year_id`; `ReportCardRow` type widens `academic_period_id` to `string | null`.

Worker:

- `apps/worker/src/processors/gradebook/report-card-generation.processor.ts` — full-year branch loads all snapshots across every period in the year, collapses each (student, subject) into one mean snapshot, loads comments by `(year, NULL period)`, emits a synthetic "Full Year" period in the render payload, switches storage key to `full-year-<yearId>` segment, dedups via the `(student, NULL period, year)` triple. Per-period path unchanged.
- `apps/worker/src/processors/gradebook/report-card-auto-generate.processor.ts` — backfills `academic_year_id` from the period when creating draft cards.

Frontend:

- `apps/web/src/app/[locale]/(school)/report-cards/generate/_components/wizard/types.ts` — wizard state gains `academicYearId: string | null` alongside `academicPeriodId`. New `SET_FULL_YEAR` action; `SET_PERIOD` clears the year.
- `apps/web/src/app/[locale]/(school)/report-cards/generate/_components/wizard/step-2-period.tsx` — Coming Soon stopgap removed. Renders one "Full Year — <name>" card per academic year (active first) above the period list.
- `apps/web/src/app/[locale]/(school)/report-cards/generate/_components/wizard/step-5-comment-gate.tsx` — dry-run payload sends both period (nullable) and year.
- `apps/web/src/app/[locale]/(school)/report-cards/generate/_components/wizard/step-6-review.tsx` — review row shows "Full year" when full-year is selected.
- `apps/web/src/app/[locale]/(school)/report-cards/generate/page.tsx` — step 2 gating accepts either choice; submit handler sends both fields.
- `apps/web/src/app/[locale]/(school)/report-cards/library/page.tsx` — period filter dropdown gains a "Full year" option that sends `academic_period_id=full_year`.
- `apps/web/src/app/[locale]/(school)/report-comments/_components/request-reopen-modal.tsx` — full rebuild. Form scope token is either a UUID or `full_year:<yearId>`; submit decodes it into the right API payload. Both periods and academic years are listed.

i18n:

- `apps/web/messages/{en,ar}.json` — new keys: `reportCards.wizard.periodFullYearHint`, `reportCards.wizard.reviewPeriodFullYear`, `reportCards.library.periodFullYear`. Existing `reportCards.wizard.periodFullYear` gained an `{year}` interpolation slot.

Tests:

- `apps/api/src/modules/gradebook/report-cards/report-card-overall-comments.service.spec.ts` — fixture base comment now carries `academic_year_id`. Mock `windowsService` extended with `assertWindowOpen` and `resolveCommentScope` (default behaviour matches per-period path).
- `apps/api/src/modules/gradebook/report-cards/report-card-subject-comments.service.spec.ts` — same.
- `apps/api/test/report-cards.rls.spec.ts` — fixture writes `academic_year_id` on the seeded report card.
- `apps/api/test/report-cards/library.e2e-spec.ts` — fixture report cards now write `academic_year_id`.
- `apps/api/test/report-cards/rls-leakage.e2e-spec.ts` — fixture rows on the 4 affected tables now write `academic_year_id`.

**Net-new full-year unit tests are NOT yet written.** The existing 16,969 tests cover regression of the per-period path (which is unchanged behaviourally) plus the type-system catches every structural break. The net-new tests in section 6 below remain a Backlog item — see the implementation log.

---

**Original plan (kept for reference, ✅ marks what landed and ⏭ marks what was skipped or restructured):**

**Tasks:**

1. **Remove the Phase 1a stopgap:** delete the disabled "Coming soon" card from `step-2-period.tsx`.

2. **Prisma migration** (`npx prisma migrate dev --name add_full_year_report_cards`):
   - `ReportCard`: `academic_period_id` → nullable; new `academic_year_id UUID NOT NULL` column (backfill from `academic_period.academic_year_id`); new FK to `academic_years(id)`.
   - `ReportCardBatchJob`: same treatment.
   - `ReportCardSubjectComment`: same treatment.
   - `ReportCardOverallComment`: same treatment.
   - `ReportCardTeacherRequest`: same treatment (null period_id + year_id).
   - `ReportCardApproval`: same treatment.
   - `ReportCardApprovalConfig`: same treatment.
   - `ReportCommentWindow`: same treatment.
   - `ReportCardDelivery`, `ReportCardAcknowledgment`, `ReportCardVerificationToken` — verify: do they reference period? If yes, same treatment.
   - On every affected table, **drop the existing unique constraint** that includes `academic_period_id` and **replace with two partial unique indexes** per the Q4 pattern.
   - `post_migrate.sql` — RLS policies on affected tables stay unchanged (tenant-scoped, not period-scoped). Verify.

3. **Shared Zod schemas** (`packages/shared/src/report-cards/*.schema.ts`):
   - `startGenerationRunSchema` — `academic_period_id: z.string().uuid().nullable()`; require `academic_year_id: z.string().uuid()` when period is null (cross-field `.refine()`).
   - `dryRunGenerationCommentGateSchema` — same.
   - `createCommentWindowSchema`, `createTeacherRequestSchema`, `createOverallCommentSchema`, `createSubjectCommentSchema` — same treatment where applicable.
   - Matrix/library list query schemas — add `academic_year_id` filter alongside `academic_period_id`.

4. **Backend services:**
   - `report-card-generation.service.ts`: when `dto.academic_period_id === null`, fetch data via `periodGradeComputationService.computeYearOverview(tenantId, classId, academicYearId)`, feed into the transcript builder. When non-null, existing per-period path. **All writes store both `academic_period_id` (nullable) and `academic_year_id` (always set).**
   - `report-card-transcript.service.ts`: accept year-overview-shaped input as an alternate branch. The transcript needs to render a per-subject column structure that covers all periods in the year — reuse the `computeYearOverview` output which already has `grades[periodId][subjectId]`.
   - `report-comment-windows.service.ts`: allow creating full-year windows (`{ academic_period_id: null, academic_year_id }`). Teachers write fresh comments during the window. The existing window listing should return full-year windows alongside per-period ones.
   - `report-card-overall-comments.service.ts` + `report-card-subject-comments.service.ts`: writes allow `academic_period_id: null` + `academic_year_id: <yearId>`. Reads filter by `(period | year)` depending on which the caller provides.
   - `report-card-teacher-requests.service.ts`: new request shape for full-year reopen. When approved, run a transaction that reopens every period's comment window in the year (plus the full-year window if present). This is the trickiest code change — keep it in a single `$transaction` to avoid partial reopens.
   - Approval service (find the file containing approval config lookup): add the null-period lookup path — `findFirst({ tenant_id, academic_year_id, academic_period_id: null })`. Error loudly if no full-year config exists ("Cannot generate full-year report cards without a full-year approval config — configure one in Settings").
   - **New helper**: `buildReportCardStorageKey` in the generation service (see Q5). Grep and migrate ALL existing filename/storage-key construction sites.
   - Batch job service: honour the new partial indexes. Dedup check uses `(class, period, template) WHERE period IS NOT NULL` or `(class, year, template) WHERE period IS NULL`.

5. **Frontend:**
   - `step-2-period.tsx`: replace the stopgap with a real "Full Year <year name>" card at the top of the period list. Clicking sets `academicPeriodId: null` (or a sentinel — reducer decision). Reducer in `generate/_components/wizard/types.ts` changes the state shape: `academicPeriodId: string | null` (distinct from "not selected yet" — probably use a tuple `{ periodId: string | null; selected: boolean }`).
   - `step-5-comment-gate.tsx`: dry-run payload carries nullable period. Backend handles it.
   - `step-6-review.tsx`: show "Full Year 2025-2026" in the review summary when period is null.
   - Library filter: add "Full Year" as a period option alongside S1/S2 (the library list query already has a period filter — extend it to accept `null` via a sentinel query param).
   - Report Comments landing: surface full-year windows alongside per-period ones.
   - Request Reopen modal (`report-comments/_components/request-reopen-modal.tsx`): add a "Full Year" option that creates a full-year reopen request.
   - Comment window editor: handle full-year windows (title, labelling, "Write comments for the full year" copy).

6. **Tests:**
   - Migration idempotency: `npx prisma migrate reset && npx prisma migrate deploy` roundtrip clean.
   - `report-card-generation.service.spec.ts`: add a full-year scenario. Fixture has 2 periods, both with snapshots. Generate with `period_id: null, year_id: X`. Assert the resulting ReportCard row has `period_id = null`, `year_id = X`, and the transcript data matches `computeYearOverview`'s output.
   - `report-card-teacher-requests.service.spec.ts`: full-year reopen approval unlocks all per-period windows in the year atomically.
   - Approval service spec: full-year config lookup works; absence of full-year config errors loudly.
   - RLS spec: full-year rows from tenant A are invisible to tenant B.
   - Batch job spec: the partial-index pair prevents double generation.
   - E2E in `apps/api/test/`: generate a full-year report card end-to-end via HTTP, assert library list includes it with `period: null`.
   - Frontend e2e (Playwright) is deferred to Phase 3.

7. **Commit:** `feat(report-cards): full-year report cards (Option B)`.

**Rollback plan for Phase 1b:**

- Before running the migration, tag the current HEAD: `pre-phase-1b-<date>`.
- Before running on production, take a `pg_dump` of the affected tables (the deploy script already does pre-deploy backups).
- If things go wrong, `git revert` the Phase 1b commit and run `npx prisma migrate resolve --rolled-back <migration_name>` + manual SQL to re-add NOT NULL constraints. The schema change is reversible **only if no null-period rows exist yet** — once the first full-year report card is generated, rolling back means either backfilling or deleting those rows.

### Phase 2 — Dashboard consolidation + nav move + priority feed

**Tasks:**

1. **Nav move** (`apps/web/src/lib/nav-config.ts`):
   - Add new `Report Cards` top-level group to `hubGroupedSubStripConfigs.learning`, parallel to Classes/Curriculum/Assessment/Homework/Attendance. No children (clicking goes straight to `/report-cards`).
   - Remove `reportCards`, `reportCardsGenerate`, `reportCardsSettings`, `reportCardsRequests`, `reportComments`, `gradeAnalytics` from the existing `Assessment` group's children.
   - Update the `basePaths` array on the `learning` hub entry if needed to keep `/report-cards` and `/report-comments` routable from the hub.
   - Add any needed i18n keys (`nav.reportCards` already exists per grep — verify).

2. **New consolidated `/report-cards` dashboard** (`apps/web/src/app/[locale]/(school)/report-cards/page.tsx`):
   - Full rebuild. Header: title + period selector + settings gear.
   - Quick-action tiles (4 cards): Generate, Write Comments, Library (`0 documents` or fetched count), Teacher Requests (pending badge from `/api/v1/report-card-teacher-requests/pending`).
   - Live Run Status panel (fetch via polling if an active run exists; otherwise "No runs in progress").
   - Inline Analytics snapshot panel (call `/api/v1/report-cards/analytics` with the resolved period; render the same numbers the standalone page shows). Include "See full analytics →" link to the standalone page.
   - Classes by year group section (the existing landing content moves here).
   - Responsive: mobile-first (stack tiles vertically on `<sm`), `min-w-0 flex-1` on content, `w-full` on tiles.

3. **Back-to-dashboard buttons** — verify/add across all sub-pages. Should be a single `<Button variant="ghost">` in the page header actions with `onClick={() => router.push(`/${locale}/report-cards`)}`. Reuse the existing pattern from `report-cards/[classId]/page.tsx`.

4. **Priority feed card** for teacher requests (see section 4.3 above).
   - `admin-home.tsx:29` — add `pending_report_card_requests` to `PriorityData`.
   - `dashboard/page.tsx` — add `fetchReportCardRequests`. Wire into `useEffect`.
   - `priority-feed.tsx#buildCards` — add new case with `Inbox` icon.
   - i18n keys for the card copy.

5. **Retire `/report-cards/bulk` and `/report-cards/approvals`:**
   - Delete both `page.tsx` files.
   - Verify no imports reference them.
   - Remove any nav entries.
   - Add `redirect('/report-cards/requests')` stubs **only if** you want bookmark-safety — otherwise let them 404.

6. **Tests:**
   - `turbo test` again.
   - Frontend unit tests for `priority-feed.tsx` if they exist.

7. **Commit:** `feat(report-cards): consolidated dashboard + nav move + teacher-request priority card`.

### Phase 3 — Deploy + verify

**Tasks:**

1. **Tag** pre-deploy: `git tag pre-deploy-report-cards-<yyyymmdd-hhmm>`.
2. **Deploy** via the existing direct-to-server flow — **do NOT push to `origin/main`**. The user is deliberately keeping the CI nightly gate clean.
   - Create a git bundle of all new commits since server HEAD.
   - `scp` the bundle to `root@46.62.244.139:/tmp/`.
   - SSH, `cd /opt/edupod/app`, `sudo -u edupod git fetch /tmp/bundle.pack <local_head>`, `sudo -u edupod git reset --hard <local_head>`.
   - Run `DEPLOY_SHA=<local_head> sudo -u edupod bash scripts/deploy-production.sh`. The script handles: `pnpm install --frozen-lockfile`, `prisma generate`, preflight, build, `pg_dump` pre-deploy backup, `prisma migrate deploy`, post-migrate SQL, PM2 restart, smoke tests.
   - If Node OOMs during type-check/build, set `NODE_OPTIONS="--max-old-space-size=8192"`.
3. **Playwright verify on prod** as Yusuf Rahman:
   - `/en/report-cards` → new dashboard renders, 0 console errors
   - Click Generate tile → wizard all 6 steps → submit → polling shows progress → completion
   - Click class card → matrix, Grade mode shows letters only (no percentages), no trailing whitespace, Score mode shows percentages
   - `/en/report-cards/requests` — no New Request / My Requests for admin
   - `/en/report-comments` → click 2A → editor loads, 0 console errors
   - `/en/report-cards/library` — shows 0 or listed docs
   - `/en/report-cards/analytics` — loads without 400
   - `/en/report-cards/settings` — loads and saves
   - Learning hub sub-strip shows Report Cards as its own group
   - `/en/dashboard` — if any teacher requests exist, priority card shows
   - Full-year (Phase 1b): verify Step 2 shows real Full Year option, generate a full-year report card end-to-end, verify it appears in library with period "Full Year"

   **Screenshots via Playwright:** DO NOT take screenshots. Use `browser_snapshot` only (accessibility tree). The user explicitly forbids screenshot output.

4. **Rollback if something breaks:** `git reset --hard <pre-deploy-tag>` on the server + `pg_restore` from the pre-deploy backup (dump lives at `/opt/edupod/backups/predeploy/predeploy-<ts>.dump`).

---

## 7. Implementation log (session journal — UPDATE AS YOU GO)

**Session 1 — 2026-04-09 (previous session)**

- Reproduced all 9 bugs via Playwright as Yusuf Rahman on production
- Root-caused bugs and mapped them to source files
- Presented design proposal + got user approval (Option A for analytics, library 0-count OK, wizard stays own page with Back buttons)
- User deferred "All periods" product questions, chose Option B

**Session 2 — 2026-04-10 (Phase 1a complete + deployed + verified on prod)**

_Completed:_

- ✅ Bug #1 — `report-cards-queries.service.ts`: built `subjectScaleMap` from `classSubjects[*].grading_scale.config_json`, passed into `buildMatrixCells`, derived `cell.grade` via `applyGradingScale(score, subjectScale)`. Always calls the helper (no null bypass) so the no-scale fallback returns the rounded percentage — same pattern `overall_grade` uses. Added regression unit test in `report-cards-queries.service.spec.ts` that seeds misleading display tokens (`"70.5%"`, `"59.2%"`) and asserts the derived letter (`"B"`) matches the aggregated score (85), not the tokens. The pre-existing "has_override" test was updated: with no scale, the override flag is preserved but the raw `overridden_value` string is no longer echoed into the grade field — score-derivation is authoritative.
- ✅ Bug #2 — `report-cards/[classId]/page.tsx`: changed outer wrapper to `inline-block max-w-full` and table to `w-max`. Verified on prod via DOM measurement: table=1060px, wrapper=1060px, borderbox=1062px. Down from a 218px gap.
- ✅ Bug #3 — `step-1-scope.tsx`: branched selection label on `scope.mode`. Added i18n keys `classesSelected`, `yearGroupsSelected`, `periodAll`, `periodAllHint` in both `en.json` and `ar.json`.
- ✅ Bug #4 stopgap — `step-2-period.tsx`: added disabled "Coming soon" card at top of period list. **REMOVE THIS in Phase 1b** when full-year support lands.
- ✅ Bug #5 — `step-5-comment-gate.tsx`: `apiClient<CommentGateDryRunResult>` → `apiClient<{ data: CommentGateDryRunResult }>`; dispatched `result: res.data`. Verified on prod: full wizard walk Class → 2A → S1 → Grades Only → Full name → Next renders Step 5 ("Comment check") cleanly with summary cards, no error screen.
- ✅ Bug #6 — `report-comments/overall/[classId]/page.tsx`: wrapped envelopes on 5 apiClient calls (active window, matrix, save POST, finalise PATCH, unfinalise PATCH). Verified on prod: 2A overall comments editor renders 25 student rows with weighted averages, zero console errors.
- ✅ Bug #7 — `requests/page.tsx`: gated "New request" button and "My requests" tab on `!canManage`. Narrowed `AdminTab` type to drop `'mine'`. Removed dead `activeTab === 'mine'` code path. Also fixed a latent envelope bug on `apiClient<UserSummary>` (line 158) → `apiClient<{ data: UserSummary }>` so requester names will actually display.
- ✅ Bug #8 — `report-cards/approvals/page.tsx`: replaced the entire page with a client redirect to `/report-cards/requests`. No more 404 console noise. Phase 2 will delete the route entirely.
- ✅ Bug #9 — `report-cards/analytics/page.tsx`: required two follow-up commits beyond the initial fix.
  1. **Commit `c74790d4`**: replaced the ghost `/api/v1/report-cards/analytics?` call with parallel calls to `/dashboard` + `/class-comparison`.
  2. **Commit `ae33916a`** (analytics follow-up #1): on Playwright verification the class-comparison endpoint returned **500** when called with no period (the backend service can't handle an empty UUID string). Switched to `Promise.allSettled` so dashboard renders independently, and skipped the class-comparison fetch entirely when no specific period is selected (it's per-period by design).
  3. **Commit `e0e6ba8f`** (analytics follow-up #2): a third surface bug — frontend `AnalyticsSummary` and `ClassComparisonItem` interfaces had drifted from the backend contract, so accessing `analytics.summary.completion_pct` hit `undefined.toFixed` and crashed the page. Aligned the interfaces with the backend's `ReportCardDashboard` and `ClassComparisonEntry` types: `pending_approval` (not `pending`), `completion_rate` / `comment_fill_rate` (not `_pct`), `average_grade` / `published_count` on the comparison items. Updated all JSX references and the BarChart `dataKey`s. Added `?? 0` fallbacks for safety.
- ✅ Back-to-dashboard buttons added on the sub-pages that didn't already have one: generate, settings, report-comments landing, analytics. The class matrix, library, requests landing, requests/new, requests/[id] already had parent-level back buttons. All use the existing `reportCards.backToReportCards` i18n key.
- ✅ Regression tests: api 722 suites / 15,057 tests pass; shared 36 suites / 845 pass; web 12 suites / 264 pass. Type-check clean on api + web. Lint clean on every file touched.
- ✅ Phase 1a committed locally as `c74790d4` (16 files, +1072/-371). Two follow-up fixes committed as `ae33916a` and `e0e6ba8f`. None pushed to origin/main per the CI-gate hold.
- ✅ Deployed to production via direct-bundle flow:
  - Pre-deploy server SHA: `8bb74683`
  - Final server HEAD: `e0e6ba8f`
  - Two ownership cleanups along the way: `chown -R edupod:edupod /opt/edupod/app` (27,821 root-owned files from prior root-runs) and `chown -R edupod:edupod /opt/edupod/backups` (16 backup files). The previous session had similar issues — it's worth fixing the deploy script's user-handling story before next deploy.
  - Stale `/tmp/edupod-deploy.lock` from a prior root-owned run had to be removed.
  - Deploy script's PM2 restart step uses `sudo -u edupod pm2 ...`, which fails when the script is invoked as edupod (no sudo privileges). Worked around by running PM2 reload manually as root via SSH. **Same pattern next session — the deploy script needs a fix here.**
  - Pre-deploy DB backup: `/opt/edupod/backups/predeploy/predeploy-20260409-235640.dump`
  - Migrations: 0 pending, post-migrate 0 new / 32 skipped, verification passed.
  - Smoke tests after restart: API health up (degraded warning from a pre-existing `behaviour:failed>5` BullMQ alert and a spurious `disk free_gb=0` probe — neither related to this deploy), web login HTTP 200, worker health healthy, auth HTTP 401 on bad creds.
- ✅ Playwright verification on production as Yusuf Rahman (School Owner):
  - `/en/report-cards` — landing renders, 0 console errors.
  - `/en/report-cards/2A-id` — class matrix in Grade mode: scanned 25 rows × 7 subject columns = 175 grade cells, **zero percentage offenders** (down from 7 in the original repro). Layout: table=1060px, wrapper=1060px (no trailing gap).
  - `/en/report-cards/generate` — full wizard walk Class → 2A → "1 class selected" → S1 → Grades Only → Full name → Step 5 "Comment check" renders with the 25-students-in-scope summary, zero console errors. "All periods · COMING SOON" card visible above S1/S2 in Step 2.
  - `/en/report-cards/requests` — admin sees only Pending review / All tabs, no New Request, no My Requests, Back to Report Cards visible.
  - `/en/report-cards/approvals` — clean redirect to `/en/report-cards/requests`, 0 console errors, no 404 noise.
  - `/en/report-cards/settings` — loads, 0 errors, back button present.
  - `/en/report-cards/library` — loads, 0 errors.
  - `/en/report-cards/analytics` — loads, 0 errors, summary cards render: Total 30, Published 0, Pending Approval 0, Completion Rate 0.0%, Comment Fill Rate 0.0%.
  - `/en/report-comments` — landing, 0 errors, back button present.
  - `/en/report-comments/overall/2A-id` — editor renders 25 student rows with weighted averages (was crashing with `students.map` undefined and `class.name` undefined).

**Phase 1a — DONE.** Production HEAD `e0e6ba8f`. All 9 reported bugs verified fixed. The Bug #4 stopgap is the only thing carrying forward — it's the entry point for Phase 1b.

**Backlog items surfaced during Phase 1a verification (not Phase 1a scope):**

- Backend `getClassComparison` returns 500 when called with empty `academic_period_id`. The frontend now skips the call when no period is selected, but the backend should handle the empty case gracefully. Track for a future small fix.
- Deploy script user-handling needs cleanup — the `sudo -u edupod pm2` chain inside the script breaks when the script itself is invoked as edupod. Either always invoke as root and let it sudo, or fix the script to detect the calling user.
- Server file ownership keeps drifting back to root — investigate which runtime path is creating root-owned files (turbo cache? prisma generate?) and add a chown to the deploy script's preflight.
- The `has_override` semantics on matrix cells changed: the override flag is preserved but the raw `overridden_value` string is no longer echoed. If teachers actually need to override the _letter_ (not the score), Phase 1b should add an explicit `letter_override` field. Otherwise the current behaviour is correct — score is authoritative.

**Session 3 — 2026-04-10 (Phase 1b complete locally, awaiting deploy)**

_Completed:_

- ✅ Schema migration `20260410000000_add_full_year_report_cards` — 6 tables (`report_cards`, `report_card_batch_jobs`, `report_comment_windows`, `report_card_subject_comments`, `report_card_overall_comments`, `report_card_teacher_requests`) get nullable `academic_period_id` + required `academic_year_id` (backfilled from the period's parent year before the NOT NULL flip) + FK to `academic_years` + secondary year-scoped indexes. The 2 comment tables drop their period-inclusive uniques and replace them with paired partial unique indexes (`uniq_*_period` WHERE period IS NOT NULL, `uniq_*_year` WHERE period IS NULL). RLS policies are tenant-scoped and untouched. Migration is reversible only while no NULL-period rows exist.
- ✅ Shared Zod schemas — `startGenerationRunSchema`, `dryRunGenerationCommentGateSchema`, `createCommentWindowSchema`, `submitTeacherRequestSchema`, `createOverallCommentSchema`, `createSubjectCommentSchema` accept nullable period + optional year with cross-field `.refine` enforcing exactly-one-of. `listReportCardLibraryQuerySchema` accepts the `'full_year'` sentinel and `academic_year_id` filter.
- ✅ Generation service — `generateRun` and `dryRunCommentGate` branch via the new `resolvePeriodOrYear` helper. Snapshot/comment lookups use `buildYearPeriodInFilter` (period IN-list across the year) for full-year. Batch job rows store both `academic_period_id` (nullable) and `academic_year_id`. The legacy `generate()` method also writes `academic_year_id` to satisfy the new NOT NULL constraint.
- ✅ Comment windows service — `open()` resolves period or year, errors loudly if neither. New `assertWindowOpen({ periodId, yearId })` and `resolveCommentScope()` helpers normalise scope across the comment write path. `assertWindowOpenForPeriod` is retained as a back-compat thin wrapper.
- ✅ Overall + subject comment services — `upsert` resolves scope via the windows service, asserts the right window, and writes both period (nullable) and year. `findOne` accepts a nullable `academicPeriodId` and an optional `academicYearId` for full-year lookups. `list` accepts the `'full_year'` filter.
- ✅ Teacher requests service — `submit()` resolves period or year, persists both. New `openFullYearReopen()` private method runs a single transaction that closes any other open window, flips every per-period window in the year to `open`, and creates (or reopens) the full-year window. The `auto_execute = true` approve path branches on null period to call this method, satisfying Q3's "reopening full-year = reopening every other period together" rule atomically.
- ✅ Worker generation processor — full-year branch loads all period snapshots, collapses each (student, subject) pair into one mean snapshot, loads comments by `(year, NULL period)`, emits a synthetic "Full Year" period in the render payload, and switches the storage key segment from `<periodId>` to `full-year-<yearId>`. The dedup `findFirst` uses the `(student, NULL period, year)` triple.
- ✅ Frontend wizard — `WizardState` gains `academicYearId`, `SET_FULL_YEAR` action, step 2 renders one "Full Year — <name>" card per academic year (active first) above the period list, step gating accepts either choice, dry-run + submit send both fields. Step 6 review labels full-year selection.
- ✅ Library page — period filter dropdown gains a "Full year" option that sends `academic_period_id=full_year`.
- ✅ Request-reopen modal — full rebuild. Scope token is either a period UUID or `full_year:<yearId>`; the submit handler decodes it into the right API payload. Both periods and academic years are listed in the dropdown.
- ✅ Tests — every existing report-card service spec was extended to mock the new `assertWindowOpen` / `resolveCommentScope` methods (defaults to per-period behaviour) and to write `academic_year_id` on fixture rows. RLS + library e2e specs likewise. **All 16,969 tests pass across @school/api (15,057), @school/shared (845), @school/worker (803), @school/web (264).** Type-check + lint clean across all four packages (lint had pre-existing warnings, zero errors).
- ✅ Adjacent fix: `ai-comments.service.ts` was using direct `prisma.academicPeriod.findMany` from gradebook (a cross-module Prisma access lint error). Switched to `AcademicReadFacade.findPeriodsForYear` and added the facade as a constructor dependency. AcademicsModule was already imported into GradebookModule so DI resolves cleanly.

**Phase 1b — DONE and DEPLOYED.** Single commit `142334a4` shipped to production via direct-bundle flow. Production HEAD: `142334a4c4ccbb4cbc060558de9e7e89382de42b`. Pre-deploy DB backup: `/opt/edupod/backups/predeploy/predeploy-20260410-011310.dump`. Migration `20260410000000_add_full_year_report_cards` applied cleanly. PM2 restart green; all 5 smoke tests passed (WEB / API / API READY / WORKER / AUTH). Local-only commit — `origin/main` deliberately untouched per the CI gate hold.

**Production verification (Playwright as Yusuf Rahman, School Owner):**

| Surface                                          | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/en/report-cards/generate` Step 1               | ✅     | Class scope selectable, "1 class selected" label correct (Bug #3 still green)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/en/report-cards/generate` Step 2               | ✅     | **Both Full Year cards visible**: "Full year — 2025-2026" (active year, top) and "Full year — 2024-2025", followed by S1/S2 per-period cards. Coming Soon stopgap removed.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Step 2 selection state                           | ✅     | Clicking "Full year — 2025-2026" sets active state, Next button enables, and per-period cards deselect — confirms `SET_FULL_YEAR` reducer + clear-other-scope rule                                                                                                                                                                                                                                                                                                                                                                                                          |
| Step 3 (template)                                | ✅     | Grades Only renders + selectable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Step 4 (personal info)                           | ✅     | Full name checkbox toggles, Next enables                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Step 5 (dry-run gate) — full-year                | ✅     | **End-to-end backend resolution proven**: API resolved year via `resolvePeriodOrYear`, fetched 25 students in scope, language preview "EN 25 · AR 0", comment gate correctly **blocked** because no full-year comments exist yet (Q1 spec). Force-generate checkbox visible. Zero console errors.                                                                                                                                                                                                                                                                           |
| Step 6 review                                    | ✅     | Period row labels "Full year" (the new `reviewPeriodFullYear` i18n key) instead of a UUID. Force-generate state echoed correctly.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| API submit `POST /generation-runs` (full-year)   | ✅     | Returned a `batch_job_id`, wizard transitioned to "Generation in progress 0/25". DB verified: row with `academic_period_id = NULL`, `academic_year_id = 0001b90d-…`, `total_count = 25`, `status = queued`. Schema and persistence layer fully working.                                                                                                                                                                                                                                                                                                                     |
| BullMQ enqueue `report-cards:generate`           | ✅     | Job confirmed in `gradebook` queue with correct `tenant_id`, `user_id`, `batch_job_id` payload.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Worker actually processing the full-year job** | 🔴     | **Blocked by the pre-existing 5-processor race documented in the backlog above.** Job state in BullMQ is `completed` (returned normally), `attemptsMade: 1`, `failedReason: undefined`, no `[ReportCardGenerationProcessor]` log line was emitted, and the DB row stayed `status: queued`. The wrong worker (one of the other 4 `@Processor(GRADEBOOK)` classes) silently completed the job via the `if (job.name !== EXPECTED) return;` guard. This is NOT a Phase 1b regression — the per-period path has the same race; Phase 1a never tested through actual generation. |

**Net Phase 1b status:** the schema, the API, the wizard, the dry-run gate, and the enqueue are all proven on prod. The only unproven piece is the worker actually consuming the queued job — and that's blocked on a pre-existing latent bug that affects the entire gradebook queue, not just full-year. Recommended next step: take the consolidator fix from the backlog and ship it as a tiny standalone follow-up.

**Session 4 — 2026-04-10 (Queue dispatcher fix + Phase 2 complete locally)**

_Completed:_

- ✅ **Gradebook queue dispatcher consolidation (commit `b2392e45`)** — new `GradebookQueueDispatcher` is the single `@Processor(GRADEBOOK)` class; routes `job.name` → one of 5 injectable processor services. Strips `@Processor` + `WorkerHost` from the 5 existing classes so BullMQ creates exactly one Worker on the queue. Unknown job names throw loudly so BullMQ retries instead of silently completing. 12 files, +225/-123. Deletes 4 dead "ignore different job name" tests, adds 6 new dispatcher routing tests. Worker suite now 110 / 805 (+2).
- ✅ **Phase 2 — Dashboard consolidation + nav move + priority card (commit `a8b31af4`)** — nav-config.ts now has Report Cards as its own top-level Learning group (no children); Assessment group stripped of 6 report-card children. `/report-cards` page rebuilt as a consolidated dashboard with period selector, settings gear, 4 quick-action tiles (Generate / Write Comments / Library / Requests with pending-count badge), live-run polling panel, inline analytics snapshot, classes-by-year-group bottom section. Panels extracted to `_components/dashboard-panels.tsx` to stay under the 600-line lint threshold. Retired `/report-cards/bulk` and `/report-cards/approvals` routes (deleted both files). Dashboard priority feed gets a new rose-coloured `Inbox` card for pending teacher requests, fetched from `GET /v1/report-card-teacher-requests?status=pending&pageSize=1` (permission `report_cards.comment` — accessible to both teachers and admins; rendered only on AdminHome). New `reportCards.dashboard.*` + `dashboard.reportCardRequest*` i18n keys in en + ar. 10 files, +682/-728. Removed orphan `nav.reportCardsGenerate/Settings/Requests` i18n keys as a follow-up loose-end cleanup.
- ✅ Regression after Phase 2: @school/api 722 / 15,057 · @school/shared 36 / 845 · @school/worker 110 / 805 · @school/web 12 / 264. Type-check + lint clean on all four packages (warnings only, no errors).

**Phase 2 — DONE.** Local HEAD ready for Phase 3 deploy. Neither commit pushed to `origin/main` per the CI gate hold.

**Session 5 — 2026-04-10 (Phase 3 deploy + prod verification + hotfixes)**

_Completed:_

- ✅ **Phase 3 deploy** — git bundle of `142334a4..3d5d5206` shipped direct to server, reset server `main` to my commit, ran `deploy-production.sh` via `sudo -u edupod env DEPLOY_SHA=3d5d5206 NODE_OPTIONS=...` (wrapped in `nohup` to survive SSH disconnect). Deploy script ran build + pnpm install + prisma migrate + post-migrate + verification cleanly. PM2 restart step crashed on the same `edupod not in sudoers` bug as the prior session — manually restarted all 3 services as root with `sudo -u edupod pm2 delete/start ecosystem.config.cjs`. Smoke tests: WEB 200, API 200, WORKER 200, AUTH 401 (all green). Production HEAD: `3d5d5206`.
- ✅ **Hotfix 1: BatchJobStatus enum drift (commit `c7133398`)** — the original `report_cards_world_class` migration created the enum with `running`, but `schema.prisma` has since been updated to `processing`. The worker's `ReportCardGenerationJob.processJob()` writes `{ status: 'processing' }` at the start of execution, which blew up against the stale prod enum. **Not a Phase 1b/dispatcher regression** — this code existed before but never executed because the silent-drop race swallowed the job before it could reach that line. The dispatcher fix exposed the latent bug. Fixed with migration `20260410070000_fix_batch_job_status_enum_processing` (pure `ALTER TYPE ... RENAME VALUE`, safe: zero rows in `running` state). Applied directly to prod DB and recorded in `_prisma_migrations` manually.
- ✅ **Hotfix 2: Prisma interactive transaction timeout (same commit `c7133398`)** — the worker's PDF render loop iterates every student inside the tenant-aware transaction. For a 25-student class that's ~2s per student (Chromium render), far past Prisma's default 5s. Failed with `Transaction API error: Transaction already closed`. Fixed by bumping `TenantAwareJob.transactionTimeoutMs` to 5 minutes (matching BullMQ's longest `lockDuration` on any queue) and raising `maxWait` to 30s. Subclasses can override via the new `transactionTimeoutMs` protected field.
- ✅ **Hotfix 3: Bulk/approvals route stubs (commit `a1b4f2de`)** — Phase 2 deleted `report-cards/bulk/page.tsx` and `report-cards/approvals/page.tsx`, but Next.js's `[classId]` catch-all picked up the URL and rendered "Failed to load the matrix." for old bookmarks. Re-added both as thin client-side redirect stubs — `/bulk` → `/report-cards`, `/approvals` → `/report-cards/requests`. 45 LOC total, zero runtime cost.
- ✅ **Deploy hotfixes to prod** — bundled + shipped each commit in sequence (c7133398 worker fix, a1b4f2de web stubs), rebuilt worker and web individually via `pnpm --filter`, restarted only the affected PM2 services.

**Phase 3 production verification (Playwright as Yusuf Rahman, School Owner):**

| Surface                                          | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/en/dashboard` priority feed (empty state)      | ✅     | Only "Outstanding Balance" card renders. Zero console errors. New `fetchReportCardRequests` ran silently on empty data.                                                                                                                                                                                                                                                                                                                                                                                         |
| `/en/dashboard` priority feed (populated)        | ✅     | Inserted a test `pending` teacher request → reloaded → new rose-coloured "1 Report Card Request · Teachers requesting comment windows or regenerations · Review Requests" card rendered below Outstanding Balance. Priority feed wiring end-to-end on prod.                                                                                                                                                                                                                                                     |
| Learning sub-strip                               | ✅     | `Classes · Curriculum · Assessment · Homework · Attendance · Report Cards` — Report Cards promoted to its own top-level group as designed.                                                                                                                                                                                                                                                                                                                                                                      |
| `/en/report-cards` — consolidated dashboard      | ✅     | Header with "S1" period selector + settings gear. 4 tiles (Generate / Write Comments / Library with "No documents yet" / Teacher Requests). Live run panel showing stuck Phase 1b run from prior session (cleaned up). Analytics snapshot Total 30. Classes by year group.                                                                                                                                                                                                                                      |
| `/en/report-cards` — Teacher Requests tile badge | ✅     | When test teacher request existed: tile showed "1 pending request" + rose Badge. Matches priority feed state.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Wizard Step 1 (class scope)                      | ✅     | Selected 2A, Next enabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Wizard Step 2 — Full Year cards                  | ✅     | Two Full Year cards visible (2025-2026 active + 2024-2025) above S1/S2. Selected S1.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Wizard Step 3 template                           | ✅     | Grades Only selectable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Wizard Step 4 personal info                      | ✅     | Full name checkbox toggles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Wizard Step 5 comment gate                       | ✅     | 25 students in scope, EN 25 · AR 0, blocked by comment gate (as expected), Force-generate toggled.                                                                                                                                                                                                                                                                                                                                                                                                              |
| Wizard Step 6 review                             | ✅     | Scope / Period / Template / Personal Info / Comment check rows all rendered. Generate button.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| API submit `POST /generation-runs`               | ✅     | Returned `batch_job_id`, row created with correct shape.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| BullMQ enqueue → dispatcher → processor          | ✅     | **Phase 1b dispatcher fix verified end-to-end on prod**: worker log showed `[ReportCardGenerationProcessor] Processing report-cards:generate — tenant=3ba9b02c batch=129079ed`. First time ever that a report-card generation job made it through the gradebook queue.                                                                                                                                                                                                                                          |
| **Worker completes the generation run**          | ✅     | **For the first time ever on prod:** `Generation run 129079ed complete — generated=25 blocked=0`. Total duration 54 seconds for 25 students (≈2s per student, dominated by Chromium render). DB row went `queued → processing → completed` with `completed_count=25`, `students_generated_count=25`, `students_blocked_count=0`. Report card row count jumped from 30 → 55 with `pdf_storage_key` populated on all 25 new ones. **End-to-end proof the dispatcher + enum + tx-timeout fixes all work on prod.** |
| `/en/report-cards/[classId]` matrix              | ✅     | Header "2A". Table width 1060px = wrapper width (Bug #2 still fixed). Grade mode: 225 cells, 0 percentage offenders (Bug #1 still fixed).                                                                                                                                                                                                                                                                                                                                                                       |
| `/en/report-cards/library`                       | ✅     | Renders, 0 console errors. "No report cards have been generated yet" text — pre-existing visibility issue (API returns total=0 for admin even though 55 rows exist in DB with pdf_storage_key). Not a Phase 1b/2/3 regression; documented as backlog.                                                                                                                                                                                                                                                           |
| `/en/report-cards/analytics`                     | ✅     | Total 55, Published 0, Completion 0.0%, Comment Fill Rate 0.0%. Zero errors.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `/en/report-cards/requests` (admin)              | ✅     | "Pending review" + "All" tabs only; no "New request" button, no "My requests" tab. Bug #7 still green.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/en/report-cards/settings`                      | ✅     | Loads, zero errors, back button present.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `/en/report-comments`                            | ✅     | Loads, zero errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `/en/report-cards/bulk` (retired)                | ✅     | Redirect stub → `/en/report-cards`. Clean transition, no matrix-error fallthrough.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `/en/report-cards/approvals` (retired)           | ✅     | Redirect stub → `/en/report-cards/requests`. Clean transition.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**Phase 3 — DONE.** Production HEAD: `a1b4f2de`. Phases 1a + 1b + dispatcher fix + Phase 2 + 3 hotfixes all landed. Five commits shipped since the prior deploy: `46ff5814` (docs), `b2392e45` (dispatcher), `a8b31af4` (Phase 2), `3d5d5206` (loose ends), `c7133398` (enum+tx hotfix), `a1b4f2de` (redirect stubs). None pushed to `origin/main`. Pre-deploy backup at `/opt/edupod/backups/predeploy/predeploy-20260410-06*.dump`. Rollback tag: `pre-deploy-report-cards-20260410-0709` → `142334a4`.

**New backlog items surfaced during Phase 3:**

- **Library returns 0 for admins even with 55 rows in DB**. `GET /v1/report-cards/library?page=1&pageSize=5` returns `{"data":[],"meta":{"total":0}}` while `SELECT COUNT(*) FROM report_cards WHERE tenant_id = <nhqs>` returns 55 (25 drafts with pdf_storage_key, 30 older drafts without). The query in `listReportCardLibrary` filters only by `tenant_id` and `status != 'superseded'`, so it should match. RLS is fine (edupod_app can see all 55 with `app.current_tenant_id` set). API access log shows `tenant_id: null` and `user_id: null` on the library request — suggesting the access-log interceptor runs before tenant resolution, but the RLS middleware may also be failing to resolve the tenant context on this specific route. Needs deeper debugging; not a Phase 1b/2/3 regression (was broken before).
- **AuditLogWriteProcessor floods worker stderr with `invalid input syntax for type uuid: ""`**. Every API mutation (login, report-card generation, etc.) enqueues an audit log job, and every one fails because `user_id` is an empty string somewhere in the payload. Rate is ~1/sec on an active system. Doesn't crash anything, but makes debugging harder and pollutes logs. Separate from report-cards work.
- **Deploy script `restore_pm2_services()` bug recurs**. When the script is invoked as `edupod`, it tries to `sudo -u "$PM2_USER"` inside `restore_pm2_services`, which fails because `edupod` isn't in sudoers. Both sessions (2 + 5) had to manually restart PM2 as root. Either refactor the script to detect the calling user or always run as root. Estimated 20 LOC fix.
- **Missing Chromium on server for edupod user** — turned out to be non-issue (edupod has `/home/edupod/.cache/puppeteer/chrome/linux-131.0.6778.204` from a prior setup). Still worth documenting: the Puppeteer download happens at `pnpm install` time, but the cache location is per-user, so switching users breaks it. Deploy script should run `pnpm install` as the final runtime user (edupod), not root.

**Backlog items surfaced during Phase 1b (not Phase 1b scope, deferred):**

- **🔴 PRE-EXISTING BUG — Gradebook queue has 5 competing `@Processor` classes silently dropping jobs.** Surfaced when verifying the full-year wizard flow on production. Five classes register `@Processor(QUEUE_NAMES.GRADEBOOK)`: `ReportCardGenerationProcessor`, `ReportCardAutoGenerateProcessor`, `MassReportCardPdfProcessor`, `BulkImportProcessor`, `GradebookRiskDetectionProcessor`. Each one creates its own `new Worker(...)` (verified in `@nestjs/bullmq/dist/bull.explorer.js` line 78–86), so all five compete for jobs on the same queue. When a worker pulls a job whose `name` doesn't match its expected job, the standard pattern is `if (job.name !== EXPECTED) return;` — and a normal return marks the job **completed** in BullMQ. Net result: a `report-cards:generate` job has only ~20% chance of being picked up by the right processor; the other 80% of the time, it's silently completed by an unrelated worker. **Verified on production**: a full-year batch_job row was created with the correct shape (`is_full_year=t`, `academic_year_id` populated, 25 students), the BullMQ job was found in the queue with `state: completed`, `attemptsMade: 1`, `failedReason: undefined`, but the database row stayed at `status: queued, completed_count: 0` because no `[ReportCardGenerationProcessor]` log line ever appeared. This bug pre-dates Phase 1b — the per-period generation path has the same 80% silent-drop rate, but Phase 1a verification only walked the wizard up to Step 5 dry-run and never actually clicked Generate, so the bug went unnoticed. **Fix options (choose one in a follow-up):**
  1. **Consolidate (cleanest)** — replace the 5 `@Processor(GRADEBOOK)` classes with ONE `GradebookQueueDispatcher` that owns the decorator and routes by `job.name` to the existing logic (the 5 classes become `@Injectable` services that the dispatcher calls). 5 file changes + 1 new file. Eliminates the bug structurally.
  2. **Throw on mismatch + retry budget** — change the early-return guards to `throw new Error('JOB_NAME_MISMATCH')` and bump `attempts: 30` on the API enqueue + `attempts: 30` on every cron registration. BullMQ retries → over 30 attempts the right worker eventually gets it (~99.8%). Smaller diff but generates noise (~24 failed-then-retried log entries per real job).
  3. **Use distinct queues per processor** — biggest refactor; touches API enqueue sites, all 5 processors, queue constants, and the canary monitoring config. Cleanest long-term but largest blast radius.
  - **Recommended:** Option 1. Estimated ~150 LOC refactor concentrated in `apps/worker/src/processors/gradebook/`. Same architecture pattern as the canonical NestJS BullMQ docs.
- **Net-new full-year unit/e2e tests.** The existing tests confirm regression of the per-period path; the type system catches structural issues; but the new branches in the worker, generation service, teacher requests reopen, and comment windows resolution don't have their own happy-path tests yet. Track for a follow-up: a `report-card-generation.service.spec.ts` full-year scenario, a `report-card-teacher-requests.service.spec.ts` full-year reopen atomic check, an RLS leakage spec for full-year rows, and a frontend e2e in Phase 3.
- **Approval config period/year scoping.** Q2's plan to add `(tenant_id, academic_year_id, NULL period_id)` columns to `ReportCardApprovalConfig` was not implemented — the existing `is_active` flag on a tenant-level config still works for both per-period and full-year runs. If the user later wants distinct approval workflows per scope, schema work + a settings UI change is needed.
- **WIP Q4 dedup unique index plan was wrong.** `ReportCard` has no `class_id` column, so the proposed `uniq_report_card_period ON (class_id, ...)` couldn't be created. Application-level dedup in the worker `findFirst` still prevents duplicates and now branches on period vs year. If duplicate prevention proves insufficient under load, a different unique key (e.g. `(student_id, period_id, template_id, locale)`) could be added later.
- **`buildReportCardStorageKey` helper not extracted.** The single construction site at `report-card-generation.processor.ts:388` was inlined with a branch instead of extracted to a helper. If a second construction site is added later, extracting then makes more sense.
- **`computeYearOverview` not used by the worker.** The worker's full-year branch implements its own simple-mean aggregation across periods, matching the existing weighted-average shape it already uses for per-period runs. The user mentioned "our gradebook already has 'all period' grade information/grades" which is `computeYearOverview` in the API; the worker can't import it directly across the API/worker boundary, and pulling the logic into `packages/shared` would be a useful refactor if/when the aggregation needs period weighting. Current behaviour: equal-weight mean across periods.

---

## 8. Files touched so far (Session 2)

- `apps/web/src/app/[locale]/(school)/report-cards/generate/_components/wizard/step-5-comment-gate.tsx` — envelope fix
- `apps/web/src/app/[locale]/(school)/report-comments/overall/[classId]/page.tsx` — envelope fixes (5 sites)
- `apps/web/src/app/[locale]/(school)/report-cards/generate/_components/wizard/step-1-scope.tsx` — label by mode
- `apps/web/src/app/[locale]/(school)/report-cards/generate/_components/wizard/step-2-period.tsx` — stopgap "Coming soon" card
- `apps/web/messages/en.json` — new i18n keys (`classesSelected`, `yearGroupsSelected`, `periodAll`, `periodAllHint`)
- `apps/web/messages/ar.json` — same new i18n keys in Arabic
- `apps/api/src/modules/gradebook/report-cards/report-cards-queries.service.ts` — `subjectScaleMap` + `buildMatrixCells` grade derivation

No files have been committed yet. `git status` will show all of the above as modified.

---

## 9. Reference

### 9.1 Useful endpoints

| Endpoint                                                                 | Purpose                                                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------- |
| `GET /api/v1/report-cards/classes/:classId/matrix?academic_period_id=<id | all>`                                                                        | Class matrix for report cards landing drill-in |
| `GET /api/v1/academic-periods?pageSize=50`                               | Wizard Step 2 period list                                                    |
| `GET /api/v1/classes?pageSize=200`                                       | Wizard Step 1 class list (homeroom_only flag supported; pageSize cap is 500) |
| `GET /api/v1/year-groups?pageSize=100`                                   | Wizard Step 1 year group list                                                |
| `GET /api/v1/students?search=<q>&pageSize=20&status=active`              | Wizard Step 1 individual student search                                      |
| `GET /api/v1/report-card-tenant-settings`                                | Settings page load + wizard defaults                                         |
| `PATCH /api/v1/report-card-tenant-settings`                              | Settings page save                                                           |
| `GET /api/v1/report-cards/templates/content-scopes`                      | Wizard Step 3 template list                                                  |
| `POST /api/v1/report-cards/generation-runs/dry-run`                      | Step 5 comment gate check                                                    |
| `POST /api/v1/report-cards/generation-runs`                              | Step 6 submit                                                                |
| `GET /api/v1/report-cards/generation-runs/:id`                           | Polling for live-run status                                                  |
| `GET /api/v1/report-cards/library?...`                                   | Library listing                                                              |
| `GET /api/v1/report-cards/analytics?academic_period_id=<id>`             | Analytics (needs a period filter or it 400s)                                 |
| `GET /api/v1/report-card-teacher-requests`                               | Requests list (all / pending)                                                |
| `GET /api/v1/report-card-teacher-requests/pending?pageSize=1`            | Pending count for the priority card                                          |
| `POST /api/v1/report-card-teacher-requests`                              | Create a request (teacher-only)                                              |
| `GET /api/v1/report-comment-windows/active`                              | Active comment window lookup                                                 |
| `POST /api/v1/report-comment-windows`                                    | Admin opens a window                                                         |
| `POST /api/v1/report-card-overall-comments`                              | Save/upsert an overall comment                                               |
| `PATCH /api/v1/report-card-overall-comments/:id/finalise`                | Finalise                                                                     |
| `PATCH /api/v1/report-card-overall-comments/:id/unfinalise`              | Unfinalise                                                                   |

### 9.2 Test commands

```bash
# Run report-card tests only (fast)
cd /Users/ram/Desktop/SDB
pnpm --filter @school/api test -- report-cards
pnpm --filter @school/web test -- report-cards
pnpm --filter @school/shared test -- report-cards

# Full affected suite (slow but the mandatory gate per CLAUDE.md)
turbo test --filter=@school/api --filter=@school/web --filter=@school/shared

# Type check
turbo type-check
# OOM: NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit

# Lint
turbo lint
```

### 9.3 Production deploy flow (hard rules)

- Primary server: `root@46.62.244.139`
- App lives at `/opt/edupod/app` owned by `edupod:edupod` (chown if needed; do NOT leave root-owned files)
- PM2 processes run as the `edupod` user, not root
- Ports: api=3001, web=5551, worker=5556
- **Never push to `origin/main`** during this iteration cycle — the user is keeping the CI nightly gate clean
- Deploy flow:
  1. Tag locally: `git tag pre-deploy-report-cards-<yyyymmdd-hhmm>`
  2. Create bundle: `git bundle create /tmp/rc-deploy.bundle <server_head>..<local_head>`
  3. `scp /tmp/rc-deploy.bundle root@46.62.244.139:/tmp/`
  4. SSH, `cd /opt/edupod/app`, `sudo -u edupod git fetch /tmp/rc-deploy.bundle <local_head>`, `sudo -u edupod git reset --hard <local_head>`
  5. `DEPLOY_SHA=<local_head> sudo -u edupod bash scripts/deploy-production.sh`
  6. Wait for smoke tests to pass at the end of the script
- **Do NOT update tenant_domain records** or any other production DB data without explicit approval
- **Do NOT change credentials** without explicit approval
- **Do NOT upgrade packages on the server** — version control flows from the codebase
- **The nhqs tenant is reached at `nhqs.edupod.app` or the root `edupod.app` — NEVER `nurul-huda.edupod.app`**

### 9.4 Rollback tags / backup paths

- Rollback tag format: `pre-deploy-report-cards-<yyyymmdd-hhmm>`
- DB pre-deploy backup: `/opt/edupod/backups/predeploy/predeploy-<yyyymmdd-hhmmss>.dump`
- Restore: `pg_restore -d edupod_prod /opt/edupod/backups/predeploy/<dump>` (verify DB name)

---

## 10. Gotchas / things that WILL bite you if you don't read this

1. **Envelope interceptor.** Any single-object response is wrapped in `{ data: T }`. Any response that already has `data` (paginated lists) is passed through untouched. If you type an `apiClient<T>` as the inner shape when the backend wraps it, you get `undefined.X` at runtime. When in doubt, type as `{ data: T }` and read `res.data`. Half of this feature's bugs are this mistake.

2. **`academic_period_id` is NOT NULL until Phase 1b.** Every INSERT and every query predicate assumes it's a string. Phase 1b migration is the ONLY place you touch this. Do not partially-nullify it in Phase 1a or Phase 2.

3. **Phase 1b migration is the point of no return.** Once a full-year report card is generated (period_id = null), rolling back the schema requires backfilling or deleting those rows. Tag + backup before deploying Phase 1b.

4. **RLS — never `$executeRawUnsafe` outside the middleware.** All tenant-scoped writes go through `createRlsClient().$transaction()`. Reads use `this.prisma.model.findX({ where: { tenant_id } })` directly.

5. **Logical CSS properties only.** `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `text-end`, `rounded-s-`, `rounded-e-`, `border-s-`, `border-e-`. NEVER `ml-`, `mr-`, `left-`, `right-`, `text-left`, etc. There's a lint rule and it WILL fail CI.

6. **Interactive transactions only.** `prisma.$transaction(async (tx) => { ... })`. Never the sequential/batch `prisma.$transaction([...])` API — there's an ESLint rule and it will fail the lint step.

7. **Bilingual i18n is mandatory.** Every new `t('key')` must have corresponding entries in BOTH `apps/web/messages/en.json` AND `apps/web/messages/ar.json`. Missing Arabic keys will show the raw key at runtime.

8. **Full regression tests are mandatory before commit** per `CLAUDE.md`. `turbo test` must pass. Do NOT skip with `--no-verify`.

9. **Screenshots are forbidden** during Playwright verification. Use `browser_snapshot` (accessibility tree) only. The user explicitly rejected screenshots as output.

10. **Back buttons, not browser back.** Every sub-page gets an explicit "Back to Report Cards" Button in its header actions. Do not rely on the browser back stack.

11. **`/report-cards/bulk` and `/report-cards/approvals` are on the chopping block.** Don't waste time fixing them in Phase 1a — they're being deleted in Phase 2. The Phase 1a approvals "fix" is just redirect/noop.

12. **The Phase 1a stopgap card in Step 2 MUST be removed in Phase 1b.** Don't leave the "Coming soon" card around after the real implementation lands.

13. **`computeYearOverview` at `period-grade-computation.service.ts:569` is the canonical full-year data source.** Do not rewrite the aggregation logic in the report-card generation service — delegate to this method. The user explicitly pointed out "our gradebook already has 'all period' grade information/grades" — this is what they meant.

14. **Do not regress the classes endpoint pageSize cap.** Previous session raised it from 100 → 500 in `apps/api/src/modules/classes/classes.controller.ts`. The wizard's class list depends on this. Also `homeroom_only` was added to the query schema there — don't strip it.

15. **Do not touch the ResponseTransformInterceptor.** It is the source of the envelope wrapping. Changing it to not wrap would break every frontend call site that ALREADY accounts for the wrapping (including the fixes in this session). Fix the frontend instead.

---

## 11. How to resume this work

If you're an incoming session and this doc is all you have:

1. Read sections 1–5 to get full context.
2. Read section 7 (Implementation log) to see what's done.
3. Find the current phase in section 6 and pick the next unchecked task.
4. Update section 7 as you go — mark tasks done, note any new findings, log any unexpected issues.
5. When you finish a phase, update section 7 to mark it complete and move to the next phase.
6. Before committing, run `turbo test` and `turbo type-check`. Do NOT skip these gates.
7. Before deploying, tag + backup. Don't push to origin/main.
8. After deploying, verify on prod with Playwright snapshots as Yusuf Rahman.

Good luck. The design is solid, the root causes are well-understood, and the user has been explicit about their preferences. The only genuinely hard work is Phase 1b — be deliberate about it, don't try to speedrun the migration, and lean on `computeYearOverview` for the aggregation instead of writing new math.
