import { z } from 'zod';

const parentSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().max(255).optional(),
  phone: z.string().min(1).max(50),
  relationship_label: z.string().min(1).max(100),
});

const optionalParentSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(50).optional(),
  relationship_label: z.string().min(1).max(100),
});

const emergencyContactSchema = z.object({
  contact_name: z.string().min(1).max(200),
  phone: z.string().min(1).max(50),
  relationship_label: z.string().min(1).max(100),
});

const studentSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  date_of_birth: z.string().min(1),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']),
  year_group_id: z.string().uuid(),
  national_id: z.string().min(1).max(50),
});

const feeAssignmentSchema = z.object({
  student_index: z.number().int().min(0),
  fee_structure_id: z.string().uuid(),
});

const appliedDiscountSchema = z.object({
  discount_id: z.string().uuid(),
  fee_assignment_index: z.number().int().min(0),
});

const adhocAdjustmentSchema = z.object({
  label: z.string().min(1).max(255),
  amount: z.number().positive(),
});

export const familyRegistrationSchema = z.object({
  primary_parent: parentSchema,
  secondary_parent: optionalParentSchema.optional(),
  household: z.object({
    household_name: z.string().min(1).max(255),
    address_line_1: z.string().max(255).optional(),
    address_line_2: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    postal_code: z.string().max(30).optional(),
  }),
  emergency_contacts: z.array(emergencyContactSchema).min(1).max(3),
  students: z.array(studentSchema).min(1),
  fee_assignments: z.array(feeAssignmentSchema),
  applied_discounts: z.array(appliedDiscountSchema).default([]),
  adhoc_adjustments: z.array(adhocAdjustmentSchema).default([]),
});

export type FamilyRegistrationDto = z.infer<typeof familyRegistrationSchema>;

export const previewFeesSchema = z.object({
  students: z.array(z.object({
    year_group_id: z.string().uuid(),
  })).min(1),
});

export type PreviewFeesDto = z.infer<typeof previewFeesSchema>;
