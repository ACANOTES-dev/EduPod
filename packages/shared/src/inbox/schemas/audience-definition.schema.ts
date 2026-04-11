import { z } from 'zod';

import { AUDIENCE_PROVIDER_KEYS } from '../audience.types';

/**
 * Zod schema for the composed audience definition tree.
 *
 * Mirrors `AudienceDefinition` in `../audience.types.ts`. Using `z.lazy` to
 * support recursive shape (operators contain nested definitions).
 */

const audienceLeafSchema = z.object({
  provider: z.enum(AUDIENCE_PROVIDER_KEYS),
  params: z.record(z.unknown()).optional(),
});

type AudienceDefinitionInput =
  | z.infer<typeof audienceLeafSchema>
  | { operator: 'and'; operands: AudienceDefinitionInput[] }
  | { operator: 'or'; operands: AudienceDefinitionInput[] }
  | { operator: 'not'; operand: AudienceDefinitionInput };

export const audienceDefinitionSchema: z.ZodType<AudienceDefinitionInput> = z.lazy(() =>
  z.union([
    audienceLeafSchema,
    z.object({
      operator: z.literal('and'),
      operands: z.array(audienceDefinitionSchema).min(2),
    }),
    z.object({
      operator: z.literal('or'),
      operands: z.array(audienceDefinitionSchema).min(2),
    }),
    z.object({
      operator: z.literal('not'),
      operand: audienceDefinitionSchema,
    }),
  ]),
);

export type AudienceDefinitionDto = z.infer<typeof audienceDefinitionSchema>;
