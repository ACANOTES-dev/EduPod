import { createAccommodationSchema, type CreateAccommodationDto } from '@school/shared/sen';

export const createAccommodationBodySchema = createAccommodationSchema.omit({
  sen_profile_id: true,
});

export type CreateAccommodationBody = Omit<CreateAccommodationDto, 'sen_profile_id'>;

export { createAccommodationSchema };
export type { CreateAccommodationDto };
