import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  phone: z.string().max(50).optional(),
  preferred_locale: z.enum(['en', 'ar']).optional(),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;

export const updateUserProfileSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  phone: z.string().max(50).nullable().optional(),
  preferred_locale: z.enum(['en', 'ar']).optional(),
});

export type UpdateUserProfileDto = z.infer<typeof updateUserProfileSchema>;

export const parentRegistrationSchema = createUserSchema.extend({
  preferred_contact_channels: z.array(z.enum(['email', 'whatsapp'])).min(1),
  whatsapp_phone: z.string().max(50).optional(),
  confirm_phone_is_whatsapp: z.boolean().optional(),
});

export type ParentRegistrationDto = z.infer<typeof parentRegistrationSchema>;
