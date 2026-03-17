import { z } from 'zod';

const targetPayloadByScope = {
  school: z.object({}).strict(),
  year_group: z.object({ year_group_ids: z.array(z.string().uuid()).min(1) }),
  class: z.object({ class_ids: z.array(z.string().uuid()).min(1) }),
  household: z.object({ household_ids: z.array(z.string().uuid()).min(1) }),
  custom: z.object({ user_ids: z.array(z.string().uuid()).min(1) }),
};

export const createAnnouncementSchema = z
  .object({
    title: z.string().min(1).max(255),
    body_html: z.string().min(1),
    scope: z.enum(['school', 'year_group', 'class', 'household', 'custom']),
    target_payload: z.record(z.unknown()),
    scheduled_publish_at: z.string().datetime().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const validator = targetPayloadByScope[data.scope];
    const result = validator.safeParse(data.target_payload);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ['target_payload', ...issue.path],
        });
      }
    }
  });

export type CreateAnnouncementDto = z.infer<typeof createAnnouncementSchema>;

export const updateAnnouncementSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  body_html: z.string().min(1).optional(),
  scope: z.enum(['school', 'year_group', 'class', 'household', 'custom']).optional(),
  target_payload: z.record(z.unknown()).optional(),
  scheduled_publish_at: z.string().datetime().nullable().optional(),
});

export type UpdateAnnouncementDto = z.infer<typeof updateAnnouncementSchema>;

export const publishAnnouncementSchema = z.object({
  scheduled_publish_at: z.string().datetime().nullable().optional(),
});

export type PublishAnnouncementDto = z.infer<typeof publishAnnouncementSchema>;

export const listAnnouncementsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['draft', 'pending_approval', 'scheduled', 'published', 'archived'])
    .optional(),
  sort: z.string().default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type ListAnnouncementsDto = z.infer<typeof listAnnouncementsSchema>;
