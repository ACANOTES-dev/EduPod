import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';

import { ShareableLinksService } from './shareable-links.service';
import type { PublicShareResponse } from './shareable-links.types';

/**
 * Public open route — no auth guard, no permission guard, no tenant
 * decorator. The service does its own validation: tenant boundary,
 * expiry, revoke, password check, and PII scrubbing. See
 * {@link ShareableLinksService.resolveByToken} for the security
 * invariants.
 *
 * This is the ONLY unauthenticated endpoint introduced by the
 * budgeting rebuild. The token is a UUID (≈ 122 bits of entropy) so
 * brute-forcing is infeasible, but rate-limiting on this route is a
 * v1.5 follow-up (see implementations/11-shareable-links.md §12).
 */
@Controller('v1/budgeting/share')
// PUBLIC: intentionally ungated. Shareable link viewers reach this without an authenticated session via short-lived tokens embedded in the link. Disabling 'budgeting' hides the admin/management UI but does NOT invalidate already-issued share links.
export class ShareableLinksPublicController {
  constructor(private readonly service: ShareableLinksService) {}

  // GET /v1/budgeting/share/:token  (?password=...)
  @Get(':token')
  async resolve(
    @Param('token') token: string,
    @Query('password') password?: string,
  ): Promise<PublicShareResponse> {
    if (!token) {
      throw new NotFoundException({
        code: 'SHARE_LINK_INVALID',
        message: 'Invalid link.',
      });
    }
    return this.service.resolveByToken(token, password);
  }
}
