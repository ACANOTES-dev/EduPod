import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  Headers,
} from '@nestjs/common';
import type { Request } from 'express';

import { PrismaService } from '../prisma/prisma.service';

import { StripeService } from './stripe.service';

/**
 * Stripe webhook controller. NO auth guards — Stripe webhooks are
 * verified by signature, not by JWT.
 *
 * The tenant is resolved from the webhook payload metadata.
 */
@Controller('v1/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
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
      this.logger.warn('Webhook received without identifiable tenant_id');
      return { received: true, warning: 'tenant_id not found in metadata' };
    }

    return this.stripeService.handleWebhook(tenantId, rawBody, signature ?? '');
  }
}
