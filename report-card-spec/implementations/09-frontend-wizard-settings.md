# Implementation 09 — Frontend Generation Wizard & Settings

**Wave:** 3 (frontend fan-out)
**Depends on:** 01, 03, 04
**Blocks:** nothing
**Can run in parallel with:** 07, 08, 10
**Complexity:** high (multi-step wizard + configurable fields + file upload)

---

## 1. Purpose

Build the admin-facing generation wizard and the Report Card Settings page. The wizard is a multi-step flow for launching generation runs with scope, period, template, field configuration, and comment-gate validation. The settings page lets the principal configure tenant defaults and upload their signature.

**Authoritative design:** `report-card-spec/design-spec.md` Sections 7, 13, 15.

---

## 2. Scope

### In scope

1. `/[locale]/(school)/report-cards/generate/page.tsx` — multi-step wizard
2. `/[locale]/(school)/report-cards/settings/page.tsx` — tenant settings form + signature upload
3. Step components for the wizard
4. Polling UI for in-progress runs
5. Translation keys
6. E2E tests for both pages

### Out of scope

- Wizard backend (impl 04)
- Settings backend (impl 03)
- PDF template (impl 11)
- Comments/requests pages (impls 08, 10)

---

## 3. Prerequisites

1. Impl 01 merged (Zod types)
2. Impl 03 merged (settings endpoints + template listContentScopes)
3. Impl 04 merged (generation endpoints: dry-run, start, status)

---

## 4. Task breakdown

### 4.1 Generation wizard page

**File:** `apps/web/src/app/[locale]/(school)/report-cards/generate/page.tsx`

**Permission gate:** requires `report_cards.manage`. If the user lacks it, redirect to `/report-cards` with a toast.

**State shape:**

```ts
interface WizardState {
  step: 1 | 2 | 3 | 4 | 5 | 6;
  scope: {
    mode: 'year_group' | 'class' | 'individual' | null;
    ids: string[];
  };
  academicPeriodId: string | null;
  contentScope: 'grades_only' | null;
  personalInfoFields: PersonalInfoFieldKey[];
  commentGate: {
    dryRunResult: DryRunResult | null;
    overrideCommentGate: boolean;
  };
  submittingRun: boolean;
  runId: string | null;
  runStatus: 'pending' | 'running' | 'completed' | 'partial_success' | 'failed' | null;
}
```

### 4.2 Wizard step components

Each step is its own component under `_components/wizard/`:

**Step 1 — Scope selection** (`_components/wizard/step-1-scope.tsx`)

- Three radio-card options: Year group / Class / Individual
- Depending on selection, show a multi-select:
  - Year group: load year groups via `apiClient`, present as checkboxes grouped
  - Class: load classes, present as grouped multi-select with year group headers
  - Individual: search input with autocomplete, student chips below
- Live "X students selected" count
- "Next" disabled until at least 1 is selected

**Step 2 — Period selection** (`_components/wizard/step-2-period.tsx`)

- Load `/v1/academic-periods`
- Radio list
- "Full year" option at the top

**Step 3 — Template selection** (`_components/wizard/step-3-template.tsx`)

- Load `/v1/report-card-templates/content-scopes` (impl 03)
- Render as cards: one per content scope
- Available scopes are selectable; unavailable ones show "Coming soon" badge and are disabled
- For v1, only `grades_only` is selectable

**Step 4 — Personal info fields** (`_components/wizard/step-4-fields.tsx`)

- Load tenant settings `default_personal_info_fields`
- Checkbox list of all available field keys
- Pre-check the defaults
- Group into logical sections: Identity, Dates, Academic, Media
- Live preview panel showing the selected fields

**Step 5 — Comment gate dry-run** (`_components/wizard/step-5-comment-gate.tsx`)

- On entry, automatically `POST /v1/report-cards/generation-runs/dry-run` with the wizard's current selections
- Loading state while waiting
- Show the result:
  - Total students in scope
  - Language breakdown (X English reports + Y Arabic reports)
  - Missing subject comments list (collapsible, grouped by student)
  - Missing overall comments list
  - Unfinalised comments list
- If `would_block`:
  - Show a prominent warning
  - If tenant allows force-generate, show a "Force-generate anyway" checkbox with a strong warning
