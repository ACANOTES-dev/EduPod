import {
  BadRequestException,
  forwardRef,
  Inject,
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
import { AdmissionsFinanceBridgeService } from '../admissions/admissions-finance-bridge.service';
import { ApplicationConversionService } from '../admissions/application-conversion.service';
import { ApplicationStateMachineService } from '../admissions/application-state-machine.service';
import { EncryptionService } from '../configuration/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

import { isPayableStatus, roundMoney } from './helpers/invoice-status.helper';
import { InvoicesService } from './invoices.service';
import { ReceiptsService } from './receipts.service';

interface StripeCheckoutResult {
  session_id: string;
  checkout_url: string;
}

export interface AdmissionsCheckoutResult {
  session_id: string;
  checkout_url: string;
  amount_cents: number;
  currency_code: string;
  expires_at: Date;
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
    @Inject(forwardRef(() => ApplicationConversionService))
    private readonly applicationConversionService: ApplicationConversionService,
    @Inject(forwardRef(() => ApplicationStateMachineService))
    private readonly applicationStateMachineService: ApplicationStateMachineService,
    @Inject(forwardRef(() => AdmissionsFinanceBridgeService))
    private readonly admissionsFinanceBridge: AdmissionsFinanceBridgeService,
    private readonly sequenceService: SequenceService,
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
      const stripeConfig = await createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(
        async (tx) =>
          (tx as unknown as PrismaService).tenantStripeConfig.findUnique({
            where: { tenant_id: tenantId },
          }),
      );
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
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const purpose = session.metadata?.purpose;
        if (purpose === 'admissions') {
          await this.handleAdmissionsCheckoutCompleted(tenantId, event.id, session);
        } else {
          await this.handleCheckoutCompleted(tenantId, session);
        }
        break;
      }
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.purpose === 'admissions') {
          // Nothing to do — the admissions payment-expiry cron (Impl 08)
          // owns the state revert when the deadline passes.
          this.logger.log(
            `Admissions checkout session expired: ${session.id} — cron will handle revert`,
          );
        }
        break;
      }
      case 'payment_intent.payment_failed':
        this.logger.warn(`Payment failed: ${event.id}`);
        break;
      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }

    return { received: true };
  }

  /**
   * Create a Stripe Checkout Session for an application that has just entered
   * `conditional_approval`. The amount, currency, and expiry are all derived
   * server-side from the application row — the parent cannot alter any of
   * them. Called from the worker's `admissions-payment-link` processor (first
   * send) and from the admin-facing regenerate endpoint.
   */
  async createAdmissionsCheckoutSession(
    tenantId: string,
    applicationId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<AdmissionsCheckoutResult> {
    // eslint-disable-next-line school/no-cross-module-prisma-access -- webhook/checkout handler lives in finance for historical reasons; reads its own stripe_checkout_session_id column
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, tenant_id: tenantId },
    });
    if (!application) {
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: `Application with id "${applicationId}" not found`,
      });
    }
    if (application.status !== 'conditional_approval') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot create checkout for application with status "${application.status}"`,
      });
    }
    if (!application.payment_amount_cents || application.payment_amount_cents <= 0) {
      throw new BadRequestException({
        code: 'NO_PAYMENT_AMOUNT',
        message: 'Application has no payment amount set',
      });
    }
    if (!application.payment_deadline) {
      throw new BadRequestException({
        code: 'NO_PAYMENT_DEADLINE',
        message: 'Application has no payment deadline set',
      });
    }

    const stripe = await this.getStripeClient(tenantId);
    const amountCents = application.payment_amount_cents;
    const currencyCode = application.currency_code ?? 'EUR';
    const deadline = application.payment_deadline;

    // Stripe limits expires_at to 24 hours from creation. Cap to 23h to
    // stay safely under the limit; our internal payment-expiry cron handles
    // the longer deadline independently.
    const maxStripeExpiry = Math.floor((Date.now() + 23 * 60 * 60 * 1000) / 1000);
    const expiresAt = Math.min(Math.floor(deadline.getTime() / 1000), maxStripeExpiry);

    const productName = `Admission fee — application ${application.application_number}`;
    const productDescription = `Upfront admission payment for ${application.student_first_name} ${application.student_last_name}`;

    const session = await this.circuitBreaker.exec('stripe', () =>
      stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: currencyCode.toLowerCase(),
              unit_amount: amountCents,
              product_data: {
                name: productName,
                description: productDescription,
              },
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        expires_at: expiresAt,
        metadata: {
          purpose: 'admissions',
          tenant_id: tenantId,
          application_id: applicationId,
          expected_amount_cents: amountCents.toString(),
        },
      }),
    );

    // eslint-disable-next-line school/no-cross-module-prisma-access -- stripe_checkout_session_id is a finance-owned column on applications
    await this.prisma.application.update({
      where: { id: applicationId },
      data: { stripe_checkout_session_id: session.id },
    });

    return {
      session_id: session.id,
      checkout_url: session.url ?? successUrl,
      amount_cents: amountCents,
      currency_code: currencyCode,
      expires_at: deadline,
    };
  }

  /**
   * Webhook handler for the admissions branch of `checkout.session.completed`.
   * Verifies amount, tenant, and idempotency, then converts the application
   * into a Student record and flips it to `approved` inside a single
   * interactive RLS transaction.
   */
  private async handleAdmissionsCheckoutCompleted(
    tenantId: string,
    eventId: string,
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const applicationId = session.metadata?.application_id;
    const expectedCentsStr = session.metadata?.expected_amount_cents;
    const metadataTenantId = session.metadata?.tenant_id;

    if (!applicationId || !expectedCentsStr) {
      this.logger.warn(`admissions checkout.session.completed missing metadata: ${session.id}`);
      return;
    }
    if (metadataTenantId && metadataTenantId !== tenantId) {
      this.logger.error(
        `admissions webhook: tenant mismatch (metadata=${metadataTenantId}, resolved=${tenantId}) for session ${session.id}`,
      );
      throw new BadRequestException({
        code: 'TENANT_MISMATCH',
        message: 'Webhook tenant does not match metadata tenant',
      });
    }

    const expectedCents = Number.parseInt(expectedCentsStr, 10);
    if (!Number.isFinite(expectedCents) || expectedCents <= 0) {
      this.logger.error(
        `admissions webhook: expected_amount_cents metadata not a positive integer: "${expectedCentsStr}"`,
      );
      throw new BadRequestException({
        code: 'AMOUNT_METADATA_INVALID',
        message: 'expected_amount_cents metadata is not a positive integer',
      });
    }

    const actualCents = session.amount_total ?? 0;
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.admissionsPaymentEvent.findUnique({
        where: { stripe_event_id: eventId },
      });
      if (existing) {
        this.logger.log(`Duplicate admissions event ${eventId} — skipping`);
        return;
      }

      const application = await db.application.findFirst({
        where: { id: applicationId, tenant_id: tenantId },
      });
      if (!application) {
        this.logger.error(
          `admissions webhook: application ${applicationId} not found for tenant ${tenantId}`,
        );
        throw new NotFoundException({
          code: 'APPLICATION_NOT_FOUND',
          message: `Application "${applicationId}" not found`,
        });
      }

      if (application.payment_amount_cents !== expectedCents) {
        this.logger.error(
          `admissions webhook: metadata expected ${expectedCents} but application stored ${application.payment_amount_cents}`,
        );
        throw new BadRequestException({
          code: 'AMOUNT_MISMATCH_METADATA',
          message: 'Webhook metadata amount does not match the application payment amount',
        });
      }

      if (actualCents !== expectedCents) {
        this.logger.error(
          `admissions webhook: Stripe actual ${actualCents} but expected ${expectedCents}`,
        );
        throw new BadRequestException({
          code: 'AMOUNT_MISMATCH_ACTUAL',
          message: 'Stripe session amount does not match expected amount',
        });
      }

      if (application.status !== 'conditional_approval') {
        this.logger.warn(
          `admissions webhook: application ${applicationId} has status "${application.status}" — recording out-of-band`,
        );
        await db.admissionsPaymentEvent.create({
          data: {
            tenant_id: tenantId,
            application_id: applicationId,
            stripe_event_id: eventId,
            stripe_session_id: session.id,
            amount_cents: actualCents,
            status: 'received_out_of_band',
          },
        });
        return;
      }

      await db.admissionsPaymentEvent.create({
        data: {
          tenant_id: tenantId,
          application_id: applicationId,
          stripe_event_id: eventId,
          stripe_session_id: session.id,
          amount_cents: actualCents,
          status: 'succeeded',
        },
      });

      const triggerUserId = application.reviewed_by_user_id;
      if (!triggerUserId) {
        throw new InternalServerErrorException({
          code: 'REVIEWER_MISSING',
          message: 'Application has no reviewed_by_user_id — cannot attribute consent records',
        });
      }

      const conversion = await this.applicationConversionService.convertToStudent(db, {
        tenantId,
        applicationId,
        triggerUserId,
      });

      await this.applicationStateMachineService.markApproved(
        tenantId,
        applicationId,
        {
          actingUserId: null,
          paymentSource: 'stripe',
          overrideRecordId: null,
        },
        db,
      );

      // Create financial records: fee assignment, invoice, payment, allocation
      if (
        conversion.created &&
        application.target_academic_year_id &&
        application.target_year_group_id
      ) {
        await this.admissionsFinanceBridge.createFinancialRecords({
          tenantId,
          householdId: conversion.household_id,
          studentId: conversion.student_id,
          studentFirstName: application.student_first_name,
          studentLastName: application.student_last_name,
          yearGroupId: application.target_year_group_id,
          academicYearId: application.target_academic_year_id,
          paymentAmountCents: actualCents,
          paymentSource: 'stripe',
          actingUserId: triggerUserId,
          stripeSessionId: session.id,
          stripePaymentIntentId:
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : session.payment_intent?.id,
          db,
        });
      }
    });
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

      // Generate sequential payment reference
      const paymentRef = await this.sequenceService.nextNumber(
        tenantId,
        'payment',
        undefined,
        'PAYREF',
      );

      // Create payment record
      const payment = await prisma.payment.create({
        data: {
          tenant_id: tenantId,
          household_id: householdId,
          payment_reference: paymentRef,
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
