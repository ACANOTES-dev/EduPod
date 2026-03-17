import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  PromotionRolloverReport,
  PromotionDetail,
  FeeGenerationRunSummary,
  WriteOffReport,
  WriteOffEntry,
  NotificationDeliverySummary,
  ExportPack,
  ExportPackItem,
} from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

interface DateRangeFilters {
  start_date?: string;
  end_date?: string;
}

interface PaginatedFilters extends DateRangeFilters {
  page?: number;
  pageSize?: number;
}

interface NotificationFilters extends PaginatedFilters {
  channel?: 'email' | 'whatsapp' | 'in_app';
  template_key?: string;
}

interface FeeGenerationFilters {
  academic_year_id?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async promotionRollover(
    tenantId: string,
    academicYearId: string,
  ): Promise<PromotionRolloverReport> {
    // First, try to get counts from audit_logs where the promotion was committed
    const auditLog = await this.prisma.auditLog.findFirst({
      where: {
        tenant_id: tenantId,
        action: 'promotion_commit',
        entity_type: 'academic_year',
        entity_id: academicYearId,
      },
      orderBy: { created_at: 'desc' },
    });

    if (auditLog) {
      const metadata = auditLog.metadata_json as Record<string, unknown>;
      const counts = metadata as {
        promoted?: number;
        held_back?: number;
        graduated?: number;
        withdrawn?: number;
      };

      // Build details from year groups
      const yearGroups = await this.prisma.yearGroup.findMany({
        where: { tenant_id: tenantId },
        orderBy: { display_order: 'asc' },
        select: { id: true, name: true },
      });

      const details: PromotionDetail[] = yearGroups.map((yg) => ({
        year_group_id: yg.id,
        year_group_name: yg.name,
        promoted: 0,
        held_back: 0,
        graduated: 0,
      }));

      return {
        promoted: counts.promoted ?? 0,
        held_back: counts.held_back ?? 0,
        graduated: counts.graduated ?? 0,
        withdrawn: counts.withdrawn ?? 0,
        details,
      };
    }

    // Fallback: compute from student data directly
    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id: academicYearId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!academicYear) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year with id "${academicYearId}" not found`,
      });
    }

    // Load year groups
    const yearGroups = await this.prisma.yearGroup.findMany({
      where: { tenant_id: tenantId },
      orderBy: { display_order: 'asc' },
      include: { next_year_group: { select: { id: true } } },
    });

    const yearGroupMap = new Map(yearGroups.map((yg) => [yg.id, yg]));

    // Load students with enrolments in this academic year
    const students = await this.prisma.student.findMany({
      where: {
        tenant_id: tenantId,
        class_enrolments: {
          some: {
            class_entity: { academic_year_id: academicYearId },
          },
        },
      },
      select: {
        id: true,
        status: true,
        year_group_id: true,
        class_enrolments: {
          where: {
            class_entity: { academic_year_id: academicYearId },
          },
          select: {
            class_entity: {
              select: { year_group_id: true },
            },
          },
        },
      },
    });

    let promoted = 0;
    let heldBack = 0;
    let graduated = 0;
    let withdrawn = 0;

    // Build per-year-group detail map
    const detailMap = new Map<string, PromotionDetail>();
    for (const yg of yearGroups) {
      detailMap.set(yg.id, {
        year_group_id: yg.id,
        year_group_name: yg.name,
        promoted: 0,
        held_back: 0,
        graduated: 0,
      });
    }

    for (const student of students) {
      // Determine original year group from class enrolment
      const enrolmentYearGroupId = student.class_enrolments[0]?.class_entity?.year_group_id ?? null;
      const currentYearGroupId = student.year_group_id;
      const originalYg = enrolmentYearGroupId ? yearGroupMap.get(enrolmentYearGroupId) : null;
      const detailEntry = enrolmentYearGroupId ? detailMap.get(enrolmentYearGroupId) : null;

      if (student.status === 'graduated') {
        graduated++;
        if (detailEntry) detailEntry.graduated++;
      } else if (student.status === 'withdrawn') {
        withdrawn++;
      } else if (originalYg && currentYearGroupId !== enrolmentYearGroupId) {
        // Student moved to a different year group — promoted
        promoted++;
        if (detailEntry) detailEntry.promoted++;
      } else {
        // Still in same year group — held back
        heldBack++;
        if (detailEntry) detailEntry.held_back++;
      }
    }

    const details = Array.from(detailMap.values()).filter(
      (d) => d.promoted > 0 || d.held_back > 0 || d.graduated > 0,
    );

    return {
      promoted,
      held_back: heldBack,
      graduated,
      withdrawn,
      details,
    };
  }

  async feeGenerationRuns(
    tenantId: string,
    filters: FeeGenerationFilters,
  ): Promise<{ data: FeeGenerationRunSummary[]; meta: { page: number; pageSize: number; total: number } }> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      action: 'fee_generation_confirm',
      entity_type: 'fee_generation',
    };

    if (filters.academic_year_id) {
      // Filter by metadata containing the academic_year_id
      where.metadata_json = {
        path: ['academic_year_id'],
        equals: filters.academic_year_id,
      };
    }

    const [auditLogs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const data: FeeGenerationRunSummary[] = auditLogs.map((log) => {
      const metadata = log.metadata_json as Record<string, unknown>;
      return {
        id: log.id,
        run_date: log.created_at.toISOString(),
        invoices_created: (metadata.invoices_created as number) ?? 0,
        total_amount: (metadata.total_amount as number) ?? 0,
        households_affected: (metadata.households_affected as number) ?? 0,
        metadata,
      };
    });

    return { data, meta: { page, pageSize, total } };
  }

  async writeOffs(
    tenantId: string,
    filters: PaginatedFilters,
  ): Promise<{ data: WriteOffReport; meta: { page: number; pageSize: number; total: number } }> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    // Build date filter
    const dateFilter: Record<string, unknown> = {};
    if (filters.start_date) dateFilter.gte = new Date(filters.start_date);
    if (filters.end_date) dateFilter.lte = new Date(filters.end_date);

    const invoiceWhere: Record<string, unknown> = {
      tenant_id: tenantId,
      status: 'written_off',
    };

    if (Object.keys(dateFilter).length > 0) {
      invoiceWhere.updated_at = dateFilter;
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where: invoiceWhere,
        orderBy: { updated_at: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          invoice_number: true,
          write_off_amount: true,
          write_off_reason: true,
          updated_at: true,
          household: {
            select: { household_name: true },
          },
        },
      }),
      this.prisma.invoice.count({ where: invoiceWhere }),
    ]);

    const entries: WriteOffEntry[] = invoices.map((inv) => ({
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      household_name: inv.household.household_name,
      amount: Number(inv.write_off_amount ?? 0),
      written_off_at: inv.updated_at.toISOString(),
      reason: inv.write_off_reason ?? null,
    }));

    const totalWrittenOff = entries.reduce((sum, e) => sum + e.amount, 0);

    // Query discount totals in the date range for scholarship impact
    const discountWhere: Record<string, unknown> = {
      tenant_id: tenantId,
      status: { notIn: ['void', 'cancelled'] },
      discount_amount: { gt: 0 },
    };

    if (Object.keys(dateFilter).length > 0) {
      discountWhere.updated_at = dateFilter;
    }

    const discountInvoices = await this.prisma.invoice.findMany({
      where: discountWhere,
      select: { discount_amount: true },
    });

    const totalDiscounts = discountInvoices.reduce(
      (sum, inv) => sum + Number(inv.discount_amount),
      0,
    );

    const report: WriteOffReport = {
      entries,
      totals: {
        total_written_off: Number(totalWrittenOff.toFixed(2)),
        total_discounts: Number(totalDiscounts.toFixed(2)),
      },
    };

    return { data: report, meta: { page, pageSize, total } };
  }

  async notificationDelivery(
    tenantId: string,
    filters: NotificationFilters,
  ): Promise<NotificationDeliverySummary> {
    // Build where clause
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
    };

    if (filters.channel) {
      where.channel = filters.channel;
    }

    if (filters.template_key) {
      where.template_key = filters.template_key;
    }

    // Date range filter on created_at
    const dateFilter: Record<string, unknown> = {};
    if (filters.start_date) dateFilter.gte = new Date(filters.start_date);
    if (filters.end_date) dateFilter.lte = new Date(filters.end_date);

    if (Object.keys(dateFilter).length > 0) {
      where.created_at = dateFilter;
    }

    // Fetch all notifications in the range (exclude queued for accurate counts)
    const notifications = await this.prisma.notification.findMany({
      where,
      select: {
        id: true,
        channel: true,
        status: true,
        template_key: true,
        failure_reason: true,
      },
    });

    // Aggregate by channel
    const channelMap = new Map<string, { sent: number; delivered: number; failed: number }>();
    const templateMap = new Map<string, { sent: number; delivered: number; failed: number }>();
    const failureMap = new Map<string, number>();

    let totalSent = 0;
    let totalDelivered = 0;
    let totalFailed = 0;

    for (const n of notifications) {
      const isSent = n.status !== 'queued';
      const isDelivered = n.status === 'delivered' || n.status === 'read';
      const isFailed = n.status === 'failed';

      if (isSent) totalSent++;
      if (isDelivered) totalDelivered++;
      if (isFailed) totalFailed++;

      // By channel
      const channelKey = n.channel;
      const channelEntry = channelMap.get(channelKey) ?? { sent: 0, delivered: 0, failed: 0 };
      if (isSent) channelEntry.sent++;
      if (isDelivered) channelEntry.delivered++;
      if (isFailed) channelEntry.failed++;
      channelMap.set(channelKey, channelEntry);

      // By template
      const templateKey = n.template_key ?? 'unknown';
      const templateEntry = templateMap.get(templateKey) ?? { sent: 0, delivered: 0, failed: 0 };
      if (isSent) templateEntry.sent++;
      if (isDelivered) templateEntry.delivered++;
      if (isFailed) templateEntry.failed++;
      templateMap.set(templateKey, templateEntry);

      // Failure reasons
      if (isFailed && n.failure_reason) {
        const current = failureMap.get(n.failure_reason) ?? 0;
        failureMap.set(n.failure_reason, current + 1);
      }
    }

    const byChannel = Array.from(channelMap.entries()).map(([channel, stats]) => ({
      channel,
      sent: stats.sent,
      delivered: stats.delivered,
      failed: stats.failed,
      delivery_rate: stats.sent > 0
        ? Number(((stats.delivered / stats.sent) * 100).toFixed(2))
        : 0,
    }));

    const byTemplate = Array.from(templateMap.entries()).map(([template_key, stats]) => ({
      template_key,
      sent: stats.sent,
      delivered: stats.delivered,
      failed: stats.failed,
    }));

    const failureReasons = Array.from(failureMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    return {
      total_sent: totalSent,
      total_delivered: totalDelivered,
      total_failed: totalFailed,
      by_channel: byChannel,
      by_template: byTemplate,
      failure_reasons: failureReasons,
    };
  }

  async studentExportPack(
    tenantId: string,
    studentId: string,
  ): Promise<ExportPack> {
    // Validate student exists
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: {
        id: true,
        student_number: true,
        first_name: true,
        last_name: true,
        first_name_ar: true,
        last_name_ar: true,
        date_of_birth: true,
        gender: true,
        status: true,
        entry_date: true,
        exit_date: true,
        year_group_id: true,
        medical_notes: true,
        has_allergy: true,
        allergy_details: true,
        year_group: {
          select: { id: true, name: true },
        },
        household: {
          select: { id: true, household_name: true },
        },
      },
    });

    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student with id "${studentId}" not found`,
      });
    }

    // Fetch attendance records (last 200)
    const attendanceRecords = await this.prisma.attendanceRecord.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      orderBy: { created_at: 'desc' },
      take: 200,
      select: {
        id: true,
        status: true,
        reason: true,
        marked_at: true,
        session: {
          select: { id: true, session_date: true, status: true },
        },
      },
    });

    // Fetch grades
    const grades = await this.prisma.grade.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        raw_score: true,
        is_missing: true,
        comment: true,
        entered_at: true,
        assessment: {
          select: {
            id: true,
            title: true,
            status: true,
            max_score: true,
          },
        },
      },
    });

    // Fetch report cards
    const reportCards = await this.prisma.reportCard.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        status: true,
        template_locale: true,
        teacher_comment: true,
        principal_comment: true,
        published_at: true,
        academic_period: {
          select: { id: true, name: true },
        },
      },
    });

    // Fetch class enrolments
    const classEnrolments = await this.prisma.classEnrolment.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      orderBy: { start_date: 'desc' },
      select: {
        id: true,
        status: true,
        start_date: true,
        end_date: true,
        class_entity: {
          select: {
            id: true,
            name: true,
            academic_year: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    const sections: ExportPackItem[] = [
      { section: 'profile', data: [student] },
      {
        section: 'attendance_records',
        data: attendanceRecords.map((ar) => ({
          id: ar.id,
          status: ar.status,
          reason: ar.reason,
          marked_at: ar.marked_at.toISOString(),
          session_date: ar.session.session_date,
          session_status: ar.session.status,
        })),
      },
      {
        section: 'grades',
        data: grades.map((g) => ({
          id: g.id,
          raw_score: g.raw_score !== null ? Number(g.raw_score) : null,
          is_missing: g.is_missing,
          comment: g.comment,
          entered_at: g.entered_at?.toISOString() ?? null,
          assessment_title: g.assessment.title,
          assessment_status: g.assessment.status,
          max_score: Number(g.assessment.max_score),
        })),
      },
      {
        section: 'report_cards',
        data: reportCards.map((rc) => ({
          id: rc.id,
          status: rc.status,
          template_locale: rc.template_locale,
          teacher_comment: rc.teacher_comment,
          principal_comment: rc.principal_comment,
          published_at: rc.published_at?.toISOString() ?? null,
          academic_period_name: rc.academic_period.name,
        })),
      },
      {
        section: 'class_enrolments',
        data: classEnrolments.map((ce) => ({
          id: ce.id,
          status: ce.status,
          start_date: ce.start_date,
          end_date: ce.end_date,
          class_name: ce.class_entity.name,
          academic_year_name: ce.class_entity.academic_year?.name ?? null,
        })),
      },
    ];

    return {
      subject_type: 'student',
      subject_id: studentId,
      exported_at: new Date().toISOString(),
      sections,
    };
  }

  async householdExportPack(
    tenantId: string,
    householdId: string,
  ): Promise<ExportPack> {
    // Validate household exists
    const household = await this.prisma.household.findFirst({
      where: { id: householdId, tenant_id: tenantId },
      select: {
        id: true,
        household_name: true,
        address_line_1: true,
        address_line_2: true,
        city: true,
        country: true,
        postal_code: true,
        status: true,
        billing_parent: {
          select: { id: true, first_name: true, last_name: true },
        },
        students: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            status: true,
            year_group: {
              select: { name: true },
            },
          },
        },
        household_parents: {
          select: {
            role_label: true,
            parent: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
              },
            },
          },
        },
      },
    });

    if (!household) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: `Household with id "${householdId}" not found`,
      });
    }

    // Fetch invoices (last 100)
    const invoices = await this.prisma.invoice.findMany({
      where: { tenant_id: tenantId, household_id: householdId },
      orderBy: { created_at: 'desc' },
      take: 100,
      select: {
        id: true,
        invoice_number: true,
        status: true,
        issue_date: true,
        due_date: true,
        total_amount: true,
        balance_amount: true,
        discount_amount: true,
        write_off_amount: true,
        write_off_reason: true,
        currency_code: true,
      },
    });

    // Fetch payments (last 100)
    const payments = await this.prisma.payment.findMany({
      where: { tenant_id: tenantId, household_id: householdId },
      orderBy: { received_at: 'desc' },
      take: 100,
      select: {
        id: true,
        payment_reference: true,
        payment_method: true,
        amount: true,
        currency_code: true,
        status: true,
        received_at: true,
      },
    });

    const sections: ExportPackItem[] = [
      {
        section: 'profile',
        data: [{
          id: household.id,
          household_name: household.household_name,
          address_line_1: household.address_line_1,
          address_line_2: household.address_line_2,
          city: household.city,
          country: household.country,
          postal_code: household.postal_code,
          status: household.status,
          billing_parent: household.billing_parent
            ? `${household.billing_parent.first_name} ${household.billing_parent.last_name}`
            : null,
          parents: household.household_parents.map((hp) => ({
            id: hp.parent.id,
            name: `${hp.parent.first_name} ${hp.parent.last_name}`,
            role_label: hp.role_label,
          })),
          students: household.students.map((s) => ({
            id: s.id,
            name: `${s.first_name} ${s.last_name}`,
            status: s.status,
            year_group: s.year_group?.name ?? null,
          })),
        }],
      },
      {
        section: 'invoices',
        data: invoices.map((inv) => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          status: inv.status,
          issue_date: inv.issue_date?.toISOString().split('T')[0] ?? null,
          due_date: inv.due_date.toISOString().split('T')[0],
          total_amount: Number(inv.total_amount),
          balance_amount: Number(inv.balance_amount),
          discount_amount: Number(inv.discount_amount),
          write_off_amount: inv.write_off_amount !== null ? Number(inv.write_off_amount) : null,
          write_off_reason: inv.write_off_reason,
          currency_code: inv.currency_code,
        })),
      },
      {
        section: 'payments',
        data: payments.map((p) => ({
          id: p.id,
          payment_reference: p.payment_reference,
          payment_method: p.payment_method,
          amount: Number(p.amount),
          currency_code: p.currency_code,
          status: p.status,
          received_at: p.received_at.toISOString(),
        })),
      },
    ];

    return {
      subject_type: 'household',
      subject_id: householdId,
      exported_at: new Date().toISOString(),
      sections,
    };
  }
}
