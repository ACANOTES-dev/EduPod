import { z } from 'zod';

export const listNotificationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['queued', 'sent', 'delivered', 'failed', 'read']).optional(),
  unread_only: z.coerce.boolean().optional(),
});

export type ListNotificationsDto = z.infer<typeof listNotificationsSchema>;
