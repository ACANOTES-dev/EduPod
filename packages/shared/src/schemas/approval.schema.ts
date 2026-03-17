import { z } from 'zod';

export const createApprovalWorkflowSchema = z.object({
  action_type: z.enum([
    'announcement_publish',
    'invoice_issue',
    'application_accept',
    'payment_refund',
    'payroll_finalise',
  ]),
  approver_role_id: z.string().uuid(),
  is_enabled: z.boolean().default(true),
});

export type CreateApprovalWorkflowDto = z.infer<typeof createApprovalWorkflowSchema>;

export const updateApprovalWorkflowSchema = z.object({
  approver_role_id: z.string().uuid().optional(),
  is_enabled: z.boolean().optional(),
});

export type UpdateApprovalWorkflowDto = z.infer<typeof updateApprovalWorkflowSchema>;

export const approvalDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  comment: z.string().max(2000).optional(),
});

export type ApprovalDecisionDto = z.infer<typeof approvalDecisionSchema>;

export const approvalCommentSchema = z.object({
  comment: z.string().max(2000).optional(),
});

export type ApprovalCommentDto = z.infer<typeof approvalCommentSchema>;

export const approvalRequestFilterSchema = z.object({
  status: z
    .enum([
      'pending_approval',
      'approved',
      'rejected',
      'executed',
      'cancelled',
      'expired',
    ])
    .optional(),
});

export type ApprovalRequestFilterDto = z.infer<typeof approvalRequestFilterSchema>;
