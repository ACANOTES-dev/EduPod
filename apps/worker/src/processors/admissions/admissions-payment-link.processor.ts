import { createDecipheriv } from 'crypto';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';
import Stripe from 'stripe';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Payload & job name ──────────────────────────────────────────────────────

export interface AdmissionsPaymentLinkPayload {
  tenant_id: string;
  application_id: string;
}

// Matches the constant exported from the API's
// application-state-machine.service.ts; the state machine enqueues this job
// on the `notifications` queue whenever an application transitions to
// `conditional_approval`.
export const ADMISSIONS_PAYMENT_LINK_JOB = 'notifications:admissions-payment-link';

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Generates a Stripe Checkout Session for an application that has just
 * entered `conditional_approval`, stamps the session id on the application
 * row, and queues an email notification for the submitting parent with the
 * hosted checkout URL.
 *
 * Runs on the shared `notifications` queue because the enqueuing state
 * machine already writes there for all admissions parent-facing messages;
 * a dedicated queue would double-bind the downstream cron/worker topology.
 *
 * Stripe SDK + AES-256-GCM decrypt are intentionally inlined rather than
 * routed through the API's `StripeService` / `EncryptionService` — the
 * worker runs in its own NestJS context that does not import API modules,
 * mirroring the pattern used in `key-rotation.processor.ts`. If the
 * encryption format (iv:authTag:ciphertext hex) changes, update both.
 */
