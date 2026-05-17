import { z } from 'zod';

export const alertRouteDestinationSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  if (Object.keys(value).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Destination must include at least one channel-specific field',
    });
  }
});

export const alertEscalationStepStoredSchema = z.object({
  route_id: z.string().uuid(),
  ack_window_minutes: z.coerce.number().int().min(1).max(1440),
});

export const alertEscalationStepsStoredSchema = z.array(alertEscalationStepStoredSchema).min(1);

export type AlertEscalationStepStored = z.infer<typeof alertEscalationStepStoredSchema>;

export type RouteDispatchPurpose = 'operator' | 'health_check';
