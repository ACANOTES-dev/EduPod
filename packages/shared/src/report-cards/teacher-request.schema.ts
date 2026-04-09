import { z } from 'zod';

// ─── Enums ──────────────────────────────────────────────────────────────────

export const TEACHER_REQUEST_TYPES = ['open_comment_window', 'regenerate_reports'] as const;
export const teacherRequestTypeSchema = z.enum(TEACHER_REQUEST_TYPES);
export type TeacherRequestType = z.infer<typeof teacherRequestTypeSchema>;

export const TEACHER_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'completed',
  'cancelled',
] as const;
export const teacherRequestStatusSchema = z.enum(TEACHER_REQUEST_STATUSES);
export type TeacherRequestStatus = z.infer<typeof teacherRequestStatusSchema>;

// ─── target_scope_json shape ────────────────────────────────────────────────
// Only used by `regenerate_reports` requests. The shape is:
//   { scope: 'student' | 'class' | 'year_group', ids: string[] }

export const TEACHER_REQUEST_SCOPES = ['student', 'class', 'year_group'] as const;

export const teacherRequestScopeSchema = z.object({
  scope: z.enum(TEACHER_REQUEST_SCOPES),
  ids: z.array(z.string().uuid()).min(1).max(500),
});

export type TeacherRequestScope = z.infer<typeof teacherRequestScopeSchema>;

// ─── Submit request ─────────────────────────────────────────────────────────
// Cross-field rule:
//   - regenerate_reports: target_scope_json is REQUIRED
//   - open_comment_window: target_scope_json MUST be null/absent

export const submitTeacherRequestSchema = z
  .object({
    request_type: teacherRequestTypeSchema,
    academic_period_id: z.string().uuid(),
    target_scope_json: teacherRequestScopeSchema.nullable().optional(),
    reason: z.string().min(1).max(2000),
  })
  .superRefine((data, ctx) => {
    if (data.request_type === 'regenerate_reports') {
      if (!data.target_scope_json) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'target_scope_json is required when request_type is regenerate_reports',
          path: ['target_scope_json'],
        });
      }
    } else if (data.request_type === 'open_comment_window') {
      if (data.target_scope_json !== null && data.target_scope_json !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'target_scope_json must be null when request_type is open_comment_window',
          path: ['target_scope_json'],
        });
      }
    }
  });

export type SubmitTeacherRequestDto = z.infer<typeof submitTeacherRequestSchema>;

// ─── Review request ─────────────────────────────────────────────────────────
// Principal approve/reject. `decision` controls the next status; `review_note`
// is optional.

export const reviewTeacherRequestSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  review_note: z.string().max(2000).optional(),
});

export type ReviewTeacherRequestDto = z.infer<typeof reviewTeacherRequestSchema>;

// ─── Cancel request ─────────────────────────────────────────────────────────
// Author can cancel their own pending request.

export const cancelTeacherRequestSchema = z.object({}).strict();

export type CancelTeacherRequestDto = z.infer<typeof cancelTeacherRequestSchema>;
