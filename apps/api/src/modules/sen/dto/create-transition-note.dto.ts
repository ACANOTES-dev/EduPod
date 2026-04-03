import { createTransitionNoteSchema, type CreateTransitionNoteDto } from '@school/shared/sen';

export const createTransitionNoteBodySchema = createTransitionNoteSchema.omit({
  sen_profile_id: true,
});

export type CreateTransitionNoteBody = Omit<CreateTransitionNoteDto, 'sen_profile_id'>;

export { createTransitionNoteSchema };
export type { CreateTransitionNoteDto };
