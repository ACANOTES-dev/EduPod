import { z } from 'zod';

import { senProfessionalTypeSchema, senReferralStatusSchema } from '../enums';

export const createProfessionalInvolvementSchema = z.object({
  sen_profile_id: z.string().uuid(),
  professional_type: senProfessionalTypeSchema,
  professional_name: z.string().max(255).optional(),
  organisation: z.string().max(255).optional(),
  referral_date: z.string().date().optional(),
  assessment_date: z.string().date().optional(),
  report_received_date: z.string().date().optional(),
  recommendations: z.string().max(10000).optional(),
  status: senReferralStatusSchema.default('pending'),
  pastoral_referral_id: z.string().uuid().optional(),
  notes: z.string().max(10000).optional(),
});

export type CreateProfessionalInvolvementDto = z.infer<typeof createProfessionalInvolvementSchema>;

export const updateProfessionalInvolvementSchema = z.object({
  professional_type: senProfessionalTypeSchema.optional(),
  professional_name: z.string().max(255).nullable().optional(),
  organisation: z.string().max(255).nullable().optional(),
  referral_date: z.string().date().nullable().optional(),
  assessment_date: z.string().date().nullable().optional(),
  report_received_date: z.string().date().nullable().optional(),
  recommendations: z.string().max(10000).nullable().optional(),
  status: senReferralStatusSchema.optional(),
  pastoral_referral_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
});

export type UpdateProfessionalInvolvementDto = z.infer<typeof updateProfessionalInvolvementSchema>;

export const listProfessionalInvolvementsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sen_profile_id: z.string().uuid().optional(),
  professional_type: senProfessionalTypeSchema.optional(),
  status: senReferralStatusSchema.optional(),
});

export type ListProfessionalInvolvementsQuery = z.infer<
  typeof listProfessionalInvolvementsQuerySchema
>;
