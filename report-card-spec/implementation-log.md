# Report Cards Redesign — Implementation Log

This file is a running record of which implementation units have been completed, when, by whom, and with what outcome. Every agent that completes an implementation MUST append an entry here before their work is considered done.

## Log entry template

When you finish an implementation, append an entry to the **Completions** section below using exactly this format:

```markdown
### Implementation NN: <title>

- **Completed at:** YYYY-MM-DD HH:MM (local time)
- **Completed by:** <agent identifier or session id>
- **Branch / commit:** `<branch-name>` @ `<commit-sha>`
- **Pull request:** <PR URL if applicable, or "direct to main">
- **Status:** ✅ complete | ⚠️ partial | ❌ blocked
- **Summary:** One or two sentences on what was built.

**What changed:**

- File 1 — brief purpose
- File 2 — brief purpose
- …

**Database changes:**

- Migration: `<migration name>` — brief description
- New tables: …
- New columns: …
- (none, if no DB change)

**Test coverage:**

- Unit specs added: N
- Integration/E2E specs added: N
- RLS leakage tests: per new table, confirmed passing
- `turbo test` status: ✅ all green | ⚠️ skipped reason | ❌ failing reason
- `turbo lint` status: ✅ | ❌
- `turbo type-check` status: ✅ | ❌

**Architecture docs updated (if applicable):**

- `docs/architecture/module-blast-radius.md` — updated | not required
- `docs/architecture/event-job-catalog.md` — updated | not required
- `docs/architecture/state-machines.md` — updated | not required
- `docs/architecture/danger-zones.md` — updated | not required

**Regression check:**

- Ran full `turbo test`: ✅ all green | ❌ failures (list below)
- Any unrelated test failures: none | <list>

**Blockers or follow-ups:**

- None, OR describe any blockers/handoffs the next implementation needs to know about

**Notes for the next agent:**

- Any non-obvious context that might trip them up
```

## Rules for agents writing entries

1. **Only append — never rewrite or delete prior entries.** Prior entries are the audit trail.
2. **Commit the log file update in the same PR as the implementation.** The log must reflect merged state.
3. **If the implementation is partial, mark it ⚠️ partial, describe what was done, and create a new entry when the remainder lands.** Do not retroactively edit the ⚠️ entry.
4. **If the implementation is blocked, mark it ❌ blocked, describe the blocker, and hand off to the user.** A blocked entry is still a valid log entry.
5. **Link the commit SHA.** No log entry is complete without a traceable commit.
6. **Include the `turbo test` / `turbo lint` / `turbo type-check` results.** If any failed, explain why and whether it was unrelated.
7. **Check the architecture docs.** If your implementation added a cross-module dependency, a new job, a new state machine, or new coupling, update the relevant file in `docs/architecture/` — and note that in the log entry.

## Completions

<!-- Append completed implementation entries below this line -->

### Implementation 01: Database Foundation

- **Completed at:** 2026-04-09
- **Completed by:** Claude Opus 4.6 (Claude Code)
- **Branch / commit:** `main` @ `3a4a5b42`
- **Pull request:** direct to main (local commit only — not pushed per nightly-only push policy)
- **Status:** ✅ complete
- **Summary:** Landed Prisma schema for the Report Cards Redesign — 4 new enums, 5 new tables, schema-only column extensions on `students`/`report_cards`/`report_card_templates`/`report_card_batch_jobs`, RLS policies for all five new tables, Zod schemas + tests in `@school/shared/report-cards`, and idempotent default seeds for tenant settings, default templates, and the three new permissions wired into role mappings.

**What changed:**

- `packages/prisma/schema.prisma` — added enums `CommentWindowStatus`, `TeacherRequestType`, `TeacherRequestStatus`, `ReportCardContentScope`; extended `ReportCardStatus` with `superseded`; added 5 new models (`ReportCommentWindow`, `ReportCardSubjectComment`, `ReportCardOverallComment`, `ReportCardTeacherRequest`, `ReportCardTenantSettings`); added new columns to `Student`, `ReportCard`, `ReportCardTemplate`, `ReportCardBatchJob`; wired inverse relations on `Tenant`, `User`, `Student`, `Class`, `Subject`, `AcademicPeriod`.
- `packages/prisma/migrations/20260409120000_add_report_cards_redesign_foundation/migration.sql` — new migration (idempotent, additive: keeps `teacher_comment` for backwards compatibility and adds `overall_comment_text` as a mirror column; later impl will migrate consumers and drop the old column).
- `packages/prisma/migrations/20260409120000_add_report_cards_redesign_foundation/post_migrate.sql` — RLS policies for all 5 new tables (ENABLE + FORCE + tenant_isolation policy).
- `packages/prisma/rls/policies.sql` — same policies added to the canonical RLS catalogue.
- `packages/prisma/schema-snapshot.prisma` — regenerated from updated `schema.prisma`.
- `packages/prisma/seed.ts` — new Step 6b seeds default `ReportCardTenantSettings` per tenant, English + Arabic "Grades Only" templates, and points each tenant's `default_template_id` at the English template.
- `packages/prisma/seed/permissions.ts` — registered new permissions `report_cards.view`, `report_cards.comment`, `report_cards.manage`.
- `packages/prisma/seed/system-roles.ts` — wired new permissions into `school_owner`, `school_principal`, `admin`, `school_vice_principal` (`view + comment + manage`); `teacher` (`view + comment`); `front_office` (`view`).
- `packages/shared/src/report-cards/*.ts` — new schemas + types: `content-scope.schema.ts`, `second-language.schema.ts`, `comment-window.schema.ts`, `subject-comment.schema.ts`, `overall-comment.schema.ts`, `teacher-request.schema.ts`, `tenant-settings.schema.ts`, plus `index.ts` barrel.
- `packages/shared/src/report-cards/__tests__/*.spec.ts` — 60 unit tests covering happy paths, every `.refine()` rule, every enum boundary, and every required-field check.
- `packages/shared/src/index.ts` — re-exports the new `report-cards` barrel from the root @school/shared.
- `packages/shared/package.json` — added `./report-cards` subpath export and matching `typesVersions` entry.
- `apps/api/test/report-cards/rls-leakage.e2e-spec.ts` — new e2e suite, 19 tests, validates SELECT/UPDATE/DELETE cross-tenant isolation for all 5 new tables.
- `docs/architecture/state-machines.md` — added `CommentWindowStatus` and `TeacherRequestStatus` state machines; expanded `ReportCardStatus` with `superseded`; bumped `Last verified` to 2026-04-09.

