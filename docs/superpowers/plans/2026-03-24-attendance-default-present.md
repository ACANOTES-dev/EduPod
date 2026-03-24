# Attendance: Default Present Mode + Smart Tracking + AI Scan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance attendance with default-present mode, exceptions-only upload, quick-mark shorthand, undo window, smart absence pattern detection with parent/staff notifications, immediate parent absence SMS/WhatsApp, and AI photo scan of handwritten absence sheets.

**Architecture:** Seven features layered on the existing attendance module. Shared types/schemas first, then a single Prisma migration, then backend services (each feature in its own service file), worker processors, and finally frontend pages. The AI scan feature gates behind a new `ai_functions` module toggle. Pattern detection and parent notifications use the existing notification dispatch infrastructure.

**Tech Stack:** NestJS, Prisma, BullMQ, Redis, Next.js App Router, Zod, Claude Vision API (`@anthropic-ai/sdk`), shadcn/ui, Tailwind (RTL-safe logical classes only).

**Spec:** `docs/superpowers/specs/2026-03-24-attendance-default-present-design.md`

---

## File Structure

### Shared (`packages/shared/src/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `schemas/tenant.schema.ts` | Modify | Add `defaultPresentEnabled`, `notifyParentOnAbsence`, `patternDetection` to attendance section; add `ai` section |
| `schemas/attendance.schema.ts` | Modify | Add `defaultPresentUploadSchema`, `quickMarkSchema`, `scanConfirmSchema`; update `createAttendanceSessionSchema` with `default_present` |
| `types/attendance.ts` | Modify | Add `AttendancePatternAlert`, `ScanResult`, `QuickMarkEntry` types |
| `constants/permissions.ts` | Modify | Add `attendance.view_pattern_reports` |
| `constants/notification-types.ts` | Modify | Add `attendance.absent`, `attendance.late`, `attendance.left_early`, `attendance.pattern_detected` |
| `constants/module-keys.ts` | Modify | Add `ai_functions` to `MODULE_KEYS` |

### Database (`packages/prisma/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `schema.prisma` | Modify | Add `default_present` to AttendanceSession, `arrival_time` to AttendanceRecord, new `AttendancePatternAlert` model, new enums |
| `migrations/YYYYMMDD_attendance_default_present/migration.sql` | Create | DDL for new columns, table, enums, indexes, RLS policies |

### Backend API (`apps/api/src/modules/attendance/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `attendance.service.ts` | Modify | Add `createDefaultPresentRecords()` method; update `createSession()` to auto-create records when default_present active |
| `attendance-upload.service.ts` | Modify | Add exceptions-only upload mode, quick-mark text parsing |
| `attendance.controller.ts` | Modify | Add scan, quick-mark, undo, pattern endpoints |
| `attendance.module.ts` | Modify | Register new services, inject notification queue |
| `attendance-pattern.service.ts` | Create | Pattern detection engine — excessive absences, recurring day, chronic tardiness |
| `attendance-scan.service.ts` | Create | AI photo scan — send image to Claude Vision, parse response |
| `attendance-parent-notification.service.ts` | Create | Immediate parent absence notification trigger + pattern-based parent alerts |
| `dto/attendance.dto.ts` | Modify | Re-export new DTOs |

### Worker (`apps/worker/src/processors/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `attendance-session-generation.processor.ts` | Modify | After session creation, bulk-insert present records if default_present active |
| `attendance-pattern-detection.processor.ts` | Create | Daily pattern detection job |
| `attendance-scan.processor.ts` | Create | Process photo via Claude Vision API |
| `attendance-parent-notification.processor.ts` | Create | Dispatch immediate absence notifications to parents |
| `../worker.module.ts` | Modify | Register new processors |

### Frontend (`apps/web/src/app/[locale]/(school)/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `attendance/page.tsx` | Modify | Add default_present toggle to create session dialog |
| `attendance/upload/page.tsx` | Modify | Add exceptions-only mode, quick-mark text input, undo button |
| `attendance/scan/page.tsx` | Create | AI photo scan upload + confirmation UI |
| `attendance/exceptions/page.tsx` | Modify | Add "Patterns" tab with pattern alerts table |
| `settings/general/page.tsx` | Modify | Add new attendance settings (defaultPresent, notifications, pattern detection, AI) |

---

## Task 1: Shared Types, Schemas & Constants

**Files:**
- Modify: `packages/shared/src/schemas/tenant.schema.ts`
- Modify: `packages/shared/src/schemas/attendance.schema.ts`
- Modify: `packages/shared/src/types/attendance.ts`
- Modify: `packages/shared/src/constants/permissions.ts`
- Modify: `packages/shared/src/constants/notification-types.ts`
- Modify: `packages/shared/src/constants/module-keys.ts` (find exact file — may be in permissions.ts or a separate file)

- [ ] **Step 1: Add new attendance settings to tenant schema**

In `packages/shared/src/schemas/tenant.schema.ts`, update the `attendance` section:

```typescript
attendance: z
  .object({
    allowTeacherAmendment: z.boolean().default(false),
    autoLockAfterDays: z.number().int().nullable().default(null),
    pendingAlertTimeHour: z.number().int().min(0).max(23).default(14),
    workDays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
    defaultPresentEnabled: z.boolean().default(false),
    notifyParentOnAbsence: z.boolean().default(false),
    patternDetection: z
      .object({
        enabled: z.boolean().default(false),
        excessiveAbsenceThreshold: z.number().int().min(1).default(5),
        excessiveAbsenceWindowDays: z.number().int().min(1).default(14),
        recurringDayThreshold: z.number().int().min(1).default(3),
        recurringDayWindowDays: z.number().int().min(1).default(30),
        tardinessThreshold: z.number().int().min(1).default(4),
        tardinessWindowDays: z.number().int().min(1).default(14),
        parentNotificationMode: z.enum(['auto', 'manual']).default('manual'),
      })
      .default({}),
  })
  .default({}),
```

Add new top-level `ai` section:

```typescript
ai: z
  .object({
    enabled: z.boolean().default(false),
  })
  .default({}),
```

- [ ] **Step 2: Update attendance schemas with new DTOs**

In `packages/shared/src/schemas/attendance.schema.ts`, add:

```typescript
// Update createAttendanceSessionSchema to include default_present
export const createAttendanceSessionSchema = z.object({
  class_id: z.string().uuid(),
  schedule_id: z.string().uuid().nullable().optional(),
  session_date: z.string().min(1),
  override_closure: z.boolean().optional(),
  override_reason: z.string().optional(),
  default_present: z.boolean().nullable().optional(), // NEW
});

// Exceptions-only upload schema (default present mode)
export const defaultPresentUploadSchema = z.object({
  session_date: z.string().min(1),
  records: z.array(
    z.object({
      student_number: z.string().min(1),
      status: z.enum(['absent_unexcused', 'absent_excused', 'late', 'left_early']),
      reason: z.string().optional(),
    }),
  ),
});
export type DefaultPresentUploadDto = z.infer<typeof defaultPresentUploadSchema>;

// Quick-mark shorthand schema
export const quickMarkSchema = z.object({
  session_date: z.string().min(1),
  text: z.string().min(1),
});
export type QuickMarkDto = z.infer<typeof quickMarkSchema>;

// AI scan confirmation schema
export const scanConfirmSchema = z.object({
  session_date: z.string().min(1),
  entries: z.array(
    z.object({
      student_number: z.string().min(1),
      status: z.enum(['absent_unexcused', 'absent_excused', 'late', 'left_early']),
      reason: z.string().optional(),
    }),
  ),
});
export type ScanConfirmDto = z.infer<typeof scanConfirmSchema>;

// Upload undo schema
export const uploadUndoSchema = z.object({
  batch_id: z.string().uuid(),
});
export type UploadUndoDto = z.infer<typeof uploadUndoSchema>;

// Amend — add optional arrival_time for late records
export const amendAttendanceRecordSchema = z.object({
  status: attendanceRecordStatusEnum,
  amendment_reason: z.string().min(1, 'Amendment reason is required'),
  arrival_time: z.string().regex(/^\d{2}:\d{2}$/).optional(), // HH:MM
});

// Save records — add optional arrival_time
export const saveAttendanceRecordsSchema = z.object({
  records: z.array(
    z.object({
      student_id: z.string().uuid(),
      status: attendanceRecordStatusEnum,
      reason: z.string().nullable().optional(),
      arrival_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(), // HH:MM
    }),
  ).min(1),
});
```

- [ ] **Step 3: Add new types**

In `packages/shared/src/types/attendance.ts`, add:

```typescript
export type AttendanceAlertType = 'excessive_absences' | 'recurring_day' | 'chronic_tardiness';
export type AttendanceAlertStatus = 'active' | 'acknowledged' | 'resolved';

export interface AttendancePatternAlert {
  id: string;
  tenant_id: string;
  student_id: string;
  alert_type: AttendanceAlertType;
  detected_date: string;
  window_start: string;
  window_end: string;
  details_json: ExcessiveAbsenceDetails | RecurringDayDetails | TardinessDetails;
  status: AttendanceAlertStatus;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  parent_notified: boolean;
  parent_notified_at: string | null;
  created_at: string;
  // Relations (optional, populated by includes)
  student?: { id: string; first_name: string; last_name: string; student_number: string };
}

export interface ExcessiveAbsenceDetails {
  count: number;
  threshold: number;
  window_days: number;
}

export interface RecurringDayDetails {
  day_of_week: number;
  day_name: string;
  count: number;
  threshold: number;
  dates: string[];
}

export interface TardinessDetails {
  count: number;
  threshold: number;
  window_days: number;
}

export interface ScanResultEntry {
  student_number: string;
  status: 'absent_unexcused' | 'absent_excused' | 'late' | 'left_early';
  reason?: string;
  confidence: 'high' | 'low';
  resolved_student_name?: string;
  resolved_student_id?: string;
  error?: string;
}

export interface ScanResult {
  entries: ScanResultEntry[];
  raw_ai_response?: string;
}

export interface QuickMarkEntry {
  student_number: string;
  status: string;
  reason?: string;
}
```

