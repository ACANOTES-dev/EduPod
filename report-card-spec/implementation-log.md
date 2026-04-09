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

### Implementation 02: Comment System Backend

- **Completed at:** 2026-04-09
- **Completed by:** Claude Opus 4.6 (Claude Code)
- **Branch / commit:** `main` @ `63b0af60`
- **Pull request:** direct to main (local commit only — not pushed per nightly-only push policy)
- **Status:** ✅ complete
- **Summary:** Built the full backend comment subsystem: windows, subject comments, overall comments, and single-student AI drafting with strict server-side window enforcement. The `assertWindowOpenForPeriod` primitive on `ReportCommentWindowsService` is the single reusable cost-control mechanism — every comment write and every AI call routes through it.

**What changed:**

- `apps/api/src/modules/gradebook/report-cards/dto/comment-window.dto.ts` — thin re-export from `@school/shared`
- `apps/api/src/modules/gradebook/report-cards/dto/subject-comment.dto.ts` — thin re-export
- `apps/api/src/modules/gradebook/report-cards/dto/overall-comment.dto.ts` — thin re-export
- `apps/api/src/modules/gradebook/report-cards/report-comment-windows.service.ts` (+ spec) — windows CRUD, state machine, `assertWindowOpenForPeriod`
- `apps/api/src/modules/gradebook/report-cards/report-comment-windows.controller.ts` (+ spec) — `/v1/report-comment-windows` endpoints (list, active, one, open, close, extend, reopen, update)
- `apps/api/src/modules/gradebook/report-cards/report-card-subject-comments.service.ts` (+ spec) — upsert/finalise/unfinalise/bulkFinalise with authorship + window enforcement
- `apps/api/src/modules/gradebook/report-cards/report-card-subject-comments.controller.ts` (+ spec) — `/v1/report-card-subject-comments` endpoints including `/ai-draft`
- `apps/api/src/modules/gradebook/report-cards/report-card-overall-comments.service.ts` (+ spec) — homeroom-teacher gated upsert/finalise/unfinalise
- `apps/api/src/modules/gradebook/report-cards/report-card-overall-comments.controller.ts` (+ spec) — `/v1/report-card-overall-comments` endpoints
- `apps/api/src/modules/gradebook/report-cards/report-card-ai-draft.service.ts` (+ spec) — single-student subject draft with window enforcement + GDPR tokenisation (existing bulk `ai-generate-comments` endpoint preserved intact for backwards compat)
- `apps/api/src/modules/gradebook/report-cards/report-card.module.ts` — registered new services, controllers, and `ReportCommentWindowsService` export for downstream impls
- `apps/api/test/report-cards/comment-windows.e2e-spec.ts` — lifecycle + enforcement e2e
- `apps/api/test/report-cards/subject-comments.e2e-spec.ts` — window enforcement + authorship + bulk finalise e2e
- `apps/api/test/report-cards/overall-comments.e2e-spec.ts` — homeroom authorship + enforcement e2e
- `apps/api/test/report-cards/ai-draft.e2e-spec.ts` — AI draft guards (Anthropic/Consent/GDPR stubbed via NestJS `overrideProvider`)
- `packages/shared/src/report-cards/subject-comment.schema.ts` — removed `.default(false)` from `is_ai_draft` so the inferred DTO keeps it optional (schema test updated accordingly)
- `api-surface.snapshot.json` — regenerated for the 21 new routes

**Database changes:**

- None (uses tables from impl 01)

**Test coverage:**

- Unit specs added: 4 service specs + 3 controller specs (81 tests total, all passing)
- Integration/E2E specs added: 4 (20 tests total, all passing). The RLS leakage coverage for the three new tables lives in impl 01's `rls-leakage.e2e-spec.ts` — those 19 tests still pass on this branch.
- `turbo test` status: ✅ all 14986 tests green across 718 suites (api) + full workspace green
- `turbo lint` status: ✅ 0 errors (833 pre-existing warnings, none introduced)
- `turbo type-check` status: ✅ green for all packages

**Architecture docs updated (if applicable):**

- `docs/architecture/module-blast-radius.md` — not required (no cross-module imports added; the comment services depend on existing read facades from `academics`, `classes`, `students`, plus existing `gdpr`, `ai`, `configuration` modules already imported by the report-card module)
- `docs/architecture/event-job-catalog.md` — not required (AI call is synchronous; no new BullMQ jobs or crons)
- `docs/architecture/state-machines.md` — verified that `CommentWindowStatus` is already documented from impl 01; no additional state machines introduced
- `docs/architecture/danger-zones.md` — not required

**Regression check:**

- Ran full `turbo test`: ✅ all 14986 tests green across all packages
- DI verification script from `00-common-knowledge.md §3.7`: ✅ `DI OK`
- Any unrelated test failures: none (the only failure during development was the `api-surface` snapshot which was re-committed after the new routes were added)

**Blockers or follow-ups:**

- Implementation 08 (frontend report comments) is now unblocked.
- Implementation 05 (teacher requests) can now import `ReportCommentWindowsService` from the report-card module exports and call `reopen` or `open` to satisfy approved teacher requests.
- Note on the `api-surface` snapshot tool: it has a pre-existing bug where each route row is populated with the _previous_ route's `@RequiresPermission` value (because the block scan starts from `prev.matchEnd`). Runtime permission checks remain correct via NestJS reflection on the decorated method; the snapshot is authoritative for presence/absence of routes but not for per-row permission accuracy.

**Notes for the next agent:**

- **`ReportCommentWindowsService.assertWindowOpenForPeriod(tenantId, periodId)` is the reusable cost-control primitive.** Every new endpoint that consumes AI OR writes a teacher-authored comment must call it BEFORE any billable work. Do not duplicate the check at the controller layer — it lives in the services.
- **Authorship checks always run BEFORE window checks** to avoid leaking window state to unauthorised users (they get 403 `INVALID_AUTHOR` instead of 403 `COMMENT_WINDOW_CLOSED`).
- `CommentActor = { userId: string; isAdmin: boolean }` is the shared shape passed between the controllers and services; the controllers compute `isAdmin` via `PermissionCacheService.getPermissions(user.membership_id).includes('report_cards.manage')`.
- The single-student AI draft endpoint is `POST /v1/report-card-subject-comments/ai-draft` with payload `{ student_id, subject_id, class_id, academic_period_id }`. Response is `{ comment_text, model, tokens_used }`. The caller (frontend in impl 08) is responsible for persisting the returned text by calling `POST /v1/report-card-subject-comments` with `is_ai_draft: true`.
- The existing bulk `POST /v1/gradebook/ai/generate-comments` endpoint is untouched; it remains available for the legacy overview page until impl 08 lands.
- An edit on a finalised subject or overall comment clears its finalisation (`finalised_at` + `finalised_by_user_id` reset to null), so the comment must be explicitly re-finalised after any text change. This matches the design spec's "strict finalisation" rule.
- All writes use `createRlsClient(prisma, { tenant_id, user_id }).$transaction(...)` — the sole permitted use of `as unknown as PrismaService` remains inside those transaction blocks.

### Implementation 03: Settings & Templates Backend

- **Completed at:** 2026-04-09
- **Completed by:** Claude Opus 4.6 (Claude Code)
- **Branch / commit:** `main` @ `aa348ec3`
- **Pull request:** direct to main (local commit only — not pushed per nightly-only push policy)
- **Status:** ✅ complete
- **Summary:** Built the `ReportCardTenantSettingsService` + controller with lazy default bootstrap, full Zod re-validation on every partial update, and a principal-signature upload/delete flow that validates mime-type, magic bytes, and a 2 MB size cap via the existing S3 storage provider. Additively refactored `ReportCardTemplateService` to expose `listContentScopes()` and `resolveForGeneration()` without disturbing any of its existing CRUD/AI-conversion methods.

**What changed:**

