import { createDecipheriv } from 'crypto';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';
import Stripe from 'stripe';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const FINANCE_RECONCILE_STRIPE_REFUNDS_JOB = 'finance:reconcile-stripe-refunds';

/**
 * FIN-023: alert-only reconciliation cron for Stripe refunds.
 *
 * `RefundsService.execute` calls Stripe inside a DB transaction. If Stripe
 * succeeds but the DB commit then fails, the local row ends up flagged
 * `failed` while Stripe has actually processed the refund. Nothing recovers
 * this drift today.
 *
 * This processor runs daily (registered in CronSchedulerService) and for
 * every tenant with a configured Stripe account:
 *  1. Lists recent Stripe refunds for that tenant's Stripe account.
 *  2. Fetches the corresponding local `refunds` rows by payment_intent match.
 *  3. Detects two drift types:
 *     - drift_type = 'stripe_has_local_failed' — Stripe refund exists,
 *       local row is `failed`. Customer got their money; books say we didn't
 *       refund. Highest-severity alert.
 *     - drift_type = 'local_executed_no_stripe' — local row is `executed`,
 *       no matching Stripe refund. Could indicate a manual/cash refund
 *       tagged as Stripe, or a Stripe API inconsistency. Lower severity.
 *
 * Alert-only initially (per product decision) — logs at ERROR level with
 * structured context so the alerting pipeline can pick them up. No
 * auto-repair; a human decides what to do about each drift case.
 */
