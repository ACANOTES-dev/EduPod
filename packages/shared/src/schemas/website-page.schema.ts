import { z } from 'zod';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createWebsitePageSchema = z.object({
  locale: z.string().max(10).default('en'),
  page_type: z.enum(['home', 'about', 'admissions', 'contact', 'custom']),
  slug: z
    .string()
    .min(1)
    .max(150)
    .regex(slugRegex, 'Slug must be lowercase alphanumeric with dashes'),
  title: z.string().min(1).max(255),
  meta_title: z.string().max(255).nullable().optional(),
  meta_description: z.string().nullable().optional(),
  body_html: z.string().min(1),
  show_in_nav: z.boolean().default(false),
  nav_order: z.number().int().default(0),
});

export type CreateWebsitePageDto = z.infer<typeof createWebsitePageSchema>;

export const updateWebsitePageSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  slug: z
    .string()
    .min(1)
    .max(150)
    .regex(slugRegex, 'Slug must be lowercase alphanumeric with dashes')
    .optional(),
  meta_title: z.string().max(255).nullable().optional(),
  meta_description: z.string().nullable().optional(),
  body_html: z.string().min(1).optional(),
  show_in_nav: z.boolean().optional(),
  nav_order: z.number().int().optional(),
});

export type UpdateWebsitePageDto = z.infer<typeof updateWebsitePageSchema>;

export const listWebsitePagesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['draft', 'published', 'unpublished']).optional(),
  locale: z.string().default('en').optional(),
  page_type: z.enum(['home', 'about', 'admissions', 'contact', 'custom']).optional(),
});

export type ListWebsitePagesDto = z.infer<typeof listWebsitePagesSchema>;