- [ ] **Step 4: Add new permission**

In `packages/shared/src/constants/permissions.ts`, add to `attendance`:

```typescript
attendance: {
  manage: 'attendance.manage',
  view: 'attendance.view',
  take: 'attendance.take',
  amend_historical: 'attendance.amend_historical',
  override_closure: 'attendance.override_closure',
  view_pattern_reports: 'attendance.view_pattern_reports', // NEW
},
```

- [ ] **Step 5: Add new notification types**

In `packages/shared/src/constants/notification-types.ts`, add to `NOTIFICATION_TYPES`:

```typescript
export const NOTIFICATION_TYPES = [
  // ... existing ...
  'attendance.exception',
  'attendance.absent',           // NEW — parent notified on absence
  'attendance.late',             // NEW — parent notified on late
  'attendance.left_early',       // NEW — parent notified on early departure
  'attendance.pattern_detected', // NEW — staff notified of pattern alert
] as const;
```

- [ ] **Step 6: Add `ai_functions` module key**

Find `MODULE_KEYS` (likely in `packages/shared/src/constants/`) and add `'ai_functions'`.

- [ ] **Step 7: Run `turbo type-check` to verify shared package compiles**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add types, schemas, permissions for default-present attendance"
```

---

## Task 2: Database Migration

**Files:**
- Modify: `packages/prisma/schema.prisma`
- Create: `packages/prisma/migrations/YYYYMMDD_attendance_default_present/migration.sql`

- [ ] **Step 1: Update Prisma schema — AttendanceSession**

Add `default_present` column:

```prisma
model AttendanceSession {
  // ... existing fields ...
  default_present      Boolean?                @db.Boolean
  // ... rest unchanged ...
}
```

- [ ] **Step 2: Update Prisma schema — AttendanceRecord**

Add `arrival_time` column:

```prisma
model AttendanceRecord {
  // ... existing fields ...
  arrival_time          String?                 @db.VarChar(5)  // HH:MM
  // ... rest unchanged ...
}
```

- [ ] **Step 3: Add new enums**

```prisma
enum AttendanceAlertType {
  excessive_absences
  recurring_day
  chronic_tardiness
}

enum AttendanceAlertStatus {
  active
  acknowledged
  resolved
}
```

- [ ] **Step 4: Add AttendancePatternAlert model**

```prisma
model AttendancePatternAlert {
  id                String                 @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id         String                 @db.Uuid
  student_id        String                 @db.Uuid
  alert_type        AttendanceAlertType
  detected_date     DateTime               @db.Date
  window_start      DateTime               @db.Date
  window_end        DateTime               @db.Date
  details_json      Json
  status            AttendanceAlertStatus   @default(active)
  acknowledged_by   String?                @db.Uuid
  acknowledged_at   DateTime?              @db.Timestamptz()
  parent_notified   Boolean                @default(false)
  parent_notified_at DateTime?             @db.Timestamptz()
  created_at        DateTime               @default(now()) @db.Timestamptz()
  updated_at        DateTime               @default(now()) @updatedAt @db.Timestamptz()

  tenant            Tenant                 @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  student           Student                @relation(fields: [student_id], references: [id], onDelete: Cascade)
  acknowledged_user User?                  @relation("alert_acknowledger", fields: [acknowledged_by], references: [id], onDelete: SetNull)

  @@unique([tenant_id, student_id, alert_type, detected_date], name: "idx_pattern_alerts_unique")
  @@index([tenant_id, student_id], name: "idx_pattern_alerts_tenant_student")
  @@index([tenant_id, status], name: "idx_pattern_alerts_tenant_status")
  @@map("attendance_pattern_alerts")
}
```

- [ ] **Step 5: Add relations to existing models**

Add to `Tenant` model:
```prisma
attendance_pattern_alerts AttendancePatternAlert[]
```

Add to `Student` model:
```prisma
attendance_pattern_alerts AttendancePatternAlert[]
```

Add to `User` model:
```prisma
acknowledged_alerts AttendancePatternAlert[] @relation("alert_acknowledger")
```

- [ ] **Step 6: Generate migration**

Run: `cd packages/prisma && npx prisma migrate dev --name attendance-default-present`

- [ ] **Step 7: Add RLS policy to migration**

Create/edit `post_migrate.sql` in the migration folder:

```sql
-- RLS for attendance_pattern_alerts
ALTER TABLE attendance_pattern_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON attendance_pattern_alerts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

- [ ] **Step 8: Verify migration applies cleanly**

Run: `cd packages/prisma && npx prisma migrate dev`
Expected: Migration applied successfully

- [ ] **Step 9: Run `npx prisma generate` to update client**

Run: `cd packages/prisma && npx prisma generate`
Expected: Generated Prisma Client

- [ ] **Step 10: Commit**

```bash
git add packages/prisma/
git commit -m "feat(prisma): add default_present, arrival_time, pattern_alerts table"
```

---

## Task 3: Default Present — Backend Service

**Files:**
- Modify: `apps/api/src/modules/attendance/attendance.service.ts`
- Test: `apps/api/src/modules/attendance/attendance.service.spec.ts`

- [ ] **Step 1: Write failing test — createDefaultPresentRecords**

In `attendance.service.spec.ts`, add new describe block:

```typescript
describe('createDefaultPresentRecords', () => {
  it('should create present records for all enrolled students when default_present is active', async () => {
    const SESSION_ID = 'session-dp-1';
    const CLASS_ID = 'class-1';
    const enrolledStudents = [
      { id: 'student-1', student_id: 'student-1' },
      { id: 'student-2', student_id: 'student-2' },
      { id: 'student-3', student_id: 'student-3' },
    ];

    mockRlsTx.classEnrolment.findMany.mockResolvedValue(
      enrolledStudents.map((s) => ({ student_id: s.student_id, student: { id: s.student_id } })),
    );
    mockRlsTx.attendanceRecord.createMany.mockResolvedValue({ count: 3 });

    const result = await service.createDefaultPresentRecords(
      TENANT_ID,
      SESSION_ID,
      CLASS_ID,
      USER_ID,
    );

    expect(result).toBe(3);
    expect(mockRlsTx.attendanceRecord.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          tenant_id: TENANT_ID,
          attendance_session_id: SESSION_ID,
          student_id: 'student-1',
          status: 'present',
          marked_by_user_id: USER_ID,
        }),
      ]),
      skipDuplicates: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest --testPathPattern=attendance.service.spec --no-coverage -t "createDefaultPresentRecords"`
Expected: FAIL — `service.createDefaultPresentRecords is not a function`

- [ ] **Step 3: Implement createDefaultPresentRecords**

In `attendance.service.ts`, add method:

```typescript
async createDefaultPresentRecords(
  tenantId: string,
  sessionId: string,
  classId: string,
  userId: string,
): Promise<number> {
  const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

  return prismaWithRls.$transaction(async (tx) => {
    const db = tx as unknown as PrismaService;

    // Get all actively enrolled students in this class
    const enrolments = await db.classEnrolment.findMany({
      where: {
        class_id: classId,
        tenant_id: tenantId,
        status: 'active',
      },
      select: { student_id: true },
    });

    if (enrolments.length === 0) return 0;

    const now = new Date();
    const result = await db.attendanceRecord.createMany({
      data: enrolments.map((e) => ({
        tenant_id: tenantId,
        attendance_session_id: sessionId,
        student_id: e.student_id,
        status: 'present' as const,
        marked_by_user_id: userId,
        marked_at: now,
      })),
      skipDuplicates: true,
    });

    return result.count;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest --testPathPattern=attendance.service.spec --no-coverage -t "createDefaultPresentRecords"`
Expected: PASS

- [ ] **Step 5: Write failing test — createSession with default_present**

```typescript
it('should auto-create present records when default_present is true', async () => {
  // Mock class, academic year, work days, etc. as passing
  // Mock session creation success
  // Assert that createDefaultPresentRecords is called after session creation

  const createSpy = jest.spyOn(service, 'createDefaultPresentRecords').mockResolvedValue(25);

  mockRlsTx.attendanceSession.create.mockResolvedValue({
    id: 'new-session',
    class_id: 'class-1',
    default_present: true,
  });

  // ... setup mocks for validation (class exists, work day, etc.) ...

  await service.createSession(TENANT_ID, USER_ID, {
    class_id: 'class-1',
    session_date: '2026-03-25',
    default_present: true,
  }, ['attendance.take'], 'staff-1');

  expect(createSpy).toHaveBeenCalledWith(TENANT_ID, 'new-session', 'class-1', USER_ID);
});
```

- [ ] **Step 6: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 7: Update createSession to handle default_present**

In the `createSession` method, after session creation:

