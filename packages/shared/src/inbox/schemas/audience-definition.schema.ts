import { z } from 'zod';

import { AUDIENCE_PROVIDER_KEYS } from '../audience.types';

/**
 * Zod schema for the composed audience definition tree.
 *
 * Mirrors `AudienceDefinition` in `../audience.types.ts`. Uses `z.lazy` to
 * support recursive shape (operators contain nested definitions). The
 * top-level `audienceDefinitionSchema` is extended with a max-depth check
 * to prevent pathological trees from reaching the composer.
 *
 * Per-provider parameter validation is deliberately NOT applied here — it
 * runs on the backend in `AudienceProviderRegistry.get(key).paramsSchema`
 * when the composer walks a leaf. That keeps the shared schema decoupled
 * from the provider registry while still rejecting trivially malformed
 * trees (e.g. `provider` missing, `operands` single-child, unknown key).
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

/**
 * Internal recursive schema — allows unbounded depth at parse time. The
 * depth guard is applied as a superRefine on the exported wrapper so the
 * error message points at the root and callers see a single structured
 * failure rather than a cascade of nested issues.
 */
const audienceDefinitionInnerSchema: z.ZodType<AudienceDefinitionInput> = z.lazy(() =>
  z.union([
    audienceLeafSchema,
    z.object({
      operator: z.literal('and'),
      operands: z.array(audienceDefinitionInnerSchema).min(2),
    }),
    z.object({
      operator: z.literal('or'),
      operands: z.array(audienceDefinitionInnerSchema).min(2),
    }),
    z.object({
      operator: z.literal('not'),
      operand: audienceDefinitionInnerSchema,
    }),
  ]),
);

/** Maximum nesting depth for an audience definition tree. */
export const AUDIENCE_DEFINITION_MAX_DEPTH = 5;

function measureDepth(def: AudienceDefinitionInput): number {
  if ('provider' in def) return 1;
  if (def.operator === 'not') return 1 + measureDepth(def.operand);
  return 1 + Math.max(...def.operands.map(measureDepth));
}

export const audienceDefinitionSchema: z.ZodType<AudienceDefinitionInput> =
  audienceDefinitionInnerSchema.superRefine((val, ctx) => {
    const depth = measureDepth(val);
    if (depth > AUDIENCE_DEFINITION_MAX_DEPTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: `AUDIENCE_DEFINITION_TOO_DEEP: depth ${depth} exceeds limit ${AUDIENCE_DEFINITION_MAX_DEPTH}`,
      });
    }
  });

export type AudienceDefinitionDto = z.infer<typeof audienceDefinitionSchema>;
