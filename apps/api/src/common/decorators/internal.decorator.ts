import { SetMetadata } from '@nestjs/common';

/**
 * Marks a service as module-internal. Services decorated with @Internal()
 * should NOT be imported or injected by other NestJS modules.
 *
 * Enforcement: `scripts/check-internal-violations.ts` scans the codebase for
 * cross-module imports of @Internal()-decorated files and reports violations.
 *
 * Usage:
 *   @Internal()
 *   @Injectable()
 *   export class MyInternalHelper { ... }
 */
export const INTERNAL_KEY = 'IS_INTERNAL_SERVICE';
export const Internal = () => SetMetadata(INTERNAL_KEY, true);
