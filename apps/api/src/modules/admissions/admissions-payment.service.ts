import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ConfigurationReadFacade } from '../configuration/configuration-read.facade';
import { EncryptionService } from '../configuration/encryption.service';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentIntentResult {
  client_secret: string;
  payment_intent_id: string;
  amount: number;
  discount_applied: number;
  original_amount: number;
}

interface EarlyBirdTier {
  deadline: string;
  discount_percent: number;
  label: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AdmissionsPaymentService {
  private readonly logger = new Logger(AdmissionsPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly configurationReadFacade: ConfigurationReadFacade,
  ) {}

  // ─── Stripe Client ──────────────────────────────────────────────────────

  private async getStripeClient(tenantId: string): Promise<Stripe> {
    const stripeConfig = await this.configurationReadFacade.findStripeConfigFull(tenantId);
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

  // ─── Early Bird Discount Calculation ────────────────────────────────────

  calculateDiscount(
    feeAmount: number,
    tiers: EarlyBirdTier[],
    submissionDate: Date = new Date(),
  ): {
    discount_percent: number;
    discount_amount: number;
    final_amount: number;
    tier_label: string | null;
  } {
    if (!tiers.length) {
      return { discount_percent: 0, discount_amount: 0, final_amount: feeAmount, tier_label: null };
    }

    // Sort tiers by deadline ascending
    const sorted = [...tiers].sort(
      (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
    );

    // Find the first tier where today < deadline
    for (const tier of sorted) {
      if (submissionDate < new Date(tier.deadline)) {
        const discountAmount = Math.round(((feeAmount * tier.discount_percent) / 100) * 100) / 100;
        return {
          discount_percent: tier.discount_percent,
          discount_amount: discountAmount,
          final_amount: Math.round((feeAmount - discountAmount) * 100) / 100,
          tier_label: tier.label,
        };
      }
    }

    return { discount_percent: 0, discount_amount: 0, final_amount: feeAmount, tier_label: null };
  }

  // ─── Create PaymentIntent for Online Payment ───────────────────────────

  async createPaymentIntent(
    tenantId: string,
    applicationId: string,
    feeAmount: number,
  ): Promise<PaymentIntentResult> {
    const stripe = await this.getStripeClient(tenantId);

    // Get early bird discounts from tenant settings
    const settings = await this.settingsService.getSettings(tenantId);
    const tiers = (settings.admissions?.earlyBirdDiscounts ?? []) as EarlyBirdTier[];
    const { discount_amount, final_amount } = this.calculateDiscount(feeAmount, tiers);

    const amountInCents = Math.round(final_amount * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'aed', // tenant currency from settings — hardcoded for now
      metadata: {
        tenant_id: tenantId,
        application_id: applicationId,
        type: 'admissions_payment',
      },
    });

    // Store PaymentIntent ID and amounts on the application
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.application.update({
        where: { id: applicationId },
        data: {
          stripe_payment_intent_id: paymentIntent.id,
          payment_amount: final_amount,
          discount_applied: discount_amount > 0 ? discount_amount : null,
        },
      });
    });

    return {
      client_secret: paymentIntent.client_secret!,
      payment_intent_id: paymentIntent.id,
      amount: final_amount,
      discount_applied: discount_amount,
      original_amount: feeAmount,
    };
  }

  // ─── Handle Stripe Webhook (payment confirmed) ─────────────────────────

  async handlePaymentConfirmed(paymentIntentId: string): Promise<void> {
    // Find the application by stripe_payment_intent_id
    const application = await this.prisma.application.findFirst({
      where: { stripe_payment_intent_id: paymentIntentId },
    });

    if (!application) {
      this.logger.warn(`No application found for PaymentIntent ${paymentIntentId}`);
      return;
    }

    if (application.status !== 'conditional_approval') {
      this.logger.warn(
        `Application ${application.id} already has status ${application.status}, skipping`,
      );
      return;
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: application.tenant_id });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.application.update({
        where: { id: application.id },
        data: {
          status: 'approved',
          payment_status: 'paid_online',
          reviewed_at: new Date(),
        },
      });

