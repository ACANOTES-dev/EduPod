import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

import type { CheckoutSessionDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { CircuitBreakerRegistry } from '../../common/services/circuit-breaker-registry';
import { EncryptionService } from '../configuration/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

import { isPayableStatus, roundMoney } from './helpers/invoice-status.helper';
import { InvoicesService } from './invoices.service';
import { ReceiptsService } from './receipts.service';

interface StripeCheckoutResult {
  session_id: string;
  checkout_url: string;
}

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly invoicesService: InvoicesService,
    private readonly receiptsService: ReceiptsService,
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerRegistry,
    private readonly tenantReadFacade: TenantReadFacade,
  ) {}

  private get webhookSecret(): string | undefined {
    return (
      this.configService.get<string>('STRIPE_WEBHOOK_SECRET') || process.env.STRIPE_WEBHOOK_SECRET
    );
  }

  /**
   * Build a Stripe SDK instance using the tenant's decrypted secret key.
   */
  private async getStripeClient(tenantId: string): Promise<Stripe> {
    // eslint-disable-next-line school/no-cross-module-prisma-access -- encrypted keys required for Stripe SDK, not exposed via facade
    const stripeConfig = await this.prisma.tenantStripeConfig.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!stripeConfig) {
      throw new BadRequestException({
        code: 'STRIPE_NOT_CONFIGURED',
        message: 'Stripe is not configured for this tenant',
      });
    }

    const secretKey = this.encryption.decrypt(
      stripeConfig.stripe_secret_key_encrypted,
      stripeConfig.encryption_key_ref,
    );

    return new Stripe(secretKey, { apiVersion: '2026-02-25.clover' });
  }

  async createCheckoutSession(
    tenantId: string,
    invoiceId: string,
    dto: CheckoutSessionDto,
  ): Promise<StripeCheckoutResult> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenant_id: tenantId },
      include: {
        household: { select: { id: true, household_name: true } },
        lines: true,
      },
    });
    if (!invoice) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: `Invoice with id "${invoiceId}" not found`,
      });
    }

    if (!isPayableStatus(invoice.status)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot create checkout for invoice with status "${invoice.status}"`,
      });
    }

    const stripe = await this.getStripeClient(tenantId);

    // Charge the outstanding balance, not the original line amounts
    const balanceAmount = roundMoney(Number(invoice.balance_amount));
    if (balanceAmount <= 0) {
      throw new BadRequestException({
        code: 'INVOICE_ALREADY_PAID',
        message: 'This invoice has no outstanding balance',
      });
    }

    const session = await this.circuitBreaker.exec('stripe', () =>
      stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: invoice.currency_code.toLowerCase(),
              unit_amount: Math.round(balanceAmount * 100),
              product_data: { name: `Invoice ${invoice.invoice_number ?? invoiceId}` },
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: dto.success_url,
        cancel_url: dto.cancel_url,
        metadata: {
          tenant_id: tenantId,
          invoice_id: invoiceId,
          household_id: invoice.household_id,
        },
      }),
    );

    return {
      session_id: session.id,
      checkout_url: session.url ?? dto.success_url,
    };
  }

  /**
   * Verify signature and process a Stripe webhook event.
   */
  async handleWebhook(
    tenantId: string,
    rawBody: Buffer,
    signature: string,
  ): Promise<{ received: boolean }> {
    // Determine webhook secret: prefer env (global), fall back to per-tenant.
    // Global secret is used when a single webhook endpoint serves all tenants.
    // Per-tenant secret is used when each tenant has its own Stripe account.
    let webhookSecret = this.webhookSecret;

    if (!webhookSecret) {
      // eslint-disable-next-line school/no-cross-module-prisma-access -- encrypted webhook secret required, not exposed via facade
      const stripeConfig = await this.prisma.tenantStripeConfig.findUnique({
        where: { tenant_id: tenantId },
      });
      if (stripeConfig) {
        try {
          webhookSecret = this.encryption.decrypt(
            stripeConfig.stripe_webhook_secret_encrypted,
            stripeConfig.encryption_key_ref,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Failed to decrypt per-tenant webhook secret for ${tenantId}: ${msg}`);
        }
      }
    }

    if (!webhookSecret) {
      throw new BadRequestException({
        code: 'WEBHOOK_SECRET_MISSING',
        message: 'Stripe webhook secret is not configured',
      });
    }

    // Verify signature (constructEvent only checks HMAC, doesn't need a real API key)
    let event: Stripe.Event;
    try {
      const stripe = new Stripe('sk_stub_for_webhook_verification', {
        apiVersion: '2026-02-25.clover',
      });
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Webhook signature verification failed: ${msg}`);
      throw new BadRequestException({
        code: 'INVALID_SIGNATURE',
        message: 'Webhook signature verification failed',
      });
    }

    // Process event (idempotency is checked inside each handler, within the transaction)
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(tenantId, event.data.object as Stripe.Checkout.Session);
        break;
      case 'payment_intent.payment_failed':
        this.logger.warn(`Payment failed: ${event.id}`);
        break;
      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }

    return { received: true };
  }

  /**
   * Handle checkout.session.completed: create a payment and auto-allocate.
   */
  private async handleCheckoutCompleted(tenantId: string, session: Stripe.Checkout.Session) {
    const invoiceId = session.metadata?.invoice_id;
    const householdId = session.metadata?.household_id;

    if (!invoiceId || !householdId) {
      this.logger.warn('checkout.session.completed missing invoice_id or household_id in metadata');
      return;
    }

    const amountTotal = session.amount_total ? roundMoney(session.amount_total / 100) : 0;
    if (amountTotal <= 0) {
      this.logger.warn(`checkout.session.completed with zero amount for session ${session.id}`);
      return;
    }

    // Store the payment_intent ID (not session ID) for refund compatibility
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? session.id);

    // Get tenant currency
    const tenant = await this.tenantReadFacade.findById(tenantId);
    if (!tenant) {
      this.logger.error(
        `checkout.session.completed: tenant ${tenantId} not found — payment will be lost`,
      );
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant ${tenantId} not found during Stripe checkout processing`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    await rlsClient.$transaction(async (tx) => {
      const prisma = tx as unknown as typeof this.prisma;

      // Idempotency check inside transaction (atomic with the insert)
      const existingPayment = await prisma.payment.findFirst({
        where: { external_event_id: paymentIntentId, tenant_id: tenantId },
      });
      if (existingPayment) {
        this.logger.log(`Duplicate Stripe payment_intent ${paymentIntentId} — already processed`);
        return;
      }

      // Create payment record
      const payment = await prisma.payment.create({
        data: {
          tenant_id: tenantId,
          household_id: householdId,
          payment_reference: `STRIPE-${session.id}`,
          payment_method: 'stripe',
          external_provider: 'stripe',
          external_event_id: paymentIntentId,
          amount: amountTotal,
          currency_code: tenant.currency_code,
          status: 'posted',
          received_at: new Date(),
        },
      });

      // Auto-allocate to the invoice
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, tenant_id: tenantId },
      });
      if (invoice && Number(invoice.balance_amount) > 0) {
        const allocAmount = roundMoney(Math.min(amountTotal, Number(invoice.balance_amount)));
        await prisma.paymentAllocation.create({
          data: {
            tenant_id: tenantId,
            payment_id: payment.id,
            invoice_id: invoiceId,
            allocated_amount: allocAmount,
          },
        });
        await this.invoicesService.recalculateBalance(tenantId, invoiceId, prisma);
      }

      // Generate receipt
      await this.receiptsService.createForPayment(tenantId, payment.id, null, 'en', tx);
    });
  }

  /**
   * Process a Stripe refund for a payment that was made via Stripe.
   */
  async processRefund(
    tenantId: string,
    paymentId: string,
    amount: number,
  ): Promise<{ refund_id: string; status: string }> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenant_id: tenantId },
    });
    if (!payment) {
      throw new NotFoundException({
        code: 'PAYMENT_NOT_FOUND',
        message: `Payment with id "${paymentId}" not found`,
      });
    }

    if (payment.payment_method !== 'stripe') {
      throw new BadRequestException({
        code: 'NOT_STRIPE_PAYMENT',
        message: 'This payment was not made via Stripe',
      });
    }

    if (!payment.external_event_id) {
      throw new InternalServerErrorException({
        code: 'MISSING_EXTERNAL_ID',
        message: 'Payment is missing Stripe session/payment intent ID',
      });
    }

    const stripe = await this.getStripeClient(tenantId);
    const paymentIntentId = payment.external_event_id;

    const refund = await this.circuitBreaker.exec('stripe', () =>
      stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: Math.round(amount * 100),
      }),
    );

    return {
      refund_id: refund.id,
      status: refund.status ?? 'succeeded',
    };
  }
}
