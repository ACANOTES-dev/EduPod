import { z } from 'zod';

export const emergencyContactSchema = z.object({
  contact_name: z.string().min(1).max(255),
  phone: z.string().min(1).max(50),
  relationship_label: z.string().max(100).optional(),
  display_order: z.number().int().min(1).max(3),
});

export type EmergencyContactDto = z.infer<typeof emergencyContactSchema>;

export const createHouseholdSchema = z.object({
  household_name: z.string().min(1).max(255),
  address_line1: z.string().max(255).optional(),
  address_line2: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  postal_code: z.string().max(30).optional(),
  country: z.string().max(100).optional(),
  emergency_contacts: z
    .array(emergencyContactSchema)
    .min(1, 'At least one emergency contact is required')
    .max(3, 'A maximum of 3 emergency contacts are allowed'),
});

export type CreateHouseholdDto = z.infer<typeof createHouseholdSchema>;

export const updateHouseholdSchema = z.object({
  household_name: z.string().min(1).max(255).optional(),
  address_line1: z.string().max(255).nullable().optional(),
  address_line2: z.string().max(255).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  postal_code: z.string().max(30).nullable().optional(),
  country: z.string().max(100).nullable().optional(),
});

export type UpdateHouseholdDto = z.infer<typeof updateHouseholdSchema>;

export const mergeHouseholdSchema = z.object({
  source_household_id: z.string().uuid(),
  target_household_id: z.string().uuid(),
});

export type MergeHouseholdDto = z.infer<typeof mergeHouseholdSchema>;

export const splitHouseholdSchema = z.object({
  source_household_id: z.string().uuid(),
  new_household_name: z.string().min(1).max(255),
  student_ids: z.array(z.string().uuid()),
  parent_ids: z.array(z.string().uuid()),
  emergency_contacts: z
    .array(emergencyContactSchema)
    .min(1, 'At least one emergency contact is required'),
});

export type SplitHouseholdDto = z.infer<typeof splitHouseholdSchema>;
