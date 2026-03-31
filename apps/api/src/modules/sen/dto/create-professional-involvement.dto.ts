import { createProfessionalInvolvementSchema } from '@school/shared';
import type { CreateProfessionalInvolvementDto } from '@school/shared';

export const createProfessionalInvolvementBodySchema = createProfessionalInvolvementSchema.omit({
  sen_profile_id: true,
});

export type CreateProfessionalInvolvementBody = Omit<
  CreateProfessionalInvolvementDto,
  'sen_profile_id'
>;

export { createProfessionalInvolvementSchema };
export type { CreateProfessionalInvolvementDto };
