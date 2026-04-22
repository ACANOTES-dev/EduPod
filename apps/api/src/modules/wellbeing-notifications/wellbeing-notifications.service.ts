import { Injectable, Logger, NotImplementedException } from '@nestjs/common';

import {
  wellbeingChannelPreferencesSchema,
  type WellbeingChannelPreferences,
} from '@school/shared/wellbeing';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { WellbeingEmailProvider } from './providers/email.provider';
import { WellbeingInAppProvider } from './providers/in-app.provider';
import { WellbeingSmsProvider } from './providers/sms.provider';
import type { WellbeingDispatchInput } from './providers/types';
import { WellbeingWhatsappProvider } from './providers/whatsapp.provider';

const DEFAULT_CHANNELS: WellbeingChannelPreferences = {
  defaults: { email: false, sms: false, whatsapp: false },
  overrides: {},
};

function isProviderNotWired(err: unknown): boolean {
  if (!(err instanceof NotImplementedException)) return false;
  const response = err.getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    (response as { code?: unknown }).code === 'PROVIDER_NOT_WIRED'
  );
}

type ChannelKey = 'email' | 'sms' | 'whatsapp';

interface ResolvedChannels {
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
}

/**
 * WellbeingNotificationsService — orchestrates per-event delivery for
 * wellbeing notifications.
 *
 * In-app delivery is mandatory and runs first; secondary channels
 * (email/SMS/WhatsApp) honour the per-tenant `tenant_notification_preferences.wellbeing_channels`
 * preference (override → default). Per-channel failures are isolated; a
 * stub provider throwing `PROVIDER_NOT_WIRED` is silently swallowed so
 * Wave 3 callers can compose `dispatch()` into their flows without crashing
 * while delivery hardening lands in a follow-up pass.
 */
@Injectable()
export class WellbeingNotificationsService {
  private readonly logger = new Logger(WellbeingNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inApp: WellbeingInAppProvider,
    private readonly email: WellbeingEmailProvider,
    private readonly sms: WellbeingSmsProvider,
    private readonly whatsapp: WellbeingWhatsappProvider,
  ) {}

  async dispatch(input: WellbeingDispatchInput): Promise<void> {
    if (input.recipients.length === 0) {
      return;
    }

    // 1. In-app is non-negotiable.
    try {
      await this.inApp.send(input);
    } catch (err) {
      // In-app failure is loud — it means the notifications table write
      // failed, which is a data-layer issue the caller should know about.
      this.logger.error(
        `[wellbeing-notifications] in-app delivery failed for event=${input.event}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err;
    }

    // 2. Resolve secondary-channel preferences.
    const channels = await this.getEventChannels(input.tenantId, input.event);

    // 3. Fan out to enabled secondary channels; per-channel failure is
    //    contained.
    const dispatches: Promise<unknown>[] = [];
    if (channels.email) dispatches.push(this.safeDispatch('email', () => this.email.send(input)));
    if (channels.sms) dispatches.push(this.safeDispatch('sms', () => this.sms.send(input)));
    if (channels.whatsapp)
      dispatches.push(this.safeDispatch('whatsapp', () => this.whatsapp.send(input)));

    if (dispatches.length === 0) return;
    await Promise.allSettled(dispatches);
  }

  /**
   * Resolve the (defaults + per-event overrides) channel matrix for a
   * given event. Public so Wave 5 impl 18 can reuse the resolution logic
   * when rendering the channel preferences admin UI.
   */
  async getEventChannels(tenantId: string, event: string): Promise<ResolvedChannels> {
    const row = await this.prisma.tenantNotificationPreferences.findUnique({
      where: { tenant_id: tenantId },
      select: { wellbeing_channels: true },
    });

    const parsed = wellbeingChannelPreferencesSchema.safeParse(
      row?.wellbeing_channels ?? DEFAULT_CHANNELS,
    );
    const prefs: WellbeingChannelPreferences = parsed.success ? parsed.data : DEFAULT_CHANNELS;
    if (!parsed.success) {
      this.logger.warn(
        `[wellbeing-notifications] tenant ${tenantId} has malformed wellbeing_channels JSONB; falling back to defaults`,
      );
    }

    const override = prefs.overrides[event] ?? {};
    return {
      email: override.email ?? prefs.defaults.email,
      sms: override.sms ?? prefs.defaults.sms,
      whatsapp: override.whatsapp ?? prefs.defaults.whatsapp,
    };
  }

  /**
   * Read the full wellbeing channel preferences for a tenant. Returns the
   * stored JSONB if present, or the zero-state default otherwise.
   *
   * Consumed by the Wellbeing Notifications settings page to render the
   * event × channel matrix.
   */
  async getChannels(tenantId: string): Promise<WellbeingChannelPreferences> {
    const row = await this.prisma.tenantNotificationPreferences.findUnique({
      where: { tenant_id: tenantId },
      select: { wellbeing_channels: true },
    });

    const parsed = wellbeingChannelPreferencesSchema.safeParse(
      row?.wellbeing_channels ?? DEFAULT_CHANNELS,
    );
    if (parsed.success) return parsed.data;

    this.logger.warn(
      `[wellbeing-notifications] tenant ${tenantId} has malformed wellbeing_channels JSONB; returning defaults`,
    );
    return DEFAULT_CHANNELS;
  }

  /**
   * Replace the full wellbeing channel preferences for a tenant.
   *
   * Callers MUST have already validated the incoming payload against
   * `updateWellbeingChannelPreferencesSchema` (the controller does this
   * via the Zod pipe). We still re-parse here to harden against misuse.
   */
  async upsertChannels(
    tenantId: string,
    userId: string,
    prefs: WellbeingChannelPreferences,
  ): Promise<WellbeingChannelPreferences> {
    const parsed = wellbeingChannelPreferencesSchema.parse(prefs);

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });

    await rls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.tenantNotificationPreferences.upsert({
        where: { tenant_id: tenantId },
        create: { tenant_id: tenantId, wellbeing_channels: parsed },
        update: { wellbeing_channels: parsed },
      });
    });

    return parsed;
  }

  private async safeDispatch(channel: ChannelKey, fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      if (isProviderNotWired(err)) {
        this.logger.debug(
          `[wellbeing-notifications] ${channel} provider not wired — skipping dispatch`,
        );
        return;
      }
      this.logger.error(
        `[wellbeing-notifications] ${channel} dispatch failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      // Do not rethrow — secondary channels must not block in-app delivery.
    }
  }
}
