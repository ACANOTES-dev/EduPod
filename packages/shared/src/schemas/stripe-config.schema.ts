import { z } from 'zod';

export const upsertStripeConfigSchema = z.object({
  stripe_secret_key: z
    .string()
    .min(1)
    .refine((val) => val.startsWith('sk_'), { message: 'Secret key must start with sk_' }),
  stripe_publishable_key: z
    .string()
    .min(1)
    .refine((val) => val.startsWith('pk_'), { message: 'Publishable key must start with pk_' }),
  stripe_webhook_secret: z
    .string()
    .min(1)
    .refine((val) => val.startsWith('whsec_'), {
      message: 'Webhook secret must start with whsec_',
    }),
});

export type UpsertStripeConfigDto = z.infer<typeof upsertStripeConfigSchema>;
