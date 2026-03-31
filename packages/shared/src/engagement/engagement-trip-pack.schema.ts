import { z } from 'zod';

// ─── Mark Attendance ─────────────────────────────────────────────────────────

export const eventMarkAttendanceSchema = z.object({
  student_id: z.string().uuid(),
  present: z.boolean(),
});

export type EventMarkAttendanceDto = z.infer<typeof eventMarkAttendanceSchema>;

// ─── Headcount ───────────────────────────────────────────────────────────────

export const headcountSchema = z.object({
  count_present: z.number().int().min(0),
});

export type HeadcountDto = z.infer<typeof headcountSchema>;

// ─── Incident Report ─────────────────────────────────────────────────────────

export const createIncidentReportSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1),
});

export type CreateIncidentReportDto = z.infer<typeof createIncidentReportSchema>;
