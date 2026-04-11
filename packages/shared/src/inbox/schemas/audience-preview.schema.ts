import { z } from 'zod';

import { audienceDefinitionSchema } from './audience-definition.schema';

/**
 * POST /v1/inbox/audiences/preview — request body.
 *
 * Accepts a definition tree (composed or leaf) and returns a resolved
 * recipient count plus a small deterministic sample for the chip-builder UI.
 */
export const previewAudienceSchema = z
  .object({
    definition: audienceDefinitionSchema,
  })
  .strict();

export type PreviewAudienceDto = z.infer<typeof previewAudienceSchema>;
