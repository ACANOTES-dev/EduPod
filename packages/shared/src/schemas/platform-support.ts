import { z } from 'zod';

import { paginationQuerySchema } from './pagination.schema';

export const platformSupportActionTypeSchema = z.enum([
  'password_reset',
  'mfa_reset',
  'resend_invite',
  'unlock_account',
  'transfer_ownership',
  'disable_user',
  'enable_user',
]);

export type PlatformSupportActionType = z.infer<typeof platformSupportActionTypeSchema>;

export const transferOwnershipSchema = z.object({
  new_owner_user_id: z.string().uuid(),
});

export type TransferOwnershipDto = z.infer<typeof transferOwnershipSchema>;

export const listAuditActionsQuerySchema = paginationQuerySchema.extend({
  action_type: platformSupportActionTypeSchema.optional(),
  actor_id: z.string().uuid().optional(),
  target_user_id: z.string().uuid().optional(),
  target_tenant_id: z.string().uuid().optional(),
});

export type ListAuditActionsQuery = z.infer<typeof listAuditActionsQuerySchema>;

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(255).optional(),
  global_status: z.enum(['active', 'suspended', 'disabled']).optional(),
  tenant_id: z.string().uuid().optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
