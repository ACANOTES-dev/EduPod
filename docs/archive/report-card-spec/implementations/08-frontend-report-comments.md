# Implementation 08 — Frontend Report Comments

**Wave:** 3 (frontend fan-out)
**Depends on:** 01 (schema), 02 (comment system backend)
**Blocks:** nothing
**Can run in parallel with:** 07, 09, 10
**Complexity:** high (new UX surface + strict window gating + AI draft flow)

---

## 1. Purpose

Build the Report Comments pages: landing for teachers and admins showing their teaching assignments, the 3-column editor for writing subject comments, the overall comment editor for homeroom teachers, and the admin control for opening/closing/extending/reopening comment windows.

**Authoritative design:** `report-card-spec/design-spec.md` Sections 8, 9.

---

## 2. Scope

### In scope

1. New route tree `/[locale]/(school)/report-comments/`
   - `page.tsx` — landing with cards grouped by year group + window banner
   - `subject/[classId]/[subjectId]/page.tsx` — 3-column subject comment editor
   - `overall/[classId]/page.tsx` — overall comment editor (homeroom)
2. Window banner component (open/closed states)
3. Admin controls: open window modal, close/extend/reopen buttons in the page header
4. AI draft integration — per-row button + bulk-draft-all
5. Teacher request shortcut: "Request window reopen" button in closed-state banner
6. Translation keys
7. E2E tests

### Out of scope

- Teacher request submission UI beyond the shortcut button (the full request form lives in impl 10)
- Window state machine logic (already enforced backend-side in impl 02)
- AI prompting logic (handled server-side in impl 02)

---

## 3. Prerequisites

1. Impl 02 merged — all comment endpoints available
2. Impl 01 merged — Zod types available
3. Familiarity with `apps/web/src/app/[locale]/(school)/gradebook/[classId]/results-matrix.tsx` for the data patterns
4. Verify: do teachers have a way to see their assigned classes? There should be an endpoint like `/v1/teaching-assignments` or similar. If not, the landing page can list all classes the user has access to and filter by "I am a subject teacher" — verify via grep.

---

## 4. Task breakdown

### 4.1 Landing page

**File:** `apps/web/src/app/[locale]/(school)/report-comments/page.tsx`

**Data to load:**

1. `GET /v1/report-comment-windows/active` → the current open window (or null)
2. List of teaching assignments for the current user:
   - If an open window exists, the period is taken from the window
   - If no open window, fall back to the most recent closed window for display purposes, or show "No comment activity yet"
3. For each (class × subject) assignment the user teaches for the window's period, count finalised/total subject comments via `GET /v1/report-card-subject-comments?class_id=X&subject_id=Y&academic_period_id=P`
4. If the user is a homeroom teacher, also load the overall comment progress for their homeroom via `GET /v1/report-card-overall-comments?class_id=X&academic_period_id=P`

**Layout:**

1. **Window banner** (always visible at top of content):
   - Open state: green-tinted panel with the period name, "Closes at [date]", any admin instructions, and (for admins only) "Close window" / "Extend" buttons
   - Closed state: muted panel with "Comments are currently locked. Next window: [scheduled if any] or [none planned]." For teachers: "Request window reopen →" button. For admins: "Open new window" button.
2. **Admin-only toolbar** (only if `report_cards.manage`):
   - "Open new window" button (visible when no open window)
   - "Close now" / "Extend" buttons (visible when open window exists)
3. **Homeroom card** (only for homeroom teachers, positioned above subject cards):
   - Title "Overall comments — [class name]"
   - Progress: "5 / 24 finalised"
   - Click → navigate to `/[locale]/report-comments/overall/[classId]`
4. **Subject assignment cards** grouped by year group (same visual grammar as the gradebook/report-cards landing):
   - Title: subject name
   - Subtitle: class name
   - Period name
   - Progress bar with "N / M finalised"
   - Click → navigate to `/[locale]/report-comments/subject/[classId]/[subjectId]`
   - Grey/disabled styling when window is closed (still clickable — read-only view)

### 4.2 Open window modal (admin)

**Component:** `apps/web/src/app/[locale]/(school)/report-comments/_components/open-window-modal.tsx`

Form with:

- Academic period (required, select)
- Opens at (datetime-local, defaults to "now")
- Closes at (datetime-local, required)
- Instructions (textarea, optional)

Uses `react-hook-form` + `zodResolver` with the `openCommentWindowSchema` from `@school/shared`.

On submit: `POST /v1/report-comment-windows`. On success: close modal, refresh page data.

### 4.3 Subject comment editor (3 columns)

**File:** `apps/web/src/app/[locale]/(school)/report-comments/subject/[classId]/[subjectId]/page.tsx`

