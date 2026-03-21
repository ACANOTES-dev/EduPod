import { z } from 'zod';

const parentLinkSchema = z.object({
  parent_id: z.string().uuid(),
  relationship_label: z.string().max(100).optional(),
});

export const createStudentSchema = z
  .object({
    household_id: z.string().uuid(),
    first_name: z.string().min(1).max(100),
    last_name: z.string().min(1).max(100),
    first_name_ar: z.string().max(100).optional(),
    last_name_ar: z.string().max(100).optional(),
    national_id: z.string().min(1, 'National ID is required').max(50),
    date_of_birth: z.string().min(1, 'date_of_birth is required'),
    gender: z
      .enum(['male', 'female', 'other', 'prefer_not_to_say'])
      .optional(),
    status: z.enum(['applicant', 'active']),
    entry_date: z.string().optional(),
    year_group_id: z.string().uuid().optional(),
    class_homeroom_id: z.string().uuid().optional(),
    student_number: z.string().max(50).optional(),
    medical_notes: z.string().max(2000).optional(),
    has_allergy: z.boolean().optional(),
    allergy_details: z.string().max(1000).optional(),
    parent_links: z.array(parentLinkSchema).optional(),
  })
  .refine(
    (data) => {
      if (data.has_allergy === true) {
        return !!data.allergy_details && data.allergy_details.trim().length > 0;
      }
      return true;
    },
    {
      message: 'allergy_details is required when has_allergy is true',
      path: ['allergy_details'],
    },
  );

export type CreateStudentDto = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = z
  .object({
    household_id: z.string().uuid().optional(),
    first_name: z.string().min(1).max(100).optional(),
    last_name: z.string().min(1).max(100).optional(),
    first_name_ar: z.string().max(100).nullable().optional(),
    last_name_ar: z.string().max(100).nullable().optional(),
    national_id: z.string().max(50).nullable().optional(),
    date_of_birth: z.string().optional(),
    gender: z
      .enum(['male', 'female', 'other', 'prefer_not_to_say'])
      .nullable()
      .optional(),
    entry_date: z.string().nullable().optional(),
    year_group_id: z.string().uuid().nullable().optional(),
    class_homeroom_id: z.string().uuid().nullable().optional(),
    student_number: z.string().max(50).nullable().optional(),
    medical_notes: z.string().max(2000).nullable().optional(),
    has_allergy: z.boolean().optional(),
    allergy_details: z.string().max(1000).nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.has_allergy === true) {
        return !!data.allergy_details && data.allergy_details.trim().length > 0;
      }
      return true;
    },
    {
      message: 'allergy_details is required when has_allergy is true',
      path: ['allergy_details'],
    },
  );

export type UpdateStudentDto = z.infer<typeof updateStudentSchema>;

export const updateStudentStatusSchema = z
  .object({
    status: z.enum(['applicant', 'active', 'withdrawn', 'graduated', 'archived']),
    reason: z.string().max(500).optional(),
  })
  .refine(
    (data) => {
      if (data.status === 'withdrawn') {
        return !!data.reason && data.reason.trim().length > 0;
      }
      return true;
    },
    {
      message: 'reason is required when status is withdrawn',
      path: ['reason'],
    },
  );

export type UpdateStudentStatusDto = z.infer<typeof updateStudentStatusSchema>;
