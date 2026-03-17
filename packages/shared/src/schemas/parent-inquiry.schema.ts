import { z } from 'zod';

export const createInquirySchema = z.object({
  subject: z.string().min(1).max(255),
  message: z.string().min(1),
  student_id: z.string().uuid().nullable().optional(),
});

export type CreateInquiryDto = z.infer<typeof createInquirySchema>;

export const createInquiryMessageSchema = z.object({
  message: z.string().min(1),
});

export type CreateInquiryMessageDto = z.infer<typeof createInquiryMessageSchema>;

export const listInquiriesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['open', 'in_progress', 'closed']).optional(),
});

export type ListInquiriesDto = z.infer<typeof listInquiriesSchema>;
