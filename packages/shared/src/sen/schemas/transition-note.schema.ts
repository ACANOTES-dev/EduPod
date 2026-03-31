import { z } from 'zod';

export const createTransitionNoteSchema = z.object({
  sen_profile_id: z.string().uuid(),
  note_type: z.string().min(1).max(100),
  content: z.string().min(1).max(10000),
});

export type CreateTransitionNoteDto = z.infer<typeof createTransitionNoteSchema>;

export const updateTransitionNoteSchema = z.object({
  note_type: z.string().min(1).max(100).optional(),
  content: z.string().min(1).max(10000).optional(),
});

export type UpdateTransitionNoteDto = z.infer<typeof updateTransitionNoteSchema>;

export const listTransitionNotesQuerySchema = z.object({
  sen_profile_id: z.string().uuid(),
  note_type: z.string().max(100).optional(),
});

export type ListTransitionNotesQuery = z.infer<typeof listTransitionNotesQuerySchema>;
