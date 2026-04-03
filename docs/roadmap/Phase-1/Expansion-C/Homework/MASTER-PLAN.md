# Digital Homework & School Diary — Implementation Plan

## Overview

Build a digital replacement for the physical homework journal/diary. Teachers set homework per class, students/parents view it, completion is tracked, and analytics surface homework load patterns. This is a **new NestJS module** (`homework`) with its own queue, frontend routes, and shared types.

The spec positions this as post-launch / vision. This plan is designed so it can be executed as a standalone feature once core MIS is established. It follows all existing architectural patterns exactly.

---

## Decisions

- **S3 Storage**: Each tenant has up to 10GB of S3 storage (paid by the tenant). Homework file attachments are approved — path convention: `/{tenant_id}/homework/{assignment_id}/{filename}`.
- **Student portal**: V1 routes through the parent portal. No student login for V1.
- **Gradebook integration**: Deferred to Phase 4 (post-V1 validation).
- **Tenant module flag**: Homework is gated behind `tenant_modules` (disabled by default, enabled per tenant).

---

## Data Model — 6 New Tables

| Table                       | Purpose                                                             |
| --------------------------- | ------------------------------------------------------------------- |
| `homework_assignments`      | Core record — what the teacher sets                                 |
| `homework_attachments`      | Files/links attached to assignments                                 |
| `homework_completions`      | Per-student completion tracking (self-reported or teacher-verified) |
| `homework_recurrence_rules` | Recurring homework definitions                                      |
| `diary_notes`               | Student-to-self daily notes (private)                               |
| `diary_parent_notes`        | Parent-teacher communication notes (replaces "sign the journal")    |

---

## Enums

```
HomeworkType     = written | reading | research | revision | project_work | online_activity
HomeworkStatus   = draft | published | archived
CompletionStatus = not_started | in_progress | completed
RecurrenceFrequency = daily | weekly | custom
```

---

## State Machine — HomeworkStatus

```
draft      → [published, archived]
published  → [archived]
archived*
```

- **Guarded by**: `packages/shared/src/constants/homework-status.ts` + `homework.service.ts`
- **Side effects**: `published` sets `published_at`, makes assignment visible to students/parents. `archived` hides from default views but retains for analytics.

---

## Schema Design

### HomeworkAssignment

```prisma
model HomeworkAssignment {
  id                    String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id             String         @db.Uuid
  class_id              String         @db.Uuid
  subject_id            String?        @db.Uuid
  academic_year_id      String         @db.Uuid
  academic_period_id    String?        @db.Uuid
  assigned_by_user_id   String         @db.Uuid
  title                 String         @db.VarChar(255)
  description           String?        @db.Text
  homework_type         HomeworkType
  status                HomeworkStatus @default(draft)
  due_date              DateTime       @db.Date
  due_time              DateTime?      @db.Time
  published_at          DateTime?      @db.Timestamptz()
  copied_from_id        String?        @db.Uuid
  recurrence_rule_id    String?        @db.Uuid
  max_points            Int?           @db.SmallInt
  created_at            DateTime       @default(now()) @db.Timestamptz()
  updated_at            DateTime       @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant          Tenant          @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  class_entity    Class           @relation(fields: [class_id], references: [id], onDelete: Cascade)
  subject         Subject?        @relation(fields: [subject_id], references: [id], onDelete: SetNull)
  academic_year   AcademicYear    @relation(fields: [academic_year_id], references: [id], onDelete: Cascade)
  academic_period AcademicPeriod? @relation(fields: [academic_period_id], references: [id], onDelete: SetNull)
  assigned_by     User            @relation("hw_assigned_by", fields: [assigned_by_user_id], references: [id], onDelete: Cascade)
  copied_from     HomeworkAssignment?  @relation("hw_copy_chain", fields: [copied_from_id], references: [id], onDelete: SetNull)
  copies          HomeworkAssignment[] @relation("hw_copy_chain")
  recurrence_rule HomeworkRecurrenceRule? @relation(fields: [recurrence_rule_id], references: [id], onDelete: SetNull)
  attachments     HomeworkAttachment[]
  completions     HomeworkCompletion[]

  @@index([tenant_id, class_id, status], name: "idx_hw_assignments_class_status")
  @@index([tenant_id, due_date], name: "idx_hw_assignments_due_date")
  @@index([tenant_id, assigned_by_user_id], name: "idx_hw_assignments_assigned_by")
  @@index([tenant_id, academic_year_id], name: "idx_hw_assignments_year")
  @@map("homework_assignments")
}
```

