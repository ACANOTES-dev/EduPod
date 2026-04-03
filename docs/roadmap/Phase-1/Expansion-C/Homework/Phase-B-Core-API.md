# Phase B — Core API

**Wave**: 2
**Deploy Order**: d2
**Depends On**: A

## Scope

Implements the full NestJS backend module for homework management — the service layer, controllers, DTOs, and S3 attachment handling. Covers teacher CRUD, completion tracking, diary notes, parent-facing endpoints, and analytics queries. All ~50 API endpoints across 5 controllers.

## Deliverables

### Module

- [ ] `apps/api/src/modules/homework/homework.module.ts` — module definition with BullMQ queue registration

### DTOs (`apps/api/src/modules/homework/dto/`)

- [ ] `create-homework.dto.ts` — re-export from `@school/shared`
- [ ] `update-homework.dto.ts`
- [ ] `list-homework.dto.ts`
- [ ] `mark-completion.dto.ts`
- [ ] `create-diary-note.dto.ts`
- [ ] `create-parent-note.dto.ts`

### Controllers & Services

#### Homework CRUD

- [ ] `homework.controller.ts` — ~18 endpoints under `v1/homework`
  - `POST v1/homework` — create assignment
  - `GET v1/homework` — list with filters (class, status, type, date range)
  - `GET v1/homework/:id` — detail with attachments & completion summary
  - `PATCH v1/homework/:id` — update
  - `PATCH v1/homework/:id/status` — state transitions (publish/archive)
  - `POST v1/homework/:id/copy` — copy from previous
  - `DELETE v1/homework/:id` — delete draft only
  - `POST v1/homework/:id/attachments` — add attachment (file or URL)
  - `DELETE v1/homework/:id/attachments/:attachmentId` — remove attachment
  - `GET v1/homework/by-class/:classId` — class homework list
  - `GET v1/homework/by-class/:classId/week` — week overview
  - `GET v1/homework/today` — teacher's today view
  - `POST v1/homework/recurrence-rules` — create recurrence rule
  - `PATCH v1/homework/recurrence-rules/:id` — update recurrence rule
  - `DELETE v1/homework/recurrence-rules/:id` — delete recurrence rule
  - `GET v1/homework/templates` — browse copyable past assignments
  - `POST v1/homework/bulk-create` — create from recurrence rule
- [ ] `homework.service.ts` — business logic
  - State machine validation via `VALID_HOMEWORK_TRANSITIONS`
  - Copy-from logic (duplicate assignment, adjust dates, link via `copied_from_id`)
  - S3 upload/delete for file attachments (via S3Module)
  - Tenant-scoped academic year/period resolution
  - `publish()` sets `published_at`

#### Completion Tracking

- [ ] `homework-completions.controller.ts` — ~5 endpoints
  - `GET v1/homework/:id/completions` — all completions for assignment
  - `POST v1/homework/:id/completions` — student self-report
  - `PATCH v1/homework/:id/completions/:studentId` — teacher update
  - `POST v1/homework/:id/completions/bulk` — bulk update
  - `GET v1/homework/:id/completion-rate` — completion rate
- [ ] `homework-completions.service.ts` — upsert pattern (unique constraint), bulk mark, rate calculation

#### Diary

- [ ] `homework-diary.controller.ts` — ~6 endpoints
  - `GET v1/diary/:studentId` — personal notes
  - `POST v1/diary/:studentId` — create note
  - `PATCH v1/diary/:studentId/:noteDate` — update note
  - `GET v1/diary/:studentId/parent-notes` — parent-teacher notes
  - `POST v1/diary/:studentId/parent-notes` — create parent note
  - `PATCH v1/diary/parent-notes/:id/acknowledge` — acknowledge
- [ ] `homework-diary.service.ts` — one-per-day unique constraint, acknowledgement flow

#### Parent

