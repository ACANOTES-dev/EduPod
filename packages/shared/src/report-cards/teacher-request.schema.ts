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

// ─── Approve request ────────────────────────────────────────────────────────
// Principal approves a pending request. When auto_execute is true the approval
// also triggers the downstream side-effect (open window / start generation run).
// Otherwise the approval just flips the status and the frontend routes the
// principal into the wizard/modal with pre-filled parameters.

export const approveTeacherRequestSchema = z
  .object({
    review_note: z.string().max(2000).optional(),
    auto_execute: z.boolean().optional().default(false),
  })
  .strict();

export type ApproveTeacherRequestDto = z.infer<typeof approveTeacherRequestSchema>;

// ─── Reject request ─────────────────────────────────────────────────────────
// Principal rejects a pending request. A review note is required so the
// teacher understands why.

export const rejectTeacherRequestSchema = z
  .object({
    review_note: z.string().min(1).max(2000),
  })
  .strict();

export type RejectTeacherRequestDto = z.infer<typeof rejectTeacherRequestSchema>;

// ─── List query ─────────────────────────────────────────────────────────────
// Supports filtering by status and scoping to the caller via `my=true` flag.
// The caller's own user id is injected server-side from the JWT; the `my`
// flag only tells the service whether to apply that filter.

export const listTeacherRequestsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: teacherRequestStatusSchema.optional(),
    request_type: teacherRequestTypeSchema.optional(),
    my: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .strict();

export type ListTeacherRequestsQuery = z.infer<typeof listTeacherRequestsQuerySchema>;

// ─── Cancel request ─────────────────────────────────────────────────────────
// Author can cancel their own pending request.

export const cancelTeacherRequestSchema = z.object({}).strict();

export type CancelTeacherRequestDto = z.infer<typeof cancelTeacherRequestSchema>;
