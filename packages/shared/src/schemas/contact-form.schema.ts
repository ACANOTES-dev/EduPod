import { z } from 'zod';

export const contactFormSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  phone: z.string().max(50).nullable().optional(),
  message: z.string().min(1).max(5000),
  _honeypot: z.string().optional(),
});

export type ContactFormDto = z.infer<typeof contactFormSchema>;

export const updateContactStatusSchema = z.object({
  status: z.enum(['reviewed', 'closed', 'spam']),
});

export type UpdateContactStatusDto = z.infer<typeof updateContactStatusSchema>;

export const listContactSubmissionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['new', 'reviewed', 'closed', 'spam']).optional(),
  include_spam: z.coerce.boolean().default(false).optional(),
});

export type ListContactSubmissionsDto = z.infer<typeof listContactSubmissionsSchema>;
