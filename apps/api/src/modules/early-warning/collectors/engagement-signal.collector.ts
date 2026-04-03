import { Injectable } from '@nestjs/common';

import type { DetectedSignal, SignalResult } from '@school/shared/early-warning';

import { PrismaService } from '../../prisma/prisma.service';

import { buildSignal } from './collector-utils';

// ─── Constants ──────────────────────────────────────────────────────────────

const LOOKBACK_DAYS = 30;
const WEEKS_TO_TRACK = 4;
const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

// ─── Internal Types ─────────────────────────────────────────────────────────

interface ParentUserMapping {
  parentId: string;
  userId: string;
}

interface NotificationRow {
  id: string;
  recipient_user_id: string;
  read_at: Date | null;
  created_at: Date;
}

interface UserRow {
  id: string;
  last_login_at: Date | null;
}

interface ParentInquiryRow {
  id: string;
}

interface AcknowledgementRow {
  id: string;
  parent_id: string;
  sent_at: Date;
  acknowledged_at: Date | null;
}

interface AcademicYearRow {
  id: string;
  start_date: Date;
  end_date: Date;
}

// ─── Collector ──────────────────────────────────────────────────────────────

@Injectable()
export class EngagementSignalCollector {
  constructor(private readonly prisma: PrismaService) {}

  async collectSignals(
    tenantId: string,
    studentId: string,
    academicYearId: string,
  ): Promise<SignalResult> {
    const signals: DetectedSignal[] = [];

    // ─── Resolve parent user IDs ──────────────────────────────────────────────
    const parentUsers = await this.resolveParentUsers(tenantId, studentId);

    if (parentUsers.length === 0) {
      return { domain: 'engagement', rawScore: 0, signals: [], summaryFragments: [] };
    }

    const userIds = parentUsers.map((p) => p.userId);
    const parentIds = parentUsers.map((p) => p.parentId);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - LOOKBACK_DAYS * MS_PER_DAY);

    // ─── Fetch all data in parallel ───────────────────────────────────────────
    const [notifications, users, inquiryCount, acknowledgements, academicYear] = await Promise.all([
      this.fetchNotifications(tenantId, userIds, thirtyDaysAgo),
      this.fetchUsers(userIds),
      this.fetchParentInquiryCount(tenantId, parentIds, academicYearId),
      this.fetchAcknowledgements(tenantId, parentIds, thirtyDaysAgo),
      this.fetchAcademicYear(tenantId, academicYearId),
    ]);

    // ─── Signal 1: low_notification_read_rate ─────────────────────────────────
    this.checkNotificationReadRate(notifications, parentUsers, signals);

    // ─── Signal 2: no_portal_login ────────────────────────────────────────────
    this.checkNoPortalLogin(users, parentUsers, now, signals);

    // ─── Signal 3: no_parent_inquiry ──────────────────────────────────────────
    this.checkNoParentInquiry(inquiryCount, academicYear, now, studentId, signals);

    // ─── Signal 4: slow_acknowledgement ───────────────────────────────────────
    this.checkSlowAcknowledgement(acknowledgements, parentUsers, signals);

    // ─── Signal 5: disengagement_trajectory ───────────────────────────────────
    this.checkDisengagementTrajectory(notifications, parentUsers, now, signals);

    // ─── Build result ─────────────────────────────────────────────────────────
    const rawScore = Math.min(
      100,
      signals.reduce((sum, s) => sum + s.scoreContribution, 0),
    );

