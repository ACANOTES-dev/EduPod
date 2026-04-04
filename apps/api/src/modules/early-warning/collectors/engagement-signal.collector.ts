import { Injectable } from '@nestjs/common';

import type { DetectedSignal, SignalResult } from '@school/shared/early-warning';

import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { AuthReadFacade } from '../../auth/auth-read.facade';
import type { BehaviourParentAcknowledgementRow } from '../../behaviour/behaviour-read.facade';
import { BehaviourReadFacade } from '../../behaviour/behaviour-read.facade';
import type { NotificationMinimalRow } from '../../communications/communications-read.facade';
import { CommunicationsReadFacade } from '../../communications/communications-read.facade';
import { ParentInquiriesReadFacade } from '../../parent-inquiries/parent-inquiries-read.facade';
import { ParentReadFacade } from '../../parents/parent-read.facade';

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

interface UserRow {
  id: string;
  last_login_at: Date | null;
}

interface AcademicYearRow {
  id: string;
  start_date: Date;
  end_date: Date;
}

// ─── Collector ──────────────────────────────────────────────────────────────

@Injectable()
export class EngagementSignalCollector {
  constructor(
    private readonly parentReadFacade: ParentReadFacade,
    private readonly communicationsReadFacade: CommunicationsReadFacade,
    private readonly authReadFacade: AuthReadFacade,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly parentInquiriesReadFacade: ParentInquiriesReadFacade,
    private readonly behaviourReadFacade: BehaviourReadFacade,
  ) {}

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
      this.fetchAcknowledgements(tenantId, studentId),
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
    const parentIdRows = await this.parentReadFacade.findParentUserIdsForStudent(
      tenantId,
      studentId,
    );

    const mappings: ParentUserMapping[] = [];
    for (const row of parentIdRows) {
      if (row.user_id) {
        mappings.push({ parentId: row.id, userId: row.user_id });
      }
    }
    return mappings;
  }

  private async fetchNotifications(
    tenantId: string,
    userIds: string[],
    since: Date,
  ): Promise<NotificationMinimalRow[]> {
    return this.communicationsReadFacade.findInAppNotificationsForUsers(tenantId, userIds, since);
  }

  private async fetchUsers(userIds: string[]): Promise<UserRow[]> {
    return this.authReadFacade.findUsersWithLoginInfo(userIds);
  }

  private async fetchParentInquiryCount(
    tenantId: string,
    parentIds: string[],
    academicYearId: string,
  ): Promise<number> {
    const academicYear = await this.academicReadFacade.findYearById(tenantId, academicYearId);
    if (!academicYear) return 0;

    const inquiries = await this.parentInquiriesReadFacade.findByParentIds(
      tenantId,
      parentIds,
      { from: academicYear.start_date, to: academicYear.end_date },
    );

    return inquiries.length;
  }

  private async fetchAcknowledgements(
    tenantId: string,
    studentId: string,
  ): Promise<BehaviourParentAcknowledgementRow[]> {
    return this.behaviourReadFacade.findParentAcknowledgements(tenantId, studentId, LOOKBACK_DAYS);
  }

  private async fetchAcademicYear(
    tenantId: string,
    academicYearId: string,
  ): Promise<AcademicYearRow | null> {
    return this.academicReadFacade.findYearById(tenantId, academicYearId);
  }

  // ─── Signal 1: low_notification_read_rate ──────────────────────────────────

  private checkNotificationReadRate(
    notifications: NotificationMinimalRow[],
    parentUsers: ParentUserMapping[],
    signals: DetectedSignal[],
  ): void {
    if (notifications.length === 0) return;

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
    acknowledgements: BehaviourParentAcknowledgementRow[],
    parentUsers: ParentUserMapping[],
    signals: DetectedSignal[],
  ): void {
    if (acknowledgements.length === 0) return;

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

    let slowestTime = -1;
    for (const ack of acknowledgements) {
      if (ack.acknowledged_at) {
        const time = new Date(ack.acknowledged_at).getTime() - new Date(ack.sent_at).getTime();
        if (time > slowestTime) {
          slowestTime = time;
          slowestAckId = ack.id;
        }
      } else {
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
    notifications: NotificationMinimalRow[],
    parentUsers: ParentUserMapping[],
    now: Date,
    signals: DetectedSignal[],
  ): void {
    if (notifications.length === 0) return;

    let bestWeeklyRates: number[] = [];

    for (const pu of parentUsers) {
      const parentNotifs = notifications.filter((n) => n.recipient_user_id === pu.userId);
      if (parentNotifs.length === 0) continue;

      const weeklyRates = computeWeeklyReadRates(parentNotifs, now, WEEKS_TO_TRACK);

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

function computeWeeklyReadRates(
  notifications: NotificationMinimalRow[],
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
