# Implementation 11 — PDF Template Rendering

**Wave:** 4
**Depends on:** 04 (generation backend — render contract must exist)
**Blocks:** 12 (cleanup) optionally; 12 can proceed without 11
**Can run in parallel with:** 12 (cleanup)
**Complexity:** medium-high (visual React-PDF implementation) — **BUT HELD FOR USER-SUPPLIED DESIGN**

---

## 1. Purpose

Implement the production-grade PDF template rendering for the report card. This is the actual visual design, built as a React-PDF component, that consumes the `ReportCardRenderPayload` contract from impl 04 and produces polished PDF bytes in English and Arabic.

**⚠️ HOLD STATE:** this implementation cannot begin until the user provides the visual design. The user has explicitly stated they will design the PDF layout themselves and share it. Until then:

- impl 04's placeholder renderer is in place and all other work can proceed
- This file describes the target state and the steps once the design arrives
- Do NOT begin this implementation without user-supplied design input

**Authoritative design:** `report-card-spec/design-spec.md` Section 16.

---

## 2. Scope (when user unblocks)

### In scope

1. React-PDF components for the English grades-only template: `apps/web/src/report-card-templates/grades-only/en.tsx`
2. React-PDF components for the Arabic grades-only template: `apps/web/src/report-card-templates/grades-only/ar.tsx`
3. Template manifest: `apps/web/src/report-card-templates/grades-only/manifest.json`
4. Shared layout primitives (header, subjects table, comment block, signature block) in `apps/web/src/report-card-templates/_shared/`
5. RTL handling for the Arabic variant (logical properties, mirroring)
6. Font registration (English: per the ux spec; Arabic: a suitable Arabic webfont — Noto Sans Arabic or similar, verify license and embed)
7. Image embedding for the tenant logo and principal signature (both from storage keys, loaded as buffers during rendering)
8. Wiring the production renderer into the worker processor (replaces the placeholder binding in impl 04)
9. Visual regression tests (snapshot or pixel-diff via Playwright)

### Out of scope

- Content-scope templates other than grades-only (future phases)
- Any visual design decisions not supplied by the user

---

## 3. Prerequisites

1. User has provided the visual design (mockup, spec, or reference artifact)
2. Impl 04 merged with the placeholder renderer in place
3. `@react-pdf/renderer` installed and working in the worker environment (verify — it should already be a dependency since the existing report card generation uses it)

---

## 4. Task breakdown (once unblocked)

### 4.1 Read the user's design

1. Obtain the design from the user
2. Identify: layout structure, font choices, colour palette, section hierarchy, spacing, image placements, signature placement, grading scale reference, footer content
3. Clarify any ambiguity BEFORE coding — ask specific questions

### 4.2 Shared primitives

**Directory:** `apps/web/src/report-card-templates/_shared/`

Build reusable components:

- `<PageLayout>` — A4 portrait, logical padding, header/footer slots
- `<Masthead>` — tenant logo + name + academic period + title
- `<StudentIdentityBlock>` — renders the selected personal-info fields gracefully (absent fields simply don't render)
- `<AcademicSummaryStrip>` — three tiles (overall average, overall grade, rank badge)
- `<SubjectsTable>` — one row per subject with score, grade, teacher, remarks
- `<OverallCommentBlock>` — homeroom teacher comment + signature line
- `<GradingScaleFootnote>` — tenant's grade thresholds printed at the bottom
- `<SignatureRow>` — three-slot signature row (homeroom, principal, parent)
- `<Footer>` — contact details + timestamp

### 4.3 English template

**File:** `apps/web/src/report-card-templates/grades-only/en.tsx`

Exports a function `renderEnglish(payload: ReportCardRenderPayload): Promise<Buffer>`.

Composes the shared primitives in the user-supplied layout. Handles:

- Top-3 rank badge rendering (only when `payload.student.rank_badge !== null`)
- Pre-filled principal signature (from `payload.tenant.principal_signature_storage_key` — loaded as bytes)
- Missing-field handling (empty fields → no render, no gaps)
- Subject overflow handling (if subjects don't fit on one page, second page continues the table)

### 4.4 Arabic template

**File:** `apps/web/src/report-card-templates/grades-only/ar.tsx`

Same layout, RTL. Key considerations:

- Use logical properties from React-PDF's style system
- Mirror column order in the subjects table (student-id column moves to the end in RTL? Or stays? — follow user design)
- Arabic font registration
- Date formatting via `Intl.DateTimeFormat('ar', ...)` — Gregorian calendar, Western numerals (per the project's i18n rule)
- Right-to-left paragraph direction for comment text

### 4.5 Manifest

**File:** `apps/web/src/report-card-templates/grades-only/manifest.json`

```json
{
  "id": "grades-only",
  "name": {
    "en": "Grades Only",
    "ar": "الدرجات فقط"
  },
  "content_scope": "grades_only",
  "languages": ["en", "ar"],
  "required_data_sources": ["grades", "subject_comments", "overall_comment", "tenant_settings"],
  "version": "1.0.0"
}
```

### 4.6 Wire into the worker

Replace the placeholder binding in the worker's DI container:

```ts
// apps/worker/src/processors/report-card-generation.module.ts
{
  provide: 'REPORT_CARD_RENDERER',
  useClass: GradesOnlyRenderer, // new production renderer
}
```

The `GradesOnlyRenderer` is a wrapper class that picks `renderEnglish` or `renderArabic` based on `payload.language`.

### 4.7 Visual regression test

**File:** `apps/worker/test/report-card-render.visual.spec.ts`

Approach:

1. Render the English template with a canned payload
2. Write the PDF to a temp file
3. Use `pdf-parse` or similar to extract text and assert key phrases are present ("Report Card", student name, each subject name, "Term 1", etc.)
4. For visual regression: use Playwright with `pdf2image` or snapshot the PDF buffer as a base64 string and compare to a checked-in snapshot
5. Repeat for Arabic

The text-extraction approach is more stable than pixel diffs and catches most regressions.

---

## 5. Files to create

- `apps/web/src/report-card-templates/grades-only/en.tsx`
- `apps/web/src/report-card-templates/grades-only/ar.tsx`
- `apps/web/src/report-card-templates/grades-only/manifest.json`
- `apps/web/src/report-card-templates/_shared/*.tsx` (multiple)
- `apps/web/src/report-card-templates/_shared/fonts/*.ttf` (font files if embedding)
- `apps/worker/src/processors/grades-only-renderer.ts` (wrapper class)
- `apps/worker/test/report-card-render.visual.spec.ts`

## 6. Files to modify

- `apps/worker/src/processors/report-card-generation.module.ts` — swap placeholder for production renderer
- `apps/worker/src/processors/report-card-render.placeholder.ts` — keep for fallback, mark as dev-only in comments

---

## 7. Testing requirements

### 7.1 Unit / visual tests

- Text extraction: assert key content present for both languages
- Missing-field handling: render with a payload that has no photo, no signature, no rank badge — assert no errors and no empty boxes
- Top-3 rank: render with rank_badge 1, 2, 3, null — assert badge appears correctly or not at all
- Long subject list: render with 12 subjects — assert second page renders
- Long comments: render with very long overall comment — assert text wraps, no overflow

### 7.2 Integration

After wiring, re-run impl 04's generation e2e tests with the production renderer. PDFs should now look production-quality.

### 7.3 Regression

```bash
turbo test && turbo lint && turbo type-check && turbo build
```

---

## 8. Security checklist

- [ ] Fonts are licensed appropriately for commercial use (verify before embedding)
- [ ] Tenant logo and signature loading happens tenant-scoped (no cross-tenant data)
- [ ] No PII leaked in logs during rendering
- [ ] Render failures do not crash the whole batch — errors propagate up to impl 04's per-student error handler

---

## 9. Acceptance criteria

1. English and Arabic templates produce visually polished PDFs matching the user's design
2. All `ReportCardRenderPayload` fields are handled correctly
3. Missing fields render gracefully
4. Top-3 rank badges render correctly
5. Signatures render correctly
6. Arabic RTL layout is correct
7. Visual regression tests pass
8. `turbo test/lint/type-check/build` green
9. Log entry added
10. User signs off on the visual result

---

## 10. Architecture doc update check

| File                     | Decision                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `module-blast-radius.md` | NO — internal to the worker                                                                                                      |
| `event-job-catalog.md`   | Update the `report-card:generate` entry to note the production renderer is now in use                                            |
| `state-machines.md`      | NO                                                                                                                               |
| `danger-zones.md`        | **Consider:** "PDF rendering fonts are embedded at build time. Font file replacements require a redeploy, not a data migration." |

---

## 11. Completion log stub

```markdown
### Implementation 11: PDF Template Rendering

- **Completed at:** YYYY-MM-DD HH:MM
- **Completed by:** <agent>
- **Branch / commit:** `<branch>` @ `<sha>`
- **Status:** ✅ complete
- **Summary:** Implemented production English + Arabic grades-only templates matching user-supplied visual design. Wired into worker, replaced placeholder. Visual regression tests cover critical cases.

**What changed:**

- `apps/web/src/report-card-templates/grades-only/{en,ar}.tsx`
- Shared layout primitives in `_shared/`
- Arabic font embedded
- Worker DI swap
- Visual regression tests

**Test coverage:**

- Visual: text extraction + snapshot for both languages
- Integration: impl 04's e2e tests re-run with production renderer
- `turbo test/lint/type-check/build`: ✅

**Architecture docs updated:**

- `docs/architecture/event-job-catalog.md` — updated renderer note
- `docs/architecture/danger-zones.md` — added font replacement note

**Blockers or follow-ups:**

- Future content-scope templates (grades+homework, etc.) will reuse the shared primitives
- Impl 12 can now proceed with final cleanup

**Notes:**

- Arabic font file: <name>, <license>, <size>
- Visual regression snapshots checked in under `apps/worker/test/__snapshots__/`
```

---

## 12. If you get stuck (when finally unblocked)

- **React-PDF RTL unclear:** check React-PDF docs for `direction` prop on the root Document/Page. For complex layouts, apply RTL at the View level with `flexDirection: 'row-reverse'`.
- **Arabic shaping issues:** ensure the font file includes Arabic glyphs and that text is passed as a single string, not split into spans (React-PDF joins correctly if fed whole strings).
- **Font licensing:** do not ship a font without a commercial license. Noto Sans Arabic (SIL OFL), Cairo, or Tajawal are common open-source choices.
- **Visual mismatch with user design:** iterate. The user will review the output and request adjustments. Plan for 2-3 rounds of visual refinement.