@Processor(QUEUE_NAMES.FINANCE, {
  lockDuration: 5 * 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class StripeRefundReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(StripeRefundReconciliationProcessor.name);

  /** Look back window for Stripe.refunds.list and local refund query. */
  private static readonly LOOKBACK_MS = 48 * 60 * 60 * 1000;

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== FINANCE_RECONCILE_STRIPE_REFUNDS_JOB) {
      return;
    }

    this.logger.log('Starting Stripe refund reconciliation sweep');

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });

    let checkedTenants = 0;
    let driftCount = 0;

    for (const { id: tenantId } of tenants) {
      try {
        const result = await this.reconcileTenant(tenantId);
        checkedTenants += result.checked ? 1 : 0;
        driftCount += result.driftCount;
      } catch (err) {
        this.logger.error(`Reconciliation failed for tenant ${tenantId}: ${String(err)}`);
      }
    }

    this.logger.log(
      `Reconciliation sweep complete — tenants_checked=${checkedTenants}/${tenants.length} drift_alerts=${driftCount}`,
    );
  }

  private async reconcileTenant(
    tenantId: string,
  ): Promise<{ checked: boolean; driftCount: number }> {
    // tenantStripeConfig and refund both have FORCE ROW LEVEL SECURITY with
    // policies that cast `app.current_tenant_id` to uuid. Without an
    // interactive transaction that sets the GUC via set_config, the first
    // read either errors with "unrecognized configuration parameter" or
    // with "invalid input syntax for type uuid: \"\"" — both observed in
    // prod cron runs (same class of bug as SCHED-013, fixed the same way).
    //
    // We do the DB reads inside the transaction, then perform the Stripe
    // API calls and alert logging outside the transaction (no DB
    // contention, and Stripe calls can take seconds per page).
    const { stripeConfig, localRefunds } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT set_config('app.current_tenant_id', ${tenantId}::text, true)`,
      );
      const config = await tx.tenantStripeConfig.findUnique({
        where: { tenant_id: tenantId },
      });
      if (!config) {
        return { stripeConfig: null, localRefunds: [] };
      }
      const sinceMs = Date.now() - StripeRefundReconciliationProcessor.LOOKBACK_MS;
      const refunds = await tx.refund.findMany({
        where: {
          tenant_id: tenantId,
          created_at: { gte: new Date(sinceMs) },
        },
        select: {
          id: true,
          refund_reference: true,
          amount: true,
          status: true,
          created_at: true,
          payment: {
            select: {
              id: true,
              external_event_id: true,
              external_provider: true,
            },
          },
        },
      });
      return { stripeConfig: config, localRefunds: refunds };
    });

    if (!stripeConfig) {
      // Not an error — tenant just hasn't configured Stripe.
      return { checked: false, driftCount: 0 };
    }

    let stripe: Stripe;
    try {
      const secretKey = this.decrypt(
        stripeConfig.stripe_secret_key_encrypted,
        stripeConfig.encryption_key_ref,
      );
      stripe = new Stripe(secretKey, { apiVersion: '2026-02-25.clover' });
    } catch (err) {
      this.logger.error(`Cannot decrypt Stripe secret key for tenant ${tenantId}: ${String(err)}`);
      return { checked: false, driftCount: 0 };
    }

    const sinceSeconds = Math.floor(
      (Date.now() - StripeRefundReconciliationProcessor.LOOKBACK_MS) / 1000,
    );

    // 1. Pull recent Stripe refunds for this tenant's account. Paginate in
    //    case they have a high volume (unlikely for a school but correctness
    //    first). Local refunds for the same window were already loaded in
    //    the tenant-context transaction above.
    const stripeRefunds: Stripe.Refund[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;
    while (hasMore) {
      const page: Stripe.ApiList<Stripe.Refund> = await stripe.refunds.list({
        created: { gte: sinceSeconds },
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      stripeRefunds.push(...page.data);
      hasMore = page.has_more;
      startingAfter = page.data[page.data.length - 1]?.id;
      if (!startingAfter) break;
    }

    let driftCount = 0;

    // Drift type 1: Stripe has a refund whose payment_intent maps to a local
    // payment — but the local refund for that payment is `failed`.
    for (const stripeRefund of stripeRefunds) {
      const paymentIntentId =
        typeof stripeRefund.payment_intent === 'string'
          ? stripeRefund.payment_intent
          : stripeRefund.payment_intent?.id;
      if (!paymentIntentId) continue;

      const matches = localRefunds.filter((l) => l.payment?.external_event_id === paymentIntentId);
      const amountMatches = matches.filter(
        (l) => Math.round(Number(l.amount) * 100) === stripeRefund.amount,
      );

      if (amountMatches.length === 0) {
        // No local row matches — could be a Stripe-side refund created
        // outside our system. Flag it so someone can investigate.
        this.logger.error(
          JSON.stringify({
            event: 'stripe_refund_reconciliation_drift',
            drift_type: 'stripe_refund_no_local_row',
            tenant_id: tenantId,
            stripe_refund_id: stripeRefund.id,
            amount_cents: stripeRefund.amount,
            payment_intent: paymentIntentId,
            created_at: new Date(stripeRefund.created * 1000).toISOString(),
          }),
        );
        driftCount++;
        continue;
      }

      const failedMatches = amountMatches.filter((l) => l.status === 'failed');
      for (const failed of failedMatches) {
        this.logger.error(
          JSON.stringify({
            event: 'stripe_refund_reconciliation_drift',
            drift_type: 'stripe_has_local_failed',
            tenant_id: tenantId,
            local_refund_id: failed.id,
            refund_reference: failed.refund_reference,
            stripe_refund_id: stripeRefund.id,
            amount_cents: stripeRefund.amount,
            payment_intent: paymentIntentId,
          }),
        );
        driftCount++;
      }
    }

    // Drift type 2: local row is `executed` with a Stripe-sourced payment
    // but no Stripe refund matches it.
    for (const local of localRefunds) {
      if (local.status !== 'executed') continue;
      if (local.payment?.external_provider !== 'stripe') continue;
      const paymentIntentId = local.payment.external_event_id;
      if (!paymentIntentId) continue;

      const matches = stripeRefunds.filter((s) => {
        const intentId =
          typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id;
        return intentId === paymentIntentId && s.amount === Math.round(Number(local.amount) * 100);
      });

      if (matches.length === 0) {
        this.logger.error(
          JSON.stringify({
            event: 'stripe_refund_reconciliation_drift',
            drift_type: 'local_executed_no_stripe',
            tenant_id: tenantId,
            local_refund_id: local.id,
            refund_reference: local.refund_reference,
            amount: Number(local.amount),
            payment_intent: paymentIntentId,
          }),
        );
        driftCount++;
      }
    }

    return { checked: true, driftCount };
  }

  // MAINTENANCE NOTE: duplicates `EncryptionService.decrypt` from
  // apps/api/src/modules/configuration/encryption.service.ts. Worker runs in
  // its own NestJS context and cannot import API modules. Keep in lockstep
  // with admissions-payment-link.processor.ts and key-rotation.processor.ts —
  // they all share this inlined decrypt.
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
