import { z } from 'zod';

export const cacheFlushSchema = z.object({
  tenant_id: z.string().uuid().optional(),
  cache_type: z.enum(['permissions', 'domains', 'modules', 'all']),
});

export type CacheFlushDto = z.infer<typeof cacheFlushSchema>;

export const maintenanceToggleSchema = z.object({
  enabled: z.boolean(),
  message: z.string().trim().max(500).optional(),
});

export type MaintenanceToggleDto = z.infer<typeof maintenanceToggleSchema>;

export const listMaintenanceWindowsQuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
});

export type ListMaintenanceWindowsQuery = z.infer<typeof listMaintenanceWindowsQuerySchema>;

export const createMaintenanceWindowSchema = z
  .object({
    tenant_id: z.string().uuid(),
    starts_at: z.coerce.date(),
    ends_at: z.coerce.date(),
    message: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.ends_at > data.starts_at, {
    message: 'ends_at must be after starts_at',
    path: ['ends_at'],
  });

export type CreateMaintenanceWindowDto = z.infer<typeof createMaintenanceWindowSchema>;