- [ ] `homework-parent.controller.ts` — ~6 endpoints
  - `GET v1/parent/homework` — all children's homework
  - `GET v1/parent/homework/today` — today per child
  - `GET v1/parent/homework/overdue` — overdue across children
  - `GET v1/parent/homework/week` — week overview
  - `GET v1/parent/homework/:studentId/summary` — student summary
  - `GET v1/parent/homework/:studentId/diary` — diary parent-notes
- [ ] `homework-parent.service.ts` — scoped to parent's linked students via `student_parents`

#### Analytics

- [ ] `homework-analytics.controller.ts` — ~10 endpoints
  - `GET v1/homework/analytics/completion-rates` — per class/subject
  - `GET v1/homework/analytics/student/:studentId` — student trends
  - `GET v1/homework/analytics/class/:classId` — class patterns
  - `GET v1/homework/analytics/load` — cross-subject load analysis
  - `GET v1/homework/analytics/load/daily` — daily load heatmap data
  - `GET v1/homework/analytics/non-completers` — consistently non-completing students
  - `GET v1/homework/analytics/subject/:subjectId` — subject trends
  - `GET v1/homework/analytics/teacher/:staffId` — teacher setting patterns
  - `GET v1/homework/analytics/year-group/:ygId` — year group overview
  - `GET v1/homework/analytics/correlation` — completion vs academic performance
- [ ] `homework-analytics.service.ts` — aggregation queries, completion rate calculations

### Tests

- [ ] `homework.controller.spec.ts`
- [ ] `homework.service.spec.ts`
- [ ] `homework-completions.controller.spec.ts`
- [ ] `homework-completions.service.spec.ts`
- [ ] `homework-diary.controller.spec.ts`
- [ ] `homework-diary.service.spec.ts`
- [ ] `homework-parent.controller.spec.ts`
- [ ] `homework-parent.service.spec.ts`
- [ ] `homework-analytics.controller.spec.ts`
- [ ] `homework-analytics.service.spec.ts`

### App Module Registration

- [ ] Register `HomeworkModule` in `apps/api/src/app.module.ts`

## Out of Scope

- Frontend pages (Phase D, E, F)
- Worker jobs / cron processors (Phase C)
- Search indexing (Phase C)
- Dashboard integration (Phase D)

## Dependencies

- **Phase A**: All Prisma models, enums, Zod schemas, shared constants, permissions, tenant settings, queue constants

## Implementation Notes

- **Controller pattern**: `@UseGuards(AuthGuard, PermissionGuard)` at class level. `@RequiresPermission('homework.manage')` per route. Thin controllers — zero business logic.
- **Service pattern**: `tenantId` as first argument to every method. RLS writes via `createRlsClient(this.prisma, { tenant_id }).$transaction(async (tx) => { ... })`. Reads with `tenant_id` in `where`.
- **Parent endpoints** must resolve the parent's `user_id` → `parent.id` → `student_parents` → `student_ids` to scope visibility. This follows the existing pattern in `parent-inquiries.controller.ts`.
- **S3 attachments**: Use the existing `S3Module` for upload/delete. Path: `/{tenant_id}/homework/{assignment_id}/{filename}`. Size validation against tenant `max_attachment_size_mb` setting. File type validation: PDF, DOCX, XLSX, PPTX, PNG, JPG, WebP, ZIP. Per-tenant 10GB storage cap check.
- **Static routes before dynamic**: e.g., `GET v1/homework/today` must be defined before `GET v1/homework/:id`.
- **Pagination**: all list endpoints return `{ data, meta: { page, pageSize, total } }`.
- **Copy-from** duplicates all fields except `id`, `status` (→ draft), timestamps, and completions. Adjustments: new `due_date`, `published_at = null`, `copied_from_id = source.id`.
- **Bulk completion**: uses `createMany` with `skipDuplicates` for efficiency, then individual updates for existing records.
- **Analytics** queries are read-only aggregate queries — no RLS write transactions needed. Use direct Prisma reads with `tenant_id` in `where`.