### HomeworkAttachment

```prisma
model HomeworkAttachment {
  id                     String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id              String   @db.Uuid
  homework_assignment_id String   @db.Uuid
  attachment_type        String   @db.VarChar(20)  // 'file' | 'url'
  file_name              String?  @db.VarChar(255)
  file_key               String?  @db.VarChar(500) // S3 path
  file_size_bytes        Int?
  mime_type              String?  @db.VarChar(100)
  url                    String?  @db.Text
  display_order          Int      @default(0) @db.SmallInt
  created_at             DateTime @default(now()) @db.Timestamptz()

  // Relations
  tenant     Tenant             @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  assignment HomeworkAssignment @relation(fields: [homework_assignment_id], references: [id], onDelete: Cascade)

  @@index([tenant_id, homework_assignment_id], name: "idx_hw_attachments_assignment")
  @@map("homework_attachments")
}
```

### HomeworkCompletion

```prisma
model HomeworkCompletion {
  id                     String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id              String           @db.Uuid
  homework_assignment_id String           @db.Uuid
  student_id             String           @db.Uuid
  status                 CompletionStatus @default(not_started)
  completed_at           DateTime?        @db.Timestamptz()
  verified_by_user_id    String?          @db.Uuid
  verified_at            DateTime?        @db.Timestamptz()
  notes                  String?          @db.Text
  points_awarded         Int?             @db.SmallInt
  created_at             DateTime         @default(now()) @db.Timestamptz()
  updated_at             DateTime         @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant      Tenant             @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  assignment  HomeworkAssignment @relation(fields: [homework_assignment_id], references: [id], onDelete: Cascade)
  student     Student            @relation(fields: [student_id], references: [id], onDelete: Cascade)
  verified_by User?              @relation("hw_verified_by", fields: [verified_by_user_id], references: [id], onDelete: SetNull)

  @@unique([tenant_id, homework_assignment_id, student_id], name: "idx_hw_completion_unique")
  @@index([tenant_id, student_id, status], name: "idx_hw_completions_student")
  @@map("homework_completions")
}
```

### HomeworkRecurrenceRule

```prisma
model HomeworkRecurrenceRule {
  id                 String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id          String              @db.Uuid
  frequency          RecurrenceFrequency
  interval           Int                 @default(1) @db.SmallInt
  days_of_week       Int[]               @db.SmallInt
  start_date         DateTime            @db.Date
  end_date           DateTime?           @db.Date
  active             Boolean             @default(true)
  created_at         DateTime            @default(now()) @db.Timestamptz()
  updated_at         DateTime            @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant      Tenant               @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  assignments HomeworkAssignment[]

  @@index([tenant_id], name: "idx_hw_recurrence_tenant")
  @@map("homework_recurrence_rules")
}
```

### DiaryNote

```prisma
model DiaryNote {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id   String   @db.Uuid
  student_id  String   @db.Uuid
  note_date   DateTime @db.Date
  content     String   @db.Text
  created_at  DateTime @default(now()) @db.Timestamptz()
  updated_at  DateTime @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant  Tenant  @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  student Student @relation(fields: [student_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, student_id, note_date], name: "idx_diary_note_unique")
  @@index([tenant_id, student_id], name: "idx_diary_notes_student")
  @@map("diary_notes")
}
```

### DiaryParentNote

```prisma
model DiaryParentNote {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id       String   @db.Uuid
  student_id      String   @db.Uuid
  parent_id       String?  @db.Uuid
  author_user_id  String   @db.Uuid
  note_date       DateTime @db.Date
  content         String   @db.Text
  acknowledged    Boolean  @default(false)
  acknowledged_at DateTime? @db.Timestamptz()
  created_at      DateTime @default(now()) @db.Timestamptz()
  updated_at      DateTime @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant  Tenant  @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  student Student @relation(fields: [student_id], references: [id], onDelete: Cascade)
  parent  Parent? @relation(fields: [parent_id], references: [id], onDelete: SetNull)
  author  User    @relation("diary_note_author", fields: [author_user_id], references: [id], onDelete: Cascade)

  @@index([tenant_id, student_id, note_date], name: "idx_diary_parent_notes_student_date")
  @@map("diary_parent_notes")
}
```

---

## Relation Additions to Existing Models

- `Student` → `hw_completions`, `hw_diary_notes`, `hw_diary_parent_notes`
- `Class` → `homework_assignments`
- `Subject` → `homework_assignments`
- `AcademicYear` → `homework_assignments`
- `AcademicPeriod` → `homework_assignments`
- `User` → `hw_assignments`, `hw_verified_completions`, `hw_diary_parent_notes`
- `Parent` → `hw_diary_parent_notes`
- `Tenant` → all 6 homework relations