@Processor(QUEUE_NAMES.NOTIFICATIONS, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class AdmissionsPaymentLinkProcessor extends WorkerHost {
  private readonly logger = new Logger(AdmissionsPaymentLinkProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<AdmissionsPaymentLinkPayload>): Promise<void> {
    if (job.name !== ADMISSIONS_PAYMENT_LINK_JOB) {
      return;
    }

    const { tenant_id, application_id } = job.data;

    if (!tenant_id || !application_id) {
      throw new Error(
        `Job rejected: missing tenant_id or application_id for ${ADMISSIONS_PAYMENT_LINK_JOB}`,
      );
    }

    this.logger.log(
      `Processing ${ADMISSIONS_PAYMENT_LINK_JOB} — tenant ${tenant_id} application ${application_id}`,
    );

    const application = await this.prisma.application.findFirst({
      where: { id: application_id, tenant_id },
    });

    if (!application) {
      this.logger.warn(
        `Application ${application_id} not found for tenant ${tenant_id} — skipping`,
      );
      return;
    }

    if (application.status !== 'conditional_approval') {
      this.logger.warn(
        `Application ${application_id} has status ${application.status} — skipping payment-link dispatch`,
      );
      return;
    }

    if (!application.payment_amount_cents || application.payment_amount_cents <= 0) {
      this.logger.error(
        `Application ${application_id} has no payment_amount_cents — cannot create checkout session`,
      );
      return;
    }

    if (!application.payment_deadline) {
      this.logger.error(
        `Application ${application_id} has no payment_deadline — cannot create checkout session`,
      );
      return;
    }

    // Load the tenant's encrypted Stripe secret key.
    const stripeConfig = await this.prisma.tenantStripeConfig.findUnique({
      where: { tenant_id },
    });
    if (!stripeConfig) {
      this.logger.error(
        `Stripe not configured for tenant ${tenant_id} — admissions payment link cannot be generated`,
      );
      return;
    }

    const secretKey = this.decrypt(
      stripeConfig.stripe_secret_key_encrypted,
      stripeConfig.encryption_key_ref,
    );
    const stripe = new Stripe(secretKey, { apiVersion: '2026-02-25.clover' });

    const { successUrl, cancelUrl } = this.buildCheckoutUrls(tenant_id, application_id);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: (application.currency_code ?? 'EUR').toLowerCase(),
            unit_amount: application.payment_amount_cents,
            product_data: {
              name: `Admission fee — application ${application.application_number}`,
              description: `Upfront admission payment for ${application.student_first_name} ${application.student_last_name}`,
            },
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      expires_at: Math.floor(application.payment_deadline.getTime() / 1000),
      metadata: {
        purpose: 'admissions',
        tenant_id,
        application_id,
        expected_amount_cents: application.payment_amount_cents.toString(),
      },
    });

    await this.prisma.application.update({
      where: { id: application_id },
      data: { stripe_checkout_session_id: session.id },
    });

    const checkoutUrl = session.url ?? successUrl;

    await this.enqueueParentEmail(
      tenant_id,
      application_id,
      application.application_number,
      application.submitted_by_parent_id,
      application.student_first_name,
      application.student_last_name,
      checkoutUrl,
      application.payment_amount_cents,
      application.currency_code ?? 'EUR',
      application.payment_deadline,
      session.id,
    );

    this.logger.log(
      `Created admissions checkout session ${session.id} for application ${application_id}`,
    );
  }

  // ─── Email dispatch ──────────────────────────────────────────────────────

  private async enqueueParentEmail(
    tenantId: string,
    applicationId: string,
    applicationNumber: string,
    submittedByParentId: string | null,
    studentFirstName: string,
    studentLastName: string,
    checkoutUrl: string,
    amountCents: number,
    currencyCode: string,
    paymentDeadline: Date,
    sessionId: string,
  ): Promise<void> {
    let recipientUserId: string | null = null;

    if (submittedByParentId) {
      const parent = await this.prisma.parent.findFirst({
        where: { id: submittedByParentId, tenant_id: tenantId },
        select: { user_id: true },
      });
      recipientUserId = parent?.user_id ?? null;
    }

    if (!recipientUserId) {
      this.logger.warn(
        `Application ${applicationId} has no reachable parent user account — payment link not emailed (admin must share manually)`,
      );
      return;
    }

    // Idempotency: one payment-link notification per Stripe session id.
    const idempotencyKey = `admissions:payment-link:${sessionId}`.slice(0, 64);

    await this.prisma.notification.create({
      data: {
        tenant_id: tenantId,
        recipient_user_id: recipientUserId,
        channel: 'email',
        template_key: 'admissions_payment_link',
        locale: 'en',
        status: 'queued',
        idempotency_key: idempotencyKey,
        source_entity_type: 'application',
        source_entity_id: applicationId,
        payload_json: {
          application_id: applicationId,
          application_number: applicationNumber,
          student_first_name: studentFirstName,
          student_last_name: studentLastName,
          checkout_url: checkoutUrl,
          amount_cents: amountCents,
          currency_code: currencyCode,
          payment_deadline: paymentDeadline.toISOString(),
        },
      },
    });
  }

  // ─── URL helpers ─────────────────────────────────────────────────────────

  private buildCheckoutUrls(
    tenantId: string,
    applicationId: string,
  ): { successUrl: string; cancelUrl: string } {
    const base = (process.env.APP_URL ?? 'https://app.edupod.app').replace(/\/$/, '');
    return {
      successUrl: `${base}/en/apply/payment-success?application=${applicationId}&tenant=${tenantId}`,
      cancelUrl: `${base}/en/apply/payment-cancelled?application=${applicationId}&tenant=${tenantId}`,
    };
  }

  // ─── Encryption helpers ──────────────────────────────────────────────────
  //
  // MAINTENANCE NOTE: duplicates `EncryptionService.decrypt` from
  // apps/api/src/modules/configuration/encryption.service.ts. The worker
  // cannot import the API's EncryptionService across module boundaries.
  // Keep both implementations in lockstep — see the matching note in
  // key-rotation.processor.ts for the same pattern.

  private decrypt(ciphertext: string, keyRef: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error(
        `Invalid ciphertext format — expected 3 colon-separated parts, got ${parts.length}`,
      );
    }

    const version = this.resolveKeyVersion(keyRef);
    const key = this.loadKey(version);

    const iv = Buffer.from(parts[0] as string, 'hex');
    const authTag = Buffer.from(parts[1] as string, 'hex');
    const encrypted = Buffer.from(parts[2] as string, 'hex');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  private loadKey(version: number): Buffer {
    const hex = process.env[`ENCRYPTION_KEY_V${version}`];
    if (hex) {
      const buf = Buffer.from(hex, 'hex');
      if (buf.length !== 32) {
        throw new Error(
          `ENCRYPTION_KEY_V${version} must be 32 bytes (64 hex chars), got ${buf.length}`,
        );
      }
      return buf;
    }

    if (version === 1) {
      const legacyHex = process.env.ENCRYPTION_KEY ?? process.env.ENCRYPTION_KEY_LOCAL;
      if (legacyHex) {
        const buf = Buffer.from(legacyHex, 'hex');
        if (buf.length !== 32) {
          throw new Error('Legacy ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
        }
        return buf;
      }
    }

    throw new Error(
      `No encryption key available for version ${version}. Set ENCRYPTION_KEY_V${version}.`,
    );
  }

  private resolveKeyVersion(keyRef: string): number {
    const match = /^v(\d+)$/.exec(keyRef);
    if (match) {
      return Number.parseInt(match[1] as string, 10);
    }
    if (keyRef === 'aws' || keyRef === 'local') {
      return 1;
    }
    this.logger.warn(`Unknown keyRef "${keyRef}" — falling back to v1`);
    return 1;
  }
}