**Data to load:**

1. Active window → period id
2. Class info (name, year group)
3. Subject info (name)
4. Students in the class with their grades for this subject/period (reuse the matrix endpoint from impl 06, or call a simpler per-student endpoint if one exists)
5. Existing subject comments for this (class, subject, period)

**Layout:**

- Header: "English — 2A · Term 1" (subject — class · period)
- Window status chip (open/closed)
- Toolbar:
  - "AI-draft all empty" button (disabled when closed, or when no empty rows)
  - "Finalise all drafts" button (disabled when closed)
  - Filter: all / unfinalised / finalised
- Table (use `DataTable` or custom) with three columns:
  1. **Student** — name + number + photo thumb (placeholder if missing)
  2. **Grade** — score / letter grade (respecting tenant display mode) + small sparkline showing assessment trajectory
  3. **Comment** — inline editable textarea; "AI" badge when the text is untouched from an AI draft; per-row "AI draft" button; per-row "Finalise" / "Unfinalise" button

**Per-row behaviour:**

- Clicking the textarea → editable inline
- Typing → debounce 500ms → `POST /v1/report-card-subject-comments` (upsert) with `is_ai_draft: false`
- Clicking "AI draft" → `POST /v1/report-card-subject-comments/ai-draft` (via impl 02's service, wrapped in a new endpoint if needed — see impl 02 §4.7 for the route; if not exposed, add it now) → receives text → populate the textarea → mark `is_ai_draft: true` via the backend
- Clicking "Finalise" → `PATCH /v1/report-card-subject-comments/:id/finalise` → updates the row state
- Clicking "Unfinalise" → `PATCH .../unfinalise`

**Window closed state:**

- All textareas become `readOnly`
- All buttons disabled
- Banner at the top: "Window closed. Contact principal to request reopening."
- "Request window reopen" link (shortcut to impl 10 submission form)

**Sparkline component:**

- Tiny Recharts line chart or raw SVG — does not need to be elaborate
- Uses the assessment scores in order for the period
- Width ~ 80px, height ~ 24px
- No axes, minimal styling

### 4.4 Overall comment editor

**File:** `apps/web/src/app/[locale]/(school)/report-comments/overall/[classId]/page.tsx`

Simpler than the subject editor:

- Only homeroom teacher + admin can access (enforce via permission check on page mount; backend also enforces)
- Table: student + overall weighted grade + comment textarea
- No AI draft (this is intentional — overall comment is a human task)
- Per-row Finalise / Unfinalise

Same window-gating behaviour.

### 4.5 "Request window reopen" shortcut

When a teacher clicks this button anywhere:

- Open a small modal with a "Reason" textarea (required, ≥ 10 chars)
- Submit: `POST /v1/report-card-teacher-requests` with `request_type: 'open_comment_window'`, `target_scope_json: null`, `academic_period_id: <most recent closed window's period>`, `reason: <text>`
- Show a toast on success: "Request submitted. You'll be notified when the principal reviews it."

This is a quick inline form — the full Teacher Requests management page lives in impl 10.

### 4.6 Translation keys

Add to both locales under `reportComments`:

```json
{
  "reportComments": {
    "title": "Report Comments",
    "windowBanner": {
      "open": "Comment window open for {period} — closes {closesAt}.",
      "closed": "Comment window is closed.",
      "instructions": "Principal's note: {instructions}",
      "requestReopen": "Request window reopen",
      "openWindow": "Open new window",
      "closeNow": "Close now",
      "extend": "Extend",
      "reopen": "Reopen"
    },
    "assignmentCard": {
      "progress": "{done} / {total} finalised",
      "period": "Period: {period}"
    },
    "editor": {
      "aiDraftAll": "AI-draft all empty",
      "finaliseAll": "Finalise all drafts",
      "filterAll": "All",
      "filterUnfinalised": "Unfinalised",
      "filterFinalised": "Finalised",
      "studentCol": "Student",
      "gradeCol": "Grade",
      "commentCol": "Comment",
      "aiBadge": "AI draft",
      "finalise": "Finalise",
      "unfinalise": "Unfinalise",
      "aiDraftRow": "AI draft",
      "windowClosedBanner": "This window is closed. Request the principal to reopen it if you need to make changes."
    },
    "requestReopenModal": {
      "title": "Request window reopen",
      "reasonLabel": "Reason",
      "reasonPlaceholder": "Why does the window need to be reopened?",
      "submit": "Submit request",
      "success": "Request submitted. You'll be notified when the principal reviews it."
    }
  }
}
```

### 4.7 Navigation wiring

Add "Report Comments" to the Learning hub sub-strip (permission-gated to `report_cards.comment`). Search the nav config file for the existing Learning hub entries and add the new link.

---

## 5. Files to create

- `apps/web/src/app/[locale]/(school)/report-comments/page.tsx`
- `apps/web/src/app/[locale]/(school)/report-comments/subject/[classId]/[subjectId]/page.tsx`
- `apps/web/src/app/[locale]/(school)/report-comments/overall/[classId]/page.tsx`
- `apps/web/src/app/[locale]/(school)/report-comments/_components/open-window-modal.tsx`
- `apps/web/src/app/[locale]/(school)/report-comments/_components/window-banner.tsx`
- `apps/web/src/app/[locale]/(school)/report-comments/_components/request-reopen-modal.tsx`
- `apps/web/src/app/[locale]/(school)/report-comments/_components/sparkline.tsx`
- `apps/web/e2e/report-comments.spec.ts`

## 6. Files to modify

- `apps/web/messages/en.json`, `apps/web/messages/ar.json`
- Nav config (find via grep for existing Learning hub entries)

---

## 7. Testing requirements

### 7.1 E2E (Playwright)

`report-comments.spec.ts`:

- Teacher lands on `/en/report-comments`
- With an open window fixture: sees the banner with period + close date, sees their assignment cards
- With a closed window fixture: sees the closed banner, cannot type into the editor (readonly), sees "Request window reopen" button
- Teacher clicks a subject assignment card → editor loads with student rows
- Teacher types a comment → debounced save succeeds → row shows "draft" state
- Teacher clicks "AI draft" → AI call fires, textarea fills
- Teacher clicks "Finalise" → row shows finalised state
- Admin opens a new window via the modal → window banner switches to open state
- Admin closes the window → banner switches back to closed
- Arabic RTL: key layouts verified (cards, table, textarea direction)

### 7.2 Regression

```bash
turbo test && turbo lint && turbo type-check && turbo build --filter=@school/web
```

---

## 8. Mobile / RTL checklist

- [ ] Landing works at 375px (cards stack)
- [ ] Subject editor: the 3-column table uses horizontal scroll on narrow screens, with sticky student column
- [ ] Overall editor: same
- [ ] Textareas: `w-full`, `text-base` (16px)
- [ ] All physical directional classes replaced with logical ones
- [ ] Arabic RTL verified
- [ ] Sparkline renders in both directions (use `transform: scaleX(-1)` in RTL if needed — verify visually)

---

## 9. Acceptance criteria

1. Landing page displays window banner + assignment cards grouped by year
2. Open/close/extend/reopen controls visible only to admins and functional
3. Subject editor 3-column layout works end-to-end
4. AI draft button populates the textarea via backend
5. Per-row and bulk finalise work
6. Window closed → editor becomes read-only with no bypass
7. Overall editor works for homeroom teachers
8. "Request window reopen" modal submits teacher requests
9. Arabic RTL renders correctly
10. Mobile usable
11. E2E tests pass
12. `turbo test/lint/type-check/build` green
13. Log entry added

---

## 10. Architecture doc update check

| File                     | Decision           |
| ------------------------ | ------------------ |
| `module-blast-radius.md` | NO — frontend only |
| Others                   | NO                 |

---

## 11. Completion log stub

```markdown
### Implementation 08: Frontend Report Comments

- **Completed at:** YYYY-MM-DD HH:MM
- **Completed by:** <agent>
- **Branch / commit:** `<branch>` @ `<sha>`
- **Status:** ✅ complete
- **Summary:** Built Report Comments landing, 3-column subject editor, overall editor, window banner + admin controls, and inline request-reopen flow. Window gating enforced both server-side and reflected in the UI state.

**What changed:**

- 3 new pages + 4 new components under `/report-comments/`
- Translation keys for en + ar
- Nav wiring for Learning hub
- E2E tests

**Test coverage:**

- E2E: report-comments.spec.ts covers teacher flow, admin flow, closed-window behaviour
- `turbo test/lint/type-check/build`: ✅

**Blockers or follow-ups:**

- The "request window reopen" modal submits teacher requests — the full Teacher Requests management queue lives in impl 10
```

---

## 12. If you get stuck

- **Teaching assignment endpoint unclear:** search the codebase for endpoints like `/v1/teachers/me/assignments` or similar. If none exists, list classes the user can access (via existing permission scoping) and filter client-side by the subjects they teach.
- **AI draft endpoint route unclear:** impl 02 §4.7 defined the service; if the controller wasn't added there, you may need to expose `POST /v1/report-card-subject-comments/ai-draft` as part of this frontend work. Coordinate with whoever did impl 02.
- **Sparkline implementation:** keep it minimal — a `<svg>` polyline with 5-10 points is enough. Don't over-engineer.
