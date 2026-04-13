# Admissions Bug Log — Decisions Journal

Running record of judgement calls made while executing the bug log. Each
entry includes the bug ID, date, decision, and one-line reason.

---

- ADM-001 (2026-04-13): Built dedicated `/admissions/overrides` page (Option A) instead of redirecting hub tile. — Claude Opus 4.6
- ADM-004 (2026-04-13): Re-framed bug after user clarified NHQS is EUR not AED. Fixed Payment tab to use tenant currency (Option B) instead of stale `application.currency_code`. Parent dashboard `€450` is correct for an EUR tenant — no change needed there. — Claude Opus 4.6
- ADM-002 (2026-04-13): Used `unwrap()` (Option A — defensive destructure) instead of redirecting `/apply` to a static page. The root cause was the missing envelope unwrap, not a deprecated tenant picker. — Claude Opus 4.6
- ADM-003 (2026-04-13): Inline string formatter for note body (`18 Apr 2026, 12:13 UTC`) instead of structured-storage refactor. Reasons: minimal blast radius, no schema migration, audit-trail backwards-compat preserved (existing ISO notes left alone). — Claude Opus 4.6
- ADM-005 (2026-04-13): Inject single-option label list into the two target comboboxes (Option A/B hybrid) instead of swapping them for plain text (Option C). Keeps the renderer generic and the form schema unchanged. — Claude Opus 4.6
- ADM-006 (2026-04-13): Postgres `pg_advisory_xact_lock` keyed on `(tenant, year_group)` (Option A) instead of SERIALIZABLE retry (Option B) or denormalised capacity table (Option C). Idiomatic, no schema migration, no controller retry logic. — Claude Opus 4.6
- ADM-007 (2026-04-13): Combined explicit `setInterval` lock renewal (Option A) with much-larger base `lockDuration` (5min → 30min). Did not split into sub-jobs (Option B) — keeps the at-most-once contract and avoids reconciliation complexity. — Claude Opus 4.6
- ADM-008 (2026-04-13): Capacity check (Option A) over document-only (Option B). Reuses ADM-006's advisory lock + extends the formula to subtract `ready_to_admit_count`. Manual promote can no longer over-queue. — Claude Opus 4.6
- ADM-009 (2026-04-13): Blocked — needs explicit user approval to run the new enum + column Prisma migration on prod. — Claude Opus 4.6
- ADM-010 (2026-04-13): Trimmed per-application shape only (drop student_first_name, student_last_name, target_year_group_id). Kept the wrapper since sibling-batch confirmations need `submission_batch_id` + `household_number`. — Claude Opus 4.6
- ADM-011 (2026-04-13): Audit note written from the controller (where `user.sub` is available), wrapped in best-effort `try/catch` so an audit-trail failure cannot break the regenerate response. — Claude Opus 4.6
- ADM-012 (2026-04-13): Endpoint already returned a unified `HOUSEHOLD_NOT_FOUND` code; only timing leak remained. Padded failure path to ~80ms so success vs failure timings overlap. — Claude Opus 4.6
- ADM-013 (2026-04-13): Stripe idempotency keyed on `(application_id, payment_deadline.toISOString())` for both worker and API paths. Applied a follow-up fix to ADM-011 — the controller previously read a non-existent `stripe_checkout_session_id` field on the result and now reads `session_id`. Split into two commits (api + worker) to avoid lint-staged hanging on cross-package eslint runs. — Claude Opus 4.6
- ADM-014 (2026-04-13): Used existing `formatDate()` (`DD-MM-YYYY`) helper for the detail page rather than switching every callsite to `11 Apr 2026`. Detail and queue pages now render the same format. — Claude Opus 4.6
