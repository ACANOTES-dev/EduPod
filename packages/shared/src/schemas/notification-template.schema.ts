import { z } from 'zod';

// `.strict()` rejects unknown keys — clients cannot smuggle
// `tenant_id` or `is_system` through the controller. The service
// layer still sets `tenant_id` unconditionally from auth context;
// `.strict()` is defence-in-depth so a misconfigured client surfaces
// a 400 instead of silently dropped fields.
export const createNotificationTemplateSchema = z
  .object({
    channel: z.enum(['email', 'whatsapp', 'in_app']),
    template_key: z.string().min(1).max(100),
    locale: z.string().min(1).max(10),
    subject_template: z.string().nullable().optional(),
    body_template: z.string().min(1),
  })
  .strict();

export type CreateNotificationTemplateDto = z.infer<typeof createNotificationTemplateSchema>;

export const updateNotificationTemplateSchema = z
  .object({
    subject_template: z.string().nullable().optional(),
    body_template: z.string().min(1).optional(),
  })
  .strict()
  .refine((data) => data.subject_template !== undefined || data.body_template !== undefined, {
    message: 'At least one of subject_template or body_template must be provided',
  });

export type UpdateNotificationTemplateDto = z.infer<typeof updateNotificationTemplateSchema>;

export const listNotificationTemplatesSchema = z.object({
  template_key: z.string().optional(),
  channel: z.enum(['email', 'whatsapp', 'in_app']).optional(),
  locale: z.string().optional(),
});

export type ListNotificationTemplatesDto = z.infer<typeof listNotificationTemplatesSchema>;
