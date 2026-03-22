import { z } from 'zod';

export const createRoleSchema = z.object({
  role_key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, 'Role key must be lowercase alphanumeric with underscores'),
  display_name: z.string().min(1).max(100),
  role_tier: z.enum(['platform', 'admin', 'staff', 'parent']),
  permission_ids: z.array(z.string().uuid()),
});

export type CreateRoleDto = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  permission_ids: z.array(z.string().uuid()).optional(),
});

export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;

export const invitedRolePayloadSchema = z.object({
  role_ids: z.array(z.string().uuid()),
  parent_link: z
    .object({
      household_id: z.string().uuid().optional(),
      student_ids: z.array(z.string().uuid()).optional(),
    })
    .optional(),
});

export type InvitedRolePayloadDto = z.infer<typeof invitedRolePayloadSchema>;

export const createInvitationSchema = z.object({
  email: z.string().email().max(255),
  role_ids: z.array(z.string().uuid()).min(1),
  parent_link: z
    .object({
      household_id: z.string().uuid().optional(),
      student_ids: z.array(z.string().uuid()).optional(),
    })
    .optional(),
});

export type CreateInvitationDto = z.infer<typeof createInvitationSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  password: z.string().min(8).max(128).optional(),
  phone: z.string().max(50).optional(),
});

export type AcceptInvitationDto = z.infer<typeof acceptInvitationSchema>;

export const updateMembershipRolesSchema = z.object({
  role_ids: z.array(z.string().uuid()).min(1),
});

export type UpdateMembershipRolesDto = z.infer<typeof updateMembershipRolesSchema>;

export const assignPermissionsSchema = z.object({
  permission_ids: z.array(z.string().uuid()),
});

export type AssignPermissionsDto = z.infer<typeof assignPermissionsSchema>;

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  role_id: z.string().uuid().optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;
