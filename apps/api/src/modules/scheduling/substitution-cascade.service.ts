import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SubstitutionOfferStatus } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { SubstitutionService } from './substitution.service';

interface AbsenceRow {
  id: string;
  tenant_id: string;
  staff_profile_id: string;
  absence_date: Date;
  date_to: Date | null;
  full_day: boolean;
  period_from: number | null;
  period_to: number | null;
  nominated_substitute_id: string | null;
  cancelled_at: Date | null;
}

interface TenantSettings {
  offer_timeout_minutes: number;
  parallel_offer_count: number;
  auto_cascade_enabled: boolean;
}

const DEFAULT_SETTINGS: TenantSettings = {
  offer_timeout_minutes: 30,
  parallel_offer_count: 3,
  auto_cascade_enabled: true,
};

/**
 * Orchestrates the life of a substitution offer.
 *
 * Runs synchronously for now — called inline after an absence is created or
 * an offer is declined. A future BullMQ processor can replace the inline path
 * if cascade latency becomes a concern. The state machine + first-accept-wins
 * logic already treats each transition as atomic.
 */
@Injectable()
export class SubstitutionCascadeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly substitutionService: SubstitutionService,
    private readonly schedulesReadFacade: SchedulesReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  // ─── Entry point: run a full cascade for an absence ───────────────────────

  async runCascade(tenantId: string, absenceId: string, opts: { cascadeRound?: number } = {}) {
    const absence = await this.loadAbsence(tenantId, absenceId);
    if (!absence || absence.cancelled_at) return { offers_created: 0 };

    const settings = await this.loadSettings(tenantId);
    if (!settings.auto_cascade_enabled) return { offers_created: 0 };

    const round = opts.cascadeRound ?? 1;
    const expiresAt = new Date(Date.now() + settings.offer_timeout_minutes * 60 * 1000);

    let totalOffers = 0;
    for (const day of this.enumerateDays(absence.absence_date, absence.date_to)) {
      const slots = await this.findAffectedSchedules(tenantId, absence, day);
      for (const slot of slots) {
        // Skip if this slot already has a confirmed assignment.
        const existingConfirmed = await this.prisma.substitutionRecord.findFirst({
          where: {
            tenant_id: tenantId,
            absence_id: absenceId,
            schedule_id: slot.id,
            absence_date: day,
            status: { in: ['assigned', 'confirmed'] },
          },
        });
        if (existingConfirmed) continue;

        // Determine candidates: nomination on round 1, otherwise top-N rank.
        let candidates: string[];
        let isNomination = false;
        if (round === 1 && absence.nominated_substitute_id) {
          candidates = [absence.nominated_substitute_id];
          isNomination = true;
        } else {
          const suggestions = await this.substitutionService.findEligibleSubstitutes(
            tenantId,
            slot.id,
            day.toISOString().slice(0, 10),
          );
          candidates = suggestions.data
            .filter((c) => c.is_available)
            .slice(0, settings.parallel_offer_count)
            .map((c) => c.staff_profile_id);
        }

        // Skip candidates who already have a live pending offer for this slot/day.
        const alreadyOffered = await this.prisma.substitutionOffer.findMany({
          where: {
            tenant_id: tenantId,
            absence_id: absenceId,
            schedule_id: slot.id,
            absence_date: day,
            status: 'pending',
          },
          select: { candidate_staff_id: true },
        });
        const blocked = new Set(alreadyOffered.map((o) => o.candidate_staff_id));
        const fresh = candidates.filter((id) => !blocked.has(id));

        if (fresh.length === 0) continue;

        const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
        await prismaWithRls.$transaction(async (tx) => {
          const db = tx as unknown as PrismaService;
          for (const candidateId of fresh) {
            await db.substitutionOffer.create({
              data: {
                tenant_id: tenantId,
                absence_id: absenceId,
                schedule_id: slot.id,
                absence_date: day,
                candidate_staff_id: candidateId,
                expires_at: expiresAt,
                status: 'pending',
                is_nomination: isNomination,
                cascade_round: round,
              },
            });
            totalOffers += 1;
          }
        });
      }
    }

    return { offers_created: totalOffers };
  }

  // ─── Accept / Decline ─────────────────────────────────────────────────────

  async acceptOffer(tenantId: string, userId: string, offerId: string) {
    const staff = await this.staffProfileReadFacade.findByUserId(tenantId, userId);
    if (!staff) {
      throw new ForbiddenException({
        error: { code: 'NO_STAFF_PROFILE', message: 'No staff profile linked to user' },
      });
    }

    const offer = await this.prisma.substitutionOffer.findFirst({
      where: { tenant_id: tenantId, id: offerId },
    });
    if (!offer) {
      throw new NotFoundException({
        error: { code: 'OFFER_NOT_FOUND', message: `Offer "${offerId}" not found` },
      });
    }
    if (offer.candidate_staff_id !== staff.id) {
      throw new ForbiddenException({
        error: { code: 'NOT_YOUR_OFFER', message: 'This offer was not sent to you' },
      });
    }
    if (offer.status !== 'pending') {
      throw new ConflictException({
        error: { code: 'OFFER_NOT_PENDING', message: `Offer is ${offer.status}` },
      });
    }
    if (offer.expires_at.getTime() < Date.now()) {
      throw new ConflictException({
        error: { code: 'OFFER_EXPIRED', message: 'This offer has expired' },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // First-accept-wins: check if another offer for the same slot+day was
      // already accepted in the moment between the outer read and this tx.
      const sibling = await db.substitutionOffer.findFirst({
        where: {
          tenant_id: tenantId,
          absence_id: offer.absence_id,
          schedule_id: offer.schedule_id,
          absence_date: offer.absence_date,
          status: 'accepted',
          id: { not: offerId },
        },
      });
      if (sibling) {
        throw new ConflictException({
          error: {
            code: 'SLOT_ALREADY_FILLED',
            message: 'Another teacher accepted this slot first',
          },
        });
      }

      // Mark this offer accepted.
      await db.substitutionOffer.update({
        where: { id: offerId },
        data: { status: 'accepted', responded_at: new Date() },
      });

      // Revoke sibling pending offers for the same slot+day.
      await db.substitutionOffer.updateMany({
        where: {
          tenant_id: tenantId,
          absence_id: offer.absence_id,
          schedule_id: offer.schedule_id,
          absence_date: offer.absence_date,
          status: 'pending',
          id: { not: offerId },
        },
        data: { status: 'revoked', responded_at: new Date() },
      });

      // Create the SubstitutionRecord.
      const record = await db.substitutionRecord.create({
        data: {
          tenant_id: tenantId,
          absence_id: offer.absence_id,
          schedule_id: offer.schedule_id,
          substitute_staff_id: staff.id,
          offer_id: offerId,
          absence_date: offer.absence_date,
          source: offer.is_nomination ? 'nomination' : 'cascade',
          status: 'assigned',
          assigned_by_user_id: userId,
          assigned_at: new Date(),
        },
      });

      return { record_id: record.id };
    })) as { record_id: string };

    return { id: offerId, status: 'accepted', record_id: result.record_id };
  }

  async declineOffer(tenantId: string, userId: string, offerId: string, reason: string | null) {
    const staff = await this.staffProfileReadFacade.findByUserId(tenantId, userId);
    if (!staff) {
      throw new ForbiddenException({
        error: { code: 'NO_STAFF_PROFILE', message: 'No staff profile linked to user' },
      });
    }

    const offer = await this.prisma.substitutionOffer.findFirst({
      where: { tenant_id: tenantId, id: offerId },
    });
    if (!offer) {
      throw new NotFoundException({
        error: { code: 'OFFER_NOT_FOUND', message: `Offer "${offerId}" not found` },
      });
    }
    if (offer.candidate_staff_id !== staff.id) {
      throw new ForbiddenException({
        error: { code: 'NOT_YOUR_OFFER', message: 'This offer was not sent to you' },
      });
    }
    if (offer.status !== 'pending') {
      throw new ConflictException({
        error: { code: 'OFFER_NOT_PENDING', message: `Offer is ${offer.status}` },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.substitutionOffer.update({
        where: { id: offerId },
        data: {
          status: 'declined',
          responded_at: new Date(),
          decline_reason: reason,
        },
      });
    });

    // If all pending siblings for this slot are now terminal, trigger next cascade
    // round. Skip if this was a nomination decline — Decision 9 escalates to admin.
    if (!offer.is_nomination) {
      const stillPending = await this.prisma.substitutionOffer.count({
        where: {
          tenant_id: tenantId,
          absence_id: offer.absence_id,
          schedule_id: offer.schedule_id,
          absence_date: offer.absence_date,
          status: 'pending',
        },
      });
      if (stillPending === 0) {
        await this.runCascade(tenantId, offer.absence_id, {
          cascadeRound: offer.cascade_round + 1,
        });
      }
    }

    return { id: offerId, status: 'declined' };
  }

  // ─── Expiry (lazy — called from list endpoints; can be cron'd later) ──────

  async expireStaleOffers(tenantId: string) {
    const now = new Date();
    const stale = await this.prisma.substitutionOffer.findMany({
      where: {
        tenant_id: tenantId,
        status: 'pending',
        expires_at: { lt: now },
      },
      select: {
        id: true,
        absence_id: true,
        schedule_id: true,
        absence_date: true,
        is_nomination: true,
        cascade_round: true,
      },
    });
    if (stale.length === 0) return { expired: 0 };

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.substitutionOffer.updateMany({
        where: { id: { in: stale.map((s) => s.id) } },
        data: { status: 'expired', responded_at: now },
      });
    });

    // For each slot where all offers are now terminal, enqueue the next cascade
    // round (unless the expired offer was a nomination — Decision 9 escalates).
    const bySlot = new Map<string, (typeof stale)[number]>();
    for (const s of stale) {
      const key = `${s.absence_id}-${s.schedule_id}-${s.absence_date.toISOString()}`;
      if (!bySlot.has(key)) bySlot.set(key, s);
    }
    for (const s of bySlot.values()) {
      if (s.is_nomination) continue;
      const pending = await this.prisma.substitutionOffer.count({
        where: {
          tenant_id: tenantId,
          absence_id: s.absence_id,
          schedule_id: s.schedule_id,
          absence_date: s.absence_date,
          status: 'pending',
        },
      });
      if (pending === 0) {
        await this.runCascade(tenantId, s.absence_id, { cascadeRound: s.cascade_round + 1 });
      }
    }

    return { expired: stale.length };
  }

  // ─── Cancel all offers for an absence (called when absence cancelled) ────

  async revokeOffersForAbsence(tenantId: string, absenceId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.substitutionOffer.updateMany({
        where: {
          tenant_id: tenantId,
          absence_id: absenceId,
          status: 'pending',
        },
        data: { status: 'revoked', responded_at: new Date() },
      });
      await db.substitutionRecord.updateMany({
        where: {
          tenant_id: tenantId,
          absence_id: absenceId,
          status: { in: ['assigned', 'confirmed'] },
        },
        data: { status: 'revoked' },
      });
    });
  }

  // ─── List offers for a teacher ────────────────────────────────────────────

  async listMyOffers(tenantId: string, userId: string) {
    // Lazily expire stale ones before reading.
    await this.expireStaleOffers(tenantId);

    const staff = await this.staffProfileReadFacade.findByUserId(tenantId, userId);
    if (!staff) return { data: [] };

    const offers = await this.prisma.substitutionOffer.findMany({
      where: {
        tenant_id: tenantId,
        candidate_staff_id: staff.id,
        status: { in: ['pending', 'accepted'] },
      },
      include: {
        absence: {
          include: {
            staff_profile: { include: { user: true } },
          },
        },
        schedule: {
          include: {
            class_entity: { include: { subject: true } },
            room: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { absence_date: 'asc' }, { offered_at: 'asc' }],
    });

    return {
      data: offers.map((o) => {
        const reporter = o.absence.staff_profile?.user;
        const cls = o.schedule.class_entity;
        return {
          id: o.id,
          status: o.status,
          absence_date: o.absence_date.toISOString().slice(0, 10),
          expires_at: o.expires_at.toISOString(),
          is_nomination: o.is_nomination,
          absent_teacher_name: reporter ? `${reporter.first_name} ${reporter.last_name}` : null,
          class_name: cls?.name ?? null,
          subject_name: cls?.subject?.name ?? null,
          room_name: o.schedule.room?.name ?? null,
          start_time: o.schedule.start_time.toISOString().slice(11, 16),
          end_time: o.schedule.end_time.toISOString().slice(11, 16),
        };
      }),
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async loadAbsence(tenantId: string, absenceId: string): Promise<AbsenceRow | null> {
    const absence = await this.prisma.teacherAbsence.findFirst({
      where: { tenant_id: tenantId, id: absenceId },
    });
    return absence as AbsenceRow | null;
  }

  private async loadSettings(tenantId: string): Promise<TenantSettings> {
    const row = await this.prisma.tenantSchedulingSettings.findFirst({
      where: { tenant_id: tenantId },
    });
    if (!row) return DEFAULT_SETTINGS;
    return {
      offer_timeout_minutes: row.offer_timeout_minutes,
      parallel_offer_count: row.parallel_offer_count,
      auto_cascade_enabled: row.auto_cascade_enabled,
    };
  }

  private enumerateDays(start: Date, end: Date | null): Date[] {
    if (!end || start.getTime() === end.getTime()) return [this.atUtcMidnight(start)];
    const days: Date[] = [];
    const cur = this.atUtcMidnight(start);
    const stop = this.atUtcMidnight(end);
    while (cur.getTime() <= stop.getTime()) {
      const dow = cur.getUTCDay();
      // Skip weekends for now — school-calendar holiday filtering is a future
      // enhancement once a school_holidays table is introduced.
      if (dow !== 0 && dow !== 6) {
        days.push(new Date(cur));
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return days;
  }

  private atUtcMidnight(d: Date): Date {
    const copy = new Date(d);
    copy.setUTCHours(0, 0, 0, 0);
    return copy;
  }

  private async findAffectedSchedules(tenantId: string, absence: AbsenceRow, day: Date) {
    const dow = day.getUTCDay();
    // SchedulesReadFacade owns direct Prisma access to `schedule`. Call the
    // teacher-timetable method and filter in memory — N is tiny (<10 periods
    // per teacher per day).
    const allForTeacher = await this.schedulesReadFacade.findTeacherTimetable(
      tenantId,
      absence.staff_profile_id,
      { asOfDate: day },
    );

    const periodFrom = absence.period_from;
    const periodTo = absence.period_to ?? absence.period_from;

    return allForTeacher
      .filter((s) => s.weekday === dow)
      .filter((s) => {
        if (absence.full_day) return true;
        if (periodFrom === null || periodTo === null) return true;
        return (
          s.period_order !== null && s.period_order >= periodFrom && s.period_order <= periodTo
        );
      })
      .map((s) => ({ id: s.id }));
  }

  // Exposed for completeness — used by tests & future cron wrapper.
  static VALID_OFFER_STATUSES: SubstitutionOfferStatus[] = [
    'pending',
    'accepted',
    'declined',
    'expired',
    'revoked',
  ];
}