      await db.applicationNote.create({
        data: {
          tenant_id: application.tenant_id,
          application_id: application.id,
          author_user_id:
            application.submitted_by_parent_id ??
            application.reviewed_by_user_id ??
            '00000000-0000-0000-0000-000000000000',
          note: `Online payment confirmed via Stripe (${paymentIntentId}). Application submitted.`,
          is_internal: true,
        },
      });
    });
  }

  // ─── Select Cash/Payment Plan Option ───────────────────────────────────

  async selectCashOption(
    tenantId: string,
    applicationId: string,
    feeAmount: number,
  ): Promise<{ payment_deadline: Date }> {
    const settings = await this.settingsService.getSettings(tenantId);
    const deadlineDays = settings.admissions?.cashPaymentDeadlineDays ?? 14;
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + deadlineDays);

    // Calculate discount
    const tiers = (settings.admissions?.earlyBirdDiscounts ?? []) as EarlyBirdTier[];
    const { discount_amount, final_amount } = this.calculateDiscount(feeAmount, tiers);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.application.update({
        where: { id: applicationId },
        data: {
          payment_status: 'pending',
          payment_amount: final_amount,
          discount_applied: discount_amount > 0 ? discount_amount : null,
          payment_deadline: deadline,
        },
      });
    });

    return { payment_deadline: deadline };
  }

  // ─── Admin: Mark Payment Received ──────────────────────────────────────

  async markPaymentReceived(tenantId: string, applicationId: string, userId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const app = await db.application.findFirst({
        where: { id: applicationId, tenant_id: tenantId },
      });

      if (!app) {
        throw new NotFoundException({
          error: { code: 'APPLICATION_NOT_FOUND', message: 'Application not found' },
        });
      }

      if (app.status !== 'conditional_approval') {
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS',
            message: 'Only conditional approvals can be marked as paid',
          },
        });
      }

      await db.application.update({
        where: { id: applicationId },
        data: {
          status: 'approved',
          payment_status: 'paid_cash',
          reviewed_at: new Date(),
          payment_deadline: null,
        },
      });

      await db.applicationNote.create({
        data: {
          tenant_id: tenantId,
          application_id: applicationId,
          author_user_id: userId,
          note: 'Cash payment received. Application submitted.',
          is_internal: true,
        },
      });

      return { success: true };
    });
  }

  // ─── Admin: Setup Payment Plan ─────────────────────────────────────────

  async setupPaymentPlan(tenantId: string, applicationId: string, userId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const app = await db.application.findFirst({
        where: { id: applicationId, tenant_id: tenantId },
      });

      if (!app) {
        throw new NotFoundException({
          error: { code: 'APPLICATION_NOT_FOUND', message: 'Application not found' },
        });
      }

      if (app.status !== 'conditional_approval') {
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS',
            message: 'Only conditional approvals can have payment plans',
          },
        });
      }

      await db.application.update({
        where: { id: applicationId },
        data: {
          status: 'approved',
          payment_status: 'payment_plan',
          reviewed_at: new Date(),
          payment_deadline: null,
        },
      });

      await db.applicationNote.create({
        data: {
          tenant_id: tenantId,
          application_id: applicationId,
          author_user_id: userId,
          note: 'Payment plan arranged. Application submitted.',
          is_internal: true,
        },
      });

      return { success: true };
    });
  }

  // ─── Admin: Waive Fees ─────────────────────────────────────────────────

  async waiveFees(tenantId: string, applicationId: string, userId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const app = await db.application.findFirst({
        where: { id: applicationId, tenant_id: tenantId },
      });

      if (!app) {
        throw new NotFoundException({
          error: { code: 'APPLICATION_NOT_FOUND', message: 'Application not found' },
        });
      }

      if (app.status !== 'conditional_approval') {
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS',
            message: 'Only conditional approvals can have fees waived',
          },
        });
      }

      await db.application.update({
        where: { id: applicationId },
        data: {
          status: 'approved',
          payment_status: 'waived',
          payment_amount: 0,
          reviewed_at: new Date(),
          payment_deadline: null,
        },
      });

      await db.applicationNote.create({
        data: {
          tenant_id: tenantId,
          application_id: applicationId,
          author_user_id: userId,
          note: 'Fees waived by admin. Application submitted.',
          is_internal: true,
        },
      });

      return { success: true };
    });
  }
}
