# Implementation 13 — Gradebook Full Enforcement

> **Phase:** 3 — Wave W3 (full enforcement pass)
> **Wave:** W3 (largest spec in the wave; 14 controllers + 5 processors)
> **Depends on:** W1 (01–08); W2 impl 11 (AI gating layer covers gradebook AI)
> **Deploys:** API restart + worker restart + web rebuild
> **Model:** Opus 4.7 / **Max effort** (largest API surface; report-card cron has external S3 side effects)

---

## Goal

Wire `@ModuleEnabled('gradebook')` enforcement across the entire gradebook surface — 14 controllers, 5 cron processors, frontend nav for gradebook, report-cards, report-comments, transcripts. After this ships, toggling `gradebook` off cleanly hides all academic assessment UI and prevents auto-generated report cards from being produced for that tenant.

---

## Critical safety constraints

- **In-flight report-card generation jobs may complete** (we don't kill in-flight). The resulting PDFs land in S3 but are inaccessible via the gated `/transcripts` and `/report-cards` endpoints. Acceptable; documented in STRATEGY §8 Scenario D.
- **AI grading paths**: gradebook AI (e.g., AI comments, AI grading suggestions) was gated in impl 11 under `ai_functions`. This spec's `gradebook` gating is the OUTER gate. Both must pass for an AI grading request to proceed: `gradebook` enabled (this spec) AND `ai_functions` enabled (impl 11).
- **Parent gradebook (`parent-gradebook.controller.ts`) gates same as admin.** When gradebook is off, parents lose access to their student's grades view. Document this — schools should expect to communicate the disable to parents in advance.

---

## Files to modify

### Controllers (add `@ModuleEnabled('gradebook')` + `ModuleEnabledGuard`)

All 14 controllers under `apps/api/src/modules/gradebook/`:

- `assessment-categories.controller.ts`
- `gradebook-advanced.controller.ts`
- `gradebook-insights.controller.ts`
- `gradebook.controller.ts`
- `grading-scales.controller.ts`
- `parent-gradebook.controller.ts`
- `transcripts.controller.ts`
- `report-card-overall-comments.controller.ts`
- `report-card-subject-comments.controller.ts`
- `report-card-teacher-requests.controller.ts`
- `report-card-tenant-settings.controller.ts`
- `report-cards-enhanced.controller.ts`
- `report-cards.controller.ts`
- `report-comment-windows.controller.ts`

### Worker processors (Pattern B — top-of-process check)

- `apps/worker/src/processors/gradebook/gradebook-risk-detection.processor.ts`
- `apps/worker/src/processors/gradebook/report-card-auto-generate.processor.ts`
- `apps/worker/src/processors/gradebook/report-card-generation.processor.ts`
- `apps/worker/src/processors/gradebook/mass-report-card-pdf.processor.ts`
- `apps/worker/src/processors/gradebook/s3-report-card-storage-writer.ts`

For all 5: top of `process()`, check `TenantModuleService.isEnabled(tenant_id, 'gradebook')`. If disabled: log skip, return success. The cron-dispatcher (one level up) MAY also do a Pattern A skip — recommended for `report-card-auto-generate` since it's a fan-out by nature.

### Frontend — nav annotations

- `nav.gradebook` (and sub-entries: `/gradebook/class/:classId`, `/gradebook/settings`, `/gradebook/analytics`) → `moduleKey: 'gradebook'`
- `nav.reportCards` (and sub-entries) → `moduleKey: 'gradebook'`
- `nav.reportComments` → `moduleKey: 'gradebook'`
- `nav.transcripts` (if present) → `moduleKey: 'gradebook'`
- Parent portal `/parent/gradebook` (and any subroutes for student grade viewing) → `moduleKey: 'gradebook'`

### Tests

- Un-skip the `gradebook` block in `module-gating-leakage.e2e-spec.ts`. Add probes covering several controllers:
  - `GET /api/v1/gradebook/grades` → 404 MODULE_DISABLED
  - `GET /api/v1/report-cards` → 404 MODULE_DISABLED
  - `GET /api/v1/transcripts` → 404 MODULE_DISABLED
- Worker test: enqueue `report-card-auto-generate` for a disabled tenant; verify silent return + ack; verify no S3 PDF created.

---

## Acceptance

- [ ] All 14 controllers gated; static-analysis test passes.
- [ ] All 5 worker processors have the Pattern B check.
- [ ] Frontend nav for gradebook, report-cards, report-comments, transcripts, parent-gradebook annotated with `moduleKey: 'gradebook'`.
- [ ] Module-gating leakage tests pass for `gradebook`.
- [ ] Worker tests pass for the report-card pipeline (disabled → no S3 write).
- [ ] Smoke test on NHQS: toggle `gradebook` off → all gradebook nav hidden; teacher cannot enter grades; parent cannot view child's grades; previously-published report card PDFs in S3 remain (not deleted) but the `/parent/report-cards/:id` viewer 404s. Toggle back on → access restored within 60s; report-card auto-generation resumes on next cron tick.

---

## Notes

- Gradebook is the largest API surface in this initiative. Allocate ~1 day of focused work for this spec.
- The S3 PDF orphaning when disable happens mid-generation is acceptable. A follow-up periodic janitor job (out of scope for Module Gating; tracked in `docs/operations/PRE-LAUNCH-CHECKLIST.md` if desired) can clean orphans.
- The dependency on impl 11 is loose: impl 11 added gating to gradebook AI controllers/services. If 11 ships first, those controllers are double-gated (good — defense in depth). If this spec ships first and adds class-level `@ModuleEnabled('gradebook')` to those controllers, impl 11 just adds the inner `@RequiresAiFlag` decoration on top.
- Verify the report-card cron-dispatcher pattern: if it iterates tenants centrally (Pattern A), the per-tenant Pattern B inside the processor is defense in depth — both are correct. If the dispatcher already filters by enabled tenants, the processor's Pattern B is a safety net.