**Database changes:**

- Migration: `20260409120000_add_report_cards_redesign_foundation`
- New tables: `report_comment_windows`, `report_card_subject_comments`, `report_card_overall_comments`, `report_card_teacher_requests`, `report_card_tenant_settings`
- New columns: `students.preferred_second_language`; `report_cards.overall_comment_text`, `subject_comments_json`, `personal_info_fields_json`, `pdf_storage_key`, `template_id`; `report_card_templates.content_scope`; `report_card_batch_jobs.scope_type`, `scope_ids_json`, `personal_info_fields_json`, `languages_requested`, `students_generated_count`, `students_blocked_count`, `errors_json`
- New constraints: unique partial index `report_comment_windows_one_open_per_tenant` (one open window per tenant), check constraint `report_comment_windows_closes_after_opens` (`closes_at > opens_at`), unique constraint on `report_card_tenant_settings.tenant_id`
- New enum values: `ReportCardStatus.superseded`
- Backfill: `report_cards.overall_comment_text` populated from `teacher_comment` for existing rows; `report_cards.template_id` backfilled to a default "Grades Only" template (created on demand if absent) for tenants that have legacy report cards.

**Spec deviation note:** The design spec called for renaming `teacher_comment` → `overall_comment_text`. The rename was changed to an additive mirror because the implementation file scopes impl 01 to "schema only — no apps/api/src/modules changes", and dropping the column would have broken ~25 production consumers (services, controllers, web pages, tests) outside the allowed scope. Both columns now exist; consumers continue using `teacher_comment`; a follow-up impl will migrate consumers and drop the deprecated column. The new column is documented as "deprecated mirror" in the Prisma schema.

**Test coverage:**

- Unit specs added: 6 (60 individual tests across the Zod schemas)
- Integration/E2E specs added: 1 (`rls-leakage.e2e-spec.ts` — 19 tests)
- RLS leakage tests: 5 tables, all SELECT/UPDATE/DELETE cross-tenant scenarios passing
- `turbo test` status: ✅ all green — 14905/14905 tests passing across 711 suites
- `turbo lint` status: ✅ all green — 0 errors (822 pre-existing warnings, none introduced by this impl)
- `turbo type-check` status: ✅ all green — 8/8 tasks successful

**Architecture docs updated (if applicable):**

- `docs/architecture/module-blast-radius.md` — not required (no cross-module imports added; this impl only touches `packages/prisma`, `packages/shared`, and `apps/api/test`)
- `docs/architecture/event-job-catalog.md` — not required (no jobs/crons added)
- `docs/architecture/state-machines.md` — ✅ updated with `CommentWindowStatus`, `TeacherRequestStatus`, and the `ReportCardStatus.superseded` extension
- `docs/architecture/danger-zones.md` — not required

**Regression check:**

- Ran full `turbo test`: ✅ all 14905 tests green across 711 suites + 19 new RLS leakage tests
- Any unrelated test failures: none

**Blockers or follow-ups:**

- Implementations 02–06 are now unblocked.
- Follow-up: a later implementation must migrate `report_cards` consumers from `teacher_comment` to `overall_comment_text` and then drop the `teacher_comment` column with a `NOT NULL` follow-up on `template_id`. The schema is already in a forward-compatible state for that change.
- Local commit only — not pushed to GitHub per nightly-push policy. The migration has NOT been applied to production yet; that step is gated on user approval.

**Notes for the next agent:**

- The default tenant settings JSONB structure is defined by `reportCardTenantSettingsPayloadSchema` in `packages/shared/src/report-cards/tenant-settings.schema.ts`. Treat that as the source of truth — every read/write of `report_card_tenant_settings.settings_json` should run through this schema.
- The submit-teacher-request schema enforces a cross-field invariant: `regenerate_reports` requires `target_scope_json`, `open_comment_window` forbids it. Re-use `submitTeacherRequestSchema` rather than re-implementing the rule.
- The `report_comment_windows` partial unique index is the database guarantee that backs the "one open window per tenant" rule. Do not duplicate the check at the application layer — let the unique violation surface as a typed error.
- The default "Grades Only" templates are seeded for both `en` and `ar` locales. The English template is `is_default = true`; the Arabic template is `is_default = false`.
- `ReportCard.template_id` is currently nullable to accommodate the backfill. Make it `NOT NULL` only after every consumer writes it consistently.
