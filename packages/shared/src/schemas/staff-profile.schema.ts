import { z } from 'zod';

export const createStaffProfileSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  // `email` intentionally NOT part of the DTO. Staff login email is derived
  // from the auto-generated 6-char staff_number + tenant primary domain
  // (e.g., `abc123@nhqs.edupod.app`). See buildLoginEmail + StaffProfilesService.create.
  phone: z.string().min(1).max(50),
  role_id: z.string().uuid(),
  job_title: z.string().max(255).optional(),
  employment_status: z.enum(['active', 'inactive']),
  department: z.string().max(255).optional(),
  employment_type: z
    .enum(['full_time', 'part_time', 'contract', 'substitute'])
    .default('full_time'),
  bank_name: z.string().max(255).optional(),
  bank_account_number: z.string().max(100).optional(),
  bank_iban: z.string().max(50).optional(),
});

export type CreateStaffProfileDto = z.infer<typeof createStaffProfileSchema>;

export const updateStaffProfileSchema = z.object({
  staff_number: z.string().max(50).nullable().optional(),
  job_title: z.string().max(255).nullable().optional(),
  employment_status: z.enum(['active', 'inactive']).optional(),
  department: z.string().max(255).nullable().optional(),
  employment_type: z.enum(['full_time', 'part_time', 'contract', 'substitute']).optional(),
  bank_name: z.string().max(255).nullable().optional(),
  bank_account_number: z.string().max(100).nullable().optional(),
  bank_iban: z.string().max(50).nullable().optional(),
});

export type UpdateStaffProfileDto = z.infer<typeof updateStaffProfileSchema>;

export const staffProfileQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  employment_status: z.enum(['active', 'inactive']).optional(),
  department: z.string().optional(),
  search: z.string().optional(),
});

export type StaffProfileQueryDto = z.infer<typeof staffProfileQuerySchema>;
