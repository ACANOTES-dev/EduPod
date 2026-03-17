import { z } from 'zod';

export const createDomainSchema = z.object({
  domain: z
    .string()
    .min(1)
    .max(255)
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/,
      'Domain must be a valid hostname',
    ),
  domain_type: z.enum(['app', 'public_site']),
  is_primary: z.boolean().optional().default(false),
});

export type CreateDomainDto = z.infer<typeof createDomainSchema>;
