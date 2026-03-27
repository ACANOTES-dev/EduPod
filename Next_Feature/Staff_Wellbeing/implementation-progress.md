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
| D | Workload Intelligence | `phase-d-workload-intelligence.md` | NOT STARTED | — | — |
| E | Frontend — Staff Experience | `phase-e-frontend-staff.md` | NOT STARTED | — | — |
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
