# Staff Wellbeing — Implementation Progress

**Master Spec:** `staff-wellbeing-spec-v1-master.md`
**Scope:** V1 — Trust Before Breadth (7 phases, A-G)

---

## Dependency Graph

```
A ──→ B ──→ C ───────────┐
                          ├──→ F ──→ G
A ──→ D ──────→ E ────────┘
       (parallel with B+C)
```

- B and D are fully parallel after A
- C and D are also parallel
- E requires B + D
- F requires C + D + E
- G requires all

---

## Phase Status

| Phase | Name | Spec | Status | Started | Completed |
|-------|------|------|--------|---------|-----------|
| A | Foundation & Shared Infrastructure | `phase-a-foundation.md` | COMPLETE | 2026-03-27 | 2026-03-27 |
| B | Anonymous Survey Engine | `phase-b-survey-engine.md` | COMPLETE | 2026-03-27 | 2026-03-27 |
| C | Survey Results & Trust Layer | `phase-c-trust-layer.md` | NOT STARTED | — | — |
| D | Workload Intelligence | `phase-d-workload-intelligence.md` | COMPLETE | 2026-03-27 | 2026-03-27 |
| E | Frontend — Staff Experience | `phase-e-frontend-staff.md` | COMPLETE | 2026-03-27 | 2026-03-27 |
| F | Frontend — Principal/Board + Reports | `phase-f-frontend-admin.md` | NOT STARTED | — | — |
| G | Security Verification & Hardening | `phase-g-hardening.md` | NOT STARTED | — | — |

---

## Session Log

### Session 1 — 2026-03-27
**Phase(s):** A
**Work done:**
- `@BlockImpersonation()` guard + decorator (shared infrastructure in `common/guards/`)
- Database migration `20260328100000_add_staff_wellbeing_tables`: 4 tables (staff_surveys, survey_questions, survey_responses with NO tenant_id, survey_participation_tokens)
- RLS on staff_surveys + survey_questions; CHECK constraints on threshold floors + window validity
- StaffWellbeingModule skeleton wired into app.module.ts
- Per-tenant HMAC secret service (AES-256 encrypted, EncryptionService integration)
- 7 wellbeing permissions seeded with role assignments
- `staff_wellbeing` module key added to constant + seed
- Zod DTO schemas in packages/shared (survey CRUD, response submission, moderation, results query, tenant settings)
- TenantSettingsJson extended with staff_wellbeing type
- Architecture docs: DZ-27 (survey_responses exception), blast radius updated
**Execution:** 6 parallel agents (4 Sonnet, 2 Opus). Zero integration errors at merge.
**Tests:** 11 passing (5 guard, 6 HMAC). 100/100 regression tests clean.
**Commit:** `439f2af` — deployed to production, CI green.
**Issues:** None.
**Next:** Phase B (Anonymous Survey Engine) and/or Phase D (Workload Intelligence) — both unblocked, can run in parallel.

### Session 2 — 2026-03-27
**Phase(s):** B
**Work done:**
- B1: Survey CRUD service + controller (create, list, get detail, update draft)
- B2: Clone-as-draft (any status → new draft with same questions, blank dates)
- B3: Survey lifecycle (activate with single-active enforcement, close with results_released)
- B4: Anonymous response submission (HMAC double-vote prevention, atomic token + response write, no user_id on responses)
- B5: Active survey endpoint (returns survey + hasResponded boolean)
- B6: Moderation scan worker job (flags freeform text matching staff names, room codes, subject names — Irish name support)
- B7: Survey notification jobs (open notify on activation, closing reminder 24h before close)
- B8: Participation token cleanup cron (05:00 UTC, deletes tokens for surveys closed >7 days)
- B9: EAP resource endpoint + refresh check cron (06:00 UTC, notifies managers when EAP details >90 days stale)
- `wellbeing` BullMQ queue registered in API module + worker module
- 3 cron jobs registered in CronSchedulerService
- architecture/event-job-catalog.md updated (5 new job types, 3 cron jobs, queue config)
**Execution:** 6 parallel agents (3 Opus, 3 Sonnet). 1 agent ran out of usage but all files were complete. Orchestrator fixed 1 test bug + import ordering.
**Tests:** 248 passing across API (181) + worker (67). All Phase B suites green. Pre-existing Phase D failures unaffected.
**Issues:** None.
**Next:** Phase C (Survey Results & Trust Layer) and/or Phase D (Workload Intelligence) — both unblocked.

