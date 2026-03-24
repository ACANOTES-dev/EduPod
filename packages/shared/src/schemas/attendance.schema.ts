import { z } from 'zod';

const attendanceRecordStatusEnum = z.enum([
  'present', 'absent_unexcused', 'absent_excused', 'late', 'left_early',
]);

export const createAttendanceSessionSchema = z.object({
  class_id: z.string().uuid(),
  schedule_id: z.string().uuid().nullable().optional(),
  session_date: z.string().min(1),
  override_closure: z.boolean().optional(),
  override_reason: z.string().optional(),
  default_present: z.boolean().nullable().optional(),
});

export type CreateAttendanceSessionDto = z.infer<typeof createAttendanceSessionSchema>;

export const saveAttendanceRecordsSchema = z.object({
  records: z.array(z.object({
    student_id: z.string().uuid(),
    status: attendanceRecordStatusEnum,
    reason: z.string().nullable().optional(),
    arrival_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  })).min(1),
});

export type SaveAttendanceRecordsDto = z.infer<typeof saveAttendanceRecordsSchema>;

export const amendAttendanceRecordSchema = z.object({
  status: attendanceRecordStatusEnum,
  amendment_reason: z.string().min(1, 'Amendment reason is required'),
  arrival_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export type AmendAttendanceRecordDto = z.infer<typeof amendAttendanceRecordSchema>;

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

export const quickMarkSchema = z.object({
  session_date: z.string().min(1),
  text: z.string().min(1),
});
export type QuickMarkDto = z.infer<typeof quickMarkSchema>;

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

export const uploadUndoSchema = z.object({
  batch_id: z.string().uuid(),
});
export type UploadUndoDto = z.infer<typeof uploadUndoSchema>;

export const derivedPayloadSchema = z.object({
  sessions_total: z.number().int(),
  sessions_present: z.number().int(),
  sessions_absent: z.number().int(),
  sessions_late: z.number().int(),
  sessions_excused: z.number().int(),
  session_details: z.array(z.object({
    session_id: z.string().uuid(),
    class_id: z.string().uuid(),
    status: z.string(),
  })),
});