- If no issues, show green checkmark and brief summary

**Step 6 — Review & submit** (`_components/wizard/step-6-review.tsx`)

- Summary of all selections from steps 1-5
- "Back" button to previous step
- "Generate" button:
  - Disabled if `would_block` and not overridden
  - On click: `POST /v1/report-cards/generation-runs` with the full payload
  - Receives `{ batch_job_id }`
  - Transitions to polling state

**Polling state:**

- After submission, show a progress card
- Poll `GET /v1/report-cards/generation-runs/:id` every 3 seconds
- Show counts as they update: `students_generated_count / total`
- When `status` becomes `completed` / `partial_success` / `failed`:
  - Show the final summary
  - "View library" button → navigate to `/report-cards/library`
  - If errors exist, collapsible list
- Stop polling once terminal state reached

**Navigation guard:** warn on navigation away mid-submission (use `beforeunload` or Next.js router event handling).

### 4.3 Settings page

**File:** `apps/web/src/app/[locale]/(school)/report-cards/settings/page.tsx`

**Permission gate:** `report_cards.view` to view, `report_cards.manage` to edit.

**Form sections (using `react-hook-form` + `zodResolver`):**

1. **Display defaults**
   - Matrix display mode (grade / score) — radio
   - Show top-3 rank badge on the PDF — toggle
2. **Comment gate**
   - Require finalised comments before generation — toggle
   - Allow admin to force-generate — toggle
3. **Default personal info fields**
   - Same checkbox list as wizard Step 4
4. **Template**
   - Default template (dropdown, from `listContentScopes`)