### Session 3 — 2026-03-27
**Phase(s):** D
**Work done:**
- D1: WorkloadComputeService — core read-only computation engine (1900+ lines): teaching period count, cover duty count, consecutive period detection, free period distribution, split timetable detection, room change analysis, Gini coefficient, timetable quality composite (D4), substitution pressure index, correlation analysis, personal and aggregate workload methods
- D2: PersonalWorkloadController — 3 self-only endpoints (`/my-workload/summary`, `/my-workload/cover-history`, `/my-workload/timetable-quality`) with `@BlockImpersonation()`, no permission needed beyond auth, cache-aside pattern with 5-min TTL
- D3: AggregateWorkloadController — 6 permission-gated endpoints (`/aggregate/workload-summary`, `/aggregate/cover-fairness`, `/aggregate/timetable-quality`, `/aggregate/absence-trends`, `/aggregate/substitution-pressure`, `/aggregate/correlation`) requiring `wellbeing.view_aggregate`, cache-aside with 24-hour TTL
- D4: Timetable quality composite score (30% free distribution, 30% consecutive, 20% split, 20% room changes) — embedded in D1
- D5: WorkloadCacheService (Redis, personal 5min/aggregate 24h TTL) + WorkloadMetricsProcessor daily cron at 04:00 UTC pre-computing aggregate metrics for all tenants
- D6: BoardReportService + BoardReportController — `/reports/termly-summary` endpoint requiring `wellbeing.view_board_report`, compiles all aggregate metrics into board-level summary
- Zod schemas for all workload request/response types in `packages/shared`
- Module wired with RedisModule import, 3 new controllers, 3 new services
- architecture/event-job-catalog.md updated (1 new cron job)
- architecture/module-blast-radius.md updated (new exports)
**Execution:** 7 parallel agents (5 Opus, 2 Sonnet). 4 agents hit rate limits but all target files were created before cutoff. Orchestrator filled gaps (board-report controller/specs, worker processor/spec), fixed type errors, and wired integration files.
**Tests:** 188 passing across 11 suites (all Phase D suites green). Pre-existing failures in other modules unaffected.
**Issues:** None.
**Next:** Phase E (Frontend — Staff Experience) requires B + D (both complete). Phase C (Survey Results & Trust Layer) is unblocked.

### Session 4 — 2026-03-27
**Phase(s):** E
**Work done:**
- E1: Personal Workload Dashboard (`/wellbeing/my-workload`) — Summary stat cards (teaching periods, cover duties, timetable quality), cover history table (desktop) / card view (mobile), timetable quality breakdown with Recharts bar chart, trend comparison, privacy note, loading/error states
- E2: Resources Page (`/wellbeing/resources`) — EAP provider info with freshness indicator, 6 hardcoded Irish crisis helplines (Pieta House, Samaritans, Text 50808, INTO, TUI, ASTI) with tel:/sms: links, external resources from tenant config
- E3: Survey Submission (`/wellbeing/survey`) — 3-state page (no active survey, active + not responded, active + already responded), anonymity explanation panel with expandable HMAC architecture detail, question rendering by type (likert_5, single_choice, freeform), submission warning, confirmation dialog, 409/403 error handling
- E4: Active Survey Sidebar Indicator — Badge dot on Survey nav item when active survey exists and user hasn't responded, fetched on layout mount for staff roles
- E5: Small School Guidance — Dismissible info banner when staff < 15, shown on wellbeing pages
- Sidebar nav: Wellbeing section added with Heart/LifeBuoy/MessageSquare icons, visible to all staff roles
- Translation keys: Full en.json + ar.json wellbeing section (myWorkload, resources, survey, sidebar, smallSchool)
- All pages RTL-safe (logical properties only), mobile-first (375px), bilingual
**Execution:** 4 parallel agents (2 Opus, 2 Sonnet). Zero integration errors. Orchestrator handled sidebar nav, translations, and lint fixes.
**Tests:** 230 passing (13 suites, all staff-wellbeing green). Type-check and lint clean.
**Issues:** None.
**Next:** Phase C (Survey Results & Trust Layer) is unblocked. Phase F requires C + D + E (E now complete).