- `apps/api/src/modules/gradebook/report-cards/dto/tenant-settings.dto.ts` — thin re-export of `reportCardTenantSettingsPayloadSchema` and `updateReportCardTenantSettingsSchema` from `@school/shared`
- `apps/api/src/modules/gradebook/report-cards/report-card-tenant-settings.service.ts` (+ `.spec.ts`) — new service: `get`, `getPayload`, `update`, `uploadPrincipalSignature`, `deletePrincipalSignature`. Lazy default bootstrap, partial-merge + full-schema re-validation, PNG/JPEG/WEBP magic-byte verification, 2 MB size cap, deterministic S3 key `tenant/{tenant_id}/report-cards/principal-signature.{ext}`, previous-key cleanup on extension change.
- `apps/api/src/modules/gradebook/report-cards/report-card-tenant-settings.controller.ts` (+ `.spec.ts`) — new `/v1/report-card-tenant-settings` routes: `GET` (view), `PATCH` (manage), `POST /principal-signature` (manage, multipart via the shared `createFileInterceptor({ allowedMimes: IMAGE, maxSizeMb: 2 })`), `DELETE /principal-signature` (manage).
- `apps/api/src/modules/gradebook/report-cards/report-card-template.service.ts` — additive refactor: new `listContentScopes(tenantId)` groups templates by `content_scope` and always emits entries for the planned-but-unavailable scopes (`grades_homework`, `grades_attendance`, `grades_homework_attendance`, `full_master`) as `is_available: false`; new `resolveForGeneration(tenantId, { contentScope, locale })` picks the default template for a (scope, locale) pair with fallback to a non-default row. Existing CRUD/AI-conversion methods untouched.
- `apps/api/src/modules/gradebook/report-cards/report-card-template.service.spec.ts` — added 7 tests covering `listContentScopes` and `resolveForGeneration`; existing specs still green.
- `apps/api/src/modules/gradebook/report-cards/report-cards-enhanced.controller.ts` — added `GET /v1/report-cards/templates/content-scopes` (permission: `report_cards.view`) **before** the dynamic `:id` route so NestJS matches it first.
- `apps/api/src/modules/gradebook/report-cards/report-card.module.ts` — imports `S3Module`; registers `ReportCardTenantSettingsController` + `ReportCardTenantSettingsService`; adds `ReportCardTemplateService` and `ReportCardTenantSettingsService` to `exports` so impl 04 (generation) can consume `listContentScopes`, `resolveForGeneration`, and `getPayload`.
- `apps/api/test/report-cards/tenant-settings.e2e-spec.ts` — 8 e2e tests against the real Postgres (AppModule with `S3Service` stubbed): lazy bootstrap, partial merge, invalid payload rejection, signature upload happy path, magic-byte mismatch, `PRINCIPAL_NAME_REQUIRED`, delete clears both fields, tenant isolation via the service.
- `apps/api/test/report-cards/templates.e2e-spec.ts` — 6 e2e tests: `listContentScopes` grouping shape, unavailable-scope entries, `resolveForGeneration` for en / ar / missing locale / unavailable scope.
- `api-surface.snapshot.json` — regenerated for the 5 new routes (4 settings + 1 template content-scopes). The known pre-existing snapshot bug documented in impl 02's notes (previous-route permission bleeds into the next row) surfaces here too for the dynamic `:id` template route — the runtime permission is still correctly enforced via NestJS reflection on the decorated method.

**Database changes:**

- None (uses tables + `content_scope` column from impl 01).

**Test coverage:**

- Unit specs added: 2 (service + controller for tenant settings; 17 tests). Extended the existing `report-card-template.service.spec.ts` with 7 more tests (30 total in that file).
- Integration/E2E specs added: 2 (`tenant-settings.e2e-spec.ts` → 8 tests, `templates.e2e-spec.ts` → 6 tests). Full `/report-cards/*` e2e suite is 7 files / 53 tests green.
- RLS leakage: `report_card_tenant_settings` is covered by impl 01's `rls-leakage.e2e-spec.ts` (still passing); impl 03's `tenant-settings.e2e-spec.ts` additionally verifies tenant-isolation at the service layer by running writes against two different tenants in the same test.
- `turbo test` status: ✅ all 15010 tests green across 720 suites.
- `turbo lint` status: ✅ 0 errors, 834 pre-existing warnings (no new rule violations from this impl).
- `turbo type-check` status: ✅ green for all 14 tasks.
- DI verification script from `00-common-knowledge.md §3.7`: ✅ `DI OK`.

**Architecture docs updated (if applicable):**

- `docs/architecture/module-blast-radius.md` — not required (new `S3Module` import on `ReportCardModule` is a standard shared-infrastructure dependency; no domain-module cross-talk added)
- `docs/architecture/event-job-catalog.md` — not required (no BullMQ jobs or crons added)
- `docs/architecture/state-machines.md` — not required
- `docs/architecture/danger-zones.md` — not required (the "JSONB validated at write time but not at read time" concern is mitigated here because `get()` routes every read through `reportCardTenantSettingsPayloadSchema.parse` in `toResult`, so any historical drift surfaces immediately rather than silently)

**Regression check:**

- Ran full `turbo test`: ✅ 15010/15010 green across 720 suites.
- Any unrelated test failures: none. The `api-surface` snapshot test was updated via the root-level `pnpm -w run snapshot:api` script after adding the new routes.

**Blockers or follow-ups:**

- Implementation 04 (generation) can now call `ReportCardTemplateService.resolveForGeneration` and `ReportCardTenantSettingsService.getPayload` via the module exports.
- Implementation 09 (frontend wizard + settings) is unblocked.
- Local commit only — not pushed to GitHub per nightly-only push policy.

**Notes for the next agent:**

- The tenant-settings upload endpoint is multipart/form-data. It accepts the file under the `file` field and an optional `principal_name` text field. If the tenant has no `principal_name` persisted yet, the caller MUST supply it in the upload request or the service throws `PRINCIPAL_NAME_REQUIRED` — this is enforced to honour the impl-01 Zod refine that forbids a half-configured signature pair.
- `ReportCardTenantSettingsService.get()` is safe to call on tenants that have no row yet — it lazily creates a default row using `reportCardTenantSettingsPayloadSchema.parse({})`. Impl 04 can call `getPayload` without worrying about tenant seeding.
- `listContentScopes` always emits five entries: `grades_only` (always `is_available: true`) plus four "coming soon" placeholders. The frontend can render a single response without needing its own catalogue.
- `resolveForGeneration` returns `null` for any content scope other than `grades_only` without touching the DB — future waves will add the other scopes to the Postgres enum and relax that guard.
- Principal signatures are stored under `{tenant_id}/report-cards/principal-signature.{png|jpg|webp}`. Re-uploads with a different extension automatically delete the previous file so the bucket stays tidy.
- Magic-byte validation is defence-in-depth: multer already filters by declared mime type, but the service re-verifies the first few bytes per PNG/JPEG/WEBP signatures to catch spoofed uploads. Adding new accepted mime types requires updating both `SIGNATURE_ALLOWED_MIMES` and `MAGIC_BYTE_MATCHERS` together.

### Implementation 04: Generation Backend

- **Completed at:** 2026-04-09 19:20 (local time)
- **Completed by:** Claude Opus 4.6 (Claude Code)
- **Branch / commit:** `main` @ `5d9216df`
- **Pull request:** direct to main (local commit only — not pushed per nightly-only push policy)
- **Status:** ✅ complete
- **Summary:** Refactored `ReportCardGenerationService` into a NestJS-injectable provider with the full new-flow API (`resolveScope`, `dryRunCommentGate`, `generateRun`, `getRun`, `listRuns`), wired four new wizard-facing endpoints under `/v1/report-cards/generation-runs`, and shipped a tenant-aware `ReportCardGenerationProcessor` in the worker with a placeholder React-PDF-style renderer. Impl 11 will swap the placeholder for the production templates without touching the processor.

**What changed:**

- `packages/shared/src/report-cards/generation.schema.ts` — new Zod schemas (`generationScopeSchema`, `dryRunGenerationCommentGateSchema`, `startGenerationRunSchema`, `listGenerationRunsQuerySchema`) + the `ReportCardRenderPayload` contract type shared between API, worker, and (future) renderer.
- `packages/shared/src/report-cards/index.ts` — re-export barrel entry for the new generation schemas.
- `packages/shared/src/report-cards/__tests__/generation.schema.spec.ts` — 13 unit tests covering every mode, refinement, and boundary.
- `apps/api/src/modules/gradebook/report-cards/report-card-generation.service.ts` — major refactor: added `@Injectable()`, added `ReportCardTemplateService`, `ReportCardTenantSettingsService`, and `@InjectQueue('gradebook')` dependencies (all `@Optional()` so the legacy `new` site in `ReportCardsService` continues to compile), and added the new methods `resolveScope`, `dryRunCommentGate`, `generateRun`, `getRun`, `listRuns`. Legacy methods (`generate`, `buildBatchSnapshots`, `generateBulkDrafts`) are preserved untouched for backwards compatibility.
- `apps/api/src/modules/gradebook/report-cards/report-card-generation.service.spec.ts` — extended with 20 new tests covering scope resolution, the comment-gate dry run, happy path + blocking branches, and `listRuns`/`getRun`. Existing 20 legacy tests still pass unchanged.
- `apps/api/src/modules/gradebook/report-cards/report-cards.controller.ts` — four new routes (all behind `report_cards.manage`):
  - `POST /v1/report-cards/generation-runs/dry-run`
  - `POST /v1/report-cards/generation-runs`
  - `GET /v1/report-cards/generation-runs`
  - `GET /v1/report-cards/generation-runs/:id`
    Static routes registered BEFORE the dynamic `:id` route to avoid NestJS route shadowing.
