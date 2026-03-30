import type { z } from 'zod';

import type {
  bulkMarkCompletionSchema,
  completionStatusSchema,
  createDiaryNoteSchema,
  createHomeworkSchema,
  createParentNoteSchema,
  homeworkSettingsSchema,
  homeworkStatusSchema,
  homeworkTypeSchema,
  listHomeworkSchema,
  markCompletionSchema,
  recurrenceFrequencySchema,
  updateHomeworkSchema,
} from '../schemas/homework.schema';

export type HomeworkType = z.infer<typeof homeworkTypeSchema>;
export type HomeworkStatus = z.infer<typeof homeworkStatusSchema>;
export type CompletionStatus = z.infer<typeof completionStatusSchema>;
export type RecurrenceFrequency = z.infer<typeof recurrenceFrequencySchema>;

export type CreateHomeworkDto = z.infer<typeof createHomeworkSchema>;
export type UpdateHomeworkDto = z.infer<typeof updateHomeworkSchema>;
export type ListHomeworkQuery = z.infer<typeof listHomeworkSchema>;
export type MarkCompletionDto = z.infer<typeof markCompletionSchema>;
export type BulkMarkCompletionDto = z.infer<typeof bulkMarkCompletionSchema>;
export type CreateDiaryNoteDto = z.infer<typeof createDiaryNoteSchema>;
export type CreateParentNoteDto = z.infer<typeof createParentNoteSchema>;
export type HomeworkSettingsDto = z.infer<typeof homeworkSettingsSchema>;
