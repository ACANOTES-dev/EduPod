import {
  createProfessionalInvolvementSchema,
  type CreateProfessionalInvolvementDto,
} from '@school/shared/sen';

export const createProfessionalInvolvementBodySchema = createProfessionalInvolvementSchema.omit({
  sen_profile_id: true,
});

export type CreateProfessionalInvolvementBody = Omit<
  CreateProfessionalInvolvementDto,
  'sen_profile_id'
>;

export { createProfessionalInvolvementSchema };
export type { CreateProfessionalInvolvementDto };