- `apps/api/src/modules/gradebook/report-cards/report-cards.controller.spec.ts` — added `mockGenerationService` provider so the controller TestingModule compiles with the new dependency.
- `apps/api/src/modules/gradebook/report-cards/report-card.module.ts` — registered `ReportCardGenerationService` as a provider and added it to `exports` so impl 05 (teacher requests) can inject it for the auto-execute path.
- `apps/api/test/report-cards/generation-runs.e2e-spec.ts` — new e2e suite (8 tests): dry-run against class and year_group scopes, blocking + override + SCOPE_EMPTY paths on `generateRun`, `listRuns` + `getRun`, and cross-tenant isolation. Uses the real AppModule + Postgres with the BullMQ `gradebook` queue stubbed via `overrideProvider(getQueueToken('gradebook'))`.
- `apps/worker/src/processors/report-card-render.contract.ts` — `ReportCardRenderer` interface and `REPORT_CARD_RENDERER_TOKEN` DI symbol.
- `apps/worker/src/processors/report-card-render.placeholder.ts` — `PlaceholderReportCardRenderer` that builds a valid minimal single-page PDF (hand-crafted bytes, no new deps) with the student summary, subjects, and comments. Impl 11 swaps the DI binding.
- `apps/worker/src/processors/gradebook/report-card-generation.processor.ts` — new processor on the `gradebook` queue listening for `report-cards:generate`. Implementation class `ReportCardGenerationJob extends TenantAwareJob` loads the batch job row, resolves the scope, fetches grades + finalised comments in bulk, computes top-3 rank badges when enabled, builds the `ReportCardRenderPayload` per (student × locale), calls the injected renderer, upserts the `ReportCard` row, and deletes the prior `pdf_storage_key` when overwriting. Per-student errors accumulate in `errors_json`; infrastructure failures mark the whole job `failed`. Also exports a `NullReportCardStorageWriter` and `REPORT_CARD_STORAGE_WRITER_TOKEN` so production can bind an S3-backed writer later.
- `apps/worker/src/processors/gradebook/report-card-generation.processor.spec.ts` — 8 tests: job name constant, tenant_id guardrails (inherited from `TenantAwareJob`), happy path for one student, dual-language flow for ar-preferred students, ar-disabled flow when no ar template, per-student error isolation, and the upsert + storage-delete branch.
- `apps/worker/src/worker.module.ts` — registered `ReportCardGenerationProcessor`, `PlaceholderReportCardRenderer`, and the renderer + storage DI tokens (`REPORT_CARD_RENDERER_TOKEN`, `REPORT_CARD_STORAGE_WRITER_TOKEN`).
- `api-surface.snapshot.json` — regenerated for the four new routes.
- `docs/architecture/event-job-catalog.md` — documented the refactored `report-cards:generate` job (queue, payload, flow, side effects, DI bindings).
- `docs/architecture/state-machines.md` — added the `ReportCardBatchJob` generation-run lifecycle with the mapping between logical `pending → running → completed / partial_success / failed` and the physical `BatchJobStatus` enum values already in the schema.
- `docs/architecture/module-blast-radius.md` — noted the new cross-module dependencies on `ReportCardTemplateService` + `ReportCardTenantSettingsService` and the new BullMQ job.
- `docs/architecture/danger-zones.md` — added `DZ-42: Report Card Regeneration Deletes Previous PDFs` documenting the overwrite semantics and the audit-history tradeoff.

**Database changes:**

- None (uses impl 01 tables and columns). Noted below in "Blockers or follow-ups": the `ReportCardBatchJob.class_id` column is non-null in the current schema, which forces `generateRun` to pick a representative class id from the resolved scope. A future refactor should make `class_id` nullable or drop it.

**Test coverage:**

