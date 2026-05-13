import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';

import { apiError } from '../../common/errors/api-error';
import { TenantModuleService } from '../../common/services/tenant-module.service';

import { StripeService } from './stripe.service';

/**
 * Stripe webhook controller. NO auth guards — Stripe webhooks are verified
 * by signature, not by JWT.
 *
 * The tenant is resolved from the webhook payload metadata.
 *
 * EXTERNAL WEBHOOK: intentionally ungated at the decorator level. Module check
 * happens INLINE (DZ-MG-3). Stripe must always receive 200 for valid webhooks;
 * disabled tenants result in a silent drop after signature verification.
 */
@SkipThrottle()
@Controller('v1/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly tenantModuleService: TenantModuleService,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    // Use rawBody for signature verification (requires { rawBody: true } in NestFactory)
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body));

    // Extract tenant_id from the webhook payload metadata
    let tenantId: string | undefined;
    try {
      const parsed = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const metadata = parsed?.data?.object?.metadata;
      if (metadata?.tenant_id) {
        tenantId = metadata.tenant_id as string;
      }
    } catch {
      this.logger.warn('Could not parse webhook body for tenant_id');
    }

    if (!tenantId) {
      this.logger.error(
        'Stripe webhook received without tenant_id in metadata — returning 400 for Stripe retry',
      );
      throw new BadRequestException(
        apiError('MISSING_TENANT_ID', 'Webhook event missing tenant_id in metadata'),
      );
    }

    const event = await this.stripeService.verifyWebhookEvent(tenantId, rawBody, signature ?? '');
    const enabled = await this.tenantModuleService.isEnabled(tenantId, 'finance');
    if (!enabled) {
      this.logger.log(
        `Dropping Stripe ${event.type} for tenant ${tenantId}: finance module disabled`,
      );
      return { received: true, skipped: 'module_disabled' };
    }

    return this.stripeService.processWebhookEvent(tenantId, event);
  }
}
