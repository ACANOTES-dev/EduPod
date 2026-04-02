import { Injectable, Logger } from '@nestjs/common';

import type { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';
import type { StudentPastoralSummaryData } from './pastoral-report.service';

// ─── Helpers ───────────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0] ?? '';
}

// ─── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class PastoralReportStudentSummaryService {
  private readonly logger = new Logger(PastoralReportStudentSummaryService.name);

  constructor(private readonly eventService: PastoralEventService) {}

  // ─── CP Access Check ──────────────────────────────────────────────────────

  private async hasCpAccess(db: PrismaService, tenantId: string, userId: string): Promise<boolean> {
    const grant = await db.cpAccessGrant.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        revoked_at: null,
      },
    });
    return grant !== null;
  }

  // ─── Build Student Summary ────────────────────────────────────────────────

  async build(
    db: PrismaService,
    tenantId: string,
    userId: string,
    studentId: string,
    options: { include_resolved?: boolean },
  ): Promise<StudentPastoralSummaryData> {
    // 1. Check CP access
    const cpAccess = await this.hasCpAccess(db, tenantId, userId);

    // 2. Fetch student with year group and class
    const student = await db.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      include: {
        year_group: { select: { name: true } },
        homeroom_class: { select: { name: true } },
      },
    });

    if (!student) {
      return {
        student: {
          id: studentId,
          full_name: 'Unknown',
          student_number: '',
          year_group: '',
          class_name: '',
        },
        concerns: [],
        cases: [],
        interventions: [],
        referrals: [],
        has_cp_records: false,
      };
    }

    // 3. Concerns — filter by tier based on CP access
    const tierFilter = cpAccess ? {} : { tier: { in: [1, 2] } };
    const concerns = await db.pastoralConcern.findMany({
      where: {
        tenant_id: tenantId,
        OR: [
          { student_id: studentId },
          {
            involved_students: {
              some: {
                tenant_id: tenantId,
                student_id: studentId,
              },
            },
          },
        ],
        ...tierFilter,
      },
      include: {
        logged_by: { select: { first_name: true, last_name: true } },
        versions: {
          orderBy: { version_number: 'asc' },
          include: {
            amended_by: { select: { first_name: true, last_name: true } },
          },
        },
      },
      orderBy: { occurred_at: 'desc' },
    });

    // 4. Cases
    const caseWhere: Record<string, unknown> = {
      tenant_id: tenantId,
      student_id: studentId,
    };
    if (!options.include_resolved) {
      caseWhere['status'] = { notIn: ['resolved', 'closed'] };
    }

    const cases = await db.pastoralCase.findMany({
      where: caseWhere,
      include: {
        owner: { select: { first_name: true, last_name: true } },
        concerns: { select: { id: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    // 5. Interventions
    const interventions = await db.pastoralIntervention.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      orderBy: { created_at: 'desc' },
    });

    // 6. Referrals
    const referrals = await db.pastoralReferral.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      orderBy: { created_at: 'desc' },
    });

    // 7. CP record existence check
    let hasCpRecords = false;
    if (cpAccess) {
      const cpCount = await db.cpRecord.count({
        where: { tenant_id: tenantId, student_id: studentId },
      });
      hasCpRecords = cpCount > 0;
    }

    const data: StudentPastoralSummaryData = {
      student: {
        id: student.id,
        full_name: student.full_name ?? `${student.first_name} ${student.last_name}`,
        student_number: student.student_number ?? '',
        year_group: student.year_group?.name ?? '',
        class_name: student.homeroom_class?.name ?? '',
      },
      concerns: concerns.map((c) => ({
        id: c.id,
        date: c.occurred_at.toISOString(),
        category: c.category,
        severity: String(c.severity),
        tier: c.tier,
        narrative:
          c.versions.length > 0 ? (c.versions[c.versions.length - 1]?.narrative ?? '') : '',
        versions: c.versions.map((v) => ({
          version: v.version_number,
          text: v.narrative,
          amended_at: v.created_at.toISOString(),
          amended_by: `${v.amended_by.first_name} ${v.amended_by.last_name}`,
          reason: v.amendment_reason ?? '',
        })),
        logged_by: `${c.logged_by.first_name} ${c.logged_by.last_name}`,
        actions_taken: c.actions_taken,
      })),
      cases: cases.map((cs) => ({
        id: cs.id,
        status: String(cs.status),
        case_owner: cs.owner ? `${cs.owner.first_name} ${cs.owner.last_name}` : 'Unknown',
        opened_at: cs.created_at.toISOString(),
        review_date: cs.next_review_date ? toISODate(cs.next_review_date) : null,
        linked_concern_count: cs.concerns.length,
      })),
      interventions: interventions.map((i) => ({
        id: i.id,
        type: i.intervention_type,
        continuum_level: i.continuum_level,
        status: String(i.status),
        target_outcomes:
          typeof i.target_outcomes === 'object'
            ? JSON.stringify(i.target_outcomes)
            : String(i.target_outcomes),
        outcome: i.outcome_notes,
        start_date: i.created_at.toISOString(),
        end_date: i.updated_at.toISOString(),
      })),
      referrals: referrals.map((r) => {
        let waitDays: number | null = null;
        if (r.submitted_at && r.status === 'submitted') {
          const now = new Date();
          waitDays = Math.floor(
            (now.getTime() - r.submitted_at.getTime()) / (1000 * 60 * 60 * 24),
          );
        }
        return {
          id: r.id,
          referral_type: r.referral_type,
          status: String(r.status),
          submitted_at: r.submitted_at ? r.submitted_at.toISOString() : null,
          wait_days: waitDays,
        };
      }),
      has_cp_records: hasCpRecords,
    };

    // Fire audit event (non-blocking)
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'student_summary_accessed',
      entity_type: 'export',
      entity_id: studentId,
      student_id: studentId,
      actor_user_id: userId,
      tier: 1,
      payload: { student_id: studentId, requested_by: userId },
      ip_address: null,
    });

    return data;
  }
}
