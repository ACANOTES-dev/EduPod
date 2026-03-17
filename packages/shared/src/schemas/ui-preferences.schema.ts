import { z } from 'zod';

const MAX_UI_PREFERENCES_KEYS = 50;

export const updateUiPreferencesSchema = z
  .record(z.string(), z.unknown())
  .refine((val) => Object.keys(val).length <= MAX_UI_PREFERENCES_KEYS, {
    message: `UI preferences cannot exceed ${MAX_UI_PREFERENCES_KEYS} keys`,
  });

export type UpdateUiPreferencesDto = z.infer<typeof updateUiPreferencesSchema>;
