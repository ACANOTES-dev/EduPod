import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { pastoralTenantSettingsSchema, SYSTEM_USER_SENTINEL } from '@school/shared';
import { Queue } from 'bullmq';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AlertCheckResult {
  was_flagged: boolean;
  flag_reason: 'keyword_match' | 'consecutive_low' | null;
  generated_concern_id: string | null;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class CheckinAlertService {
  private readonly logger = new Logger(CheckinAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  /**
   * Evaluate a persisted check-in for keyword matches and consecutive-low
   * mood. If either triggers, auto-generates a Tier 2 pastoral concern,
   * records an audit event, and enqueues a notification.
   */
  async evaluateCheckin(
    tenantId: string,
    studentId: string,
    checkinId: string,
    checkinDate: string,
    moodScore: number,
    freeformText: string | null,
  ): Promise<AlertCheckResult> {
    // 1. Load tenant settings
    const settings = await this.loadCheckinSettings(tenantId);
    const {
      flagged_keywords,
      consecutive_low_threshold,
      monitoring_owner_user_ids,
      monitoring_hours_start,
      monitoring_hours_end,
      monitoring_days,
    } = settings;

    // 2. Run keyword matching first
    let flagReason: 'keyword_match' | 'consecutive_low' | null = null;
    let matchedKeyword: string | null = null;

    if (freeformText) {
      matchedKeyword = this.matchKeywords(freeformText, [...flagged_keywords]);
      if (matchedKeyword) {
        flagReason = 'keyword_match';
      }
    }

    // 3. Run consecutive-low detection (only if keyword didn't trigger)
    if (!flagReason) {
      const lowMoodScore = 1; // Lowest possible mood score
      const isConsecutiveLow = await this.detectConsecutiveLow(
        tenantId,
        studentId,
        consecutive_low_threshold,
        lowMoodScore,
      );
      if (isConsecutiveLow) {
        flagReason = 'consecutive_low';
      }
    }

    // 4. If nothing triggered, return clean result
    if (!flagReason) {
      return { was_flagged: false, flag_reason: null, generated_concern_id: null };
    }

    // 5. Flag triggered — generate concern, update checkin, audit, notify
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const concernId = await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // 5a. Create Tier 2 concern
      const concern = await db.pastoralConcern.create({
        data: {
          tenant_id: tenantId,
          student_id: studentId,
          category: 'emotional',
          severity: 'elevated',
          tier: 2,
          logged_by_user_id: SYSTEM_USER_SENTINEL,
          occurred_at: new Date(),
          location: null,
          author_masked: false,
          parent_shareable: false,
          legal_hold: false,
          imported: false,
          follow_up_needed: true,
          follow_up_suggestion: 'Review flagged self-check-in',
        },
      });

      // 5b. Update the checkin record
      await db.studentCheckin.update({
        where: { id: checkinId },
        data: {
          flagged: true,
          flag_reason: flagReason,
          auto_concern_id: concern.id,
        },
      });

      return concern.id;
    }) as string;

    // 5c. Record audit event (fire-and-forget)
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'checkin_alert_generated',
      entity_type: 'checkin',
      entity_id: checkinId,
      student_id: studentId,
      actor_user_id: SYSTEM_USER_SENTINEL,
      tier: 2,
      payload: {
        checkin_id: checkinId,
        student_id: studentId,
        flag_reason: flagReason,
        auto_concern_id: concernId,
      },
      ip_address: null,
    });

    // 5d. Determine notification timing
    const now = new Date();
    const withinHours = this.isWithinMonitoringHours(
      monitoring_hours_start,
      monitoring_hours_end,
      monitoring_days,
      now,
    );

    const jobPayload: Record<string, unknown> = {
      tenant_id: tenantId,
      checkin_id: checkinId,
      student_id: studentId,
      flag_reason: flagReason,
      monitoring_owner_user_ids: monitoring_owner_user_ids,
    };

    if (!withinHours) {
      // Schedule for next monitoring hours start
      jobPayload.deliver_after = this.getNextMonitoringStart(
        monitoring_hours_start,
        monitoring_days,
        now,
      );
    }

    await this.notificationsQueue.add(
      'pastoral:checkin-alert-notification',
      jobPayload,
    );

    return {
      was_flagged: true,
      flag_reason: flagReason,
      generated_concern_id: concernId,
    };
  }

  // ─── Private: Keyword Matching ────────────────────────────────────────────

  /**
   * Case-insensitive, word-boundary-aware scan of text against keywords.
   * Returns first matched keyword or null.
   */
  matchKeywords(text: string, keywords: string[]): string | null {
    for (const keyword of keywords) {
      // Escape special regex characters in the keyword
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(text)) {
        return keyword;
      }
    }
    return null;
  }

  // ─── Private: Consecutive Low Detection ───────────────────────────────────

  /**
   * Query last N check-ins by checkin_date DESC. If ALL have mood_score <=
   * lowMoodScore, return true. Current check-in is already persisted.
   */
  async detectConsecutiveLow(
    tenantId: string,
    studentId: string,
    threshold: number,
    lowMoodScore: number,
  ): Promise<boolean> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const checkins = await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.studentCheckin.findMany({
        where: { tenant_id: tenantId, student_id: studentId },
        orderBy: { checkin_date: 'desc' },
        take: threshold,
        select: { mood_score: true },
      });
    }) as Array<{ mood_score: number }>;

    // Fewer than threshold check-ins exist
    if (checkins.length < threshold) {
      return false;
    }

    // ALL must have mood_score <= lowMoodScore
    return checkins.every((c) => c.mood_score <= lowMoodScore);
  }

  // ─── Private: Monitoring Hours Check ──────────────────────────────────────

  /**
   * Determines whether the current time falls within monitoring hours
   * and on a monitoring day.
   *
   * @param monitoringHoursStart - "HH:MM" format
   * @param monitoringHoursEnd - "HH:MM" format
   * @param monitoringDays - array of day numbers (0=Sunday, 1=Monday, etc.)
   * @param now - current Date
   */
  isWithinMonitoringHours(
    monitoringHoursStart: string,
    monitoringHoursEnd: string,
    monitoringDays: number[],
    now: Date,
  ): boolean {
    // Check day of week
    const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, etc.
    if (!monitoringDays.includes(dayOfWeek)) {
      return false;
    }

    // Parse HH:MM
    const [startH, startM] = monitoringHoursStart.split(':').map(Number) as [number, number];
    const [endH, endM] = monitoringHoursEnd.split(':').map(Number) as [number, number];

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  // ─── Private: Next Monitoring Start ───────────────────────────────────────

  private getNextMonitoringStart(
    monitoringHoursStart: string,
    monitoringDays: number[],
    now: Date,
  ): string {
    const [startH, startM] = monitoringHoursStart.split(':').map(Number) as [number, number];

    // Start from tomorrow and find the next monitoring day
    const result = new Date(now);
    result.setDate(result.getDate() + 1);
    result.setHours(startH, startM, 0, 0);

    // Find next monitoring day (max 7 days ahead)
    for (let i = 0; i < 7; i++) {
      if (monitoringDays.includes(result.getDay())) {
        return result.toISOString();
      }
      result.setDate(result.getDate() + 1);
    }

    // Fallback: return tomorrow's start (should never reach here if monitoringDays is valid)
    const fallback = new Date(now);
    fallback.setDate(fallback.getDate() + 1);
    fallback.setHours(startH, startM, 0, 0);
    return fallback.toISOString();
  }

  // ─── Private: Load Checkin Settings ───────────────────────────────────────

  private async loadCheckinSettings(tenantId: string) {
    const record = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    const settingsJson = (record?.settings as Record<string, unknown>) ?? {};
    const pastoralRaw = (settingsJson.pastoral as Record<string, unknown>) ?? {};
    const parsed = pastoralTenantSettingsSchema.parse(pastoralRaw);

    return parsed.checkins;
  }
}
