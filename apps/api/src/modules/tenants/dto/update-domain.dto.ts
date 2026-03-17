import { z } from 'zod';

export const updateDomainSchema = z.object({
  domain_type: z.enum(['app', 'public_site']).optional(),
  is_primary: z.boolean().optional(),
  verification_status: z.enum(['pending', 'verified', 'failed']).optional(),
  ssl_status: z.enum(['pending', 'active', 'failed']).optional(),
});

export type UpdateDomainDto = z.infer<typeof updateDomainSchema>;
