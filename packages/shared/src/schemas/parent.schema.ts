import { z } from 'zod';

export const createParentSchema = z
  .object({
    first_name: z.string().min(1).max(100),
    last_name: z.string().min(1).max(100),
    email: z.string().email().max(255).optional(),
    phone: z.string().max(50).optional(),
    whatsapp_phone: z.string().max(50).optional(),
    preferred_contact_channels: z
      .array(z.enum(['email', 'whatsapp']))
      .min(1, 'At least one contact channel is required')
      .max(2),
    relationship_label: z.string().max(100).optional(),
    is_primary_contact: z.boolean().optional(),
    is_billing_contact: z.boolean().optional(),
    household_id: z.string().uuid().optional(),
    role_label: z.string().max(100).optional(),
  })
  .refine(
    (data) => {
      if (data.preferred_contact_channels.includes('whatsapp')) {
        return !!data.whatsapp_phone;
      }
      return true;
    },
    {
      message: 'whatsapp_phone is required when whatsapp is a preferred contact channel',
      path: ['whatsapp_phone'],
    },
  );

export type CreateParentDto = z.infer<typeof createParentSchema>;

export const updateParentSchema = z
  .object({
    first_name: z.string().min(1).max(100).optional(),
    last_name: z.string().min(1).max(100).optional(),
    email: z.string().email().max(255).nullable().optional(),
    phone: z.string().max(50).nullable().optional(),
    whatsapp_phone: z.string().max(50).nullable().optional(),
    preferred_contact_channels: z
      .array(z.enum(['email', 'whatsapp']))
      .min(1)
      .max(2)
      .optional(),
    relationship_label: z.string().max(100).nullable().optional(),
    is_primary_contact: z.boolean().optional(),
    is_billing_contact: z.boolean().optional(),
    role_label: z.string().max(100).nullable().optional(),
  })
  .refine(
    (data) => {
      if (
        data.preferred_contact_channels &&
        data.preferred_contact_channels.includes('whatsapp')
      ) {
        return !!data.whatsapp_phone;
      }
      return true;
    },
    {
      message: 'whatsapp_phone is required when whatsapp is a preferred contact channel',
      path: ['whatsapp_phone'],
    },
  );

export type UpdateParentDto = z.infer<typeof updateParentSchema>;
