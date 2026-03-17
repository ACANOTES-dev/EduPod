import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const replaceAvailabilitySchema = z.object({
  entries: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    available_from: z.string().regex(timeRegex, 'Must be HH:mm format'),
    available_to: z.string().regex(timeRegex, 'Must be HH:mm format'),
  })).max(7),
}).refine(
  (d) => {
    const weekdays = d.entries.map((e) => e.weekday);
    return new Set(weekdays).size === weekdays.length;
  },
  { message: 'Duplicate weekdays not allowed' },
);

export type ReplaceAvailabilityDto = z.infer<typeof replaceAvailabilitySchema>;
