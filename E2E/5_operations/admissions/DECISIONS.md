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
- ADM-016 + ADM-043 (2026-04-13): Fixed at both layers — frontend defensive read (`?.meta?.total ?? 0`) + backend controller-level `{ data, meta }` wrapper. Did not touch the underlying `findByParent` service method, which is also used by an ownership check that expects a flat array. — Claude Opus 4.6
- ADM-015 (2026-04-13): ICU plural in `messages/{en,ar}.json` for all six hub card descriptions. Arabic uses the full CLDR plural rule set. — Claude Opus 4.6
- ADM-017 (2026-04-13): Code already correct (translated label "Conditional Approval" with space). Verified live after analytics rebuild. — Claude Opus 4.6
- ADM-018 (2026-04-13): Added the 4th KPI per spec recommendation. Fetches `meta.total` from the waiting-list queue endpoint. — Claude Opus 4.6
- ADM-019 (2026-04-13): Set `minHeight={300}` on Recharts ResponsiveContainer + parent `min-h-[300px]` + RAF-gated mount. Single residual warning is upstream Recharts limitation. — Claude Opus 4.6
- ADM-020 (2026-04-13): Blocked — needs product call between (a) build sticky group headers per spec or (b) defer the spec. — Claude Opus 4.6
- ADM-021 (2026-04-13): Blocked — needs product call between (a) build morph-bar sub-strip or (b) formalise current "hub tiles + Back CTA" pattern. — Claude Opus 4.6
- ADM-023 (2026-04-13): Blocked — needs compliance/legal call between column-level encryption (Path A) vs access-event audit (Path B). — Claude Opus 4.6
- ADM-027 (2026-04-13): Blocked — needs SLA target + sibling priority order from product. — Claude Opus 4.6
- ADM-032 (2026-04-13): Blocked — needs UX call: accept-with-tag vs 409-reject for submissions against deprecated form versions. — Claude Opus 4.6
- ADM-040 (2026-04-13): Blocked — docs-only fix; needs pointer to the docs file to update. — Claude Opus 4.6
- ADM-022 (2026-04-13): Notes tab chip + compose-time visibility toggle. — Claude Opus 4.6
- ADM-024 (2026-04-13): Used existing NestJS Logger.warn (captured by Sentry + journald) instead of wiring a new metrics SDK. — Claude Opus 4.6
- ADM-031 (2026-04-13): 60s cooldown driven by the most-recent audit-note timestamp (no Redis round-trip needed) — falls open if the lookup itself fails. — Claude Opus 4.6
- ADM-035 (2026-04-13): Tailwind `capitalize` class on Current Status — minimal change; titlecasing the underlying status enum would touch many more sites. — Claude Opus 4.6
- ADM-036 (2026-04-13): Already addressed by ADM-004's `<CurrencyDisplay>` migration. — Claude Opus 4.6
- ADM-037 (2026-04-13): Renamed panel to "Stripe payment events" + clarifying empty-state copy. Did not synthesise events — would corrupt the Stripe-only reconciliation contract. — Claude Opus 4.6
- ADM-041 (2026-04-13): Blocked — needs product approval to seed `admissions_application_withdrawn` template across tenants + email copy. — Claude Opus 4.6
- ADM-025 (2026-04-13): Verified — code-side IP fallback chain already correct (`cf-connecting-ip` → `x-forwarded-for` → `req.ip`/`req.socket`). Runbook update is purely operational. — Claude Opus 4.6
- ADM-026 (2026-04-13): Blocked — needs product call between simpler "block role rename when settings reference it" vs full bidirectional validation (avoids circular module dep). — Claude Opus 4.6
- ADM-028 (2026-04-13): Blocked — needs product approval to update `admissions_application_received` template across tenants + per-student copy. — Claude Opus 4.6
- ADM-029 (2026-04-13): Non-blocking warning banner shown when both cash + bank disabled. Stripe-config detection deferred (would need extra API call, out of scope). — Claude Opus 4.6
- ADM-030 (2026-04-13): Computed warning when `payment_deadline > now+23h` (Stripe session will expire earlier). Did not store / fetch actual `expires_at` — would need schema or a Stripe API round-trip. — Claude Opus 4.6
- ADM-033 (2026-04-13): Blocked — needs product call on whether overrides filters are launch-blocking or post-launch sprint. — Claude Opus 4.6
- ADM-034 (2026-04-13): Blocked — needs product call on which locale backend-composed strings use. — Claude Opus 4.6
- ADM-038 (2026-04-13): Dynamic-imported all 7 Recharts components on the analytics page via `next/dynamic({ ssr: false })`. — Claude Opus 4.6
- ADM-039 (2026-04-13): Blocked — needs perf budget / latency target before instrumenting. — Claude Opus 4.6
- ADM-042 (2026-04-13): Blocked — needs CI-job placement decision before adding the pg_indexes guard test. — Claude Opus 4.6