    return {
      domain: 'engagement',
      rawScore,
      signals,
      summaryFragments: signals.map((s) => s.summaryFragment),
    };
  }

  // ─── Data Fetchers ──────────────────────────────────────────────────────────

  private async resolveParentUsers(
    tenantId: string,
    studentId: string,
  ): Promise<ParentUserMapping[]> {
    const studentParents = await this.prisma.studentParent.findMany({
      where: { student_id: studentId, tenant_id: tenantId },
      include: { parent: { select: { id: true, user_id: true } } },
    });

    const mappings: ParentUserMapping[] = [];
    for (const sp of studentParents) {
      const parent = sp.parent as { id: string; user_id: string | null };
      if (parent.user_id) {
        mappings.push({ parentId: parent.id, userId: parent.user_id });
      }
    }
    return mappings;
  }

  private async fetchNotifications(
    tenantId: string,
    userIds: string[],
    since: Date,
  ): Promise<NotificationRow[]> {
    return this.prisma.notification.findMany({
      where: {
        tenant_id: tenantId,
        recipient_user_id: { in: userIds },
        channel: 'in_app',
        created_at: { gte: since },
      },
      select: {
        id: true,
        recipient_user_id: true,
        read_at: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  private async fetchUsers(userIds: string[]): Promise<UserRow[]> {
    // User has NO tenant_id — platform-level table
    return this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, last_login_at: true },
    });
  }

  private async fetchParentInquiryCount(
    tenantId: string,
    parentIds: string[],
    academicYearId: string,
  ): Promise<number> {
    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id: academicYearId, tenant_id: tenantId },
      select: { start_date: true, end_date: true },
    });

    if (!academicYear) return 0;

    const inquiries: ParentInquiryRow[] = await this.prisma.parentInquiry.findMany({
      where: {
        tenant_id: tenantId,
        parent_id: { in: parentIds },
        created_at: {
          gte: academicYear.start_date,
          lte: academicYear.end_date,
        },
      },
      select: { id: true },
    });

    return inquiries.length;
  }

  private async fetchAcknowledgements(
    tenantId: string,
    parentIds: string[],
    since: Date,
  ): Promise<AcknowledgementRow[]> {
    return this.prisma.behaviourParentAcknowledgement.findMany({
      where: {
        tenant_id: tenantId,
        parent_id: { in: parentIds },
        sent_at: { gte: since },
      },
      select: {
        id: true,
        parent_id: true,
        sent_at: true,
        acknowledged_at: true,
      },
    });
  }

  private async fetchAcademicYear(
    tenantId: string,
    academicYearId: string,
  ): Promise<AcademicYearRow | null> {
    return this.prisma.academicYear.findFirst({
      where: { id: academicYearId, tenant_id: tenantId },
      select: { id: true, start_date: true, end_date: true },
    });
  }

  // ─── Signal 1: low_notification_read_rate ──────────────────────────────────

  private checkNotificationReadRate(
    notifications: NotificationRow[],
    parentUsers: ParentUserMapping[],
    signals: DetectedSignal[],
  ): void {
    if (notifications.length === 0) return;

    // Compute per-parent read rate, pick the best
    let bestRate = -1;
    let bestRead = 0;
    let bestTotal = 0;
    let bestUserId = '';

    for (const pu of parentUsers) {
      const parentNotifs = notifications.filter((n) => n.recipient_user_id === pu.userId);
      if (parentNotifs.length === 0) continue;

      const readCount = parentNotifs.filter((n) => n.read_at !== null).length;
      const rate = Math.round((readCount / parentNotifs.length) * 100);

      if (rate > bestRate) {
        bestRate = rate;
        bestRead = readCount;
        bestTotal = parentNotifs.length;
        bestUserId = pu.userId;
      }
    }

    if (bestRate < 0 || bestRate >= 30) return;

    let scoreContribution: number;
    if (bestRate >= 15) {
      scoreContribution = 10;
    } else if (bestRate >= 1) {
      scoreContribution = 15;
    } else {
      scoreContribution = 20;
    }

    // Source: most recent unread notification for best parent
    const unread = notifications.find(
      (n) => n.recipient_user_id === bestUserId && n.read_at === null,
    );
    const firstNotif = notifications[0];
    const sourceId = unread?.id ?? firstNotif?.id ?? '';

    signals.push(
      buildSignal({
        signalType: 'low_notification_read_rate',
        scoreContribution,
        details: { bestRate, read: bestRead, total: bestTotal },
        sourceEntityType: 'Notification',
        sourceEntityId: sourceId,
        summaryFragment: `Parent notification read rate: ${bestRate}% (${bestRead}/${bestTotal} in 30 days)`,
      }),
    );
  }

  // ─── Signal 2: no_portal_login ─────────────────────────────────────────────

  private checkNoPortalLogin(
    users: UserRow[],
    parentUsers: ParentUserMapping[],
    now: Date,
    signals: DetectedSignal[],
  ): void {
    // Find the most recent login across all parent users
    let bestLoginDate: Date | null = null;
    let bestUserId = '';

    for (const pu of parentUsers) {
      const user = users.find((u) => u.id === pu.userId);
      if (!user) continue;

      if (user.last_login_at) {
        if (!bestLoginDate || user.last_login_at > bestLoginDate) {
          bestLoginDate = user.last_login_at;
          bestUserId = pu.userId;
        }
      }
    }

    // If no user has ever logged in, use the first parent's userId
    const firstParent = parentUsers[0];
    if (!bestUserId && firstParent) {
      bestUserId = firstParent.userId;
    }

    const daysSince = bestLoginDate
      ? Math.floor((now.getTime() - bestLoginDate.getTime()) / MS_PER_DAY)
      : Infinity;

    if (daysSince < 21) return;

    let scoreContribution: number;
    if (daysSince <= 30) {
      scoreContribution = 15;
    } else if (daysSince <= 60) {
      scoreContribution = 20;
    } else {
      scoreContribution = 25;
    }

    const displayDays = daysSince === Infinity ? 'never' : `${daysSince}`;
    const summaryText =
      daysSince === Infinity
        ? 'No parent portal login ever recorded'
        : `No parent portal login in ${daysSince} days`;

    signals.push(
      buildSignal({
        signalType: 'no_portal_login',
        scoreContribution,
        details: { daysSince: displayDays },
        sourceEntityType: 'User',
        sourceEntityId: bestUserId,
        summaryFragment: summaryText,
      }),
    );
  }

  // ─── Signal 3: no_parent_inquiry ───────────────────────────────────────────

  private checkNoParentInquiry(
    inquiryCount: number,
    academicYear: AcademicYearRow | null,
    now: Date,
    studentId: string,
    signals: DetectedSignal[],
  ): void {
    if (inquiryCount > 0 || !academicYear) return;

    const yearStartMs = new Date(academicYear.start_date).getTime();
    const monthsElapsed = Math.floor((now.getTime() - yearStartMs) / (MS_PER_DAY * 30));

    let scoreContribution: number;
    if (monthsElapsed > 6) {
      scoreContribution = 15;
    } else if (monthsElapsed >= 3) {
      scoreContribution = 10;
    } else {
      scoreContribution = 5;
    }

    signals.push(
      buildSignal({
        signalType: 'no_parent_inquiry',
        scoreContribution,
        details: { monthsElapsed },
        sourceEntityType: 'Student',
        sourceEntityId: studentId,
        summaryFragment: 'No parent-initiated inquiries this academic year',
      }),
    );
  }

  // ─── Signal 4: slow_acknowledgement ────────────────────────────────────────

  private checkSlowAcknowledgement(
    acknowledgements: AcknowledgementRow[],
    parentUsers: ParentUserMapping[],
    signals: DetectedSignal[],
  ): void {
    if (acknowledgements.length === 0) return;

    // Compute per-parent average response time, pick the best (fastest)
    let bestAvgHours = Infinity;
    const firstAck = acknowledgements[0];
    let slowestAckId = firstAck?.id ?? '';

    for (const pu of parentUsers) {
      const parentAcks = acknowledgements.filter((a) => a.parent_id === pu.parentId);
      if (parentAcks.length === 0) continue;

      let totalHours = 0;
      let countWithResponse = 0;
      let hasUnacknowledged = false;

      for (const ack of parentAcks) {
        if (ack.acknowledged_at) {
          const hours =
            (new Date(ack.acknowledged_at).getTime() - new Date(ack.sent_at).getTime()) /
            MS_PER_HOUR;
          totalHours += hours;
          countWithResponse++;
        } else {
          hasUnacknowledged = true;
        }
      }

      let avgHours: number;
      if (countWithResponse > 0) {
        avgHours = totalHours / countWithResponse;
      } else if (hasUnacknowledged) {
        // All sent but none acknowledged — treat as never
        avgHours = Infinity;
      } else {
        continue;
      }

      if (avgHours < bestAvgHours) {
        bestAvgHours = avgHours;
      }
    }

    if (bestAvgHours < 72) return;

    let scoreContribution: number;
    if (bestAvgHours === Infinity) {
      scoreContribution = 20;
    } else if (bestAvgHours > 168) {
      scoreContribution = 20;
    } else if (bestAvgHours > 120) {
      scoreContribution = 15;
    } else {
      scoreContribution = 10;
    }

    // Source: slowest (longest response time) acknowledgement across all parents
    let slowestTime = -1;
    for (const ack of acknowledgements) {
      if (ack.acknowledged_at) {
        const time = new Date(ack.acknowledged_at).getTime() - new Date(ack.sent_at).getTime();
        if (time > slowestTime) {
          slowestTime = time;
          slowestAckId = ack.id;
        }
      } else {
        // Unacknowledged is the "slowest" by definition
        slowestAckId = ack.id;
        slowestTime = Infinity;
      }
    }

    const displayHours = bestAvgHours === Infinity ? 'never' : `${Math.round(bestAvgHours)}`;

    signals.push(
      buildSignal({
        signalType: 'slow_acknowledgement',
        scoreContribution,
        details: { avgHours: displayHours },
        sourceEntityType: 'BehaviourParentAcknowledgement',
        sourceEntityId: slowestAckId,
        summaryFragment:
          bestAvgHours === Infinity
            ? 'Behaviour acknowledgements never acknowledged'
            : `Average behaviour acknowledgement time: ${Math.round(bestAvgHours)} hours`,
      }),
    );
  }

  // ─── Signal 5: disengagement_trajectory ────────────────────────────────────

  private checkDisengagementTrajectory(
    notifications: NotificationRow[],
    parentUsers: ParentUserMapping[],
    now: Date,
    signals: DetectedSignal[],
  ): void {
    if (notifications.length === 0) return;

    // Compute weekly read rates per parent for last 4 weeks, use best parent
    let bestWeeklyRates: number[] = [];

    for (const pu of parentUsers) {
      const parentNotifs = notifications.filter((n) => n.recipient_user_id === pu.userId);
      if (parentNotifs.length === 0) continue;

      const weeklyRates = computeWeeklyReadRates(parentNotifs, now, WEEKS_TO_TRACK);

      // "Best" parent = the one with fewer consecutive declining weeks
      // But we need per-parent rates to check decline. Pick the parent with
      // highest average rate (most engaged).
      const avg = weeklyRates.reduce((sum, r) => sum + r, 0) / weeklyRates.length;
      const bestAvg =
        bestWeeklyRates.length > 0
          ? bestWeeklyRates.reduce((sum, r) => sum + r, 0) / bestWeeklyRates.length
          : -1;

      if (avg > bestAvg) {
        bestWeeklyRates = weeklyRates;
      }
    }

    if (bestWeeklyRates.length < 2) return;

    // Count consecutive declining weeks
    let consecutiveDeclines = 0;
    for (let i = 1; i < bestWeeklyRates.length; i++) {
      const current = bestWeeklyRates[i];
      const previous = bestWeeklyRates[i - 1];
      if (current !== undefined && previous !== undefined && current < previous) {
        consecutiveDeclines++;
      } else {
        consecutiveDeclines = 0;
      }
    }

    if (consecutiveDeclines < 3) return;

    const scoreContribution = consecutiveDeclines >= 4 ? 20 : 10;

    // Source: most recent notification
    const mostRecent = notifications[0];
    if (!mostRecent) return;

    signals.push(
      buildSignal({
        signalType: 'disengagement_trajectory',
        scoreContribution,
        details: {
          consecutiveDeclines,
          weeklyRates: bestWeeklyRates,
        },
        sourceEntityType: 'Notification',
        sourceEntityId: mostRecent.id,
        summaryFragment: `Parent engagement declining over ${consecutiveDeclines} consecutive weeks`,
      }),
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute weekly read rates for a set of notifications over the last N weeks.
 * Returns rates in chronological order (oldest week first).
 * Weeks with no notifications are treated as 100% (no data = no concern).
 */
function computeWeeklyReadRates(
  notifications: NotificationRow[],
  now: Date,
  weekCount: number,
): number[] {
  const rates: number[] = [];

  for (let w = weekCount - 1; w >= 0; w--) {
    const weekEnd = new Date(now.getTime() - w * 7 * MS_PER_DAY);
    const weekStart = new Date(weekEnd.getTime() - 6 * MS_PER_DAY);

    const weekNotifs = notifications.filter((n) => {
      const d = new Date(n.created_at);
      return d >= weekStart && d <= weekEnd;
    });

    if (weekNotifs.length === 0) {
      rates.push(100);
      continue;
    }

    const readCount = weekNotifs.filter((n) => n.read_at !== null).length;
    rates.push(Math.round((readCount / weekNotifs.length) * 100));
  }

  return rates;
}