---

## Permissions

| Permission                | Tier   | Description                                                 |
| ------------------------- | ------ | ----------------------------------------------------------- |
| `homework.view`           | staff  | View homework assignments and completions                   |
| `homework.manage`         | staff  | Create, edit, delete assignments; manage completions        |
| `homework.mark_own`       | staff  | Mark own class completions (teacher marking)                |
| `homework.view_diary`     | staff  | View diary notes for assigned students                      |
| `homework.write_diary`    | staff  | Write diary notes (proxy for student, or student in future) |
| `homework.view_analytics` | admin  | View homework analytics and load reports                    |
| `parent.homework`         | parent | View homework, mark self-reported completion, diary notes   |

---

## Tenant Settings

```typescript
homework: z.object({
  enabled: z.boolean().default(false),
  allow_student_self_report: z.boolean().default(true),
  require_teacher_verification: z.boolean().default(false),
  default_due_time: z.string().default('09:00'),
  overdue_notification_enabled: z.boolean().default(true),
  parent_digest_include_homework: z.boolean().default(true),
  max_attachment_size_mb: z.number().default(10),
  max_attachments_per_assignment: z.number().default(5),
  completion_reminder_enabled: z.boolean().default(true),
}).default({}),
```

---

## API Endpoints (Summary)

### Teacher Homework Management (~18 endpoints)

- `POST/GET/PATCH/DELETE v1/homework` — CRUD
- `PATCH v1/homework/:id/status` — state transitions
- `POST v1/homework/:id/copy` — copy from previous
- `POST/DELETE v1/homework/:id/attachments` — attachment management
- `GET v1/homework/by-class/:classId`, `GET v1/homework/today`
- Recurrence rule CRUD, templates, bulk-create

### Completion Tracking (~5 endpoints)

- `GET/POST/PATCH v1/homework/:id/completions` — per-student
- `POST v1/homework/:id/completions/bulk` — batch
- `GET v1/homework/:id/completion-rate`

### Diary (~6 endpoints)

- `GET/POST/PATCH v1/diary/:studentId` — personal notes
- `GET/POST v1/diary/:studentId/parent-notes` — parent-teacher
- `PATCH v1/diary/parent-notes/:id/acknowledge`

### Parent (~6 endpoints)

- `GET v1/parent/homework` — all children's homework
- `GET v1/parent/homework/today|overdue|week`
- `GET v1/parent/homework/:studentId/summary|diary`

### Analytics (~10 endpoints)

- `GET v1/homework/analytics/completion-rates|student|class|load|daily|non-completers|subject|teacher|year-group|correlation`

---

## Worker Jobs — New `homework` Queue

| Job Name                       | Trigger                    | Description                                                         |
| ------------------------------ | -------------------------- | ------------------------------------------------------------------- |
| `homework:overdue-detection`   | Cron daily 06:00 UTC       | Find published assignments past `due_date` with incomplete students |
| `homework:generate-recurring`  | Cron daily 05:00 UTC       | Process active recurrence rules, create next instances              |
| `homework:digest-homework`     | Cron at tenant digest time | Include today's homework in parent daily digest                     |
| `homework:completion-reminder` | Cron daily at 15:00 TZ     | Remind students about homework due tomorrow                         |

---

## Integration Points

1. **Parent Daily Digest** — homework data in existing digest flow
2. **Dashboard** — teacher/parent/admin homework cards
3. **Student Hub** — homework tab on student detail page
4. **Search** — index assignments in Meilisearch
5. **S3** — `/{tenant_id}/homework/{assignment_id}/{filename}` (10GB tenant cap, paid)

---

## Cross-Module Dependencies

| Dependency                            | Type               | Risk                                   |
| ------------------------------------- | ------------------ | -------------------------------------- |
| `classes` / `class_enrolments`        | Prisma-direct read | Schema changes affect homework queries |
| `students`                            | Prisma-direct read | Student status changes                 |
| `subjects`                            | Prisma-direct read | Subject display                        |
| `academic_years` / `academic_periods` | Prisma-direct read | Year/period scoping                    |
| `student_parents`                     | Prisma-direct read | Parent portal visibility               |
| `tenant_settings`                     | Prisma-direct read | Module settings                        |
| Communications (notifications queue)  | BullMQ enqueue     | Digest and reminder notifications      |
| S3Module                              | Import             | File upload/download                   |