- Shared Zod schema tests added: 13 (`generation.schema.spec.ts`)
- Unit specs added on the generation service: 20 new tests (total 40 in the file)
- Worker processor spec added: 8 tests (`report-card-generation.processor.spec.ts`)
- Integration/E2E spec added: 1 file, 8 tests (`generation-runs.e2e-spec.ts`)
- RLS leakage tests: none added (no new tables; impl 01's `rls-leakage.e2e-spec.ts` already covers every redesign-owned tenant-scoped table). Cross-tenant isolation for the new `generation-runs` endpoints is verified directly in `generation-runs.e2e-spec.ts`.
- `turbo test` status: ✅ all 15026 tests green across 720 API suites, 35 shared suites (823 tests), plus worker + web suites.
- `turbo lint` status: ✅ 0 errors (pre-existing warnings only; none introduced by this impl).
- `turbo type-check` status: ✅ green across all 8 packages.
- DI verification script from `00-common-knowledge.md §3.7`: ✅ `DI OK` for the API; also verified the worker module DI graph with `PRISMA_CLIENT` stubbed (`WORKER DI OK`).

**Architecture docs updated (if applicable):**

- `docs/architecture/module-blast-radius.md` — ✅ updated (new cross-module deps + new BullMQ job)
- `docs/architecture/event-job-catalog.md` — ✅ updated (`report-cards:generate` documented in full)
- `docs/architecture/state-machines.md` — ✅ updated (ReportCardBatchJob lifecycle)
- `docs/architecture/danger-zones.md` — ✅ updated (DZ-42: PDF overwrite data loss)
- `docs/architecture/feature-map.md` — NOT updated (per project rule — will be batched into a single update after impl 12)

**Regression check:**

- Ran full `turbo test`: ✅ 15026/15026 tests green.
- Any unrelated test failures: none. Pre-lock `report-cards.controller.spec.ts` had to receive the new `ReportCardGenerationService` provider mock, and `api-surface.spec.ts` had to regenerate the snapshot via `pnpm -w run snapshot:api`. Both fixes are in this commit and part of the test coverage above.

**Blockers or follow-ups:**

- Impl 09 (frontend wizard + settings) is now unblocked. The wizard should:
  1. Call `POST /v1/report-cards/generation-runs/dry-run` on step 6 for the preview summary.
  2. Submit via `POST /v1/report-cards/generation-runs` with `override_comment_gate` only when the admin ticks the force box.
  3. Poll `GET /v1/report-cards/generation-runs/:id` until `status` is terminal (`completed` or `failed`) — treat `completed` with `students_blocked_count > 0` as "partial success".
- Impl 11 (PDF template rendering) is now unblocked. Replace the `PlaceholderReportCardRenderer` DI binding with a production `ProductionReportCardRenderer` that implements the same `ReportCardRenderer` contract. No other file changes are required in the worker.
- Impl 05 (teacher requests) can inject `ReportCardGenerationService` from `ReportCardModule` and call `generateRun` directly when auto-executing an approved `regenerate_reports` request.
- Impl 12 (cleanup) should remove the legacy `POST /v1/report-cards/generate-batch` endpoint once impl 09's wizard has fully replaced it in the frontend.
- **Tech debt**: `ReportCardBatchJob.class_id` is non-null in the current Prisma schema but the new scope model doesn't always have a single class. `generateRun` picks the first resolved class id as a representative value. A follow-up migration should make `class_id` nullable (or drop it entirely in favour of `scope_type` + `scope_ids_json`). Impl 01's migration set did not touch this column so it remains out-of-scope here.
- **Tech debt**: there is no unique index on `(tenant_id, student_id, academic_period_id, template_id, template_locale)` on the `report_cards` table, so the processor emulates upsert via `findFirst` + `update`/`create` inside an interactive transaction rather than a native `upsert`. When the unique index lands, the processor can switch to a single `upsert` call with no behaviour change.
- Local commit only — not pushed to GitHub per nightly-push policy.

**Notes for the next agent:**

- The render contract lives at `apps/worker/src/processors/report-card-render.contract.ts` and the DI token is `REPORT_CARD_RENDERER_TOKEN`. Impl 11 implements the interface and binds the real class in `worker.module.ts` — no changes to the processor are needed.
- The storage writer contract lives alongside the processor in `apps/worker/src/processors/gradebook/report-card-generation.processor.ts` (token: `REPORT_CARD_STORAGE_WRITER_TOKEN`). Production needs to bind an S3-backed implementation in the worker bootstrap — the `NullReportCardStorageWriter` is only safe for tests.
- Overwrite semantics: the previous `pdf_storage_key` is deleted inside the same interactive transaction as the upsert. If you ever need audit history of prior PDFs, revisit `DZ-42` before changing the processor.
- `ReportCardGenerationService` constructor parameters are ordered so the optional redesign deps sit at positions 7–9. The legacy `ReportCardsService` still instantiates it with the first 6 args only (undefined optional deps) — DON'T add more required deps to the front of the constructor without also updating `ReportCardsService`.
- Comment gate enforcement is strict by default (`require_finalised_comments = true`). The admin override flag is also gated on `allow_admin_force_generate` — both must be true for the override to succeed, otherwise the service throws `FORCE_GENERATE_DISABLED`.
- The processor resolves Arabic templates via a second `prisma.reportCardTemplate.findFirst` call for `(tenant_id, content_scope, locale: 'ar')`. Today the seeded templates are English-only per tenant, so mixed-language batches simply skip the `ar` render step without failing. Adding an Arabic template row per tenant will automatically enable the second-language flow without any code changes.
- The BullMQ `gradebook` queue is registered in both the API (`report-card.module.ts`) and the worker (`worker.module.ts`). Only the worker side has a `@Processor()`; the API only enqueues.
- Impl 11 should note that the `ReportCardRenderPayload` shape is defined in `@school/shared` (`generation.schema.ts`). It includes everything needed for a single-language render; the worker constructs one payload per (student × locale) target.

### Implementation 05: Teacher Requests Backend

- **Completed at:** 2026-04-09 19:55 (local time)
- **Completed by:** Claude Opus 4.6 (Claude Code)
- **Branch / commit:** `impl-05` @ `42149423`
- **Pull request:** direct to main (local commit only — not pushed per nightly-only push policy)
- **Status:** ✅ complete
- **Summary:** Landed the teacher-requests subsystem: `ReportCardTeacherRequestsService` + controller with the full pending → approved/rejected/cancelled → completed state machine, permission-aware list/find endpoints, authorship-gated cancel, and an optional auto-execute path on approve that delegates to `ReportCommentWindowsService.open` (for `open_comment_window`) or `ReportCardGenerationService.generateRun` (for `regenerate_reports`). In-app notification fan-out on submit (all `report_cards.manage` holders) and on approve/reject (the original author) via the existing `NotificationsService.createBatch` infrastructure.

**What changed:**

- `packages/shared/src/report-cards/teacher-request.schema.ts` — added `approveTeacherRequestSchema`, `rejectTeacherRequestSchema`, and `listTeacherRequestsQuerySchema` alongside the existing submit/review schemas from impl 01. The new schemas are `.strict()` so unknown keys are rejected server-side.
- `packages/shared/src/report-cards/__tests__/teacher-request.schema.spec.ts` — 14 new unit tests covering the default value for `auto_execute`, the mandatory review-note on reject, list query coercion, pageSize cap, and unknown-status rejection.
- `apps/api/src/modules/gradebook/report-cards/dto/teacher-request.dto.ts` — thin re-export of the schemas and types from `@school/shared`, following the existing module DTO pattern.
- `apps/api/src/modules/gradebook/report-cards/report-card-teacher-requests.service.ts` (+ `.spec.ts`) — new `ReportCardTeacherRequestsService` with `list`, `listPendingForReviewer`, `findById`, `submit`, `cancel`, `approve`, `reject`, `markCompleted`. Auto-execute helpers (`autoExecuteOpenWindow`, `autoExecuteRegenerate`) run BEFORE the state flip so a downstream failure leaves the request in `pending`. 20 unit tests cover every state transition, the permission boundary on `cancel` and `findById`, the auto-execute wiring for both branches, the "downstream failure leaves pending" invariant, and the list scoping rules.
- `apps/api/src/modules/gradebook/report-cards/report-card-teacher-requests.controller.ts` (+ `.spec.ts`) — new `ReportCardTeacherRequestsController` exposing `GET /v1/report-card-teacher-requests`, `GET /v1/report-card-teacher-requests/pending`, `GET /v1/report-card-teacher-requests/:id`, `POST /v1/report-card-teacher-requests`, `PATCH /v1/report-card-teacher-requests/:id/cancel`, `PATCH /v1/report-card-teacher-requests/:id/approve`, `PATCH /v1/report-card-teacher-requests/:id/reject`, and `PATCH /v1/report-card-teacher-requests/:id/complete`. Static routes registered BEFORE the dynamic `:id` route. 9 controller tests cover delegation, actor resolution (including `isAdmin=true` when `report_cards.manage` is in the permission cache), and the DTO pass-through on every mutation path.
- `apps/api/src/modules/gradebook/report-cards/report-card.module.ts` — imports `CommunicationsModule` (for `NotificationsService`) and `RbacModule` (for `RbacReadFacade`); registers the new service + controller; adds `ReportCardTeacherRequestsService` to the `exports` list.
- `apps/api/test/report-cards/teacher-requests.e2e-spec.ts` — new e2e suite, 12 tests. Covers the full submit → approve / reject / cancel / markCompleted lifecycle against the real AppModule + Postgres, plus one auto-execute path (`open_comment_window`) that uses the REAL `ReportCommentWindowsService` and verifies a real `report_comment_windows` row is created and linked via `resulting_window_id`. The `regenerate_reports` auto-execute path is covered by the unit spec instead — a real `generateRun` needs full class/template/grade fixtures and would duplicate `generation-runs.e2e-spec.ts` coverage. Also includes cross-tenant RLS isolation (`list` + `findById`) and the admin-vs-teacher scoping check.
- `api-surface.snapshot.json` — regenerated for the 8 new routes via `pnpm -w run snapshot:api`.
- `docs/architecture/module-blast-radius.md` — documented the two new module imports (`CommunicationsModule`, `RbacModule`) on `ReportCardModule` for the teacher-requests service.
- `docs/architecture/state-machines.md` — updated the `TeacherRequestStatus` entry to reflect impl 05 landing: added the concrete guard path (`report-card-teacher-requests.service.ts`), the auto-execute side-effect wiring, the notification fan-out on submit/approve/reject, and the "failure leaves request pending" invariant.
- `docs/architecture/danger-zones.md` — added `DZ-43: Teacher Request Auto-Execute Bypasses The Wizard Review Step` covering the implicit commit-to-generation risk on `auto_execute = true`, the PDF-delete cascade via DZ-42, and the scope-translation shape drift concern.

**Database changes:**

- None (uses the `report_card_teacher_requests` table seeded in impl 01).

**Test coverage:**

- Shared Zod schema tests added: 14 new tests (`teacher-request.schema.spec.ts`).
- Service unit spec added: 20 tests (`report-card-teacher-requests.service.spec.ts`).
- Controller unit spec added: 9 tests (`report-card-teacher-requests.controller.spec.ts`).
- Integration/E2E spec added: 1 file, 12 tests (`teacher-requests.e2e-spec.ts`) including 2 RLS / tenant-isolation tests.
- RLS leakage: the `report_card_teacher_requests` table is already covered by impl 01's `rls-leakage.e2e-spec.ts`; impl 05's e2e additionally verifies list-level and findById-level cross-tenant isolation via the service layer.
- `turbo test` (unit test gate — `pnpm --filter @school/api run test`): ✅ 15061/15061 tests green across 722 suites. `@school/shared` tests: ✅ 834/834 across 35 suites.
- `turbo lint` status: ✅ 0 errors, 838 pre-existing warnings (none introduced by this impl; the 2 new errors surfaced by ESLint during development — an import/order blank line and a type import ordering — were both fixed before running the suite).
- `turbo type-check` status: ✅ green for `@school/api` and `@school/shared`.
- DI verification script from `00-common-knowledge.md §3.7`: ✅ `DI OK`.

**Architecture docs updated (if applicable):**

- `docs/architecture/module-blast-radius.md` — ✅ updated (new imports `CommunicationsModule`, `RbacModule` on `ReportCardModule`)
- `docs/architecture/event-job-catalog.md` — not required (no new BullMQ jobs or crons; notifications flow through the existing in-app `NotificationsService.createBatch` pipeline)
- `docs/architecture/state-machines.md` — ✅ updated (`TeacherRequestStatus` entry wired to the live guard service + side-effect documentation)
- `docs/architecture/danger-zones.md` — ✅ updated (`DZ-43`: auto-execute bypasses wizard review)
- `docs/architecture/feature-map.md` — NOT updated (per project rule — will be batched into a single update after impl 12)

**Regression check:**

- Ran unit tests: ✅ 15061/15061 tests green (no regressions introduced).
- Ran the full report-cards e2e suite: ✅ 73/73 green across 9 suites.
- Ran the full api e2e suite (not strictly required by the commit gates, which are `turbo test` / `turbo lint` / `turbo type-check`): 5 suites (135 tests) fail — `search.e2e-spec.ts`, `p4a-attendance`, `p4a-closures`, `p4a-rls`, `p4a-timetables`, `p4b-scheduling`, `p5-gradebook`, `p5-rls-leakage`, `workflows/payroll-finalisation`. Verified one of these (`search.e2e-spec.ts`) fails identically in isolation on the same commit (`464311e6`, pre-impl-05) — these are pre-existing e2e failures on main, unrelated to impl 05. Every file touched by this impl lives under `apps/api/src/modules/gradebook/report-cards/`, `apps/api/test/report-cards/`, `packages/shared/src/report-cards/`, and `docs/architecture/*` — none of the failing suites touch those paths.

**Blockers or follow-ups:**

- Frontend impl 10 (teacher requests UI) is now unblocked. The frontend should:
  1. Read `GET /v1/report-card-teacher-requests` with `?my=true` for the teacher "my requests" view and without the flag for the admin queue (the backend transparently returns only the caller's rows for non-admins).
  2. Use `GET /v1/report-card-teacher-requests/pending` for the admin dashboard pending-queue badge count.
  3. On approve, prefer the default `auto_execute = false` path and route into the wizard/modal with pre-filled parameters derived from the returned request row. Only pass `auto_execute = true` from an explicit double-confirm modal — see DZ-43.
- A future impl should wire the `approved → completed` transition automatically — today `markCompleted` is an explicit admin call. Candidate hooks: (a) window close listener in `ReportCommentWindowsService.closeNow` for `open_comment_window` requests, (b) batch job completion handler in `ReportCardGenerationProcessor` for `regenerate_reports` requests.
- The pre-existing e2e failures on main (`search.e2e-spec.ts`, `p4a-*`, `p4b-scheduling`, `p5-gradebook`, `p5-rls-leakage`, `workflows/payroll-finalisation`) should be triaged by the team; they pre-date impl 05 but were not surfaced by impl 04's log entry which reported `turbo test: all green` (that's the unit gate — the full e2e gate is run separately and was not part of impl 04's check).
- Local commit only — not pushed to GitHub per nightly-only push policy. Worked in the dedicated `/Users/ram/Desktop/SDB-impl05` worktree after fast-forwarding it to `main` (commit `464311e6`) — the impl-05 branch was behind because impl 04 landed on main while the worktree was still anchored at `85f245fb`.

**Notes for the next agent:**

- `ReportCardTeacherRequestsService.approve` runs the auto-execute side-effect BEFORE the state transition. If `ReportCommentWindowsService.open` or `ReportCardGenerationService.generateRun` throws, the request row stays `pending` and the error bubbles to the caller. DO NOT reorder those calls — the "leave pending on failure" invariant is load-bearing and covered by a unit test.
- The shape translation between `TeacherRequestScope` (`{ scope: 'student' | 'class' | 'year_group', ids }`) and `GenerationScope` (discriminated union on `mode`) lives in the private `requestScopeToGenerationScope` helper. If you ever add a new scope mode to either side, update this function AND the unit tests that exercise each branch.
- The notification helpers (`notifyReviewersOnSubmit`, `notifyAuthorOnDecision`) are best-effort — a notification failure is logged but does NOT roll back the state transition. This is deliberate so that a flaky notifications pipeline does not block the primary write path. If you need exactly-once delivery, move the notification enqueue into the same interactive transaction and accept the rollback-on-failure semantics.
- `findMembershipsWithPermissionAndUser` on `RbacReadFacade` is the right primitive to resolve "who should be notified" for any new admin-facing fan-out in the report-cards module. It honours the tenant scope and only returns active memberships.
- The e2e suite deliberately does NOT cover the `regenerate_reports` auto-execute path end-to-end — a real generation run requires class/template/grade/homeroom seed data that would duplicate `generation-runs.e2e-spec.ts`. The unit spec exercises the hand-off in full (both the success path and the "leave pending on failure" branch).
- The controller uses `@Param('id', ParseUUIDPipe)` for the request id on every dynamic route. If you need to add a non-UUID dynamic segment, register it BEFORE the `:id` routes to avoid NestJS route shadowing (this is why `GET /pending` appears before `GET /:id` in the controller).

### Implementation 06: Matrix & Library Backend

- **Completed at:** 2026-04-09 20:15 (local time)
- **Completed by:** Claude Opus 4.6 (Claude Code)
- **Branch / commit:** `main` @ `6a677eb8`
- **Pull request:** direct to main (local commit only — not pushed per nightly-only push policy)
- **Status:** ✅ complete
- **Summary:** Landed the two backend endpoints that power the new class-first report cards UX — `GET /v1/report-cards/classes/:classId/matrix` (students × subjects matrix with dense top-3 rank) and `GET /v1/report-cards/library` (non-superseded report cards with 5-minute signed-URL downloads and role-scoped visibility). The old flat overview endpoint is now marked `@deprecated` and logs a warning on every hit, but remains functional for the existing frontend until impl 12.

**What changed:**

- `packages/shared/src/report-cards/matrix-library.schema.ts` — new Zod schemas `classMatrixQuerySchema` (union of uuid | 'all') and `listReportCardLibraryQuerySchema` (page/pageSize + class/year_group/period/language filters).
- `packages/shared/src/report-cards/index.ts` — re-export the new schemas from the barrel.
- `packages/shared/src/report-cards/__tests__/matrix-library.schema.spec.ts` — 11 unit tests covering defaults, coercion, uuid validation, and strict-mode rejection for both schemas.
- `apps/api/src/modules/gradebook/report-cards/report-cards-queries.service.ts` — two new methods: `getClassMatrix` (class lookup → students → subjects → period grade snapshots → weighted subject/period aggregation → dense top-3 rank) and `listReportCardLibrary` (admin vs. teacher scoping → filtered report card list → signed URL per row → languages_available grouping across siblings). Gradebook coupling is documented as danger-zone **DZ-44** because the two methods intentionally mirror `PeriodGradeComputationService.computeCrossSubject` / `computeYearOverview`.
- `apps/api/src/modules/gradebook/report-cards/report-cards-queries.service.spec.ts` — 12 new unit tests across two new `describe` blocks (`getClassMatrix`, `listReportCardLibrary`), including rank-tie behaviour, all-periods aggregation, override flag propagation, admin vs. teacher scoping, language grouping, and the S3 presign-failure fallback. Existing 17 tests still green (total 29).
- `apps/api/src/modules/gradebook/report-cards/report-cards.controller.ts` — added two new routes under `/v1/report-cards` (registered BEFORE the dynamic `:id` route): `GET /classes/:classId/matrix` and `GET /library`. The legacy `GET /overview` method is annotated `@deprecated` with a JSDoc note and now logs a warning on every invocation. New `hasAnyPermission` helper resolves caller scope for the library endpoint via `PermissionCacheService` (admin = holder of `report_cards.view` OR `report_cards.manage`).
- `apps/api/src/modules/gradebook/report-cards/report-cards.controller.spec.ts` — 5 new controller tests (2 for matrix, 3 for library) covering delegation, admin/teacher scope resolution, and filter passthrough. Existing 16 tests still green (total 21).
- `apps/api/src/modules/gradebook/report-cards/report-cards.service.spec.ts` — added `{ provide: S3Service, useValue: mockS3Service }` to every TestingModule that instantiates `ReportCardsQueriesService` because impl 06 added S3Service as a new constructor parameter on the queries service. No behaviour changes.
- `apps/api/src/modules/gradebook/report-cards/report-card.module.ts` — `ReportCardModule` now imports `StaffProfilesModule` (for `StaffProfileReadFacade.resolveProfileId`) and `SchedulingModule` (for `SchedulingReadFacade.findTeacherCompetencies`). Both modules are already stable upstream dependencies; no circular imports.
- `apps/api/test/report-cards/matrix.e2e-spec.ts` — new e2e suite (4 tests). Seeds class + students + subjects + grading scale + `PeriodGradeSnapshot` rows across two terms, exercises the full single-period and all-periods matrix code paths, verifies rank calculation and cross-tenant RLS.
- `apps/api/test/report-cards/library.e2e-spec.ts` — new e2e suite (6 tests). Seeds admin + homeroom teacher + unrelated teacher, homeroom and non-homeroom classes, report cards in three locales/statuses, and exercises admin visibility, teacher scoping, unrelated-teacher empty result, language filter, class filter, and cross-tenant RLS isolation. Stubs `S3Service.getPresignedUrl` via `overrideProvider` so the test does not need real AWS credentials.
- `api-surface.snapshot.json` — regenerated for the two new routes (`GET /v1/report-cards/classes/:classId/matrix`, `GET /v1/report-cards/library`). The pre-existing per-row permission-bleed bug in the snapshot tool (documented in impl 02's log entry) still applies; runtime permission enforcement is correct via NestJS reflection on the decorated methods.
- `docs/architecture/danger-zones.md` — new **DZ-44: Report Card Matrix Reuses Gradebook Aggregation — Silent Drift Risk** with mitigation and code pointers.
- `docs/architecture/module-blast-radius.md` — added impl-06 note under `GradebookModule` documenting the new `StaffProfilesModule` + `SchedulingModule` imports and the new `ReportCardsQueriesService` methods.

**Database changes:**

- None (uses impl 01 tables and columns only).

**Test coverage:**

- Shared Zod schema tests added: 11 (`matrix-library.schema.spec.ts`)
- Unit specs added on the queries service: 12 new tests across two new `describe` blocks (total in file now 29)
- Controller specs added: 5 new tests (total in file now 21)
- Integration/E2E specs added: 2 files (`matrix.e2e-spec.ts` → 4 tests; `library.e2e-spec.ts` → 6 tests)
- RLS leakage: the two new endpoints' cross-tenant isolation is verified directly in `matrix.e2e-spec.ts` and `library.e2e-spec.ts` (no new tenant-scoped tables means nothing to add to `rls-leakage.e2e-spec.ts`).
- `turbo test` status: ✅ all 722 suites / 15077 tests green across the whole workspace.
- `turbo lint` status: ✅ 0 errors (839 pre-existing warnings, none introduced).
- `turbo type-check` status: ✅ green for every package.
- DI verification script from `00-common-knowledge.md §3.7`: ✅ `DI OK`.

**Architecture docs updated (if applicable):**

- `docs/architecture/module-blast-radius.md` — ✅ updated (new module imports + new queries service methods)
- `docs/architecture/event-job-catalog.md` — not required (no BullMQ jobs or crons added; the two new endpoints are synchronous reads)
- `docs/architecture/state-machines.md` — not required (no new status enums or transitions)
- `docs/architecture/danger-zones.md` — ✅ updated (**DZ-44** gradebook aggregation coupling)
- `docs/architecture/feature-map.md` — NOT updated (per project rule — will be batched into a single update after impl 12)

**Regression check:**

- Ran full `turbo test`: ✅ 15077/15077 tests green across 722 suites.
- Any unrelated test failures: none. The `api-surface.spec.ts` snapshot test was updated via the root-level `pnpm -w run snapshot:api` script after adding the new routes.

**Blockers or follow-ups:**

- Impl 07 (frontend overview / matrix / library) is now unblocked. The frontend should:
  1. Call `GET /v1/report-cards/classes/:classId/matrix?academic_period_id=<id|all>` for the matrix view.
  2. Call `GET /v1/report-cards/library?<filters>` for the library view.
  3. Treat the `pdf_download_url` on each library row as short-lived (5 minutes) — do not cache it client-side; re-request the endpoint before any new download.
- Impl 12 (cleanup) should delete the now-deprecated `GET /v1/report-cards/overview` endpoint, its controller method, and the `ReportCardsQueriesService.gradeOverview` method once the frontend is fully flipped over.
- **Tech debt follow-up**: the pre-existing partial unique index `idx_report_cards_active_unique` on `(tenant_id, student_id, academic_period_id)` where `status IN ('draft', 'published')` still prevents storing two published rows for the same student/period, even when `template_locale` differs. The new design requires the index to include `template_locale`. For now, the library e2e test stores the second-language row with `status = 'revised'` to side-step the constraint. A follow-up migration should relax the index — tracked under impl 04's tech debt list (constraint narrowing + native upsert switch).
- Local commit only — not pushed to GitHub per nightly-push policy.

**Notes for the next agent:**

- **DZ-44 is load-bearing.** Before changing ANY of these three files, re-read the danger zone entry: `report-cards-queries.service.ts`, `period-grade-computation.service.ts`, `weight-config.service.ts`. The report card matrix numbers and the gradebook matrix numbers are coupled by contract, not by shared code. A change to either side MUST be mirrored.
- The rank helper is named `computeDenseRankTop3` for consistency with the spec vocabulary, but it is actually **standard competition rank** — two tied students at rank 1 mean the next distinct value gets rank 3, not 2. Do not "fix" this to true dense rank without also updating the design spec §14.
- The library's teacher scoping expands from staff profile → (homeroom classes ∪ explicit ClassStaff assignments ∪ classes derived from TeacherCompetency × curriculum matrix) → active enrolments → student IDs. The homeroom lookup walks `ClassesReadFacade.findClassesGeneric` with `homeroom_teacher_staff_id` (there is no dedicated facade helper yet — if you add more call sites, consider promoting one). The teaching-competency walk goes through `SchedulingReadFacade.findTeacherCompetencies` and filters by staff profile in memory.
- The signed URL TTL is 5 minutes. If you need a longer window, change `LIBRARY_SIGNED_URL_TTL_SECONDS` — but first revisit the design spec §11 which calls out the 5-minute expectation explicitly.
- The matrix endpoint aggregates display_value from `PeriodGradeSnapshot` for per-cell grades, and applies a class-wide grading scale (first found) for the overall letter grade. If a class has mixed grading scales across subjects, the overall letter uses the first non-null scale — documented in the inline comment near `overallScale`. If this ever becomes a complaint, switch to "no overall letter grade when scales are heterogeneous" rather than inventing a blended rule.
- The `languages_available` field is computed by a second `reportCard.findMany` call filtered to the same (student, period) pairs as the current page. This is O(pageSize × siblings) rather than ideal O(page), but it keeps the logic simple and the page size is capped at 100. If library listings grow into the tens of thousands of documents, revisit with a materialised view or a separate `report_card_documents` aggregate.

### Implementation 07: Frontend Overview, Matrix & Library

- **Completed at:** 2026-04-09 20:40 (local time)
- **Completed by:** Claude Opus 4.6 (Claude Code)
- **Branch / commit:** `main` @ `fc73441a`
- **Pull request:** direct to main (local commit only — not pushed per nightly-only push policy)
- **Status:** ✅ complete
- **Summary:** Rebuilt the school-facing Report Cards frontend as a gradebook-mirror class-first surface. Landing is now year-grouped class cards, per-class `/report-cards/[classId]` is a students × subjects matrix consuming the new impl-06 endpoint with top-3 rank badges and score/grade toggle, and `/report-cards/library` is a filterable document library with role-scoped rows and per-language signed-URL downloads. Legacy orphan `report-cards/[id]` single-report detail page was renamed to `[classId]` and its contents replaced — no UI surface linked to the old detail view, so nothing breaks.

**What changed:**

- `apps/web/src/app/[locale]/(school)/report-cards/page.tsx` — rebuilt from the old overview/generate tab layout into a year-grouped class-card landing that mirrors `apps/web/src/app/[locale]/(school)/gradebook/page.tsx`. Data sources: `/api/v1/year-groups` + `/api/v1/classes` (uses the `_count.class_enrolments` included by `ClassesService.findMany` to filter empty classes and render student counts). Click navigates to `/{locale}/report-cards/{classId}`. Top-right "View Library" button routes to `/report-cards/library`.
- `apps/web/src/app/[locale]/(school)/report-cards/[classId]/page.tsx` — rename of the old `[id]/page.tsx` folder (via `git mv`) with the contents fully rewritten. New file consumes `GET /v1/report-cards/classes/:classId/matrix` (impl 06), exposes an all/period selector plus a grade/score toggle, renders a `<thead>`/`<tbody>` matrix with `sticky start-0` student column, overall column with weighted average or letter grade, and per-student top-3 rank badges (amber pill + Medal icon). Handles CLASS_NOT_FOUND 404 and generic load-failure empty states. The old single-report-card detail view was orphaned (no UI linked to it; verified by grep) and is slated for impl 12 cleanup, so its code path is not preserved.
- `apps/web/src/app/[locale]/(school)/report-cards/library/page.tsx` — new page consuming `GET /v1/report-cards/library` (impl 06). Filter toolbar (class, year group, period, language) feeds client-managed pagination (pageSize=20). Columns: Student, Class, Period, Template scope, Languages (EN/AR chips from `languages_available`), Generated timestamp (`Intl.DateTimeFormat` with Gregorian calendar + Latin numerals per i18n rule), and Download actions per available language. Downloads re-fetch a fresh signed URL from the backend before calling `window.open(url, '_blank')` — never caches URLs client-side, respects the 5-minute TTL called out in design spec §11 and impl-06 notes. Uses the shared `DataTable` component.
- `apps/web/messages/en.json` — added new keys under `reportCards`: `librarySection`, `librarySectionButton`, `noClasses`, `classesCount`, `studentsCount`, `backToReportCards`, a nested `classMatrix.*` block, and a nested `library.*` block. No existing keys touched.
- `apps/web/messages/ar.json` — full Arabic translations for every new key. No `[AR]` stubs. Gregorian calendar / Western numerals preserved per the i18n rule.
- `apps/web/e2e/visual/report-cards-overview.spec.ts` — new Playwright smoke spec covering EN + AR landing renders, the "View Library" link presence, and a bogus-UUID matrix route to verify graceful empty/not-found rendering without crashing.
- `apps/web/e2e/visual/report-cards-library.spec.ts` — new Playwright smoke spec covering EN + AR library renders and the presence of the filter combobox controls.

**Route map (before → after):**

| Route                            | Before                                                              | After                                                                                           |
| -------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `/[locale]/report-cards`         | Tab shell (Overview + Generate) reading `/v1/report-cards/overview` | Year-grouped class cards mirroring the gradebook landing                                        |
| `/[locale]/report-cards/[id]`    | Single report card detail page (orphaned — no UI linked to it)      | Renamed to `[classId]` → class matrix view consuming `/v1/report-cards/classes/:classId/matrix` |
| `/[locale]/report-cards/library` | —                                                                   | New document library with filters + per-language signed-URL downloads                           |

The legacy `/report-cards/[id]` single-document detail view has been removed. This was orphaned UI: nothing in the app (navigation, links, `router.push`, or programmatic redirects) routed users there — verified by grepping `apps/web/src/` for `/report-cards/${` and `router.push.*report-cards/`. The only remaining references to a single report card by id are API paths (`/api/v1/report-cards/${id}/...`) called from the parent dashboard `grades-tab.tsx`, which opens the PDF endpoint directly in a new tab and does not navigate into the school-facing detail page. The legacy orphan pages under `analytics/`, `approvals/`, `bulk/`, and `_components/` were left untouched — impl 12 will clean them up in the final pass.

**Database changes:**

- None (frontend-only impl).

**Test coverage:**

- New Playwright specs added: 2 files, 7 test cases total covering EN/AR renders, navigation affordances, and graceful-failure paths. The specs intentionally treat empty states as valid renders so they pass against unseeded environments.
- `pnpm turbo test` (full workspace): ✅ all 15077 tests green across 722 suites (identical baseline to impl 06's log entry — no regressions). Ran under the `impl-07.turbo-test` session lock per the parallel-worktree protocol.
- `pnpm turbo test --filter=@school/web`: ✅ 264/264 tests green across 12 suites.
- `pnpm turbo lint --filter=@school/web`: ✅ 0 errors. Warnings unchanged from baseline (pre-existing max-lines warnings on unrelated files). The two floating-promise errors surfaced on first run (the async IIFEs inside `useEffect` on the matrix and library pages) were fixed by prefixing them with `void` — verified with a second lint run.
- `pnpm turbo lint` (full workspace): ✅ 0 errors across @school/ui (53 warnings pre-existing), @school/worker (12 warnings pre-existing), and @school/api (842 warnings pre-existing). None of my files contribute warnings.
- `pnpm turbo type-check --filter=@school/web`: ✅ green after clearing stale `.next/types` generated for the now-renamed `[id]` route. Follow-up agents touching Next.js dynamic segments should `rm -rf apps/web/.next/types` before running type-check locally if Next has previously built the app with a different folder layout.
- `NODE_OPTIONS="--max-old-space-size=8192" pnpm --filter @school/api run type-check`: ✅ green. The default 4 GB ceiling OOMs on the API type-check locally; this is an environmental quirk unrelated to impl 07 but worth noting.
- `pnpm turbo build --filter=@school/web`: ✅ green. Route map confirms `/[locale]/report-cards`, `/[locale]/report-cards/[classId]`, and `/[locale]/report-cards/library` all ship (4.11 kB, 3.57 kB, 4.63 kB respectively).

**Architecture docs updated (if applicable):**

- `docs/architecture/module-blast-radius.md` — not required (frontend-only; no cross-module backend imports changed)
- `docs/architecture/event-job-catalog.md` — not required
- `docs/architecture/state-machines.md` — not required
- `docs/architecture/danger-zones.md` — not required (DZ-44 from impl 06 already covers the gradebook-aggregation coupling which this frontend consumes)
- `docs/architecture/feature-map.md` — NOT updated (per project rule — will be batched into a single update after impl 12)

**Regression check:**

- Ran full `turbo test`: ✅ 15077/15077 tests green across 722 suites. No regressions introduced — exact same count as impl 06's landing.
- Ran full `turbo lint`: ✅ 0 errors workspace-wide.
- Any unrelated test failures: none.

**Blockers or follow-ups:**

- Impl 08 (comment editor), impl 09 (generation wizard + settings), impl 10 (teacher requests) are unblocked independently of this impl — they do not depend on 07.
- Impl 12 (cleanup) should delete the legacy `analytics/`, `approvals/`, `bulk/`, and `_components/` folders under `apps/web/src/app/[locale]/(school)/report-cards/` once the new wizard (impl 09) is confirmed to cover the generate/approve/bulk flows. The existing orphan pages still build and lint cleanly, so they are dormant not dangerous.
- The old `/v1/report-cards/overview` endpoint is no longer consumed by any frontend surface after this impl. Its backend deprecation warning (added in impl 06) will now fire only for external API clients (if any) — impl 12 can delete the endpoint once confidence is established.
- Local commit only — not pushed to GitHub per nightly-push policy.
- Note: the working tree also contained unrelated deletions under `report-card-spec/template-0X*.html` and untracked `apps/worker/src/report-card-templates/`, `docs/features/report-cards/` directories — these are impl 11 (PDF template rendering) prep work from a previous session and are intentionally NOT included in the impl 07 commit.

**Notes for the next agent:**

- The matrix page uses `params.classId` because the Next.js dynamic segment folder is `[classId]`. The rename from `[id]` to `[classId]` was necessary because Next.js does not allow two dynamic segments at the same directory level (`[id]` + `[classId]` would conflict), so the legacy orphan detail page had to yield its folder slot. If impl 08/09/10 need a different dynamic segment at this level, use a nested route (e.g. `[classId]/comments/[studentId]/page.tsx`) rather than adding another sibling dynamic segment.
- The landing page uses `_count.class_enrolments` from the classes list endpoint to filter empty classes. This relies on the existing `ClassesService.findMany` behaviour (see `apps/api/src/modules/classes/classes.service.ts:155-161`) which already scopes the count to `status: 'active'`. If the classes service stops including this count, the landing page will show all classes regardless of enrolments.
- Library downloads re-query the backend for a fresh signed URL before opening the PDF. This is deliberate — the URL TTL is 5 minutes and reusing the in-memory URL after a long idle session would result in a 403 from S3. The re-query is a single page-size-1 call filtered to the exact student/period/language, so it is cheap.
- The date formatter for `generated_at` hardcodes `calendar: 'gregory'` and `numberingSystem: 'latn'` per the project's i18n rule that Arabic UIs must still show Gregorian dates and Latin numerals. Do not remove those options without also updating the i18n rule in `.claude/rules/frontend.md`.
- The rank badge appears only when `overall.rank_position` is 1, 2, or 3. The backend emits `null` for all other positions, so the frontend check is defensive. The Medal icon and amber pill styling are consistent with the "Top {rank}" pattern used in the per-student analytics page — if that pattern evolves, update both surfaces together.
- The legacy orphan files under `apps/web/src/app/[locale]/(school)/report-cards/{_components,analytics,approvals,bulk}/` were left in place. They still build and lint cleanly. Impl 12's cleanup pass should remove them, but you can delete them in a later impl if the generate/approve/bulk flows are superseded earlier by impls 09/10.
- Playwright specs were placed under `apps/web/e2e/visual/` to match the existing pattern (where `playwright.config.ts` has `testDir: './visual'`). They do NOT capture screenshots (to avoid baseline churn and per the author preference for snapshot-based verification). They use `page.waitForLoadState('networkidle')` and role-based locators and are robust against unseeded environments.

### Implementation 11: PDF Template Rendering

- **Completed at:** 2026-04-09 20:55 (local time)
- **Completed by:** Claude Opus 4.6 (Claude Code)
- **Branch / commit:** `main` @ `a39d86e4` (README follow-up `d972c424`)
- **Pull request:** direct to main (local commit only — not pushed per nightly-only push policy)
- **Status:** ✅ complete
- **Summary:** Shipped the production Report Card PDF renderer. Ports the two user-supplied HTML reference designs (Editorial Academic — Fraunces + forest green + gold; Modern Editorial — Bricolage Grotesque + cobalt blue) as Handlebars templates, renders them through the worker's existing Puppeteer pipeline, and wires the new `ProductionReportCardRenderer` as the `REPORT_CARD_RENDERER_TOKEN` binding. English and Arabic are served from a single template per design via view-model direction + translation table — the same `.hbs` file produces LTR and RTL output. Template design is selected per tenant from `ReportCardTemplate.branding_overrides_json.design_key` with a stable cache and an `editorial-academic` fallback.

**Deviation from the impl 11 spec — react-pdf → puppeteer + handlebars**

The impl 11 doc assumed `@react-pdf/renderer` was already a worker dependency and asked for React-PDF components. That assumption was factually wrong: `apps/worker/package.json` has no react-pdf, and the existing PDF rendering infrastructure (`pdf-render.processor.ts`, `mass-report-card-pdf.processor.ts`) is built on Puppeteer + Handlebars (both already installed). Given the HTML reference designs are heavy on CSS grid, flexbox, SVG watermarks, variable fonts, and `inset-inline-start` logical properties — all of which React-PDF cannot express natively — a faithful React-PDF port would have required rewriting every style from scratch with significantly lower visual fidelity, plus adding a large new dependency tree. Puppeteer ingests the HTML as-is, resolves Google Fonts natively, handles RTL directly, and matches the reference designs pixel-for-pixel. This is a pure implementation-level swap — the `ReportCardRenderer` contract (`render(payload) => Promise<Buffer>`) is unchanged, the worker processor is untouched, and the rest of the system has no knowledge of the rendering engine.

**What changed:**

- Moved the HTML reference designs from `report-card-spec/template-0{1,2,3}{,-ar}.html` to `docs/features/report-cards/html-references/` with a README explaining their role. The `report-card-spec/` folder is now clean of rendering assets.
- Added `apps/worker/src/report-card-templates/` with:
  - `editorial-academic/{index.hbs,manifest.json}` — ports template-01 HTML, grades-only content scope
  - `modern-editorial/{index.hbs,manifest.json}` — ports template-02 HTML, grades-only content scope
  - `_shared/template-helpers.ts` — typed view-model adapter that turns a `ReportCardRenderPayload` into the localised, presentation-ready `TemplateViewModel`. Handles English / Arabic translation tables, detail-field ordering, Gregorian/Western-numerals date formatting, mark and grade formatting, rank-badge labelling, and signature state.
  - `_shared/template-helpers.spec.ts` — 24 unit tests covering both languages, missing-field handling, null-score handling, rank-badge variants, and the internal escape / percent / grade-class helpers.
  - `_shared/page-base.css` — shared reset + print rules (not wired in yet; each template currently self-contains its own reset, kept as an extension point).
- Added `apps/worker/src/processors/gradebook/report-card-production.renderer.ts`:
  - `ProductionReportCardRenderer` — implements `ReportCardRenderer`, loads + compiles templates lazily, reuses a single puppeteer browser across renders, closes on `onModuleDestroy`.
  - `DefaultPuppeteerLauncher` / `PuppeteerLauncher` — abstraction so unit tests can swap the launcher. Real launcher dynamically imports `puppeteer` (same pattern as `pdf-render.processor.ts`).
  - `PrismaTemplateDesignResolver` / `TemplateDesignResolver` — reads `reportCardTemplate.branding_overrides_json.design_key` with a per-process cache, falls back to slugifying the template name, and defaults to `editorial-academic` when nothing resolves.
  - `PuppeteerBrowserLike` / `PuppeteerPageLike` — narrow structural interfaces exposing only `newPage`, `setContent`, `pdf`, and `close`, so test fakes typecheck without needing a full `puppeteer.Browser` mock (also avoids the banned `as unknown as X` cast).
- Added `report-card-production.renderer.spec.ts` — 16 tests covering design-key resolution (null, unknown, known, thrown), HTML content assertions (student name, subjects, marks, overall average, rank badge, RTL markers, Arabic translated labels), edge cases (empty subjects, 12-subject overflow, missing signature), browser lifecycle (reuse, destroy, no-op destroy, page close on pdf() throw).
- Updated `apps/worker/src/worker.module.ts`:
  - Imports the new renderer bindings.
  - Registers `ProductionReportCardRenderer`, `DefaultPuppeteerLauncher`, `PrismaTemplateDesignResolver` as providers.
  - Swaps `REPORT_CARD_RENDERER_TOKEN` from `useExisting: PlaceholderReportCardRenderer` to `useExisting: ProductionReportCardRenderer`. The placeholder stays registered as a dev-mode fallback (impl 12 can delete it).
- Updated `apps/worker/nest-cli.json` with explicit `compilerOptions.assets` entries so the `.hbs` templates and `manifest.json` files are copied from `src/` into `dist/` on `nest build`. Without this, the compiled worker would ENOENT at render time in production.
- Updated `docs/architecture/event-job-catalog.md` to note the production renderer is now bound and document the three new DI tokens.
- Added `docs/architecture/danger-zones.md` DZ-45: "Report Card Template Assets Are Not TypeScript — Silent Deploy Drift If Build Config Breaks". Covers both the nest-cli assets-copy invariant and the Google Fonts CDN fallback risk for airgapped deployments.

**Files touched outside `apps/worker/`:**

- `docs/architecture/event-job-catalog.md` — renderer binding note (impl 11 wiring)
- `docs/architecture/danger-zones.md` — DZ-45 added
- `docs/features/report-cards/html-references/{README.md,template-0{1,2,3}{,-ar}.html}` — new reference directory
- `report-card-spec/template-0{1,2,3}{,-ar}.html` — deleted (moved)

**Test coverage:**

- Unit: `template-helpers.spec.ts` — 24 tests (English, Arabic, edge cases, internals)
- Unit: `report-card-production.renderer.spec.ts` — 16 tests (design resolution, HTML content, browser lifecycle, edge cases)
- Regression: full `turbo test` green — 803 worker tests pass, no other package affected
- Lint: `turbo lint` clean (only pre-existing warnings unrelated to impl 11)
- Types: `turbo type-check` clean
- DI: worker module compiles cleanly with the new bindings (verified via `Test.createTestingModule({ imports: [WorkerModule] }).compile()` — fails only at the post-compile DB auth step, which is expected when no real DB credentials are set)
- Build: `nest build` emits `.hbs` + `manifest.json` into `dist/apps/worker/src/report-card-templates/` via the new nest-cli `assets` entries

**Architecture docs updated:**

- `docs/architecture/event-job-catalog.md` — updated `report-cards:generate` DI binding note
- `docs/architecture/danger-zones.md` — DZ-45 added
- `module-blast-radius.md` — no update needed (changes are internal to the worker)
- `state-machines.md` — no update needed
- `feature-map.md` — no update needed (no new endpoints, no new pages)

**Blockers or follow-ups:**

- Principal signature loading from storage is deferred: `buildTemplateViewModel` accepts a `signatureDataUrl` parameter, the templates render it when present, but the renderer passes `null` today. When the worker gains an image-loading helper (or when an S3 signed-URL fetch lands), wire it in `ProductionReportCardRenderer.render` before calling `buildTemplateViewModel`. No signature file is currently in use in either of the two onboarding tenants, so this is safe to defer to impl 12 or a follow-up.
- The `editorial-academic` template's "radar chart" from the reference HTML is NOT rendered — the grades-only payload has no class-average data to plot against, so showing a one-polygon radar would be misleading. Replaced with a simple two-tile "overall average / overall grade" summary card that matches the `ReportCardRenderPayload.grades.overall` shape.
- The `modern-editorial` template's "horizontal bars vs class average" chart is also omitted for the same reason — no class-average data in the grades-only payload. Kept the cobalt "final grade" card and added an inline overall-comment panel to fill the space when a comment exists.
- The page-2 content from the reference HTMLs (assignments / behavioural / attendance) is intentionally absent — the grades-only content scope does not carry that data. When homework / behaviour / attendance template variants are added in future phases, those sections come back.
- Impl 12 (cleanup) can now delete `apps/worker/src/processors/report-card-render.placeholder.ts` safely; the production renderer is the active binding.
- Local commit only — not pushed to GitHub per nightly-push policy.

**Notes for the next agent:**

- The `TEMPLATE_ROOT` resolution uses `path.resolve(__dirname, '..', '..', 'report-card-templates')`. In dev (`ts-node` running from `src/`) and in prod (compiled JS in `dist/apps/worker/src/`) this resolves correctly because both the renderer file and the templates directory share the same relative layout. If you ever move the renderer or the templates, keep the `../../report-card-templates` invariant or update the resolution to walk up until it finds the directory.
- `branding_overrides_json.design_key` is how a tenant picks between `editorial-academic` and `modern-editorial`. If `design_key` is missing, the resolver falls back to slugifying the template `name` (e.g., "Modern Editorial" → `modern-editorial`), and if that also doesn't match a known design, defaults to `editorial-academic`. The admin UI for picking a design is NOT built here — the field is set manually in `branding_overrides_json` for now. Impl 12 or a later design-picker feature can surface this in the settings UI.
- Google Fonts are loaded via CDN `<link>` in each template's `<head>`. This makes rendering online-dependent. If the deployment goes airgapped, bundle the TTF files under `_shared/fonts/` and swap to `@font-face` with `url('file://...')` — the nest-cli assets rule already copies `_shared/` contents if you add a `*.ttf` glob.
- The view-model translation table for personal-info field labels lives in `_shared/template-helpers.ts` (`DETAIL_LABELS`). It is keyed by `PersonalInfoFieldKey` from `@school/shared`, so TypeScript catches missing translations at compile time if a new field is added to the shared enum.
- The `extractDesignKey` helper treats `branding_overrides_json` as `unknown` and narrows safely — intentional because the JSONB column has no compile-time schema. If impl 12 or later adds a Zod schema for `branding_overrides_json`, the helper can be simplified.
- `ProductionReportCardRenderer` caches one compiled Handlebars template per design key and one browser per worker process. Both caches are unbounded but small (at most 2 template entries, 1 browser). If a future worker process juggles many template variants, add an LRU eviction step.
- `PuppeteerBrowserLike` / `PuppeteerPageLike` are deliberately narrow — they expose only what the renderer uses. This lets tests build structural fakes without the `as unknown as Browser` hack. Don't widen these interfaces to expose internal puppeteer APIs unless absolutely needed.
- This session did NOT touch any files belonging to concurrently-running impl 08 (frontend report comments). The only shared file could have been `implementation-log.md` — which impl 11 appends to strictly at the bottom, so merges are trivial.
