import { z } from 'zod';

import { SAVED_AUDIENCE_KINDS } from '../constants';

import { audienceDefinitionSchema } from './audience-definition.schema';

/**
 * Two flavours of saved audience:
 *   - static   → frozen list of user_ids, stored as { user_ids: [...] }
 *   - dynamic  → an AudienceDefinition tree, re-resolved on each broadcast
 */
const staticAudienceDefinitionSchema = z.object({
  user_ids: z.array(z.string().uuid()).min(1).max(10_000),
});

export const createSavedAudienceSchema = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().max(1024).nullable().optional(),
    kind: z.enum(SAVED_AUDIENCE_KINDS),
    definition: z.union([staticAudienceDefinitionSchema, audienceDefinitionSchema]),
  })
  .superRefine((val, ctx) => {
    if (val.kind === 'static' && !('user_ids' in val.definition)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['definition'],
        message: 'static audiences require { user_ids: [...] }',
      });
    }
    if (val.kind === 'dynamic' && 'user_ids' in val.definition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['definition'],
        message: 'dynamic audiences require an audience definition tree, not a user_ids list',
      });
    }
  });

export type CreateSavedAudienceDto = z.infer<typeof createSavedAudienceSchema>;

export const updateSavedAudienceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1024).nullable().optional(),
  definition: z.union([staticAudienceDefinitionSchema, audienceDefinitionSchema]).optional(),
});

export type UpdateSavedAudienceDto = z.infer<typeof updateSavedAudienceSchema>;