5. **Grade thresholds**
   - Link to the existing grade thresholds page (don't duplicate management here)
6. **Principal details**
   - Principal name (text input)
   - Principal signature (file upload: accept image, preview current signature if set, "Replace" and "Remove" buttons)

**Save behaviour:** single "Save changes" button at the bottom that sends the merged payload via `PATCH /v1/report-card-tenant-settings`. Signature upload is its own endpoint with its own button.

### 4.4 Signature upload component

**File:** `apps/web/src/app/[locale]/(school)/report-cards/settings/_components/signature-upload.tsx`

- Shows current signature if set (load from signed URL)
- "Upload new" button opens file picker
- On file selection: preview locally, "Upload" button calls `POST /v1/report-card-tenant-settings/principal-signature` as `multipart/form-data`
- On success: refresh the signed URL to show the new image
- "Remove" button calls `DELETE`

File validation client-side: PNG/JPG/WebP, max 2MB. The backend enforces this too (impl 03).

### 4.5 Translation keys

Add under `reportCards.wizard` and `reportCards.settings`:

```json
{
  "reportCards": {
    "wizard": {
      "title": "Generate Report Cards",
      "step1Title": "Who are these report cards for?",
      "step2Title": "Which period?",
      "step3Title": "Which template?",
      "step4Title": "Which personal info to include?",
      "step5Title": "Comment check",
      "step6Title": "Review and generate",
      "scopeYear": "Year group",
      "scopeClass": "Class",
      "scopeIndividual": "Individual students",
      "studentsSelected": "{count, plural, one {# student} other {# students}} selected",
      "commentGateOk": "All comments ready.",
      "commentGateBlocked": "Generation blocked. {count} missing or unfinalised comments.",
      "forceGenerateWarning": "Force-generating will produce report cards with blank comment blocks. This bypasses the normal finalisation check.",
      "forceGenerate": "Force-generate anyway",
      "submit": "Generate",
      "submitting": "Starting generation...",
      "runningProgress": "Generating... {done} of {total} students complete",
      "runCompleted": "Generation complete. {count} report cards produced.",
      "runPartial": "Partial success. {done} generated, {blocked} blocked.",
      "runFailed": "Generation failed.",
      "viewLibrary": "View library"
    },
    "settings": {
      "title": "Report Card Settings",
      "displayDefaults": "Display defaults",
      "matrixDisplayMode": "Matrix display mode",
      "showTopRankBadge": "Show top-3 rank badge on PDF",
      "commentGate": "Comment gate",
      "requireFinalisedComments": "Require finalised comments before generation",
      "allowAdminForceGenerate": "Allow admin to force-generate anyway",
      "personalInfoFields": "Default personal info fields",
      "principalName": "Principal name",
      "principalSignature": "Principal signature",
      "uploadSignature": "Upload signature",
      "removeSignature": "Remove",
      "saveChanges": "Save changes",
      "saved": "Settings saved."
    }
  }
}
```

Arabic translations required.

### 4.6 Navigation wiring

Add "Generate" and "Settings" entries to the Report Cards sub-strip (both gated to `report_cards.manage` / `report_cards.view` respectively).

---

## 5. Files to create

- `apps/web/src/app/[locale]/(school)/report-cards/generate/page.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/generate/_components/wizard/step-1-scope.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/generate/_components/wizard/step-2-period.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/generate/_components/wizard/step-3-template.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/generate/_components/wizard/step-4-fields.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/generate/_components/wizard/step-5-comment-gate.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/generate/_components/wizard/step-6-review.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/generate/_components/wizard/polling-status.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/settings/page.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/settings/_components/signature-upload.tsx`
- `apps/web/e2e/report-cards-wizard.spec.ts`
- `apps/web/e2e/report-cards-settings.spec.ts`

## 6. Files to modify

- `apps/web/messages/en.json`, `apps/web/messages/ar.json`
- Nav config

---

## 7. Testing requirements

### 7.1 E2E

**`report-cards-wizard.spec.ts`:**

- Admin navigates to `/en/report-cards/generate`
- Selects scope → period → template → fields
- Comment gate dry-run shows result
- Submits → polling state appears
- Run completes → "View library" button
- Non-admin is redirected away
- Force-generate path works when comments are missing

**`report-cards-settings.spec.ts`:**

- Admin loads settings
- Updates display mode and saves → success toast
- Uploads a signature image → preview updates
- Removes signature → preview clears
- Viewer without manage permission sees read-only state

### 7.2 Regression

```bash
turbo test && turbo lint && turbo type-check && turbo build --filter=@school/web
```

---

## 8. Mobile / RTL checklist

- [ ] Wizard works at 375px — each step is one column, buttons stack
- [ ] Settings page works at 375px
- [ ] File upload input usable on mobile
- [ ] All physical classes replaced with logical
- [ ] Arabic RTL verified
- [ ] Progress/polling UI readable on small screens

---

## 9. Acceptance criteria

1. Wizard flows through all 6 steps
2. Dry-run step calls backend and shows result
3. Comment gate blocking behaviour works
4. Generation submission and polling work end-to-end with real backend
5. Settings page displays and saves all fields
6. Signature upload/remove works
7. Non-admin users cannot access wizard or modify settings
8. Arabic RTL renders
9. Mobile usable
10. E2E tests pass
11. `turbo test/lint/type-check/build` green
12. Log entry added

---

## 10. Architecture doc update check

| File | Decision           |
| ---- | ------------------ |
| All  | NO — frontend only |

---

## 11. Completion log stub

```markdown
### Implementation 09: Frontend Generation Wizard & Settings

- **Completed at:** YYYY-MM-DD HH:MM
- **Completed by:** <agent>
- **Branch / commit:** `<branch>` @ `<sha>`
- **Status:** ✅ complete
- **Summary:** Built 6-step generation wizard with comment-gate dry-run and polling, plus the tenant settings page with principal signature upload. All admin-gated.

**What changed:**

- Wizard page + 7 step components + polling component
- Settings page + signature upload component
- Translation keys
- 2 E2E tests

**Test coverage:**

- E2E: wizard flow (happy path + force-generate + non-admin) + settings
- `turbo test/lint/type-check/build`: ✅

**Blockers or follow-ups:**

- Once impl 11 lands the real PDF template, the wizard will produce visually polished PDFs
```

---

## 12. If you get stuck

- **Multi-step wizard state management:** keep it in a single top-level `useReducer` state object. Do NOT use context or a state library for this — it's a single page's state.
- **Polling and cleanup:** use `setInterval` inside a `useEffect`, clear on unmount, and also clear when the status reaches a terminal state.
- **File upload with `react-hook-form`:** search for an existing file upload form (student photo, tenant logo) and follow its pattern.
