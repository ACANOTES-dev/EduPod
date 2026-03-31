import { z } from 'zod';

import { accommodationTypeSchema } from '../enums';

export const accommodationDetailsSchema = z.record(z.string(), z.unknown());

export const createAccommodationSchema = z.object({
  sen_profile_id: z.string().uuid(),
  accommodation_type: accommodationTypeSchema,
  description: z.string().min(1).max(5000),
  details: accommodationDetailsSchema.default({}),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
  is_active: z.boolean().default(true),
});

export type CreateAccommodationDto = z.infer<typeof createAccommodationSchema>;

export const updateAccommodationSchema = z.object({
  accommodation_type: accommodationTypeSchema.optional(),
  description: z.string().min(1).max(5000).optional(),
  details: accommodationDetailsSchema.optional(),
  start_date: z.string().date().nullable().optional(),
  end_date: z.string().date().nullable().optional(),
  is_active: z.boolean().optional(),
  approved_by_user_id: z.string().uuid().nullable().optional(),
  approved_at: z.string().datetime().nullable().optional(),
});

export type UpdateAccommodationDto = z.infer<typeof updateAccommodationSchema>;

export const listAccommodationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sen_profile_id: z.string().uuid().optional(),
  accommodation_type: accommodationTypeSchema.optional(),
  is_active: z.coerce.boolean().optional(),
});

export type ListAccommodationsQuery = z.infer<typeof listAccommodationsQuerySchema>;
