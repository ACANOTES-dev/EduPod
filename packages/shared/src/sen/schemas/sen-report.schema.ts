import { z } from 'zod';

export const ncseReturnQuerySchema = z.object({
  academic_year_id: z.string().uuid().optional(),
});

export type NcseReturnQuery = z.infer<typeof ncseReturnQuerySchema>;

export const senOverviewReportQuerySchema = z.object({});

export type SenOverviewReportQuery = z.infer<typeof senOverviewReportQuerySchema>;

export const planComplianceQuerySchema = z.object({
  academic_year_id: z.string().uuid().optional(),
  due_within_days: z.coerce.number().int().min(1).max(365).default(14),
  stale_goal_weeks: z.coerce.number().int().min(1).max(52).default(4),
});

export type PlanComplianceQuery = z.infer<typeof planComplianceQuerySchema>;

export const professionalInvolvementReportQuerySchema = z.object({});

export type ProfessionalInvolvementReportQuery = z.infer<
  typeof professionalInvolvementReportQuerySchema
>;
