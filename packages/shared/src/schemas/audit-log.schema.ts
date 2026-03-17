import { z } from 'zod';

export const auditLogFilterSchema = z.object({
  entity_type: z.string().optional(),
  actor_user_id: z.string().uuid().optional(),
  action: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AuditLogFilterDto = z.infer<typeof auditLogFilterSchema>;

export const platformAuditLogFilterSchema = auditLogFilterSchema.extend({
  tenant_id: z.string().uuid().optional(),
});

export type PlatformAuditLogFilterDto = z.infer<typeof platformAuditLogFilterSchema>;

export const engagementTrackSchema = z.object({
  event_type: z.string().min(1).max(100),
  entity_type: z.string().max(100).optional(),
  entity_id: z.string().uuid().optional(),
});

export type EngagementTrackDto = z.infer<typeof engagementTrackSchema>;
