import { Injectable, NotFoundException } from '@nestjs/common';

import type {
  ExportPack,
  ExportPackItem,
  FeeGenerationRunSummary,
  NotificationDeliverySummary,
  PromotionDetail,
  PromotionRolloverReport,
  WriteOffEntry,
  WriteOffReport,
} from '@school/shared';

import { ReportsDataAccessService } from './reports-data-access.service';

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
  constructor(private readonly dataAccess: ReportsDataAccessService) {}

  async promotionRollover(
    tenantId: string,
    academicYearId: string,
  ): Promise<PromotionRolloverReport> {
    const auditLog = (await this.dataAccess.findFirstAuditLog(
      tenantId,
      {
        action: 'promotion_commit',
        entity_type: 'academic_year',
        entity_id: academicYearId,
      },
      { created_at: 'desc' },
    )) as {
      metadata_json: unknown;
    } | null;

    if (auditLog) {
      const metadata = auditLog.metadata_json as Record<string, unknown>;
      const counts = metadata as {
        promoted?: number;
        held_back?: number;
        graduated?: number;
        withdrawn?: number;
      };

      const yearGroups = (await this.dataAccess.findYearGroups(tenantId, {
        id: true,
        name: true,
      })) as Array<{ id: string; name: string }>;

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

    // Validate academic year exists
    const yearGroups = (await this.dataAccess.findYearGroups(tenantId, {
      id: true,
      name: true,
      next_year_group: { select: { id: true } },
    })) as Array<{
      id: string;
      name: string;
      next_year_group: { id: string } | null;
    }>;

    // Check academic year exists via a student query scoped to that year
    const studentsInYear = (await this.dataAccess.findStudents(tenantId, {
      where: {
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
    })) as Array<{
      id: string;
      status: string;
      year_group_id: string | null;
      class_enrolments: Array<{
        class_entity: { year_group_id: string | null };
      }>;
    }>;

    if (studentsInYear.length === 0 && yearGroups.length === 0) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year with id "${academicYearId}" not found`,
      });
    }

    const yearGroupMap = new Map(yearGroups.map((yg) => [yg.id, yg]));

    let promoted = 0;
    let heldBack = 0;
    let graduated = 0;
    let withdrawn = 0;

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

    for (const student of studentsInYear) {
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
        promoted++;
        if (detailEntry) detailEntry.promoted++;
      } else {
        heldBack++;
        if (detailEntry) detailEntry.held_back++;
      }
    }

    const details = Array.from(detailMap.values()).filter(
      (d) => d.promoted > 0 || d.held_back > 0 || d.graduated > 0,
    );

    return { promoted, held_back: heldBack, graduated, withdrawn, details };
  }

  async feeGenerationRuns(
    tenantId: string,
    filters: FeeGenerationFilters,
  ): Promise<{
    data: FeeGenerationRunSummary[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      action: 'fee_generation_confirm',
      entity_type: 'fee_generation',
    };

    if (filters.academic_year_id) {
      where.metadata_json = {
        path: ['academic_year_id'],
        equals: filters.academic_year_id,
      };
    }

    const [auditLogs, total] = await Promise.all([
      this.dataAccess.findAuditLogs(tenantId, {
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }) as Promise<Array<{ id: string; created_at: Date; metadata_json: unknown }>>,
      this.dataAccess.countAuditLogs(tenantId, where),
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

    const dateFilter: Record<string, unknown> = {};
    if (filters.start_date) dateFilter.gte = new Date(filters.start_date);
    if (filters.end_date) dateFilter.lte = new Date(filters.end_date);

    const invoiceWhere: Record<string, unknown> = {
      status: 'written_off',
    };

    if (Object.keys(dateFilter).length > 0) {
      invoiceWhere.updated_at = dateFilter;
    }

    const [invoices, total] = await Promise.all([
      this.dataAccess.findInvoices(tenantId, {
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
          household: { select: { household_name: true } },
        },
      }) as Promise<
        Array<{
          id: string;
          invoice_number: string;
          write_off_amount: unknown;
          write_off_reason: string | null;
          updated_at: Date;
          household: { household_name: string };
        }>
      >,
      this.dataAccess.countInvoices(tenantId, invoiceWhere),
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

    const discountWhere: Record<string, unknown> = {
      status: { notIn: ['void', 'cancelled'] },
      discount_amount: { gt: 0 },
    };

    if (Object.keys(dateFilter).length > 0) {
      discountWhere.updated_at = dateFilter;
    }

    const discountInvoices = (await this.dataAccess.findInvoices(tenantId, {
      where: discountWhere,
      select: { discount_amount: true },
    })) as Array<{ discount_amount: unknown }>;

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
    const where: Record<string, unknown> = {};

    if (filters.channel) where.channel = filters.channel;
    if (filters.template_key) where.template_key = filters.template_key;

    const dateFilter: Record<string, unknown> = {};
    if (filters.start_date) dateFilter.gte = new Date(filters.start_date);
    if (filters.end_date) dateFilter.lte = new Date(filters.end_date);

    if (Object.keys(dateFilter).length > 0) {
      where.created_at = dateFilter;
    }

    const notifications = (await this.dataAccess.findNotifications(tenantId, where, {
      id: true,
      channel: true,
      status: true,
      template_key: true,
      failure_reason: true,
    })) as Array<{
      id: string;
      channel: string;
      status: string;
      template_key: string | null;
      failure_reason: string | null;
    }>;

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

      const channelKey = n.channel;
      const channelEntry = channelMap.get(channelKey) ?? { sent: 0, delivered: 0, failed: 0 };
      if (isSent) channelEntry.sent++;
      if (isDelivered) channelEntry.delivered++;
      if (isFailed) channelEntry.failed++;
      channelMap.set(channelKey, channelEntry);

      const templateKey = n.template_key ?? 'unknown';
      const templateEntry = templateMap.get(templateKey) ?? { sent: 0, delivered: 0, failed: 0 };
      if (isSent) templateEntry.sent++;
      if (isDelivered) templateEntry.delivered++;
      if (isFailed) templateEntry.failed++;
      templateMap.set(templateKey, templateEntry);

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
      delivery_rate: stats.sent > 0 ? Number(((stats.delivered / stats.sent) * 100).toFixed(2)) : 0,
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

  async studentExportPack(tenantId: string, studentId: string): Promise<ExportPack> {
    const student = await this.dataAccess.findStudentById(tenantId, studentId, {
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
      year_group: { select: { id: true, name: true } },
      household: { select: { id: true, household_name: true } },
    });

    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student with id "${studentId}" not found`,
      });
    }

    const attendanceRecords = (await this.dataAccess.findAttendanceRecords(tenantId, {
      where: { student_id: studentId },
      orderBy: { created_at: 'desc' },
      take: 200,
      select: {
        id: true,
        status: true,
        reason: true,
        marked_at: true,
        session: { select: { id: true, session_date: true, status: true } },
      },
    })) as Array<{
      id: string;
      status: string;
      reason: string | null;
      marked_at: Date;
      session: { id: string; session_date: Date; status: string };
    }>;

    const grades = (await this.dataAccess.findGrades(tenantId, {
      where: { student_id: studentId },
      select: {
        id: true,
        raw_score: true,
        is_missing: true,
        comment: true,
        entered_at: true,
        assessment: { select: { id: true, title: true, status: true, max_score: true } },
      },
      orderBy: { created_at: 'desc' },
    })) as Array<{
      id: string;
      raw_score: unknown;
      is_missing: boolean;
      comment: string | null;
      entered_at: Date | null;
      assessment: { id: string; title: string; status: string; max_score: unknown };
    }>;

    const reportCards = (await this.dataAccess.findReportCards(
      tenantId,
      { student_id: studentId },
      {
        id: true,
        status: true,
        template_locale: true,
        teacher_comment: true,
        principal_comment: true,
        published_at: true,
        academic_period: { select: { id: true, name: true } },
      },
      { created_at: 'desc' },
    )) as Array<{
      id: string;
      status: string;
      template_locale: string;
      teacher_comment: string | null;
      principal_comment: string | null;
      published_at: Date | null;
      academic_period: { id: string; name: string };
    }>;

    const classEnrolments = (await this.dataAccess.findClassEnrolments(
      tenantId,
      { student_id: studentId },
      {
        id: true,
        status: true,
        start_date: true,
        end_date: true,
        class_entity: {
          select: {
            id: true,
            name: true,
            academic_year: { select: { id: true, name: true } },
          },
        },
      },
      { start_date: 'desc' },
    )) as Array<{
      id: string;
      status: string;
      start_date: Date;
      end_date: Date | null;
      class_entity: {
        id: string;
        name: string;
        academic_year: { id: string; name: string } | null;
      };
    }>;

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

  async householdExportPack(tenantId: string, householdId: string): Promise<ExportPack> {
    const household = (await this.dataAccess.findHouseholdById(tenantId, householdId, {
      id: true,
      household_name: true,
      address_line_1: true,
      address_line_2: true,
      city: true,
      country: true,
      postal_code: true,
      status: true,
      billing_parent: { select: { id: true, first_name: true, last_name: true } },
      students: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          status: true,
          year_group: { select: { name: true } },
        },
      },
      household_parents: {
        select: {
          role_label: true,
          parent: { select: { id: true, first_name: true, last_name: true } },
        },
      },
    })) as {
      id: string;
      household_name: string;
      address_line_1: string | null;
      address_line_2: string | null;
      city: string | null;
      country: string | null;
      postal_code: string | null;
      status: string;
      billing_parent: { id: string; first_name: string; last_name: string } | null;
      students: Array<{
        id: string;
        first_name: string;
        last_name: string;
        status: string;
        year_group: { name: string } | null;
      }>;
      household_parents: Array<{
        role_label: string;
        parent: { id: string; first_name: string; last_name: string };
      }>;
    } | null;

    if (!household) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: `Household with id "${householdId}" not found`,
      });
    }

    const invoices = (await this.dataAccess.findInvoices(tenantId, {
      where: { household_id: householdId },
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
    })) as Array<{
      id: string;
      invoice_number: string;
      status: string;
      issue_date: Date | null;
      due_date: Date;
      total_amount: unknown;
      balance_amount: unknown;
      discount_amount: unknown;
      write_off_amount: unknown;
      write_off_reason: string | null;
      currency_code: string;
    }>;

    const payments = (await this.dataAccess.findPayments(tenantId, {
      where: { household_id: householdId },
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
    })) as Array<{
      id: string;
      payment_reference: string | null;
      payment_method: string;
      amount: unknown;
      currency_code: string;
      status: string;
      received_at: Date;
    }>;

    const sections: ExportPackItem[] = [
      {
        section: 'profile',
        data: [
          {
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
          },
        ],
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
