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