```typescript
// Determine effective default_present: session-level override > tenant setting
const effectiveDefaultPresent = dto.default_present !== null && dto.default_present !== undefined
  ? dto.default_present
  : tenantSettings?.attendance?.defaultPresentEnabled ?? false;

const session = await db.attendanceSession.create({
  data: {
    tenant_id: tenantId,
    class_id: dto.class_id,
    schedule_id: dto.schedule_id ?? null,
    session_date: sessionDate,
    status: 'open',
    override_reason: isClosure ? dto.override_reason : null,
    default_present: effectiveDefaultPresent || null,
  },
  include: {
    class_entity: { select: { id: true, name: true } },
  },
});

// Auto-create present records if default_present is active
if (effectiveDefaultPresent) {
  await this.createDefaultPresentRecords(tenantId, session.id, dto.class_id, userId);
}

return session;
```

- [ ] **Step 8: Run test to verify it passes**

Expected: PASS

- [ ] **Step 9: Run full attendance service test suite**

Run: `cd apps/api && npx jest --testPathPattern=attendance.service.spec --no-coverage`
Expected: All tests pass

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/attendance/attendance.service.ts apps/api/src/modules/attendance/attendance.service.spec.ts
git commit -m "feat(attendance): add default present record creation on session creation"
```

---

## Task 4: Exceptions-Only Upload + Quick-Mark + Undo

**Files:**
- Modify: `apps/api/src/modules/attendance/attendance-upload.service.ts`
- Modify: `apps/api/src/modules/attendance/attendance.controller.ts`
- Test: `apps/api/src/modules/attendance/attendance-upload.service.spec.ts`

- [ ] **Step 1: Write failing test — parseQuickMarkText**

```typescript
describe('parseQuickMarkText', () => {
  it('should parse simple shorthand lines', () => {
    const text = '1045 A\n1032 L\n1078 AE sick\n1012 LE parent pickup';
    const result = service.parseQuickMarkText(text);

    expect(result).toEqual([
      { student_number: '1045', status: 'absent_unexcused', reason: undefined },
      { student_number: '1032', status: 'late', reason: undefined },
      { student_number: '1078', status: 'absent_excused', reason: 'sick' },
      { student_number: '1012', status: 'left_early', reason: 'parent pickup' },
    ]);
  });

  it('should reject invalid status codes', () => {
    const text = '1045 X';
    expect(() => service.parseQuickMarkText(text)).toThrow('Invalid status code "X"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — `service.parseQuickMarkText is not a function`

- [ ] **Step 3: Implement parseQuickMarkText**

In `attendance-upload.service.ts`:

```typescript
private static readonly STATUS_MAP: Record<string, string> = {
  A: 'absent_unexcused',
  AE: 'absent_excused',
  L: 'late',
  LE: 'left_early',
};

parseQuickMarkText(text: string): Array<{ student_number: string; status: string; reason?: string }> {
  const lines = text.trim().split('\n').filter((line) => line.trim().length > 0);
  return lines.map((line, index) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) {
      throw new BadRequestException(`Line ${index + 1}: expected "student_number status [reason]"`);
    }

    const [studentNumber, statusCode, ...reasonParts] = parts;
    const status = AttendanceUploadService.STATUS_MAP[statusCode.toUpperCase()];
    if (!status) {
      throw new BadRequestException(
        `Invalid status code "${statusCode}" on line ${index + 1}. Valid codes: P, A, AE, L, LE`,
      );
    }

    return {
      student_number: studentNumber,
      status,
      reason: reasonParts.length > 0 ? reasonParts.join(' ') : undefined,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Write failing test — processExceptionsUpload**

```typescript
describe('processExceptionsUpload', () => {
  it('should update existing present records to exception statuses', async () => {
    // Mock: students exist, sessions exist with present records
    // Input: [{student_number: '1045', status: 'absent_unexcused'}]
    // Assert: record updated from present to absent_unexcused
    // Assert: daily summary recalculated
  });

  it('should reject unknown student numbers', async () => {
    // Mock: student_number '9999' not found
    // Assert: returns validation error with row detail
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 7: Implement processExceptionsUpload**

In `attendance-upload.service.ts`:

```typescript
async processExceptionsUpload(
  tenantId: string,
  userId: string,
  sessionDate: string,
  entries: Array<{ student_number: string; status: string; reason?: string }>,
): Promise<{ success: boolean; updated: number; errors: Array<{ row: number; error: string }>; batch_id: string }> {
  const batchId = randomUUID();
  const errors: Array<{ row: number; error: string }> = [];
  const updatedRecordIds: string[] = [];
  const affectedStudentIds = new Set<string>();
  const date = new Date(sessionDate);

  const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

  await prismaWithRls.$transaction(async (tx) => {
    const db = tx as unknown as PrismaService;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Resolve student by student_number
      const student = await db.student.findFirst({
        where: { tenant_id: tenantId, student_number: entry.student_number },
        select: { id: true },
      });

      if (!student) {
        errors.push({ row: i + 1, error: `Student number "${entry.student_number}" not found` });
        continue;
      }

      // Find their attendance record(s) for this date
      const records = await db.attendanceRecord.findMany({
        where: {
          tenant_id: tenantId,
          student_id: student.id,
          session: { session_date: date, status: { in: ['open', 'submitted'] } },
        },
        select: { id: true, status: true, attendance_session_id: true },
      });

      if (records.length === 0) {
        errors.push({ row: i + 1, error: `No attendance session found for student "${entry.student_number}" on ${sessionDate}` });
        continue;
      }

      // Update all matching records (student may have multiple sessions that day)
      for (const record of records) {
        await db.attendanceRecord.update({
          where: { id: record.id },
          data: {
            status: entry.status as AttendanceRecordStatus,
            reason: entry.reason ?? null,
            marked_by_user_id: userId,
            marked_at: new Date(),
            amended_from_status: record.status,
          },
        });
        updatedRecordIds.push(record.id);
        affectedStudentIds.add(student.id);
      }
    }

    // Recalculate daily summaries
    for (const studentId of affectedStudentIds) {
      await this.dailySummaryService.recalculate(tenantId, studentId, date);
    }
  });

  // Store undo data in Redis (5 min TTL)
  if (updatedRecordIds.length > 0) {
    await this.redis.getClient().setex(
      `attendance:undo:${batchId}`,
      300,
      JSON.stringify({ record_ids: updatedRecordIds, user_id: userId, tenant_id: tenantId, session_date: sessionDate }),
    );
  }

  return {
    success: errors.length === 0,
    updated: updatedRecordIds.length,
    errors,
    batch_id: batchId,
  };
}
```

- [ ] **Step 8: Run test to verify it passes**

Expected: PASS

- [ ] **Step 9: Implement undoUpload**

```typescript
async undoUpload(tenantId: string, userId: string, batchId: string): Promise<{ reverted: number }> {
  const raw = await this.redis.getClient().get(`attendance:undo:${batchId}`);
  if (!raw) {
    throw new BadRequestException('Undo window has expired or batch not found');
  }

  const data = JSON.parse(raw) as { record_ids: string[]; user_id: string; tenant_id: string; session_date: string };

  if (data.tenant_id !== tenantId || data.user_id !== userId) {
    throw new ForbiddenException('You can only undo your own uploads');
  }

  const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

  const reverted = await prismaWithRls.$transaction(async (tx) => {
    const db = tx as unknown as PrismaService;

    // Revert all records back to present
    const result = await db.attendanceRecord.updateMany({
      where: {
        id: { in: data.record_ids },
        tenant_id: tenantId,
        session: { status: 'open' }, // Can only undo if session still open
      },
      data: {
        status: 'present',
        reason: null,
        amended_from_status: null,
        marked_by_user_id: userId,
        marked_at: new Date(),
      },
    });

    return result.count;
  });

  // Delete undo key
  await this.redis.getClient().del(`attendance:undo:${batchId}`);

  return { reverted };
}
```

- [ ] **Step 10: Add controller endpoints**

In `attendance.controller.ts`, add:

```typescript
@Post('attendance/exceptions-upload')
@RequiresPermission('attendance.manage')
@HttpCode(HttpStatus.OK)
async exceptionsUpload(
  @CurrentTenant() tenant: { tenant_id: string },
  @CurrentUser() user: JwtPayload,
  @Body(new ZodValidationPipe(defaultPresentUploadSchema))
  dto: z.infer<typeof defaultPresentUploadSchema>,
) {
  return this.attendanceUploadService.processExceptionsUpload(
    tenant.tenant_id,
    user.sub,
    dto.session_date,
    dto.records,
  );
}

@Post('attendance/quick-mark')
@RequiresPermission('attendance.manage')
@HttpCode(HttpStatus.OK)
async quickMark(
  @CurrentTenant() tenant: { tenant_id: string },
  @CurrentUser() user: JwtPayload,
  @Body(new ZodValidationPipe(quickMarkSchema))
  dto: z.infer<typeof quickMarkSchema>,
) {
  const entries = this.attendanceUploadService.parseQuickMarkText(dto.text);
  return this.attendanceUploadService.processExceptionsUpload(
    tenant.tenant_id,
    user.sub,
    dto.session_date,
    entries,
  );
}

@Post('attendance/upload/undo')
@RequiresPermission('attendance.manage')
@HttpCode(HttpStatus.OK)
async undoUpload(
  @CurrentTenant() tenant: { tenant_id: string },
  @CurrentUser() user: JwtPayload,
  @Body(new ZodValidationPipe(uploadUndoSchema))
  dto: z.infer<typeof uploadUndoSchema>,
) {
  return this.attendanceUploadService.undoUpload(tenant.tenant_id, user.sub, dto.batch_id);
}
```

- [ ] **Step 11: Inject RedisService into AttendanceUploadService**

Update constructor:

```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly settingsService: SettingsService,
  private readonly dailySummaryService: DailySummaryService,
  private readonly redis: RedisService, // NEW
) {}
```

- [ ] **Step 12: Run all upload service tests**

Run: `cd apps/api && npx jest --testPathPattern=attendance-upload --no-coverage`
Expected: All pass

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/modules/attendance/
git commit -m "feat(attendance): exceptions-only upload, quick-mark shorthand, undo window"
```

---

## Task 5: Parent Absence Notification Service

**Files:**
- Create: `apps/api/src/modules/attendance/attendance-parent-notification.service.ts`
- Test: `apps/api/src/modules/attendance/attendance-parent-notification.service.spec.ts`
- Modify: `apps/api/src/modules/attendance/attendance.service.ts` (call notification after record change)
- Modify: `apps/api/src/modules/attendance/attendance.module.ts`

- [ ] **Step 1: Write failing test — triggerAbsenceNotification**

```typescript
describe('AttendanceParentNotificationService', () => {
  it('should enqueue parent notification when student marked absent', async () => {
    // Mock: tenant setting notifyParentOnAbsence = true
    // Mock: student has parent with user_id
    // Mock: notification queue add
    // Assert: job added with correct payload
  });

  it('should NOT send notification when notifyParentOnAbsence is false', async () => {
    // Mock: tenant setting notifyParentOnAbsence = false
    // Assert: queue.add NOT called
  });

  it('should deduplicate — not send twice for same student+session', async () => {
    // Mock: notification already exists for this source_entity
    // Assert: queue.add NOT called
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — module/class not found

- [ ] **Step 3: Implement AttendanceParentNotificationService**

Create `attendance-parent-notification.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { PrismaService } from '../../../prisma/prisma.service';
import { SettingsService } from '../configuration/settings.service';
import { NotificationsService } from '../communications/notifications.service';

@Injectable()
export class AttendanceParentNotificationService {
  private readonly logger = new Logger(AttendanceParentNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly notificationsService: NotificationsService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  /**
   * Called when an attendance record is saved/updated with a non-present status.
   * Sends immediate notification to parent(s) if tenant setting is enabled.
   */
  async triggerAbsenceNotification(
    tenantId: string,
    studentId: string,
    recordId: string,
    status: string,
    sessionDate: string,
  ): Promise<void> {
    // Check tenant setting
    const settings = await this.settingsService.getSettings(tenantId);
    if (!settings?.attendance?.notifyParentOnAbsence) return;
    if (!settings?.general?.attendanceVisibleToParents) return;

    // Status must be non-present
    if (status === 'present') return;

    // Deduplicate: check if notification already sent for this record
    const existing = await this.prisma.notification.findFirst({
      where: {
        tenant_id: tenantId,
        source_entity_type: 'attendance_record',
        source_entity_id: recordId,
      },
    });
    if (existing) return;

    // Find parent user(s) for this student
    const guardians = await this.prisma.studentGuardian.findMany({
      where: { student_id: studentId, tenant_id: tenantId },
      include: {
        guardian: {
          select: { user_id: true },
        },
        student: {
          select: { first_name: true, last_name: true },
        },
      },
    });

    if (guardians.length === 0) return;

    const studentName = `${guardians[0].student.first_name} ${guardians[0].student.last_name}`;

    // Map status to template key
    const templateMap: Record<string, string> = {
      absent_unexcused: 'attendance.absent',
      absent_excused: 'attendance.absent',
      late: 'attendance.late',
      left_early: 'attendance.left_early',
    };
    const templateKey = templateMap[status];
    if (!templateKey) return;

    // Create notifications for each guardian with a user account
    const notifications = guardians
      .filter((g) => g.guardian.user_id)
      .map((g) => ({
        tenant_id: tenantId,
        recipient_user_id: g.guardian.user_id!,
        channel: 'in_app' as const,
        template_key: templateKey,
        locale: 'en',
        payload_json: {
          student_name: studentName,
          date: sessionDate,
          status,
        },
        source_entity_type: 'attendance_record',
        source_entity_id: recordId,
      }));

    if (notifications.length > 0) {
      await this.notificationsService.createBatch(tenantId, notifications);

      // Enqueue for external dispatch (SMS/WhatsApp)
      for (const notif of notifications) {
        try {
          await this.notificationsQueue.add(
            'communications:dispatch-notifications',
            {
              tenant_id: tenantId,
              record_id: recordId,
              recipient_user_id: notif.recipient_user_id,
              template_key: templateKey,
            },
            { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
          );
        } catch {
          this.logger.warn(`Failed to enqueue parent notification for record ${recordId}`);
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Wire notification trigger into AttendanceService**

In `attendance.service.ts`, after saving records with non-present status (in `saveRecords` and `processExceptionsUpload`), call:

```typescript
// After record upsert/update, if status is not present
if (record.status !== 'present') {
  await this.parentNotificationService.triggerAbsenceNotification(
    tenantId,
    record.student_id,
    record.id,
    record.status,
    sessionDate,
  );
}
```

Inject `AttendanceParentNotificationService` into `AttendanceService` constructor.

- [ ] **Step 6: Update AttendanceModule**

Add `AttendanceParentNotificationService` to providers. Import `CommunicationsModule`. Register BullMQ queue.

```typescript
@Module({
  imports: [
    AuthModule,
    SchoolClosuresModule,
    ConfigurationModule,
    CommunicationsModule,
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    AttendanceUploadService,
    DailySummaryService,
    AttendanceParentNotificationService,
  ],
  exports: [AttendanceService, DailySummaryService],
})
export class AttendanceModule {}
```

- [ ] **Step 7: Run full attendance test suite**

Run: `cd apps/api && npx jest --testPathPattern=attendance --no-coverage`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/attendance/
git commit -m "feat(attendance): immediate parent notification on absence marking"
```

---

## Task 6: Smart Pattern Detection — Service + Worker

**Files:**
- Create: `apps/api/src/modules/attendance/attendance-pattern.service.ts`
- Test: `apps/api/src/modules/attendance/attendance-pattern.service.spec.ts`
- Create: `apps/worker/src/processors/attendance-pattern-detection.processor.ts`
- Modify: `apps/worker/src/worker.module.ts`
- Modify: `apps/api/src/modules/attendance/attendance.controller.ts`
- Modify: `apps/api/src/modules/attendance/attendance.module.ts`

- [ ] **Step 1: Write failing test — detectExcessiveAbsences**

```typescript
describe('AttendancePatternService', () => {
  describe('detectExcessiveAbsences', () => {
    it('should detect student with 5+ absences in 14-day window', async () => {
      // Mock: student has 6 absent records in past 14 days
      // Assert: returns alert object with details
    });

    it('should NOT flag student with fewer than threshold absences', async () => {
      // Mock: student has 3 absent records
      // Assert: returns empty array
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 3: Implement AttendancePatternService**

Create `attendance-pattern.service.ts`:

```typescript
@Injectable()
export class AttendancePatternService {
  private readonly logger = new Logger(AttendancePatternService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly notificationsService: NotificationsService,
    private readonly parentNotificationService: AttendanceParentNotificationService,
  ) {}

  async runDetection(tenantId: string): Promise<{
    alerts_created: number;
    students_scanned: number;
  }> {
    const settings = await this.settingsService.getSettings(tenantId);
    const config = settings?.attendance?.patternDetection;

    if (!config?.enabled) {
      return { alerts_created: 0, students_scanned: 0 };
    }

    // Get all students with attendance records
    const students = await this.getActiveStudents(tenantId);
    let alertsCreated = 0;

    for (const student of students) {
      const alerts = await this.detectPatternsForStudent(tenantId, student.id, config);

      for (const alert of alerts) {
        // Upsert (unique on tenant+student+type+date prevents duplicates)
        try {
          await this.prisma.attendancePatternAlert.create({
            data: {
              tenant_id: tenantId,
              student_id: student.id,
              alert_type: alert.alert_type,
              detected_date: new Date(),
              window_start: alert.window_start,
              window_end: alert.window_end,
              details_json: alert.details_json,
              status: 'active',
              parent_notified: false,
            },
          });
          alertsCreated++;

          // Notify staff
          await this.notifyStaff(tenantId, student, alert);

          // Notify parent (if auto mode)
          if (config.parentNotificationMode === 'auto') {
            await this.notifyParent(tenantId, student, alert);
          }
        } catch (err: unknown) {
          // Unique constraint = already detected today, skip
          if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
            continue;
          }
          throw err;
        }
      }
    }

    return { alerts_created: alertsCreated, students_scanned: students.length };
  }

  private async detectPatternsForStudent(
    tenantId: string,
    studentId: string,
    config: PatternDetectionConfig,
  ): Promise<Array<{ alert_type: string; window_start: Date; window_end: Date; details_json: Record<string, unknown> }>> {
    const alerts: Array<{ alert_type: string; window_start: Date; window_end: Date; details_json: Record<string, unknown> }> = [];
    const now = new Date();

    // 1. Excessive absences
    const absenceWindowStart = new Date(now);
    absenceWindowStart.setDate(absenceWindowStart.getDate() - config.excessiveAbsenceWindowDays);

    const absenceCount = await this.prisma.attendanceRecord.count({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: { in: ['absent_unexcused', 'absent_excused'] },
        session: { session_date: { gte: absenceWindowStart, lte: now } },
      },
    });

    if (absenceCount >= config.excessiveAbsenceThreshold) {
      alerts.push({
        alert_type: 'excessive_absences',
        window_start: absenceWindowStart,
        window_end: now,
        details_json: {
          count: absenceCount,
          threshold: config.excessiveAbsenceThreshold,
          window_days: config.excessiveAbsenceWindowDays,
        },
      });
    }

    // 2. Recurring day pattern
    const dayWindowStart = new Date(now);
    dayWindowStart.setDate(dayWindowStart.getDate() - config.recurringDayWindowDays);

    const absenceRecords = await this.prisma.attendanceRecord.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: { in: ['absent_unexcused', 'absent_excused'] },
        session: { session_date: { gte: dayWindowStart, lte: now } },
      },
      include: { session: { select: { session_date: true } } },
    });

    // Group by day of week
    const dayGroups = new Map<number, string[]>();
    for (const record of absenceRecords) {
      const day = new Date(record.session.session_date).getDay();
      const dates = dayGroups.get(day) ?? [];
      dates.push(record.session.session_date.toISOString().split('T')[0]);
      dayGroups.set(day, dates);
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (const [day, dates] of dayGroups) {
      if (dates.length >= config.recurringDayThreshold) {
        alerts.push({
          alert_type: 'recurring_day',
          window_start: dayWindowStart,
          window_end: now,
          details_json: {
            day_of_week: day,
            day_name: dayNames[day],
            count: dates.length,
            threshold: config.recurringDayThreshold,
            dates,
          },
        });
      }
    }

    // 3. Chronic tardiness
    const tardinessWindowStart = new Date(now);
    tardinessWindowStart.setDate(tardinessWindowStart.getDate() - config.tardinessWindowDays);

    const lateCount = await this.prisma.attendanceRecord.count({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: 'late',
        session: { session_date: { gte: tardinessWindowStart, lte: now } },
      },
    });

    if (lateCount >= config.tardinessThreshold) {
      alerts.push({
        alert_type: 'chronic_tardiness',
        window_start: tardinessWindowStart,
        window_end: now,
        details_json: {
          count: lateCount,
          threshold: config.tardinessThreshold,
          window_days: config.tardinessWindowDays,
        },
      });
    }

    return alerts;
  }

  private async notifyStaff(tenantId: string, student: { id: string; first_name: string; last_name: string }, alert: { alert_type: string; details_json: Record<string, unknown> }): Promise<void> {
    // Find all users with attendance.view_pattern_reports permission
    const staffUsers = await this.prisma.roleMembership.findMany({
      where: {
        tenant_id: tenantId,
        role: {
          role_permissions: {
            some: { permission_key: 'attendance.view_pattern_reports' },
          },
        },
      },
      select: { user_id: true },
    });

    const notifications = staffUsers.map((s) => ({
      tenant_id: tenantId,
      recipient_user_id: s.user_id,
      channel: 'in_app' as const,
      template_key: 'attendance.pattern_detected',
      locale: 'en',
      payload_json: {
        student_name: `${student.first_name} ${student.last_name}`,
        alert_type: alert.alert_type,
        details: alert.details_json,
      },
      source_entity_type: 'attendance_pattern_alert',
    }));

    if (notifications.length > 0) {
      await this.notificationsService.createBatch(tenantId, notifications);
    }
  }

  private async notifyParent(tenantId: string, student: { id: string; first_name: string; last_name: string }, alert: { alert_type: string; details_json: Record<string, unknown> }): Promise<void> {
    // Similar to staff notification, but targets parent user(s)
    const guardians = await this.prisma.studentGuardian.findMany({
      where: { student_id: student.id, tenant_id: tenantId },
      include: { guardian: { select: { user_id: true } } },
    });

    const notifications = guardians
      .filter((g) => g.guardian.user_id)
      .map((g) => ({
        tenant_id: tenantId,
        recipient_user_id: g.guardian.user_id!,
        channel: 'in_app' as const,
        template_key: 'attendance.pattern_detected',
        locale: 'en',
        payload_json: {
          student_name: `${student.first_name} ${student.last_name}`,
          alert_type: alert.alert_type,
          details: alert.details_json,
          message: this.buildParentMessage(student, alert),
        },
      }));

    if (notifications.length > 0) {
      await this.notificationsService.createBatch(tenantId, notifications);
    }
  }

  private buildParentMessage(
    student: { first_name: string; last_name: string },
    alert: { alert_type: string; details_json: Record<string, unknown> },
  ): string {
    const name = `${student.first_name} ${student.last_name}`;
    const details = alert.details_json;

    switch (alert.alert_type) {
      case 'excessive_absences':
        return `Your child ${name} has been absent ${details.count} days in the past ${details.window_days} days. Please contact the school office.`;
      case 'recurring_day':
        return `Your child ${name} has been consistently absent on ${details.day_name}s — ${details.count} times in the past ${details.window_days} days. Please contact the school office.`;
      case 'chronic_tardiness':
        return `Your child ${name} has been late ${details.count} times in the past ${details.window_days} days. Please contact the school office.`;
      default:
        return `An attendance pattern has been detected for your child ${name}. Please contact the school office.`;
    }
  }

  // --- Controller methods ---

  async listAlerts(
    tenantId: string,
    filters: { status?: string; alert_type?: string; page?: number; pageSize?: number },
  ) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 20, 100);
    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (filters.status) where.status = filters.status;
    if (filters.alert_type) where.alert_type = filters.alert_type;

    const [data, total] = await Promise.all([
      this.prisma.attendancePatternAlert.findMany({
        where,
        include: {
          student: { select: { id: true, first_name: true, last_name: true, student_number: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.attendancePatternAlert.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  async acknowledgeAlert(tenantId: string, alertId: string, userId: string) {
    return this.prisma.attendancePatternAlert.update({
      where: { id: alertId, tenant_id: tenantId },
      data: { status: 'acknowledged', acknowledged_by: userId, acknowledged_at: new Date() },
    });
  }

  async resolveAlert(tenantId: string, alertId: string) {
    return this.prisma.attendancePatternAlert.update({
      where: { id: alertId, tenant_id: tenantId },
      data: { status: 'resolved' },
    });
  }

  async notifyParentManual(tenantId: string, alertId: string): Promise<void> {
    const alert = await this.prisma.attendancePatternAlert.findUnique({
      where: { id: alertId, tenant_id: tenantId },
      include: { student: { select: { id: true, first_name: true, last_name: true } } },
    });

    if (!alert) throw new NotFoundException('Alert not found');
    if (alert.parent_notified) throw new ConflictException('Parent already notified');

    await this.notifyParent(tenantId, alert.student, {
      alert_type: alert.alert_type,
      details_json: alert.details_json as Record<string, unknown>,
    });

    await this.prisma.attendancePatternAlert.update({
      where: { id: alertId },
      data: { parent_notified: true, parent_notified_at: new Date() },
    });
  }

  private async getActiveStudents(tenantId: string) {
    return this.prisma.student.findMany({
      where: { tenant_id: tenantId, status: 'active' },
      select: { id: true, first_name: true, last_name: true },
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Add controller endpoints for pattern alerts**

In `attendance.controller.ts`:

```typescript
@Get('attendance/pattern-alerts')
@RequiresPermission('attendance.view_pattern_reports')
async listPatternAlerts(
  @CurrentTenant() tenant: { tenant_id: string },
  @Query() query: { status?: string; alert_type?: string; page?: string; pageSize?: string },
) {
  return this.patternService.listAlerts(tenant.tenant_id, {
    status: query.status,
    alert_type: query.alert_type,
    page: query.page ? parseInt(query.page) : undefined,
    pageSize: query.pageSize ? parseInt(query.pageSize) : undefined,
  });
}

@Patch('attendance/pattern-alerts/:id/acknowledge')
@RequiresPermission('attendance.view_pattern_reports')
async acknowledgeAlert(
  @CurrentTenant() tenant: { tenant_id: string },
  @CurrentUser() user: JwtPayload,
  @Param('id') id: string,
) {
  return this.patternService.acknowledgeAlert(tenant.tenant_id, id, user.sub);
}

@Patch('attendance/pattern-alerts/:id/resolve')
@RequiresPermission('attendance.view_pattern_reports')
async resolveAlert(
  @CurrentTenant() tenant: { tenant_id: string },
  @Param('id') id: string,
) {
  return this.patternService.resolveAlert(tenant.tenant_id, id);
}

@Post('attendance/pattern-alerts/:id/notify-parent')
@RequiresPermission('attendance.view_pattern_reports')
@HttpCode(HttpStatus.OK)
async notifyParentManual(
  @CurrentTenant() tenant: { tenant_id: string },
  @Param('id') id: string,
) {
  await this.patternService.notifyParentManual(tenant.tenant_id, id);
  return { success: true };
}
```

- [ ] **Step 6: Create worker processor**

Create `apps/worker/src/processors/attendance-pattern-detection.processor.ts`:

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../base/tenant-aware-job';

export type AttendancePatternDetectionPayload = TenantJobPayload;
export const ATTENDANCE_DETECT_PATTERNS_JOB = 'attendance:detect-patterns';

@Processor(QUEUE_NAMES.ATTENDANCE)
export class AttendancePatternDetectionProcessor extends WorkerHost {
  private readonly logger = new Logger(AttendancePatternDetectionProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<AttendancePatternDetectionPayload>): Promise<void> {
    if (job.name !== ATTENDANCE_DETECT_PATTERNS_JOB) return;

    const { tenant_id } = job.data;
    if (!tenant_id) throw new Error('Job rejected: missing tenant_id in payload.');

    this.logger.log(`Processing ${ATTENDANCE_DETECT_PATTERNS_JOB} — tenant ${tenant_id}`);

    const detectionJob = new AttendancePatternDetectionJob(this.prisma);
    await detectionJob.execute(job.data);
  }
}

class AttendancePatternDetectionJob extends TenantAwareJob<AttendancePatternDetectionPayload> {
  private readonly logger = new Logger(AttendancePatternDetectionJob.name);

  protected async processJob(
    data: AttendancePatternDetectionPayload,
    tx: PrismaClient,
  ): Promise<void> {
    // Note: The actual detection logic lives in AttendancePatternService on the API side.
    // This worker job calls it via direct DB queries (same pattern detection logic).
    // For now, we implement the detection inline since the worker doesn't have NestJS DI for API services.

    const { tenant_id } = data;

    // Read tenant settings
    const tenantSettings = await tx.tenantSetting.findFirst({
      where: { tenant_id },
      select: { settings: true },
    });

    const settings = (tenantSettings?.settings as Record<string, unknown>) ?? {};
    const attendanceSettings = (settings.attendance as Record<string, unknown>) ?? {};
    const patternConfig = (attendanceSettings.patternDetection as Record<string, unknown>) ?? {};

    if (!patternConfig.enabled) {
      this.logger.log(`Pattern detection disabled for tenant ${tenant_id}`);
      return;
    }

    // Get all active students
    const students = await tx.student.findMany({
      where: { tenant_id, status: 'active' },
      select: { id: true, first_name: true, last_name: true },
    });

    const excessiveThreshold = (patternConfig.excessiveAbsenceThreshold as number) ?? 5;
    const excessiveWindow = (patternConfig.excessiveAbsenceWindowDays as number) ?? 14;
    const recurringThreshold = (patternConfig.recurringDayThreshold as number) ?? 3;
    const recurringWindow = (patternConfig.recurringDayWindowDays as number) ?? 30;
    const tardinessThreshold = (patternConfig.tardinessThreshold as number) ?? 4;
    const tardinessWindow = (patternConfig.tardinessWindowDays as number) ?? 14;

    let alertsCreated = 0;
    const now = new Date();

    for (const student of students) {
      // 1. Excessive absences
      const absenceStart = new Date(now);
      absenceStart.setDate(absenceStart.getDate() - excessiveWindow);

      const absenceCount = await tx.attendanceRecord.count({
        where: {
          tenant_id,
          student_id: student.id,
          status: { in: ['absent_unexcused', 'absent_excused'] },
          session: { session_date: { gte: absenceStart, lte: now } },
        },
      });

      if (absenceCount >= excessiveThreshold) {
        try {
          await tx.attendancePatternAlert.create({
            data: {
              tenant_id,
              student_id: student.id,
              alert_type: 'excessive_absences',
              detected_date: now,
              window_start: absenceStart,
              window_end: now,
              details_json: { count: absenceCount, threshold: excessiveThreshold, window_days: excessiveWindow },
            },
          });
          alertsCreated++;
        } catch { /* duplicate — skip */ }
      }

      // 2. Recurring day pattern
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - recurringWindow);

      const absenceRecords = await tx.attendanceRecord.findMany({
        where: {
          tenant_id,
          student_id: student.id,
          status: { in: ['absent_unexcused', 'absent_excused'] },
          session: { session_date: { gte: dayStart, lte: now } },
        },
        include: { session: { select: { session_date: true } } },
      });

      const dayGroups = new Map<number, string[]>();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      for (const record of absenceRecords) {
        const day = new Date(record.session.session_date).getDay();
        const dates = dayGroups.get(day) ?? [];
        dates.push(new Date(record.session.session_date).toISOString().split('T')[0]);
        dayGroups.set(day, dates);
      }

      for (const [day, dates] of dayGroups) {
        if (dates.length >= recurringThreshold) {
          try {
            await tx.attendancePatternAlert.create({
              data: {
                tenant_id,
                student_id: student.id,
                alert_type: 'recurring_day',
                detected_date: now,
                window_start: dayStart,
                window_end: now,
                details_json: { day_of_week: day, day_name: dayNames[day], count: dates.length, threshold: recurringThreshold, dates },
              },
            });
            alertsCreated++;
          } catch { /* duplicate */ }
        }
      }

      // 3. Chronic tardiness
      const tardinessStart = new Date(now);
      tardinessStart.setDate(tardinessStart.getDate() - tardinessWindow);

      const lateCount = await tx.attendanceRecord.count({
        where: {
          tenant_id,
          student_id: student.id,
          status: 'late',
          session: { session_date: { gte: tardinessStart, lte: now } },
        },
      });

      if (lateCount >= tardinessThreshold) {
        try {
          await tx.attendancePatternAlert.create({
            data: {
              tenant_id,
              student_id: student.id,
              alert_type: 'chronic_tardiness',
              detected_date: now,
              window_start: tardinessStart,
              window_end: now,
              details_json: { count: lateCount, threshold: tardinessThreshold, window_days: tardinessWindow },
            },
          });
          alertsCreated++;
        } catch { /* duplicate */ }
      }
    }

    this.logger.log(`Pattern detection complete: ${alertsCreated} alerts created for ${students.length} students (tenant ${tenant_id})`);
  }
}
```

- [ ] **Step 7: Register processor in worker.module.ts**

Add `AttendancePatternDetectionProcessor` to providers array.

- [ ] **Step 8: Update AttendanceModule with PatternService**

Add `AttendancePatternService` to providers and inject into controller.

- [ ] **Step 9: Run all tests**

Run: `cd apps/api && npx jest --testPathPattern=attendance --no-coverage`
Expected: All pass

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/attendance/ apps/worker/src/
git commit -m "feat(attendance): smart pattern detection engine with staff/parent notifications"
```

---

## Task 7: AI Photo Scan — Service + Worker

**Files:**
- Create: `apps/api/src/modules/attendance/attendance-scan.service.ts`
- Test: `apps/api/src/modules/attendance/attendance-scan.service.spec.ts`
- Create: `apps/worker/src/processors/attendance-scan.processor.ts`
- Modify: `apps/api/src/modules/attendance/attendance.controller.ts`
- Modify: `apps/api/src/modules/attendance/attendance.module.ts`
- Modify: `apps/worker/src/worker.module.ts`

- [ ] **Step 1: Install Anthropic SDK**

Run: `cd apps/api && npm install @anthropic-ai/sdk`
Run: `cd apps/worker && npm install @anthropic-ai/sdk`

- [ ] **Step 2: Write failing test — parseScanResponse**

```typescript
describe('AttendanceScanService', () => {
  describe('parseScanResponse', () => {
    it('should parse valid AI JSON response into ScanResultEntry[]', () => {
      const aiResponse = JSON.stringify([
        { student_number: '1045', status: 'absent', reason: 'sick', confidence: 'high' },
        { student_number: '1032', status: 'late', confidence: 'low' },
      ]);

      const result = service.parseScanResponse(aiResponse);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        student_number: '1045',
        status: 'absent_unexcused',
        reason: 'sick',
        confidence: 'high',
      });
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 4: Implement AttendanceScanService**

Create `attendance-scan.service.ts`:

```typescript
import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';

import { PrismaService } from '../../../prisma/prisma.service';
import { SettingsService } from '../configuration/settings.service';
import { RedisService } from '../../common/services/redis.service';

import type { ScanResultEntry } from '@school/shared';

@Injectable()
export class AttendanceScanService {
  private readonly logger = new Logger(AttendanceScanService.name);
  private anthropic: Anthropic | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly redis: RedisService,
  ) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.anthropic = new Anthropic({ apiKey });
    }
  }

  async scanImage(
    tenantId: string,
    userId: string,
    imageBuffer: Buffer,
    mimeType: string,
    sessionDate: string,
  ): Promise<{ scan_id: string; entries: ScanResultEntry[] }> {
    if (!this.anthropic) {
      throw new BadRequestException('AI functions are not configured on this server');
    }

    // Verify AI module is enabled (double-check beyond guard)
    const modules = await this.prisma.tenantModule.findMany({
      where: { tenant_id: tenantId, module_key: 'ai_functions', is_enabled: true },
    });
    if (modules.length === 0) {
      throw new ForbiddenException('AI Functions module is not enabled');
    }

    // Rate limiting
    const dailyKey = `attendance:scan:${tenantId}:${new Date().toISOString().split('T')[0]}`;
    const dailyCount = await this.redis.getClient().incr(dailyKey);
    if (dailyCount === 1) {
      await this.redis.getClient().expire(dailyKey, 86400);
    }
    if (dailyCount > 50) {
      throw new BadRequestException('Daily scan limit reached (50 scans/day)');
    }

    // Send to Claude Vision
    const base64Image = imageBuffer.toString('base64');
    const mediaType = mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Image },
            },
            {
              type: 'text',
              text: `You are reading a handwritten school attendance/absence sheet. Extract each student entry as a JSON array. Each entry should have:
- student_number: the student's ID number (string)
- status: one of "absent", "absent_excused", "late", "left_early"
- reason: any written reason (string, optional)
- confidence: "high" or "low" based on handwriting clarity

If a number or status is unclear, include your best guess with confidence: "low".
Return ONLY the JSON array, no other text.`,
            },
          ],
        },
      ],
    });

    // Extract text from response
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new BadRequestException('AI did not return a readable response');
    }

    const entries = this.parseScanResponse(textBlock.text);

    // Resolve student names
    const resolved = await this.resolveStudentNames(tenantId, entries);

    // Store scan result in Redis (30 min TTL) for confirmation step
    const scanId = crypto.randomUUID();
    await this.redis.getClient().setex(
      `attendance:scan:${scanId}`,
      1800,
      JSON.stringify({ tenant_id: tenantId, user_id: userId, session_date: sessionDate, entries: resolved }),
    );

    return { scan_id: scanId, entries: resolved };
  }

  parseScanResponse(aiText: string): ScanResultEntry[] {
    // Extract JSON from response (may have markdown code fences)
    const jsonMatch = aiText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new BadRequestException('Could not parse AI response as JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      student_number: string;
      status: string;
      reason?: string;
      confidence: string;
    }>;

    const statusMap: Record<string, string> = {
      absent: 'absent_unexcused',
      absent_unexcused: 'absent_unexcused',
      absent_excused: 'absent_excused',
      excused: 'absent_excused',
      late: 'late',
      left_early: 'left_early',
    };

    return parsed.map((entry) => ({
      student_number: String(entry.student_number),
      status: (statusMap[entry.status.toLowerCase()] ?? 'absent_unexcused') as ScanResultEntry['status'],
      reason: entry.reason,
      confidence: (entry.confidence === 'high' ? 'high' : 'low') as 'high' | 'low',
    }));
  }

  private async resolveStudentNames(
    tenantId: string,
    entries: ScanResultEntry[],
  ): Promise<ScanResultEntry[]> {
    return Promise.all(
      entries.map(async (entry) => {
        const student = await this.prisma.student.findFirst({
          where: { tenant_id: tenantId, student_number: entry.student_number },
          select: { id: true, first_name: true, last_name: true },
        });

        if (student) {
          return {
            ...entry,
            resolved_student_id: student.id,
            resolved_student_name: `${student.first_name} ${student.last_name}`,
          };
        }

        return { ...entry, error: 'Student number not found' };
      }),
    );
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Expected: PASS

- [ ] **Step 6: Add controller endpoint for scan**

In `attendance.controller.ts`:

```typescript
@Post('attendance/scan')
@ModuleEnabled('ai_functions')
@RequiresPermission('attendance.manage')
@UseInterceptors(FileInterceptor('image'))
@HttpCode(HttpStatus.OK)
async scanAbsenceSheet(
  @CurrentTenant() tenant: { tenant_id: string },
  @CurrentUser() user: JwtPayload,
  @UploadedFile() file: Express.Multer.File,
  @Body('session_date') sessionDate: string,
) {
  if (!file) {
    throw new BadRequestException('Image file is required');
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
  if (!allowedTypes.includes(file.mimetype)) {
    throw new BadRequestException('Invalid image type. Allowed: JPEG, PNG, WebP, HEIC');
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new BadRequestException('Image too large. Maximum 10MB');
  }

  return this.scanService.scanImage(
    tenant.tenant_id,
    user.sub,
    file.buffer,
    file.mimetype,
    sessionDate,
  );
}

@Post('attendance/scan/confirm')
@ModuleEnabled('ai_functions')
@RequiresPermission('attendance.manage')
@HttpCode(HttpStatus.OK)
async confirmScan(
  @CurrentTenant() tenant: { tenant_id: string },
  @CurrentUser() user: JwtPayload,
  @Body(new ZodValidationPipe(scanConfirmSchema))
  dto: z.infer<typeof scanConfirmSchema>,
) {
  // Process confirmed entries same as exceptions upload
  return this.attendanceUploadService.processExceptionsUpload(
    tenant.tenant_id,
    user.sub,
    dto.session_date,
    dto.entries,
  );
}
```

- [ ] **Step 7: Update module with ScanService**

Add `AttendanceScanService` to providers. Add `MulterModule` import if not already present.

- [ ] **Step 8: Run tests**

Run: `cd apps/api && npx jest --testPathPattern=attendance --no-coverage`
Expected: All pass

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/attendance/ apps/worker/src/
git commit -m "feat(attendance): AI photo scan of handwritten absence sheets via Claude Vision"
```

---

## Task 8: Update Nightly Session Generation for Default Present

**Files:**
- Modify: `apps/worker/src/processors/attendance-session-generation.processor.ts`

- [ ] **Step 1: Update processor to create default present records**

In `AttendanceSessionGenerationJob.processJob`, after creating a session, add:

```typescript
// After successful session creation:
// Check if default_present is enabled for this tenant
const tenantSettings = await tx.tenantSetting.findFirst({
  where: { tenant_id },
  select: { settings: true },
});
const settings = (tenantSettings?.settings as Record<string, unknown>) ?? {};
const attendanceSettings = (settings.attendance as Record<string, unknown>) ?? {};
const defaultPresentEnabled = attendanceSettings.defaultPresentEnabled === true;

if (defaultPresentEnabled) {
  // Bulk insert present records for all enrolled students in this class
  const enrolments = await tx.classEnrolment.findMany({
    where: { class_id: schedule.class_id, tenant_id, status: 'active' },
    select: { student_id: true },
  });

  if (enrolments.length > 0) {
    const now = new Date();
    await tx.attendanceRecord.createMany({
      data: enrolments.map((e) => ({
        tenant_id,
        attendance_session_id: newSession.id, // capture the created session
        student_id: e.student_id,
        status: 'present',
        marked_by_user_id: '00000000-0000-0000-0000-000000000000', // system user
        marked_at: now,
      })),
      skipDuplicates: true,
    });
  }
}
```

Note: Need to capture the created session's `id` from the `create` call. Adjust the code flow to store it in a variable.

- [ ] **Step 2: Read tenant settings once at the start of processJob (optimize)**

Move the tenant settings read to the top of `processJob` so it's not read inside the loop:

```typescript
protected async processJob(data: AttendanceSessionGenerationPayload, tx: PrismaClient): Promise<void> {
  const { tenant_id, date } = data;
  const targetDate = new Date(date);

  // Read tenant settings once
  const tenantSettings = await tx.tenantSetting.findFirst({
    where: { tenant_id },
    select: { settings: true },
  });
  const settings = (tenantSettings?.settings as Record<string, unknown>) ?? {};
  const attendanceSettings = (settings.attendance as Record<string, unknown>) ?? {};
  const defaultPresentEnabled = attendanceSettings.defaultPresentEnabled === true;

  // ... rest of schedule loop, creating sessions ...
  // After each session creation, if defaultPresentEnabled, bulk insert records
}
```

- [ ] **Step 3: Run existing tests**

Run: `cd apps/worker && npx jest --no-coverage`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/processors/attendance-session-generation.processor.ts
git commit -m "feat(worker): auto-create present records in nightly session generation"
```

---

## Task 9: Frontend — Settings UI Updates

**Files:**
- Modify: `apps/web/src/app/[locale]/(school)/settings/general/page.tsx`

- [ ] **Step 1: Read current settings page to understand structure**

Read `apps/web/src/app/[locale]/(school)/settings/general/page.tsx` fully before editing.

- [ ] **Step 2: Add Default Present toggle**

In the Attendance settings section, add:

```tsx
<div className="flex items-center justify-between">
  <div>
    <Label>{t('settings.attendance.defaultPresent')}</Label>
    <p className="text-sm text-muted-foreground">
      {t('settings.attendance.defaultPresentDescription')}
    </p>
  </div>
  <Switch
    checked={settings.attendance.defaultPresentEnabled}
    onCheckedChange={(checked) =>
      updateSettings({ attendance: { ...settings.attendance, defaultPresentEnabled: checked } })
    }
  />
</div>
```

- [ ] **Step 3: Add Notify Parent on Absence toggle**

```tsx
<div className="flex items-center justify-between">
  <div>
    <Label>{t('settings.attendance.notifyParentOnAbsence')}</Label>
    <p className="text-sm text-muted-foreground">
      {t('settings.attendance.notifyParentOnAbsenceDescription')}
    </p>
  </div>
  <Switch
    checked={settings.attendance.notifyParentOnAbsence}
    onCheckedChange={(checked) =>
      updateSettings({ attendance: { ...settings.attendance, notifyParentOnAbsence: checked } })
    }
  />
</div>
```

- [ ] **Step 4: Add Pattern Detection sub-section**

Collapsible section with:
- Enabled toggle
- Excessive absence: threshold + window days (number inputs)
- Recurring day: threshold + window days
- Tardiness: threshold + window days
- Parent notification mode: Radio (Auto / Manual)

- [ ] **Step 5: Add AI Functions section (conditional on module)**

Only render if `ai_functions` module is enabled:

```tsx
{modules.includes('ai_functions') && (
  <Collapsible>
    <CollapsibleTrigger>{t('settings.ai.title')}</CollapsibleTrigger>
    <CollapsibleContent>
      <div className="flex items-center justify-between">
        <Label>{t('settings.ai.enabled')}</Label>
        <Switch
          checked={settings.ai?.enabled}
          onCheckedChange={(checked) =>
            updateSettings({ ai: { ...settings.ai, enabled: checked } })
          }
        />
      </div>
    </CollapsibleContent>
  </Collapsible>
)}
```

- [ ] **Step 6: Add translation keys**

Add EN + AR translation keys to `messages/en.json` and `messages/ar.json` for all new settings labels.

- [ ] **Step 7: Run type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add apps/web/
git commit -m "feat(web): add attendance settings UI for default present, patterns, AI"
```

---

## Task 10: Frontend — Upload Page (Exceptions Mode + Quick-Mark + Undo)

**Files:**
- Modify: `apps/web/src/app/[locale]/(school)/attendance/upload/page.tsx`

- [ ] **Step 1: Read current upload page**

Read full content of `apps/web/src/app/[locale]/(school)/attendance/upload/page.tsx`.

- [ ] **Step 2: Add mode toggle (Standard / Exceptions-Only)**

At the top of the upload form, add a mode selector that checks tenant setting `defaultPresentEnabled`:

```tsx
const [mode, setMode] = useState<'standard' | 'exceptions'>(
  tenantSettings?.attendance?.defaultPresentEnabled ? 'exceptions' : 'standard'
);
```

Show a tab or toggle to switch between modes.

- [ ] **Step 3: Build exceptions-only upload form**

When mode is `exceptions`:
- Template download button generates empty template (headers only)
- File upload accepts CSV/XLSX with student_number + status columns
- On submit, call `POST /attendance/exceptions-upload`

- [ ] **Step 4: Add Quick-Mark text area**

Below the file upload (only in exceptions mode):

```tsx
{mode === 'exceptions' && (
  <div className="space-y-2">
    <Label>{t('attendance.upload.quickMark')}</Label>
    <Textarea
      placeholder="1045 A&#10;1032 L&#10;1078 AE sick"
      value={quickMarkText}
      onChange={(e) => setQuickMarkText(e.target.value)}
      rows={6}
    />
    <Button onClick={handleQuickMark}>{t('attendance.upload.submitQuickMark')}</Button>
  </div>
)}
```

Handler calls `POST /attendance/quick-mark`.

- [ ] **Step 5: Add Undo button after successful upload**

After successful upload response:

```tsx
{uploadResult && uploadResult.batch_id && (
  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
    <p>{t('attendance.upload.undoMessage', { count: uploadResult.updated })}</p>
    <Button
      variant="outline"
      onClick={handleUndo}
      disabled={undoExpired}
    >
      {t('attendance.upload.undo')} ({undoCountdown}s)
    </Button>
  </div>
)}
```

Use `useEffect` with `setInterval` for 5-minute countdown.

- [ ] **Step 6: Add translation keys**

- [ ] **Step 7: Run type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add apps/web/
git commit -m "feat(web): exceptions-only upload, quick-mark shorthand, undo window"
```

---

## Task 11: Frontend — Patterns Dashboard

**Files:**
- Modify: `apps/web/src/app/[locale]/(school)/attendance/exceptions/page.tsx`

- [ ] **Step 1: Read current exceptions page**

- [ ] **Step 2: Add "Patterns" tab**

Use a tab component (or section toggle) to switch between existing exceptions and new pattern alerts:

```tsx
<Tabs defaultValue="pending">
  <TabsList>
    <TabsTrigger value="pending">{t('attendance.exceptions.pending')}</TabsTrigger>
    <TabsTrigger value="patterns">{t('attendance.exceptions.patterns')}</TabsTrigger>
  </TabsList>
  <TabsContent value="pending">
    {/* existing pending sessions + excessive absences UI */}
  </TabsContent>
  <TabsContent value="patterns">
    {/* new pattern alerts table */}
  </TabsContent>
</Tabs>
```

- [ ] **Step 3: Build pattern alerts table**

Fetch from `GET /attendance/pattern-alerts`. Display:
- Student name + number
- Alert type (with badge)
- Detected date
- Details (threshold, count, window)
- Status (active/acknowledged/resolved)
- Actions: Acknowledge, Resolve, Notify Parent (if manual mode and not yet notified)

Filterable by: alert type, status.

- [ ] **Step 4: Add action handlers**

- Acknowledge: `PATCH /attendance/pattern-alerts/:id/acknowledge`
- Resolve: `PATCH /attendance/pattern-alerts/:id/resolve`
- Notify Parent: `POST /attendance/pattern-alerts/:id/notify-parent`

- [ ] **Step 5: Permission gate**

Only show Patterns tab if user has `attendance.view_pattern_reports` permission.

- [ ] **Step 6: Add translation keys**

- [ ] **Step 7: Run type-check**

Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add apps/web/
git commit -m "feat(web): pattern alerts dashboard on attendance exceptions page"
```

---

## Task 12: Frontend — AI Scan Page

**Files:**
- Create: `apps/web/src/app/[locale]/(school)/attendance/scan/page.tsx`

- [ ] **Step 1: Create scan page**

New client component page:

```tsx
'use client';

// Multi-step flow:
// 1. Select session date
// 2. Upload photo (camera capture or file)
// 3. Show "Processing..." spinner
// 4. Show results table for confirmation
// 5. Edit any entries
// 6. Confirm → apply

export default function AttendanceScanPage() {
  const [step, setStep] = useState<'upload' | 'processing' | 'confirm' | 'done'>('upload');
  const [sessionDate, setSessionDate] = useState('');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  // Step 1: Date picker + file upload
  // Step 2: POST /attendance/scan (multipart)
  // Step 3: Display results table
  //   - Editable student_number (text input)
  //   - Resolved student name (read-only, or "Not found" in red)
  //   - Status dropdown
  //   - Reason text input
  //   - Confidence badge (green=high, amber=low)
  // Step 4: Confirm → POST /attendance/scan/confirm
}
```

- [ ] **Step 2: Add camera capture support**

Use `<input type="file" accept="image/*" capture="environment" />` for mobile camera.

- [ ] **Step 3: Build confirmation table**

Editable DataTable with inline editing for corrections.

- [ ] **Step 4: Add navigation link**

Add "Scan Absence Sheet" button on the upload page (only visible when `ai_functions` module is enabled for the tenant).

- [ ] **Step 5: Add translation keys**

- [ ] **Step 6: Run type-check**

Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/
git commit -m "feat(web): AI photo scan page for handwritten attendance sheets"
```

---

## Task 13: Frontend — Default Present Toggle in Session Creation

**Files:**
- Modify: `apps/web/src/app/[locale]/(school)/attendance/page.tsx`

- [ ] **Step 1: Read current page**

- [ ] **Step 2: Add default_present toggle to create session dialog**

In the create session dialog, when tenant setting `defaultPresentEnabled` is true, show a toggle:

```tsx
{tenantSettings?.attendance?.defaultPresentEnabled && (
  <div className="flex items-center gap-2">
    <Switch
      id="default-present"
      checked={defaultPresent}
      onCheckedChange={setDefaultPresent}
    />
    <Label htmlFor="default-present">
      {t('attendance.createSession.defaultPresent')}
    </Label>
  </div>
)}
```

Pass `default_present` in the POST body to `/attendance-sessions`.

- [ ] **Step 3: Add arrival_time field to marking page**

In `attendance/mark/[sessionId]/page.tsx`, when a student is marked "Late", show an optional time picker:

```tsx
{record.status === 'late' && (
  <Input
    type="time"
    value={record.arrival_time ?? ''}
    onChange={(e) => updateRecord(record.student_id, { arrival_time: e.target.value })}
    className="w-28"
  />
)}
```

- [ ] **Step 4: Add translation keys**

- [ ] **Step 5: Run type-check**

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/
git commit -m "feat(web): default present toggle in session creation, arrival time for late"
```

---

## Task 14: Regression Testing

**Files:**
- All test files across the project

- [ ] **Step 1: Run full backend test suite**

Run: `cd apps/api && npx jest --no-coverage`
Expected: All pass

- [ ] **Step 2: Run full worker test suite**

Run: `cd apps/worker && npx jest --no-coverage`
Expected: All pass

- [ ] **Step 3: Run shared package type-check**

Run: `turbo type-check`
Expected: 0 errors across all packages

- [ ] **Step 4: Run lint**

Run: `turbo lint`
Expected: 0 errors

- [ ] **Step 5: Fix any regressions**

If any test fails, fix the issue and re-run.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "test: fix regressions from attendance default-present feature"
```

---

## Task 15: E2E Integration Tests

**Files:**
- Create: `apps/api/test/attendance-default-present.e2e-spec.ts`

- [ ] **Step 1: Write E2E test — default present session creation**

```typescript
describe('Attendance Default Present (e2e)', () => {
  it('POST /attendance-sessions — should auto-create present records when default_present=true', async () => {
    // Setup: enable defaultPresentEnabled in tenant settings
    // Create session with default_present: true
    // Assert: records exist for all enrolled students
  });

  it('POST /attendance/exceptions-upload — should update present records to exceptions', async () => {
    // Setup: session with default present records
    // Upload: student_number 1045, status: absent_unexcused
    // Assert: record updated
    // Assert: daily summary recalculated
  });

  it('POST /attendance/quick-mark — should parse shorthand and update records', async () => {
    // Input: "1045 A\n1032 L"
    // Assert: records updated
  });

  it('POST /attendance/upload/undo — should revert to present within 5 min window', async () => {
    // Setup: upload exceptions
    // Undo: revert
    // Assert: records back to present
  });

  it('GET /attendance/pattern-alerts — RLS isolation', async () => {
    // Create alert for Tenant A
    // Query as Tenant B
    // Assert: empty result
  });
});
```

- [ ] **Step 2: Run E2E tests**

Run: `cd apps/api && npx jest --testPathPattern=attendance-default-present.e2e --no-coverage`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/
git commit -m "test(e2e): attendance default present, exceptions upload, quick-mark, undo, RLS"
```
